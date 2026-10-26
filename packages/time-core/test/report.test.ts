import { expect, test } from 'vitest';
import type { Project } from '../src/projects.ts';
import { buildReport, reportToCsv, reportToMarkdown, roundUp } from '../src/report.ts';
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
    description: 'Acme Corp website rebuild',
    client: 'Acme Corp',
    rate: 120,
    currency: 'EUR',
    archived: '',
    extra: {},
    ...over,
  };
}

const projects: Project[] = [
  project({}),
  project({ code: 'ACME2', description: 'Support', rate: 100, currency: 'PLN' }),
  project({ code: 'FREE', description: 'Pro bono', client: 'Acme Corp', rate: null, currency: '' }),
  project({ code: 'OTHER', description: 'Other', client: 'Other Ltd' }),
];

const NOW = Date.parse('2026-11-30T00:00:00Z');
const opts: ReportOptions = {
  range: { from: '2026-10-01', to: '2026-10-31' },
  client: 'Acme Corp',
  rounding: 15,
  includePlanned: false,
  nowMs: NOW,
};

const rows: EventRow[] = [
  row({ eventId: 'a', category: 'Coding', description: 'new featureX', hours: 1.3333, date: '2026-10-22', start: '2026-10-22T09:00+00:00', end: '2026-10-22T10:20+00:00' }),
  row({ eventId: 'b', category: 'Coding', hours: 2, date: '2026-10-23', start: '2026-10-23T09:00+00:00', end: '2026-10-23T11:00+00:00' }),
  row({ eventId: 'c', project: 'ACME2', hours: 1, date: '2026-10-24', start: '2026-10-24T09:00+00:00', end: '2026-10-24T10:00+00:00' }),
  row({ eventId: 'd', project: 'FREE', hours: 0.5, date: '2026-10-24', start: '2026-10-24T12:00+00:00', end: '2026-10-24T12:30+00:00' }),
  row({ eventId: 'e', project: 'OTHER', hours: 4 }),
  row({ eventId: 'f', project: 'NOPE', known: false, hours: 3 }),
  row({ eventId: 'g', hours: 1, date: '2026-12-01', start: '2026-12-01T09:00+00:00', end: '2026-12-01T10:00+00:00' }),
  row({ eventId: 'h', hours: 1, date: '2026-10-25', start: '2026-12-02T09:00+00:00', end: '2026-12-02T10:00+00:00' }),
];

test('roundUp', () => {
  expect(roundUp(0.3333, 15)).toBe(0.5);
  expect(roundUp(0.25, 15)).toBe(0.25);
  expect(roundUp(0, 15)).toBe(0);
  expect(roundUp(8, 30)).toBe(8);
  expect(roundUp(1.1, 0)).toBe(1.1);
  expect(roundUp(1.3333, 15)).toBe(1.5);
  expect(roundUp(0.01, 5)).toBe(0.0833);
});

test('buildReport for a client: money per currency, never one sum', () => {
  const r = buildReport(rows, projects, opts);
  expect(r.projects.map((p) => p.code)).toEqual(['ACME', 'ACME2', 'FREE']);
  const acme = r.projects[0]!;
  expect(acme.hours).toBe(3.5);
  expect(acme.money).toEqual({ amount: 420, currency: 'EUR' });
  expect(acme.categories).toEqual([
    {
      name: 'Coding',
      hours: 3.5,
      lines: [
        { date: '2026-10-22', hours: 1.5, description: 'new featureX' },
        { date: '2026-10-23', hours: 2, description: '' },
      ],
    },
  ]);
  expect(r.projects[1]!.money).toEqual({ amount: 100, currency: 'PLN' });
  expect(r.projects[2]!.money).toBeNull();
  expect(r.hours).toBe(5);
  expect(r.money).toEqual([
    { amount: 420, currency: 'EUR' },
    { amount: 100, currency: 'PLN' },
  ]);
});

test('planned rows are out by default and in with includePlanned', () => {
  expect(buildReport(rows, projects, opts).projects[0]!.hours).toBe(3.5);
  const withPlanned = buildReport(rows, projects, { ...opts, includePlanned: true });
  expect(withPlanned.projects[0]!.hours).toBe(4.5);
});

test('codes beat client; unknown rows never in', () => {
  const r = buildReport(rows, projects, { ...opts, codes: ['other', 'nope'] });
  expect(r.projects.map((p) => p.code)).toEqual(['OTHER']);
  const all = buildReport(rows, projects, { ...opts, client: undefined });
  expect(all.projects.map((p) => p.code)).toEqual(['ACME', 'ACME2', 'FREE', 'OTHER']);
});

test('the no-category group is last', () => {
  const r = buildReport(
    [
      row({ eventId: 'a' }),
      row({ eventId: 'b', category: 'Zed', date: '2026-10-23', start: '2026-10-23T09:00+00:00', end: '2026-10-23T10:00+00:00' }),
    ],
    projects,
    opts,
  );
  expect(r.projects[0]!.categories.map((c) => c.name)).toEqual(['Zed', '']);
});

const twoProjects: Report = {
  options: opts,
  projects: [
    {
      code: 'ACME',
      description: 'Acme Corp website rebuild',
      client: 'Acme Corp',
      hours: 3.5,
      money: { amount: 420, currency: 'EUR' },
      categories: [
        {
          name: 'Coding',
          hours: 3.5,
          lines: [
            { date: '2026-10-22', hours: 1.5, description: 'new featureX' },
            { date: '2026-10-23', hours: 2, description: '' },
          ],
        },
      ],
    },
    {
      code: 'ACME2',
      description: '',
      client: 'Acme Corp',
      hours: 1,
      money: { amount: 100, currency: 'PLN' },
      categories: [{ name: '', hours: 1, lines: [{ date: '2026-10-24', hours: 1, description: '' }] }],
    },
  ],
  hours: 4.5,
  money: [
    { amount: 420, currency: 'EUR' },
    { amount: 100, currency: 'PLN' },
  ],
};

