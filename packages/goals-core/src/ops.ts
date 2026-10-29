// Edits to goals.md, keeping the spec's rules (Goals spec 5): tags made once, ➕ ✏️ ✅ written on change,
// and every line an edit doesn't touch kept as it was. Each returns a new doc (the same one when nothing
// changes); areas, goals and Not now items are given by index.
import {
  areaVisionIndices, blockEnd, firstGoalIndex, goalLine, headingIndex, imageLine, isBlank, itemMarker, pictureIndex,
  readSection, visionIndices, withHead,
} from './goals-file.ts';
import type { Area, Goal, GoalsDoc, ISODate, NotNow, Picture, Section } from './model.ts';
import { oneLine } from './syntax.ts';
import { freeTag, makeTag } from './tags.ts';

/** Sets the vision line, adding a `# Vision` heading when the file has none. */
export function setVision(doc: GoalsDoc, text: string): GoalsDoc {
  const t = oneLine(text);
  if (t === doc.vision) return doc;
  const followed = doc.sections.length > 0;
  const h = headingIndex(doc.head);
  const head = h < 0
    ? put(doc.head, doc.head.length, ['# Vision', '', t], followed)
    : replaceText(doc.head, visionIndices(doc.head), t, h + 1, followed);
  return withHead(doc, head);
}

export interface AreaFields {
  vision?: string;
  picture?: Picture | null;
}

/** Adds an area after the last one (before Not now when there is none), its tag made from its name. */
export function addArea(
  doc: GoalsDoc, name: string, codes: readonly string[], fields: AreaFields = {},
): { doc: GoalsDoc; index: number } {
  const n = oneLine(name);
  const lines = [heading(n, freeTag(makeTag(n), doc, codes))];
  if (fields.picture) lines.push('', imageLine(fields.picture));
  const vision = oneLine(fields.vision ?? '');
  if (vision) lines.push('', vision);
  const s = doc.sections;
  let lastArea = -1;
  s.forEach((x, k) => { if (x.kind === 'area') lastArea = k; });
  const notNowAt = notNowPos(doc);
  const pos = lastArea >= 0 ? lastArea + 1 : notNowAt >= 0 ? notNowAt : s.length;
  if (pos < s.length) lines.push('');
  let out = doc;
  if (pos === 0) out = withHead(doc, endBlank(doc.head));
  const sections = [...out.sections];
  if (pos > 0) sections[pos - 1] = readSection(endBlank(sections[pos - 1]!.lines));
  sections.splice(pos, 0, readSection(lines));
  return { doc: { ...out, sections }, index: s.slice(0, pos).filter((x) => x.kind === 'area').length };
}

export interface AreaPatch extends AreaFields {
  name?: string;
}

/**
 * Edits an area's name, vision text or picture. The tag never changes; an untagged heading gets one
 * on its first edit.
 */
export function editArea(doc: GoalsDoc, i: number, patch: AreaPatch, codes: readonly string[]): GoalsDoc {
  const pos = areaPos(doc, i);
  if (pos < 0) return doc;
  const area = doc.sections[pos] as Area;
  const followed = pos < doc.sections.length - 1;
  let lines = area.lines;

  const pic = patch.picture;
  if (pic !== undefined && !samePicture(area.picture, pic)) {
    const p = pictureIndex(lines);
    if (pic === null) lines = cut(lines, p, p + 1);
    else if (p >= 0) lines = lines.with(p, imageLine(pic));
    else lines = put(lines, isBlank(lines[1]) ? 2 : 1, [imageLine(pic)], followed);
  }

  if (patch.vision !== undefined) {
    const t = oneLine(patch.vision);
    if (t !== (readSection(lines) as Area).vision) {
      const p = pictureIndex(lines);
      const at = p >= 0 && p < firstGoalIndex(lines) ? p + 1 : 1;
      lines = replaceText(lines, areaVisionIndices(lines), t, at, followed);
    }
  }

  const name = patch.name !== undefined ? oneLine(patch.name) : area.name;
  const tag = area.tag ?? freeTag(makeTag(name), doc, codes, i);
  if (name !== area.name || tag !== area.tag) lines = lines.with(0, heading(name, tag));

  return lines === area.lines ? doc : withSection(doc, pos, lines);
}

