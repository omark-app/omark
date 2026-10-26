import { isMap, isNode, LineCounter, parseDocument } from 'yaml';
import { allFields, defaults, fieldId } from './schema.ts';
import type { Field, KeysField, Schema, SettingsError, Values } from './schema.ts';

class ConfigFailure extends Error {
  readonly line: number | null;
  constructor(line: number | null, message: string) {
    super(message);
    this.line = line;
  }
}

function keyName(key: unknown): string {
  return String(isNode(key) ? (key as { value?: unknown }).value : key);
}

const PERCENT = /^\d+(\.\d+)?%$/;

/** Checks one value from the file or the form. Keys fields are checked by `readSettings`. */
export function checkValue(field: Exclude<Field, KeysField>, raw: unknown): { value: unknown } | { error: string } {
  const id = fieldId(field);
  switch (field.type) {
    case 'choice': {
      const values = field.options.map((o) => o.value);
      const hit =
        typeof raw === 'string'
          ? values.find((v) => (field.ignoreCase ? v.toLowerCase() === raw.toLowerCase() : v === raw))
          : undefined;
      if (hit !== undefined) return { value: hit };
      return { error: `${id} must be ${field.describe ?? `one of: ${values.join(', ')}`}` };
    }
    case 'number': {
      const min = field.min;
      const max = field.max;
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        if ((!field.integer || Number.isInteger(raw)) && (min === undefined || raw >= min) && (max === undefined || raw <= max)) {
          return { value: raw };
        }
      } else if (field.percent && typeof raw === 'string' && PERCENT.test(raw) && parseFloat(raw) <= 100) {
        return { value: raw };
      }
      let what = field.integer ? 'a whole number' : 'a number';
      if (max !== undefined) what += ` from ${min ?? 0} to ${max}`;
      else if (min !== undefined) what += ` ≥ ${min}`;
      if (field.percent) what += ', or a percentage from 0% to 100%';
      return { error: `${id} must be ${what}` };
    }
    case 'set': {
      const values = field.options.map((o) => o.value);
      if (!Array.isArray(raw)) return { error: `${id} must be a list of: ${values.join(', ')}` };
      const kept = raw.filter((v) => !(field.retired ?? []).includes(v));
      for (const v of kept) {
        if (typeof v !== 'string' || !values.includes(v)) return { error: `${id} must be one of: ${values.join(', ')}` };
      }
      return { value: kept };
    }
  }
}

/** The command that has `key` bound, or null. Commands are searched in schema order. */
export function keyOwner(field: KeysField, keys: Record<string, string[]>, key: string): string | null {
  for (const c of field.commands) if ((keys[c.id] ?? []).includes(key)) return c.id;
  return null;
}

/** Never throws: any problem returns the defaults plus the first error found. */
export function readSettings(schema: Schema, text: string): { values: Values; error: SettingsError | null } {
  try {
    return { values: read(schema, text), error: null };
  } catch (e) {
    const error: SettingsError =
      e instanceof ConfigFailure
        ? { line: e.line, message: e.message }
        : { line: null, message: e instanceof Error ? e.message : String(e) };
    return { values: defaults(schema), error };
  }
}

