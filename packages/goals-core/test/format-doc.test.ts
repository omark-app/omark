import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { areas, goalLine, notNow, parseGoals, serializeGoals } from '../src/index.ts';

// doc/format.md's Omark Goals part (roadmap G.4) must say what goals-core does.
const doc = readFileSync(new URL('../../../doc/format.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const part = doc.slice(doc.indexOf('## Omark Goals'));

test("the format doc's goals.md example reads as it says, and round-trips", () => {
  const example = /```markdown\n([\s\S]*?)```/.exec(part)![1]!;
  const d = parseGoals(example);
  expect(serializeGoals(d)).toBe(example);
  expect(d.vision).toBe('I feel happy, fulfilled and peaceful.');
  const [climbing] = areas(d);
  expect(climbing).toMatchObject({ name: 'Climbing', tag: 'climbing', picture: { path: 'images/climbing.jpg' } });
  expect(climbing!.goals.map((g) => [g.code, g.achieved])).toEqual([[null, false], ['CLIMB', false], [null, true]]);
  expect(notNow(d).map((i) => i.text)).toEqual(['New client projects that need an office']);
});

test('the goal line the format doc says the app writes is the one goals-core writes', () => {
  expect(part).toContain('`- [ ] {text} #{CODE} ✏️ {date} 📅 {due} ➕ {set} ✅ {done}`');
  expect(goalLine({ text: 'T', code: 'C', changedOn: 'E', due: 'D', setOn: 'S', achieved: true, doneOn: 'X' })).toBe('- [x] T #C ✏️ E 📅 D ➕ S ✅ X');
});