/** Moves area `i` past the next area up (`-1`) or down (`1`), skipping Not now. */
export function moveArea(doc: GoalsDoc, i: number, dir: -1 | 1): GoalsDoc {
  const a = areaPos(doc, i);
  const b = areaPos(doc, i + dir);
  if (a < 0 || b < 0) return doc;
  const s = [...doc.sections];
  [s[a], s[b]] = [s[b]!, s[a]!];
  for (const k of [a, b]) if (k < s.length - 1) s[k] = readSection(endBlank(s[k]!.lines));
  return keepEnd(doc, s);
}

/** Deletes area `i` and its goals. */
export function deleteArea(doc: GoalsDoc, i: number): GoalsDoc {
  const pos = areaPos(doc, i);
  if (pos < 0) return doc;
  return keepEnd(doc, doc.sections.filter((_, k) => k !== pos));
}

export interface NewGoal {
  text: string;
  due: ISODate | null;
  code?: string | null;
}

/** Adds a goal after the area's last one, set today (`➕`). */
export function addGoal(doc: GoalsDoc, i: number, goal: NewGoal, today: ISODate): GoalsDoc {
  const pos = areaPos(doc, i);
  if (pos < 0) return doc;
  const area = doc.sections[pos] as Area;
  const line = goalLine({
    text: oneLine(goal.text), achieved: false, due: goal.due, setOn: today, changedOn: null, doneOn: null,
    code: goal.code ? goal.code.toUpperCase() : null,
  });
  const last = area.goals.at(-1);
  let lines: string[];
  if (last) {
    const at = blockEnd(area.lines, last.line);
    lines = area.lines.toSpliced(at, 0, line);
  } else {
    lines = put(area.lines, lastText(area.lines) + 1, [line], pos < doc.sections.length - 1);
  }
  return withSection(doc, pos, lines);
}

export interface GoalPatch {
  text?: string;
  due?: ISODate | null;
  code?: string | null;
  achieved?: boolean;
}

/**
 * Edits goal `g` of area `i`. A change to its text, date or project writes `✏️` today; ticking writes
 * `✅` today and unticking removes it. The line is written as the app writes goals.
 */
export function editGoal(doc: GoalsDoc, i: number, g: number, patch: GoalPatch, today: ISODate): GoalsDoc {
  const pos = areaPos(doc, i);
  const goal = pos >= 0 ? (doc.sections[pos] as Area).goals[g] : undefined;
  if (!goal) return doc;
  const text = patch.text !== undefined ? oneLine(patch.text) : goal.text;
  const due = patch.due !== undefined ? patch.due : goal.due;
  const code = patch.code !== undefined ? (patch.code ? patch.code.toUpperCase() : null) : goal.code;
  const achieved = patch.achieved ?? goal.achieved;
  const edited = text !== goal.text || due !== goal.due || code !== goal.code;
  if (!edited && achieved === goal.achieved) return doc;
  const next: Goal = {
    ...goal, text, due, code, achieved,
    changedOn: edited ? today : goal.changedOn,
    doneOn: achieved ? (goal.achieved ? goal.doneOn : today) : null,
  };
  return withSection(doc, pos, doc.sections[pos]!.lines.with(goal.line, goalLine(next)));
}

/** Deletes goal `g` of area `i`, with the indented lines under it. */
export function deleteGoal(doc: GoalsDoc, i: number, g: number): GoalsDoc {
  const pos = areaPos(doc, i);
  const goal = pos >= 0 ? (doc.sections[pos] as Area).goals[g] : undefined;
  if (!goal) return doc;
  const lines = doc.sections[pos]!.lines;
  return withSection(doc, pos, cut(lines, goal.line, blockEnd(lines, goal.line)));
}

/** Adds a Not now line after the last one, making the section at the end of the file when there is none. */
export function addNotNow(doc: GoalsDoc, text: string): GoalsDoc {
  const line = `- ${oneLine(text)}`;
  const pos = notNowPos(doc);
  if (pos < 0) {
    const s = [...doc.sections];
    let out = doc;
    if (s.length > 0) s[s.length - 1] = readSection(endBlank(s.at(-1)!.lines));
    else out = withHead(doc, endBlank(doc.head));
    return { ...out, sections: [...s, readSection(['## Not now', '', line])] };
  }
  const section = doc.sections[pos] as NotNow;
  const last = section.items.at(-1);
  const lines = last
    ? section.lines.toSpliced(blockEnd(section.lines, last.line), 0, line)
    : put(section.lines, lastText(section.lines) + 1, [line], pos < doc.sections.length - 1);
  return withSection(doc, pos, lines);
}

