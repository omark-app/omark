import { isMap, isNode, parseDocument } from 'yaml';
import { allFields } from './schema.ts';
import type { Field, Path, Schema } from './schema.ts';
import { setSetting } from './write.ts';

function parses(text: string): boolean {
  const doc = parseDocument(text);
  return doc.errors.length === 0 && (doc.contents === null || isMap(doc.contents));
}

/** The raw YAML value at a path as plain JSON text; 'undefined' when the key is missing. */
function rawAt(text: string, path: Path): string {
  const node: unknown = parseDocument(text).getIn(path, true);
  const value: unknown = isNode(node) ? node.toJSON() : node;
  return JSON.stringify(value) ?? 'undefined';
}

function valueAt(text: string, path: Path): unknown {
  const node: unknown = parseDocument(text).getIn(path, true);
  return isNode(node) ? node.toJSON() : node;
}

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

  let text = remote;
  const conflicts: Field[] = [];
  try {
    for (const field of allFields(schema)) {
      let conflicted = false;
      for (const path of leaves(field)) {
        const b = rawAt(base, path);
        const l = rawAt(local, path);
        if (l === b) continue;
        const r = rawAt(remote, path);
        if (r !== b && r !== l) conflicted = true;
        if (r !== l) text = setSetting(text, path, valueAt(local, path));
      }
      if (conflicted) conflicts.push(field);
    }
  } catch {
    return { text: local, conflicts: [] };
  }
  return { text, conflicts };
}
