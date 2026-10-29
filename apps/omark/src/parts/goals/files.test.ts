import { expect, it } from 'vitest';
import { goalsConfig, GOALS_SCHEMA, mergeGoalsText } from './files.ts';

const BASE = '# Vision\n\nCalm.\n\n## Home #home\n- [ ] Fix the roof 📅 2027-01-01\n';

it('merges goals.md line by line: both sides\' new goals are kept, an edit on one side wins', () => {
  const local = BASE.replace('Calm.', 'Calm and strong.') + '- [ ] Paint the hall 📅 2027-03-01\n';
  const remote = BASE + '- [ ] New windows 📅 2027-05-01\n';
  const merged = mergeGoalsText(BASE, local, remote);
  expect(merged).toContain('Calm and strong.');
  expect(merged).toContain('- [ ] Paint the hall');
  expect(merged).toContain('- [ ] New windows');
  expect(merged.endsWith('\n')).toBe(true);
  expect(mergeGoalsText(BASE, BASE, remote)).toBe(remote);
  expect(mergeGoalsText('', '', '')).toBe('');
});

it('reads stale_after from goals/config.yaml: 1–24 months, default 3, a bad value falls back', () => {
  expect(goalsConfig('')).toEqual({ staleAfter: 3, error: null });
  expect(goalsConfig('stale_after: 6\n')).toEqual({ staleAfter: 6, error: null });
  expect(goalsConfig('stale_after: 30\n').staleAfter).toBe(3);
  expect(goalsConfig('stale_after: 30\n').error).not.toBeNull();
  expect(goalsConfig('other: x\nstale_after: 2\n').staleAfter).toBe(2);
  expect(GOALS_SCHEMA.file).toBe('config.yaml');
});
