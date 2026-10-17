import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { formatRepeat, nextDate, parseDone, parseRepeat, parseTasks, serializeDone, serializeTasks } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(resolve(here, '../../../.claude/skills/taskapp-files/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

const lines = skill.split('\n');
const blocks = [...skill.matchAll(/^```markdown[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)].map((m) => m[1]!);
const fenceOpenings = lines.filter((l) => /^```markdown[ \t]*$/.test(l)).length;

/** Cells of every row under `header` (after the separator) up to the first non-table line. */
function tableRows(header: string): string[][] {
  const at = lines.findIndex((l) => l.trim() === header);
  if (at < 0) return [];
  const rows: string[][] = [];
  for (let i = at + 2; i < lines.length && lines[i]!.startsWith('|'); i++) {
    rows.push(lines[i]!.split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

const unquote = (c: string) => c.replace(/^`|`$/g, '');
const rows = tableRows('| rule | due | completed on | next |');
const wording = tableRows('| write | meaning |');

describe('SKILL.md', () => {
  test('has the required frontmatter', () => {
    expect(skill).toMatch(/^---\nname: taskapp-files\ndescription: Use when reading or editing TaskApp's tasks\.md, done\.md or config\.yaml\n---\n/);
  });

  test('has markdown examples', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  test.each(blocks.map((b, i) => [i, b] as const))('markdown block %i round-trips', (_i, block) => {
    if (block.startsWith('- [x]')) expect(serializeDone(parseDone(block))).toBe(block);
    else expect(serializeTasks(parseTasks(block))).toBe(block);
  });

  test('checks every markdown fence', () => {
    expect(blocks).toHaveLength(fenceOpenings);
  });

  test('has the next-date table with at least the five Task 7 examples', () => {
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  test.each(rows)('%s, due %s, completed %s -> %s', (...cells) => {
    expect(cells).toHaveLength(4);
    const [rule, due, completedOn, next] = cells;
    // `none` in the due column is a task with no 📅.
    for (const d of [due === 'none' ? '2000-01-01' : due, completedOn, next]) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const parsed = parseRepeat(unquote(rule!));
    expect(parsed).not.toBeNull();
    expect(nextDate(parsed!, due === 'none' ? null : due!, completedOn!)).toBe(next);
  });

  test('every repeat wording row parses and formats back to itself', () => {
    expect(wording.length).toBeGreaterThanOrEqual(8);
    for (const cells of wording) {
      expect(cells).toHaveLength(2);
      const text = unquote(cells[0]!);
      const parsed = parseRepeat(text);
      expect(parsed, text).not.toBeNull();
      expect(formatRepeat(parsed!), text).toBe(text);
    }
  });
});