test('reportToMarkdown', () => {
  expect(reportToMarkdown(twoProjects)).toBe(`# Acme Corp: 2026-10-01 to 2026-10-31

Done time only. Rounded up to 15 minutes per event.

## ACME: Acme Corp website rebuild

### Coding: 3.5 h

- 2026-10-22: 1.5 h, new featureX
- 2026-10-23: 2 h

**ACME: 3.5 h, 420.00 EUR**

## ACME2

### (no category): 1 h

- 2026-10-24: 1 h

**ACME2: 1 h, 100.00 PLN**

## Totals

| Project | Hours | Amount |
|---|---|---|
| ACME | 3.5 | 420.00 EUR |
| ACME2 | 1 | 100.00 PLN |
| **Total** | **4.5** | **420.00 EUR, 100.00 PLN** |
`);
});

test('reportToMarkdown title, planned and no money', () => {
  const noMoney: Report = {
    ...twoProjects,
    options: { ...opts, client: undefined, codes: ['ACME'], rounding: 0, includePlanned: true },
    projects: [{ ...twoProjects.projects[0]!, money: null }],
    hours: 3.5,
    money: [],
  };
  const md = reportToMarkdown(noMoney);
  expect(md.startsWith('# ACME: 2026-10-01 to 2026-10-31\n\nDone and planned time.\n\n')).toBe(true);
  expect(md).toContain('**ACME: 3.5 h**\n');
  expect(md).toContain('| ACME | 3.5 |  |\n');
  expect(md.endsWith('| **Total** | **3.5** |  |\n')).toBe(true);
  const all = reportToMarkdown({ ...noMoney, options: { ...noMoney.options, codes: undefined } });
  expect(all.startsWith('# All projects: ')).toBe(true);
});

test('reportToCsv has the event columns and rounded hours', () => {
  const csv = reportToCsv(rows, projects, opts);
  const lines = csv.split('\n');
  expect(lines[0]).toBe('date,start,end,hours,project,category,description,all_day,known,calendar,event_id');
  expect(lines[1]).toBe('2026-10-22,2026-10-22T09:00+00:00,2026-10-22T10:20+00:00,1.5,ACME,Coding,new featureX,false,true,c,a');
  expect(lines).toHaveLength(6); // header, a, b, c, d, and the empty piece after the final newline
  expect(csv.endsWith('\n')).toBe(true);
});

test('reportToCsv neutralises spreadsheet formulas', () => {
  const csv = reportToCsv(
    [
      row({ eventId: '@x', description: '=HYPERLINK("x")', category: '+1', date: '2026-10-22' }),
      row({ eventId: 'y', description: '-5', category: 'ok', date: '2026-10-23', start: '2026-10-23T09:00+00:00', end: '2026-10-23T10:00+00:00' }),
      row({ eventId: 'z', description: '\tTab', date: '2026-10-24', start: '2026-10-24T09:00+00:00', end: '2026-10-24T10:00+00:00' }),
    ],
    projects,
    opts,
  );
  expect(csv).toContain(`,'+1,"'=HYPERLINK(""x"")",false,true,c,'@x\n`);
  expect(csv).toContain(",ok,'-5,");
  expect(csv).toContain(",'\tTab,");
});

const plainOpts: ReportOptions = {
  range: { from: '2026-10-01', to: '2026-10-31' },
  rounding: 0,
  includePlanned: false,
  nowMs: NOW,
};

test('roundUp keeps exact minutes stored at 4 decimals', () => {
  expect(roundUp(0.1667, 5)).toBe(0.1667);
  expect(roundUp(0.6667, 5)).toBe(0.6667);
  expect(roundUp(0.3333, 15)).toBe(0.5);
  expect(roundUp(0.25, 15)).toBe(0.25);
  expect(roundUp(0, 15)).toBe(0);
});

test('money is computed in whole cents', () => {
  const r = buildReport([row({ hours: 2.5 })], [project({ rate: 33.33 })], plainOpts);
  expect(r.projects[0]!.money).toEqual({ amount: 83.33, currency: 'EUR' });
  expect(reportToMarkdown(r)).toContain('83.33 EUR');
});

test('a currency total is the sum of the project cents', () => {
  const projects = [project({ rate: 33.33 }), project({ code: 'ACME2', rate: 33.33 }), project({ code: 'ACME3', rate: 10.01 })];
  const r = buildReport(
    [row({ hours: 2.5 }), row({ project: 'ACME2', hours: 2.5, eventId: 'b' }), row({ project: 'ACME3', hours: 0.5, eventId: 'c' })],
    projects,
    plainOpts,
  );
  const cents = r.projects.reduce((s, p) => s + Math.round(p.money!.amount * 100), 0);
  expect(cents).toBe(8333 + 8333 + 501);
  expect(r.money).toEqual([{ amount: cents / 100, currency: 'EUR' }]);
});

function mdWith(over: Partial<EventRow>, desc = 'Acme'): string {
  const report: Report = buildReport([row(over)], [project({ description: desc })], plainOpts);
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
  const report = buildReport([row({})], [project({ client: '<Acme>' })], { ...plainOpts, client: '<Acme>' });
  expect(reportToMarkdown(report).startsWith('# \\<Acme\\>: ')).toBe(true);
});
