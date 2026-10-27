// Client reports: model, Markdown and CSV.
import { groupCategories } from './categories.ts';
import { toCsv } from './csv.ts';
import { compareRows, EVENT_COLUMNS } from './events-file.ts';
import { formatHours, rowSeconds, secondsToHours } from './hours.ts';
import type { Project } from './projects.ts';
import { compareText, type EventRow } from './rows.ts';
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

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Seconds rounded up to the next `minutes`; 0 leaves them alone. */
function roundUpSeconds(seconds: number, minutes: Rounding): number {
  if (minutes === 0) return seconds;
  const step = minutes * 60;
  return Math.ceil(seconds / step) * step;
}

/**
 * Hours rounded up to the next `minutes`; 0 leaves them alone. Works on whole
 * seconds, so hours stored at 4 decimals (0.1667) still round as 10 minutes.
 */
export function roundUp(hours: number, minutes: Rounding): number {
  if (minutes === 0) return hours;
  return secondsToHours(roundUpSeconds(Math.round(hours * 3600), minutes));
}

/** A row's billed seconds: its exact length rounded up to the next `minutes`. */
function billedSeconds(row: EventRow, minutes: Rounding): number {
  return roundUpSeconds(rowSeconds(row), minutes);
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

function money(project: Project | undefined, seconds: number): Money | null {
  if (!project || project.rate === null || project.currency === '') return null;
  const cents = Math.round(Number(((project.rate * seconds) / 3600 * 100).toPrecision(12)));
  return { amount: cents / 100, currency: project.currency };
}

function byCategoryName(a: ReportCategory, b: ReportCategory): number {
  if ((a.name === '') !== (b.name === '')) return a.name === '' ? 1 : -1;
  return compareText(a.name, b.name);
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
  let totalSeconds = 0;
  for (const [code, list] of byProject) {
    const info = projects.find((p) => p.code === code);
    let projectSeconds = 0;
    const categories: ReportCategory[] = [...groupCategories(list).values()].map((g) => {
      const lines = g.rows.map((r) => ({
        date: r.date,
        start: r.start,
        seconds: billedSeconds(r, opts.rounding),
        description: r.description,
      }));
      lines.sort((a, b) => compareText(a.date, b.date) || parseInstant(a.start) - parseInstant(b.start));
      const seconds = sum(lines.map((l) => l.seconds));
      projectSeconds += seconds;
      return {
        name: g.name,
        hours: secondsToHours(seconds),
        lines: lines.map(({ date, seconds, description }) => ({ date, hours: secondsToHours(seconds), description })),
      };
    });
    categories.sort(byCategoryName);
    totalSeconds += projectSeconds;
    out.push({
      code,
      description: info?.description ?? '',
      client: info?.client ?? '',
      hours: secondsToHours(projectSeconds),
      money: money(info, projectSeconds),
      categories,
    });
  }
  out.sort((a, b) => compareText(a.code, b.code));

  const perCurrency = new Map<string, number>();
  for (const p of out) {
    if (p.money) {
      perCurrency.set(p.money.currency, (perCurrency.get(p.money.currency) ?? 0) + Math.round(p.money.amount * 100));
    }
  }
  const totals = [...perCurrency]
    .map(([currency, cents]) => ({ amount: cents / 100, currency }))
    .sort((a, b) => compareText(a.currency, b.currency));
  return { options: opts, projects: out, hours: secondsToHours(totalSeconds), money: totals };
}

/** Text from calendar events or files, safe inside one Markdown line. */
function md(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/[\\<>[\]|`]/g, (c) => `\\${c}`);
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
  const lines: string[] = [`# ${md(titleOf(o))}: ${o.range.from} to ${o.range.to}`, ''];
  let intro = o.includePlanned ? 'Done and planned time.' : 'Done time only.';
  if (o.rounding !== 0) intro += ` Rounded up to ${o.rounding} minutes per event.`;
  lines.push(intro, '');

  for (const p of report.projects) {
    lines.push(p.description ? `## ${p.code}: ${md(p.description)}` : `## ${p.code}`, '');
    for (const c of p.categories) {
      lines.push(`### ${c.name === '' ? '(no category)' : md(c.name)}: ${formatHours(c.hours)} h`, '');
      for (const l of c.lines) {
        lines.push(`- ${l.date}: ${formatHours(l.hours)} h${l.description ? `, ${md(l.description)}` : ''}`);
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
      formatHours(secondsToHours(billedSeconds(r, opts.rounding))),
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
