import { isMap, isNode, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import { allFields } from './schema.ts';
import type { Field, Path, Schema } from './schema.ts';
import { readSettings } from './read.ts';
import { setSetting } from './write.ts';

function parses(text: string): boolean {
  const doc = parseDocument(text);
  return doc.errors.length === 0 && (doc.contents === null || isMap(doc.contents));
}

/** The value at a path as plain JSON data; undefined when the key is missing. */
const valueAt = (doc: Document, path: Path): unknown => {
  const node: unknown = doc.getIn(path, true);
  return isNode(node) ? node.toJSON() : node;
};

const rawAt = (doc: Document, path: Path): string => JSON.stringify(valueAt(doc, path)) ?? 'undefined';

/** Every path a form field can write: one per field, one per command for a keys field. */
function leaves(field: Field): Path[] {
  return field.type === 'keys' ? field.commands.map((c) => [...field.path, c.id]) : [field.path];
}

/**
 * Three-way merge of config texts, one setting at a time. Starts from `remote` and
 * applies what `local` changed since `base`. If both changed a setting differently, local wins.
 */
export function mergeSettings(
  schema: Schema,
  base: string,
  local: string,
  remote: string,
): { text: string; conflicts: Field[] } {
  if (local === base) return { text: remote, conflicts: [] };
  if (remote === base) return { text: local, conflicts: [] };
  if (!parses(base) || !parses(local) || !parses(remote)) return { text: local, conflicts: [] };

  const b = parseDocument(base);
  const l = parseDocument(local);
  const r = parseDocument(remote);
  let text = remote;
  const conflicts: Field[] = [];
  const bothChanged: Field[] = [];
  try {
    for (const field of allFields(schema)) {
      let conflicted = false;
      let localChanged = false;
      let remoteChanged = false;
      for (const path of leaves(field)) {
        const rb = rawAt(b, path);
        const rl = rawAt(l, path);
        const rr = rawAt(r, path);
        if (rr !== rb) remoteChanged = true;
        if (rl === rb) continue;
        localChanged = true;
        if (rr !== rb && rr !== rl) conflicted = true;
        if (rr !== rl) text = setSetting(text, path, valueAt(l, path));
      }
      if (conflicted) conflicts.push(field);
      if (localChanged && remoteChanged) bothChanged.push(field);
    }
  } catch {
    return { text: local, conflicts: [] };
  }
  // Two edits that are fine alone can clash together (one key on two commands).
  if (readSettings(schema, text).error && !readSettings(schema, local).error) {
    return { text: local, conflicts: bothChanged };
  }
  return { text, conflicts };
}
