import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { nextDate, parseDone, parseRepeat, parseTasks, serializeDone, serializeTasks } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(resolve(here, '../../../.claude/skills/taskapp-files/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

const blocks = [...skill.matchAll(/^```markdown\n([\s\S]*?)^```$/gm)].map((m) => m[1]!);

const rows = skill
  .split('\n')
  .filter((l) => l.startsWith('|'))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
  .filter((c) => c.length === 4 && /^\d{4}-\d{2}-\d{2}$/.test(c[2]!) && /^\d{4}-\d{2}-\d{2}$/.test(c[3]!));

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

  test('has the next-date table with at least the five Task 7 examples', () => {
    expect(skill).toContain('| rule | due | completed on | next |');
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  test.each(rows)('%s, due %s, completed %s -> %s', (rule, due, completedOn, next) => {
    const parsed = parseRepeat(rule!.replace(/^`|`$/g, ''));
    expect(parsed).not.toBeNull();
    expect(nextDate(parsed!, due!, completedOn!)).toBe(next);
  });
});