function read(schema: Schema, text: string): Values {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, prettyErrors: false });
  const lineOf = (node: unknown): number | null => {
    const range = isNode(node) ? node.range : null;
    return range ? lc.linePos(range[0]).line : null;
  };

  const first = doc.errors[0];
  if (first) {
    const raw = first.linePos?.[0]?.line ?? (first.pos ? lc.linePos(first.pos[0]).line : null);
    // Errors found at end of input (unclosed bracket) are reported on the last line that has text.
    const lastText = text.replace(/\s+$/, '').split('\n').length;
    const line = raw === null ? null : Math.min(raw, Math.max(lastText, 1));
    throw new ConfigFailure(line, first.message.split('\n')[0]!);
  }

  const values = defaults(schema);
  if (doc.contents === null) return values;
  if (!isMap(doc.contents)) {
    throw new ConfigFailure(lineOf(doc.contents), 'The file must be a list of "setting: value" lines');
  }

  const fields = allFields(schema);
  const byId = new Map(fields.map((f) => [fieldId(f), f]));
  // First segments of nested paths, e.g. "habits" for habits.goal.
  const groups = new Set(fields.filter((f) => f.path.length > 1).map((f) => f.path[0]!));
  const keyLines = new Map<string, Map<string, number | null>>();
  const keysHeadLine = new Map<string, number | null>();

  const apply = (field: Field, keyNode: unknown, valueNode: unknown): void => {
    const id = fieldId(field);
    try {
      if (field.type === 'keys') {
        keysHeadLine.set(id, lineOf(keyNode));
        if (!isMap(valueNode)) throw new Error(`${id} must be a list of "command: key" lines`);
        const lines = keyLines.get(id) ?? new Map<string, number | null>();
        keyLines.set(id, lines);
        const current = values[id] as Record<string, string[]>;
        for (const sp of valueNode.items) {
          const cmd = keyName(sp.key);
          const line = lineOf(sp.key);
          if (!field.commands.some((c) => c.id === cmd)) throw new ConfigFailure(line, `Unknown shortcut command "${cmd}"`);
          const v: unknown = isNode(sp.value) ? sp.value.toJSON() : sp.value;
          const keys = typeof v === 'string' ? [v] : v;
          if (!Array.isArray(keys) || keys.length === 0 || !keys.every((k) => typeof k === 'string' && k !== '')) {
            throw new ConfigFailure(line, `Shortcut "${cmd}" must be a key or a non-empty list of keys`);
          }
          current[cmd] = keys as string[];
          lines.set(cmd, line);
        }
        return;
      }
      const raw: unknown = isNode(valueNode) ? valueNode.toJSON() : valueNode;
      const result = checkValue(field, raw);
      if ('error' in result) throw new Error(result.error);
      values[id] = result.value;
    } catch (e) {
      if (e instanceof ConfigFailure) throw e;
      throw new ConfigFailure(lineOf(valueNode) ?? lineOf(keyNode), e instanceof Error ? e.message : String(e));
    }
  };

  for (const pair of doc.contents.items) {
    const name = keyName(pair.key);
    if (groups.has(name)) {
      if (!isMap(pair.value)) {
        throw new ConfigFailure(lineOf(pair.value) ?? lineOf(pair.key), `${name} must be a list of "setting: value" lines`);
      }
      for (const sub of pair.value.items) {
        const id = `${name}.${keyName(sub.key)}`;
        const field = byId.get(id);
        if (!field) throw new ConfigFailure(lineOf(sub.key), `Unknown setting "${id}"`);
        apply(field, sub.key, sub.value);
      }
      continue;
    }
    const field = byId.get(name);
    if (!field) throw new ConfigFailure(lineOf(pair.key), `Unknown setting "${name}"`);
    apply(field, pair.key, pair.value);
  }

  for (const field of fields) {
    if (field.type !== 'keys') continue;
    const id = fieldId(field);
    const keys = values[id] as Record<string, string[]>;
    const lines = keyLines.get(id) ?? new Map<string, number | null>();

    const taken = new Set([...lines.keys()].flatMap((cmd) => keys[cmd]!));
    for (const cmd of field.yielding ?? []) {
      if (!lines.has(cmd)) keys[cmd] = keys[cmd]!.filter((k) => !taken.has(k));
    }

    const owner = new Map<string, string>();
    for (const { id: cmd } of field.commands) {
      for (const key of keys[cmd]!) {
        const other = owner.get(key);
        if (other !== undefined && other !== cmd) {
          const line = lines.get(cmd) ?? lines.get(other) ?? keysHeadLine.get(id) ?? null;
          throw new ConfigFailure(line, `Key "${key}" is bound to both ${other} and ${cmd}`);
        }
        owner.set(key, cmd);
      }
    }
  }
  return values;
}
