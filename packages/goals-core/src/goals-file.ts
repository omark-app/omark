// goals.md: read and write (Goals spec 5). Every section keeps its raw lines; the rest is read from them.
import type { Area, Goal, GoalsDoc, NotNow, NotNowItem, Picture, Section } from './model.ts';
import { dateAfter, isCodeTag, notOnlyDigits, TAG } from './syntax.ts';

const SECTION = /^##(?:[ \t]+(.*))?$/;
const TOP_HEADING = /^#(?:[ \t]|$)/;
const ANY_HEADING = /^#{1,6}(?:[ \t]|$)/;
const GOAL = /^- \[([ xX])\](?:[ \t]+(.*))?$/;
const IMAGE_LINE = /^[ \t]*!\[([^\]\n]*)\]\(([^)\s]+)(?:[ \t]+"[^"]*")?\)[ \t]*$/;
const ITEM = /^([-*+][ \t]+)(.*)$/;
const INDENTED = /^[ \t]+\S/;
const HEADING_TAG = /(?:^|[ \t])#([\p{L}\p{N}_/-]+)$/u;

export const isBlank = (line: string | undefined): boolean => line !== undefined && line.trim() === '';

/** Reads `goals.md`. A BOM and CRLF are accepted. */
export function parseGoals(text: string): GoalsDoc {
  const s = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lines = s === '' ? [] : s.split('\n');
  if (lines.at(-1) === '') lines.pop();
  let first = lines.findIndex((l) => SECTION.test(l));
  if (first < 0) first = lines.length;
  const sections: Section[] = [];
  for (let i = first; i < lines.length; ) {
    let end = i + 1;
    while (end < lines.length && !SECTION.test(lines[end]!)) end++;
    sections.push(readSection(lines.slice(i, end)));
    i = end;
  }
  return withHead({ head: [], vision: '', sections }, lines.slice(0, first));
}

