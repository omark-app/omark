import { parseDocument } from 'yaml';
import { checkValue, readSettings } from './read.ts';
import { fieldId } from './schema.ts';
import type { Field, KeysField, NumberField, Schema, Values } from './schema.ts';
import { setSetting } from './write.ts';

type KeyMap = Record<string, string[]>;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export const valueOf = (values: Values, field: Field): unknown => values[fieldId(field)];

/**
 * Writes one field's value into the config text, or removes it when it equals the default.
 * For a keys field `value` is the whole Record<command, keys>; only changed commands are written.
 * Never throws: a bad value or a file that cannot be changed safely gives `{ error }`.
 */
export function applyField(schema: Schema, text: string, field: Field, value: unknown): { text: string } | { error: string } {
  try {
    let out = text;
    if (field.type === 'keys') {
      const before = readSettings(schema, text).values[fieldId(field)] as KeyMap;
      const next = value as KeyMap;
      for (const cmd of field.commands) {
        const list = next[cmd.id] ?? [];
        if (same(list, before[cmd.id])) continue;
        // An empty list is only a yielding command giving way; the file never holds one.
        const clear = same(list, cmd.default) || (list.length === 0 && (field.yielding ?? []).includes(cmd.id));
        out = setSetting(out, [...field.path, cmd.id], clear ? undefined : list.length === 1 ? list[0] : list);
      }
    } else {
      out = setSetting(out, field.path, same(value, field.default) ? undefined : value);
    }
    const { error } = readSettings(schema, out);
    return error ? { error: error.message } : { text: out };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Binds `key` to a command's slot. `set` lists the commands the file sets; a yielding
 * command still at its default gives way, as the reader does. Without it all count as set.
 */
export function captureKey(
  field: KeysField,
  keys: KeyMap,
  cmd: string,
  index: number,
  key: string,
  set?: ReadonlySet<string>,
): { keys: KeyMap } | { error: string } {
  const mine = keys[cmd] ?? [];
  if (mine.includes(key) && mine[index] !== key) return { keys };
  for (const c of field.commands) {
    if (c.id === cmd || !(keys[c.id] ?? []).includes(key)) continue;
    if (set && !set.has(c.id) && (field.yielding ?? []).includes(c.id)) continue;
    return { error: `\`${key}\` is already ${c.label}` };
  }
  const list = [...mine];
  list[index] = key;
  return { keys: { ...keys, [cmd]: list } };
}

const KEY_FACES: Record<string, string> = {
  ' ': 'Space',
  ArrowDown: '↓',
  ArrowUp: '↑',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: 'Del',
  Enter: '↵ Enter',
};

/** How a key shows on its chip. */
export const displayKey = (key: string): string => KEY_FACES[key] ?? key;

/** The commands of a keys field that the file sets itself (the rest are at their defaults). */
export function setCommands(field: KeysField, text: string): Set<string> {
  try {
    const doc = parseDocument(text);
    return new Set(field.commands.filter((c) => doc.hasIn([...field.path, c.id])).map((c) => c.id));
  } catch {
    return new Set();
  }
}

/** Reads what was typed into a number field: a number, or for a percent field also '10%'. */
export function numberInput(field: NumberField, typed: string): { value: unknown } | { error: string } {
  const t = typed.trim();
  const raw = t === '' || (field.percent && t.endsWith('%')) ? t : Number(t);
  return checkValue(field, Number.isNaN(raw) ? t : raw);
}
