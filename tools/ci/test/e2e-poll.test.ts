import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Playwright's expect.poll backs off to checking once a second, so a check that waits for the 1 s save passes
// about 0.8 s late, ~180 times per run. The specs poll through e2e/poll.ts, which checks every 100 ms (#132).
const APPS = ['tasks', 'time', 'omark'];
const dir = (app: string) => new URL(`../../../apps/${app}/e2e/`, import.meta.url);
const specs = (app: string) => readdirSync(dir(app)).filter((f) => f.endsWith('.spec.ts'));

describe('e2e polling', () => {
  it.each(APPS)('%s: every spec polls through the 100 ms helper', (app) => {
    for (const spec of specs(app)) {
      const text = readFileSync(new URL(spec, dir(app)), 'utf8');
      expect(text, spec).not.toMatch(/expect\s*\.poll\(/);
      if (/\bpoll\(/.test(text)) expect(text, spec).toContain("import { poll } from './poll';");
    }
  });

  it.each(APPS)('%s: the helper checks every 100 ms unless a spec says otherwise', (app) => {
    const helper = readFileSync(new URL('poll.ts', dir(app)), 'utf8');
    expect(helper).toContain('expect.poll(fn, { intervals: [100], ...options })');
  });
});
