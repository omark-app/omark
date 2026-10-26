import { expect, test } from 'vitest';
import type { Project } from '../src/projects.ts';
import { buildReport, reportToMarkdown, roundUp } from '../src/report.ts';
import type { Report, ReportOptions } from '../src/report.ts';
import type { EventRow } from '../src/rows.ts';

function row(over: Partial<EventRow>): EventRow {
  return {
    date: '2026-10-22',
    start: '2026-10-22T09:00+00:00',
    end: '2026-10-22T10:00+00:00',
    hours: 1,
    project: 'ACME',
    category: '',
    description: '',
    allDay: false,
    known: true,
    calendar: 'c',
    eventId: 'e',
    extra: {},
    ...over,
  };
}

function project(over: Partial<Project>): Project {
  return {
    code: 'ACME',
    description: 'Acme',
    client: 'Acme Corp',
    rate: 33.33,
    currency: 'EUR',
    archived: '',
    extra: {},
    ...over,
  };
}

const opts: ReportOptions = {
  range: { from: '2026-10-01', to: '2026-10-31' },
  rounding: 0,
  includePlanned: false,
  nowMs: Date.parse('2026-11-30T00:00:00Z'),
};

test('roundUp keeps exact minutes stored at 4 decimals', () => {
  expect(roundUp(0.1667, 5)).toBe(0.1667);
  expect(roundUp(0.6667, 5)).toBe(0.6667);
  expect(roundUp(0.3333, 15)).toBe(0.5);
  expect(roundUp(0.25, 15)).toBe(0.25);
  expect(roundUp(0, 15)).toBe(0);
});

test('money is computed in whole cents', () => {
  const r = buildReport([row({ hours: 2.5 })], [project({})], opts);
  expect(r.projects[0]!.money).toEqual({ amount: 83.33, currency: 'EUR' });
  expect(reportToMarkdown(r)).toContain('83.33 EUR');
});

test('a currency total is the sum of the project cents', () => {
  const projects = [project({}), project({ code: 'ACME2', rate: 33.33 }), project({ code: 'ACME3', rate: 10.01 })];
  const r = buildReport(
    [row({ hours: 2.5 }), row({ project: 'ACME2', hours: 2.5, eventId: 'b' }), row({ project: 'ACME3', hours: 0.5, eventId: 'c' })],
    projects,
    opts,
  );
  const cents = r.projects.reduce((s, p) => s + Math.round(p.money!.amount * 100), 0);
  expect(cents).toBe(8333 + 8333 + 501);
  expect(r.money).toEqual([{ amount: cents / 100, currency: 'EUR' }]);
});

function mdWith(over: Partial<EventRow>, desc = 'Acme'): string {
  const report: Report = buildReport([row(over)], [project({ description: desc })], opts);
  return reportToMarkdown(report);
}

test('report text cannot add Markdown structure', () => {
  const md = mdWith({ description: 'x\n## Totals' });
  expect(md).toContain('- 2026-10-22: 1 h, x ## Totals\n');
  expect(md.split('\n').filter((l) => l === '## Totals')).toHaveLength(1);
  expect(mdWith({ description: '<img src=x>' })).toContain('\\<img src=x\\>');
  expect(mdWith({ description: '[a](b)' })).toContain('\\[a\\](b)');
  expect(mdWith({ description: 'a|b`c\\d' })).toContain('a\\|b\\`c\\\\d');
  expect(mdWith({ category: '<b>' })).toContain('### \\<b\\>: 1 h');
  expect(mdWith({}, '[x]\r\ny')).toContain('## ACME: \\[x\\] y');
});

test('the title is escaped', () => {
  const report = buildReport([row({})], [project({ client: '<Acme>' })], { ...opts, client: '<Acme>' });
  expect(reportToMarkdown(report).startsWith('# \\<Acme\\>: ')).toBe(true);
});
