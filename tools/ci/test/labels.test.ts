import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { planLabels } from '../labels.mjs';

const file = parse(readFileSync(new URL('../../../.github/labels.yml', import.meta.url), 'utf8')) as {
  name: string;
  color: string;
  description: string;
}[];

// Launch spec 6.8, the label table.
const SPEC = [
  'ready', 'good first issue', 'help wanted', 'size:small', 'size:large', 'plan-review', 'plan-approved', 'needs-human',
  'needs-info', 'in-progress', 'format', 'bug', 'enhancement', 'task', 'app:tasks', 'app:time', 'app:goals', 'app:suite',
];

describe('.github/labels.yml', () => {
  it('has every label of the factory, once', () => {
    const names = file.map((l) => l.name);
    for (const name of SPEC) expect(names, name).toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives each a colour and a role-neutral description', () => {
    for (const l of file) {
      expect(l.color, l.name).toMatch(/^[0-9a-f]{6}$/);
      expect(l.description.length, l.name).toBeGreaterThan(0);
      expect(l.description.length, l.name).toBeLessThanOrEqual(100); // GitHub's limit
      expect(l.description, l.name).not.toMatch(/\bAL\b|Claude/);
    }
  });
});

describe('planLabels', () => {
  const wanted = [
    { name: 'ready', color: '1d76db', description: 'Can be picked up' },
    { name: 'task', color: 'c5def5', description: 'Work users don\'t see' },
    { name: 'needs-info', color: 'fbca04', description: 'A question was asked; waiting for the answer' },
  ];

  it('creates what is missing and updates what differs, ignoring colour case', () => {
    const existing = [
      { name: 'ready', color: '1D76DB', description: 'Can be picked up' },
      { name: 'needs-info', color: 'FBCA04', description: 'Claude asked a question; waiting for AL' },
      { name: 'wontfix', color: 'ffffff', description: 'This will not be worked on' },
    ];
    expect(planLabels(wanted, existing)).toEqual({
      create: [wanted[1]],
      update: [wanted[2]],
    });
  });

  it('never deletes a label the file does not list', () => {
    const plan = planLabels([], [{ name: 'wontfix', color: 'ffffff', description: '' }]);
    expect(plan).toEqual({ create: [], update: [] });
  });

  it('matches names ignoring case, as GitHub does', () => {
    const plan = planLabels(wanted.slice(0, 1), [{ name: 'Ready', color: '1d76db', description: 'Can be picked up' }]);
    expect(plan.update).toEqual([wanted[0]]);
  });
});
