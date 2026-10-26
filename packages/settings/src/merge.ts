import { isMap, isNode, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import { allFields } from './schema.ts';
import type { Field, Path, Schema, SettingsError } from './schema.ts';
import { readSettings } from './read.ts';
import { setSetting } from './write.ts';

export interface MergeResult {
  text: string;
  /** Settings both sides changed differently; when `dropped`, every setting local changed. */
  conflicts: Field[];
  /** True when local's changes could not be applied: `text` is the remote, as it was. */
  dropped: boolean;
}

function parses(text: string): boolean {
  const doc = parseDocument(text);
  return doc.errors.length === 0 && (doc.contents === null || isMap(doc.contents));
}

/** The text as a document to look values up in; a root that is not a map reads as empty. */
function docOf(text: string): Document {
  const doc = parseDocument(text);
  return isMap(doc.contents) ? doc : parseDocument('');
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

/** Lines move in a merge, so the same error is the same message. */
const sameError = (a: SettingsError, b: SettingsError | null): boolean => b !== null && a.message === b.message;

/**
 * Three-way merge of config texts, one setting at a time. Starts from `remote` and
 * applies what `local` changed since `base`. If both changed a setting differently, local wins.
 * A remote text is never replaced by local's, except when the merge itself would add an error:
 * if a side does not parse or a change cannot be written, the remote is kept and `dropped` is true.
 */
export function mergeSettings(schema: Schema, base: string, local: string, remote: string): MergeResult {
  if (local === base) return { text: remote, conflicts: [], dropped: false };
  if (remote === base) return { text: local, conflicts: [], dropped: false };

  const b = docOf(base);
  const l = docOf(local);
  const r = docOf(remote);
  const fields = allFields(schema);
  const keepRemote = (): MergeResult => ({
    text: remote,
    conflicts: fields.filter((f) => leaves(f).some((p) => rawAt(b, p) !== rawAt(l, p))),
    dropped: true,
  });
  if (!parses(base) || !parses(local) || !parses(remote)) return keepRemote();

  let text = remote;
  const conflicts: Field[] = [];
  const bothChanged: Field[] = [];
  try {
    for (const field of fields) {
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
    return keepRemote();
  }
  // Two edits that are fine alone can clash together (one key on two commands). An error the
  // remote or local already had (a key from a newer build, say) is not the merge's doing.
  const error = readSettings(schema, text).error;
  if (error && !sameError(error, readSettings(schema, remote).error) && !sameError(error, readSettings(schema, local).error)) {
    return { text: local, conflicts: bothChanged, dropped: false };
  }
  return { text, conflicts, dropped: false };
}
