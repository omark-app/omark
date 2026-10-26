// Client reports: model, Markdown and CSV.
import { groupCategories } from './categories.ts';
import { toCsv } from './csv.ts';
import { compareRows, EVENT_COLUMNS } from './events-file.ts';
import { formatHours, roundHours } from './hours.ts';
import type { Project } from './projects.ts';
import type { EventRow } from './rows.ts';
import { inRange, isDone } from './summary.ts';
import type { DateRange } from './summary.ts';
import { parseInstant } from './zone.ts';

export type Rounding = 0 | 5 | 15 | 30;
export interface ReportOptions {
  range: DateRange;
  codes?: string[];
  client?: string;
  rounding: Rounding;
  includePlanned: boolean;
  nowMs: number;
}
export interface Money {
  amount: number;
  currency: string;
}
export interface ReportLine {
  date: string;
  hours: number;
  description: string;
}
export interface ReportCategory {
  name: string;
  hours: number;
  lines: ReportLine[];
}
export interface ReportProject {
  code: string;
  description: string;
  client: string;
  hours: number;
  money: Money | null;
  categories: ReportCategory[];
}
export interface Report {
  options: ReportOptions;
  projects: ReportProject[];
  hours: number;
  /** One entry per currency, never summed across currencies. */
  money: Money[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => roundHours(xs.reduce((a, b) => a + b, 0));

/** Hours rounded up to the next `minutes`; 0 leaves them alone. */
export function roundUp(hours: number, minutes: Rounding): number {
  if (minutes === 0) return hours;
  return roundHours((Math.ceil((hours * 60) / minutes - 1e-9) * minutes) / 60);
}

function codesOf(opts: ReportOptions): string[] {
  return (opts.codes ?? []).map((c) => c.toUpperCase());
}

/** The known rows the report is about, in file order. */
function select(rows: EventRow[], projects: Project[], opts: ReportOptions): EventRow[] {
  const codes = codesOf(opts);
  const client = opts.client?.trim();
  let allowed: Set<string> | null = null;
  if (codes.length > 0) allowed = new Set(codes);
  else if (client) allowed = new Set(projects.filter((p) => p.client === client).map((p) => p.code));
  return rows
    .filter(
      (r) =>
        r.known &&
        inRange(r, opts.range) &&
        (allowed === null || allowed.has(r.project)) &&
        (opts.includePlanned || isDone(r, opts.nowMs)),
    )
    .sort(compareRows);
}

function money(project: Project | undefined, hours: number): Money | null {
  if (!project || project.rate === null || project.currency === '') return null;
  return { amount: round2(project.rate * hours), currency: project.currency };
}

function byCategoryName(a: ReportCategory, b: ReportCategory): number {
  if ((a.name === '') !== (b.name === '')) return a.name === '' ? 1 : -1;
  return cmp(a.name, b.name);
}

export function buildReport(rows: EventRow[], projects: Project[], opts: ReportOptions): Report {
  const chosen = select(rows, projects, opts);
  const byProject = new Map<string, EventRow[]>();
  for (const r of chosen) {
    const list = byProject.get(r.project);
    if (list) list.push(r);
    else byProject.set(r.project, [r]);
  }
  const out: ReportProject[] = [];
  for (const [code, list] of byProject) {
    const info = projects.find((p) => p.code === code);
    const categories: ReportCategory[] = [...groupCategories(list).values()].map((g) => {
      const lines = g.rows.map((r) => ({
        date: r.date,
        start: r.start,
        hours: roundUp(r.hours, opts.rounding),
        description: r.description,
      }));
      lines.sort((a, b) => cmp(a.date, b.date) || parseInstant(a.start) - parseInstant(b.start));
      return {
        name: g.name,
        hours: sum(lines.map((l) => l.hours)),
        lines: lines.map(({ date, hours, description }) => ({ date, hours, description })),
      };
    });
    categories.sort(byCategoryName);
    const hours = sum(categories.map((c) => c.hours));
    out.push({
      code,
      description: info?.description ?? '',
      client: info?.client ?? '',
      hours,
      money: money(info, hours),
      categories,
    });
  }
  out.sort((a, b) => cmp(a.code, b.code));

  const perCurrency = new Map<string, number>();
  for (const p of out) {
    if (p.money) perCurrency.set(p.money.currency, (perCurrency.get(p.money.currency) ?? 0) + p.money.amount);
  }
  const totals = [...perCurrency]
    .map(([currency, amount]) => ({ amount: round2(amount), currency }))
    .sort((a, b) => cmp(a.currency, b.currency));
  return { options: opts, projects: out, hours: sum(out.map((p) => p.hours)), money: totals };
}

const amountText = (m: Money) => `${m.amount.toFixed(2)} ${m.currency}`;

function titleOf(opts: ReportOptions): string {
  const codes = codesOf(opts);
  if (codes.length > 0) return codes.join(', ');
  return opts.client?.trim() || 'All projects';
}

/** The report as Markdown, ending with a single newline. */
export function reportToMarkdown(report: Report): string {
  const o = report.options;
  const lines: string[] = [`# ${titleOf(o)}: ${o.range.from} to ${o.range.to}`, ''];
  let intro = o.includePlanned ? 'Done and planned time.' : 'Done time only.';
  if (o.rounding !== 0) intro += ` Rounded up to ${o.rounding} minutes per event.`;
  lines.push(intro, '');

  for (const p of report.projects) {
    lines.push(p.description ? `## ${p.code}: ${p.description}` : `## ${p.code}`, '');
    for (const c of p.categories) {
      lines.push(`### ${c.name === '' ? '(no category)' : c.name}: ${formatHours(c.hours)} h`, '');
      for (const l of c.lines) {
        lines.push(`- ${l.date}: ${formatHours(l.hours)} h${l.description ? `, ${l.description}` : ''}`);
      }
      lines.push('');
    }
    lines.push(`**${p.code}: ${formatHours(p.hours)} h${p.money ? `, ${amountText(p.money)}` : ''}**`, '');
  }

  const cell = (a: string, b: string, c: string) => `| ${a} | ${b} | ${c} |`;
  lines.push('## Totals', '', cell('Project', 'Hours', 'Amount'), '|---|---|---|');
  for (const p of report.projects) {
    lines.push(cell(p.code, formatHours(p.hours), p.money ? amountText(p.money) : ''));
  }
  const total = report.money.map(amountText).join(', ');
  lines.push(cell('**Total**', `**${formatHours(report.hours)}**`, total ? `**${total}**` : ''));
  return lines.join('\n') + '\n';
}

/** A text cell that starts like a formula gets a leading `'`, so Excel shows it as text. */
function safeCell(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** The chosen rows as an events file, with rounded hours. */
export function reportToCsv(rows: EventRow[], projects: Project[], opts: ReportOptions): string {
  const out: string[][] = [[...EVENT_COLUMNS]];
  for (const r of select(rows, projects, opts)) {
    out.push([
      r.date,
      r.start,
      r.end,
      formatHours(roundUp(r.hours, opts.rounding)),
      safeCell(r.project),
      safeCell(r.category),
      safeCell(r.description),
      r.allDay ? 'true' : 'false',
      r.known ? 'true' : 'false',
      safeCell(r.calendar),
      safeCell(r.eventId),
    ]);
  }
  return toCsv(out);
}
