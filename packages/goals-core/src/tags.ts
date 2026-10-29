// Area tags (Goals spec 5.1) and the #tags in other apps' titles (spec 6.1).
import { areas } from './goals-file.ts';
import type { GoalsDoc } from './model.ts';
import { notOnlyDigits, TAG } from './syntax.ts';

/** A new area's tag from its name: lower case, diacritics dropped, letters, digits and `-`. */
export function makeTag(name: string): string {
  const tag = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  if (tag === '') return 'area';
  return notOnlyDigits(tag) ? tag : `area-${tag}`;
}

export type TagProblem = 'invalid' | 'code' | 'taken';

/**
 * Why `tag` can't be an area's tag, or null: not a tag Obsidian reads, equal to a project code, or another
 * area's (both ignoring case, as Obsidian does). `except` is the area being tagged, by index.
 */
export function tagProblem(tag: string, doc: GoalsDoc, codes: readonly string[], except?: number): TagProblem | null {
  if (!/^[\p{L}\p{N}_/-]+$/u.test(tag) || !notOnlyDigits(tag)) return 'invalid';
  const t = tag.toLowerCase();
  if (codes.some((c) => c.toLowerCase() === t)) return 'code';
  if (areas(doc).some((a, i) => i !== except && a.tag?.toLowerCase() === t)) return 'taken';
  return null;
}

/** `base`, or `base-2`, `base-3`… when it is taken or a project code. */
export function freeTag(tag: string, doc: GoalsDoc, codes: readonly string[], except?: number): string {
  const problem = tagProblem(tag, doc, codes, except);
  if (problem === null) return tag;
  const base = problem === 'invalid' ? makeTag(tag) : tag;
  if (tagProblem(base, doc, codes, except) === null) return base;
  for (let n = 2; ; n++) {
    const tag = `${base}-${n}`;
    if (tagProblem(tag, doc, codes, except) === null) return tag;
  }
}

/** The `#tags` in a task title or goal line, as written. */
export function titleTags(text: string): string[] {
  return [...text.matchAll(TAG)].map((m) => m[1]!).filter(notOnlyDigits);
}