/** Edits Not now line `k`, keeping its list marker. */
export function editNotNow(doc: GoalsDoc, k: number, text: string): GoalsDoc {
  const pos = notNowPos(doc);
  const item = pos >= 0 ? (doc.sections[pos] as NotNow).items[k] : undefined;
  if (!item) return doc;
  const lines = doc.sections[pos]!.lines;
  const line = `${itemMarker(lines[item.line]!)}${oneLine(text)}`;
  return line === lines[item.line] ? doc : withSection(doc, pos, lines.with(item.line, line));
}

/** Deletes Not now line `k`, with the indented lines under it. */
export function deleteNotNow(doc: GoalsDoc, k: number): GoalsDoc {
  const pos = notNowPos(doc);
  const item = pos >= 0 ? (doc.sections[pos] as NotNow).items[k] : undefined;
  if (!item) return doc;
  const lines = doc.sections[pos]!.lines;
  return withSection(doc, pos, cut(lines, item.line, blockEnd(lines, item.line)));
}

const heading = (name: string, tag: string): string => ['##', name, `#${tag}`].filter((p) => p !== '').join(' ');

const samePicture = (a: Picture | null, b: Picture | null): boolean => a?.alt === b?.alt && a?.path === b?.path;

/** The index in `sections` of area `i`, or -1. */
function areaPos(doc: GoalsDoc, i: number): number {
  let n = -1;
  return doc.sections.findIndex((s) => s.kind === 'area' && ++n === i);
}

const notNowPos = (doc: GoalsDoc): number => doc.sections.findIndex((s) => s.kind === 'notNow');

function withSection(doc: GoalsDoc, pos: number, lines: string[]): GoalsDoc {
  return { ...doc, sections: doc.sections.with(pos, readSection(lines)) };
}

/**
 * `sections` as the doc's, ending the file as it ended before: when the last section changed, the new last
 * one (or the head) gets the old one's final blank line, or loses its own.
 */
function keepEnd(doc: GoalsDoc, sections: Section[]): GoalsDoc {
  const old = doc.sections.at(-1);
  const wasBlank = isBlank(old?.lines.at(-1));
  const fix = (lines: string[]) => (wasBlank ? endBlank(lines) : trimEnd(lines));
  const last = sections.at(-1);
  if (last === old) return { ...doc, sections };
  if (!last) return { ...withHead(doc, fix(doc.head)), sections };
  return { ...doc, sections: sections.with(-1, readSection(fix(last.lines))) };
}

const endBlank = (lines: string[]): string[] => (lines.length > 0 && !isBlank(lines.at(-1)) ? [...lines, ''] : lines);

function trimEnd(lines: string[]): string[] {
  let end = lines.length;
  while (end > 1 && isBlank(lines[end - 1])) end--;
  return end === lines.length ? lines : lines.slice(0, end);
}

/** The index of the last line with text. */
function lastText(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) if (!isBlank(lines[i])) return i;
  return -1;
}

/** Removes lines `[from, to)` and, when that leaves two blank lines together, one of them. */
function cut(lines: string[], from: number, to: number): string[] {
  const out = lines.toSpliced(from, to - from);
  if (from > 0 && isBlank(out[from - 1]) && isBlank(out[from])) out.splice(from, 1);
  return out;
}

/**
 * Inserts `block` at `at` with a blank line between it and text right before or after it. At the end of
 * the lines, `followed` (another section comes next) asks for a blank line after it too.
 */
function put(lines: string[], at: number, block: string[], followed: boolean): string[] {
  const before = at > 0 && !isBlank(lines[at - 1]) ? [''] : [];
  const after = (at < lines.length ? !isBlank(lines[at]) : followed) ? [''] : [];
  return lines.toSpliced(at, 0, ...before, ...block, ...after);
}

/**
 * Replaces the text lines `v` with one line `t` (none when empty). Lines between them that are blank or in
 * `v` go too; when other lines sit between, only `v` goes and `t` takes the first one's place. With no text
 * lines, `t` goes in at `at` (after a blank line there).
 */
function replaceText(lines: string[], v: number[], t: string, at: number, followed: boolean): string[] {
  if (v.length === 0) return t === '' ? lines : put(lines, isBlank(lines[at]) ? at + 1 : at, [t], followed);
  const first = v[0]!;
  const last = v.at(-1)!;
  const span = lines.slice(first, last + 1).every((l, k) => isBlank(l) || v.includes(first + k));
  if (span) return t === '' ? cut(lines, first, last + 1) : lines.toSpliced(first, last + 1 - first, t);
  let out = lines;
  for (const i of [...v].reverse()) out = i === first && t !== '' ? out.with(i, t) : cut(out, i, i + 1);
  return out;
}
