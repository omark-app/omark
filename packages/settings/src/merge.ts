import { isMap, isNode, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import { allFields } from './schema.ts';
import type { Field, Path, Schema, SettingsError } from './schema.ts';
import { readSettings } from './read.ts';
import { setSetting } from './write.ts';

/**
 * Why local's changes were not applied (`text` is then the remote, as it was):
 * `remote-broken`, the remote does not parse; `unsafe`, the base or local does not parse,
 * or a change could not be written into the remote safely.
 */
export type Dropped = false | 'remote-broken' | 'unsafe';

export interface MergeResult {
  text: string;
  /** Settings both sides changed differently; when `dropped`, every setting local changed. */
  conflicts: Field[];
  dropped: Dropped;
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
 * A remote text is never replaced by local's, except when the remote reads clean and the merge
 * would add an error. If a side does not parse or a change cannot be written, the remote is kept
 * and `dropped` says why.
 */
export function mergeSettings(schema: Schema, base: string, local: string, remote: string): MergeResult {
  if (local === base) return { text: remote, conflicts: [], dropped: false };
  if (remote === base) return { text: local, conflicts: [], dropped: false };

  const b = docOf(base);
  const l = docOf(local);
  const r = docOf(remote);
  const fields = allFields(schema);
  const keepRemote = (dropped: Dropped): MergeResult => ({
    text: remote,
    conflicts: fields.filter((f) => leaves(f).some((p) => rawAt(b, p) !== rawAt(l, p))),
    dropped,
  });
  if (!parses(remote)) return keepRemote('remote-broken');
  if (!parses(base) || !parses(local)) return keepRemote('unsafe');

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
    return keepRemote('unsafe');
  }
  // Two edits that are fine alone can clash together (one key on two commands). If the remote
  // already had an error (a key from a newer build, say), the merged text keeps it, errors and all:
  // the reader stops at the first error, so a later one can't be told from one the merge made.
  const error = readSettings(schema, text).error;
  if (error && !readSettings(schema, remote).error && !sameError(error, readSettings(schema, local).error)) {
    return { text: local, conflicts: bothChanged, dropped: false };
  }
  return { text, conflicts, dropped: false };
}