/** Writes `goals.md` with LF line endings and one final newline (an empty doc gives ''). */
export function serializeGoals(doc: GoalsDoc): string {
  const lines = [...doc.head, ...doc.sections.flatMap((s) => s.lines)];
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

export const areas = (doc: GoalsDoc): Area[] => doc.sections.filter((s): s is Area => s.kind === 'area');

/** The items of the first Not now section, or none. */
export function notNow(doc: GoalsDoc): NotNowItem[] {
  return doc.sections.find((s): s is NotNow => s.kind === 'notNow')?.items ?? [];
}

/** `doc` with `head` as its head lines and the vision read from them. */
export function withHead(doc: GoalsDoc, head: string[]): GoalsDoc {
  return { ...doc, head, vision: visionIndices(head).map((i) => head[i]!.trim()).join(' ') };
}

/** The vision lines of a head: the text lines under its first `#` heading, up to the next heading. */
export function visionIndices(head: string[]): number[] {
  const h = head.findIndex((l) => TOP_HEADING.test(l));
  const out: number[] = [];
  if (h < 0) return out;
  for (let i = h + 1; i < head.length && !ANY_HEADING.test(head[i]!); i++) if (!isBlank(head[i])) out.push(i);
  return out;
}

export const headingIndex = (head: string[]): number => head.findIndex((l) => TOP_HEADING.test(l));

/** A section read from its lines, the first being its `##` heading. */
export function readSection(lines: string[]): Section {
  const text = headingText(lines[0]!);
  if (text.replace(/\s+/g, ' ').toLowerCase() === 'not now') return { kind: 'notNow', lines, items: notNowItems(lines) };
  const { name, tag } = splitHeading(text);
  const goals: Goal[] = [];
  lines.forEach((l, i) => {
    const m = i > 0 ? GOAL.exec(l) : null;
    if (m) goals.push(readGoal(i, m[1] !== ' ', m[2] ?? ''));
  });
  const p = pictureIndex(lines);
  const pm = p >= 0 ? IMAGE_LINE.exec(lines[p]!) : null;
  const picture: Picture | null = pm ? { alt: pm[1]!, path: pm[2]! } : null;
  const vision = areaVisionIndices(lines).map((i) => lines[i]!.trim()).join(' ');
  return { kind: 'area', lines, name, tag, picture, vision, goals };
}

const headingText = (line: string): string => (SECTION.exec(line)?.[1] ?? '').trim();

/** An area heading's name and tag: the tag is its last word when that is a `#tag`. */
export function splitHeading(text: string): { name: string; tag: string | null } {
  const m = HEADING_TAG.exec(text);
  if (!m || !notOnlyDigits(m[1]!)) return { name: text, tag: null };
  return { name: text.slice(0, m.index).trim(), tag: m[1]! };
}

/** The index of an area's picture line, or -1. */
export function pictureIndex(lines: string[]): number {
  return lines.findIndex((l, i) => i > 0 && IMAGE_LINE.test(l));
}

/** The index of an area's first goal line, or its length. */
export function firstGoalIndex(lines: string[]): number {
  const i = lines.findIndex((l, k) => k > 0 && GOAL.test(l));
  return i < 0 ? lines.length : i;
}

/** The vision text lines of an area: text before its first goal, other than its picture and headings. */
export function areaVisionIndices(lines: string[]): number[] {
  const p = pictureIndex(lines);
  const out: number[] = [];
  for (let i = 1; i < firstGoalIndex(lines); i++) {
    if (i !== p && !isBlank(lines[i]) && !ANY_HEADING.test(lines[i]!)) out.push(i);
  }
  return out;
}

/** The end of the block starting at `i`: the line and the indented lines under it. */
export function blockEnd(lines: string[], i: number): number {
  let end = i + 1;
  while (end < lines.length && INDENTED.test(lines[end]!)) end++;
  return end;
}

function notNowItems(lines: string[]): NotNowItem[] {
  const out: NotNowItem[] = [];
  lines.forEach((l, i) => {
    const m = i > 0 ? ITEM.exec(l) : null;
    if (m) out.push({ line: i, text: m[2]!.trim() });
  });
  return out;
}

/** The list marker of a Not now line (`- `, `* `, `+ `). */
export const itemMarker = (line: string): string => ITEM.exec(line)?.[1] ?? '- ';

function readGoal(line: number, achieved: boolean, text: string): Goal {
  const spans: [number, number][] = [];
  const take = (sign: string) => {
    const f = dateAfter(text, sign);
    if (!f) return null;
    spans.push(f.span);
    return f.value;
  };
  const due = take('📅');
  const setOn = take('➕');
  const changedOn = take('✏');
  const doneOn = achieved ? take('✅') : null;
  // The last code-shaped tag is the code: the app writes it after the text, which may hold another.
  let code: string | null = null;
  let codeSpan: [number, number] | null = null;
  for (const m of text.matchAll(TAG)) {
    if (isCodeTag(m[1]!) && !spans.some(([s, e]) => m.index >= s && m.index < e)) {
      code = m[1]!;
      codeSpan = [m.index, m.index + m[0].length];
    }
  }
  if (codeSpan) spans.push(codeSpan);
  // Remove right to left so earlier offsets stay valid; each gap becomes one space.
  let rest = text;
  for (const [s, e] of spans.sort((a, b) => b[0] - a[0])) rest = `${rest.slice(0, s).trimEnd()} ${rest.slice(e).trimStart()}`;
  return { line, text: rest.trim(), achieved, due, setOn, changedOn, doneOn, code };
}

/** The line the app writes for a goal: `- [ ] {text} #{CODE} ✏️ {date} 📅 {due} ➕ {set} ✅ {done}`. */
export function goalLine(g: Omit<Goal, 'line'>): string {
  // ✏️ goes before 📅: Obsidian Tasks reads its signs from the line's end and stops at one it doesn't know.
  return [
    g.achieved ? '- [x]' : '- [ ]',
    g.text,
    g.code ? `#${g.code}` : '',
    g.changedOn ? `✏️ ${g.changedOn}` : '',
    g.due ? `📅 ${g.due}` : '',
    g.setOn ? `➕ ${g.setOn}` : '',
    g.achieved && g.doneOn ? `✅ ${g.doneOn}` : '',
  ].filter((p) => p !== '').join(' ');
}

export const imageLine = (p: Picture): string => `![${p.alt}](${p.path})`;
