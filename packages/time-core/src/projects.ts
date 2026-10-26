// projects.csv: read, write, validate, edit and merge.

import { parseCsv, toCsv } from './csv.ts';
import { isValidCode } from './title.ts';

export const PROJECT_COLUMNS: readonly string[] = ['code', 'description', 'client', 'rate', 'currency', 'archived'];

export interface Project {
  code: string; // upper case
  description: string;
  client: string;
  rate: number | null; // per hour
  rateText?: string; // an invalid rate as typed; `rate` is null
  currency: string; // upper case
  archived: string; // '' or YYYY-MM-DD
  extra: Record<string, string>; // unknown columns, keyed by header
}

/** A problem in the file. `line` is the CSV line, or null for edited rows. */
export interface Problem {
  line: number | null;
  message: string;
}

export interface ProjectsFile {
  projects: Project[];
  columns: string[]; // header spellings, in file order
  problems: Problem[];
}

const CODE_MESSAGE = 'Code must be 2–20 letters, digits or _, starting with a letter';
const RATE_NUMBER_MESSAGE = 'Rate must be a number';
const RATE_CURRENCY_MESSAGE = 'Rate needs a currency';
const CURRENCY_MESSAGE = 'Currency must be a 3-letter code like EUR';
const ARCHIVED_MESSAGE = 'Archived must be a date (YYYY-MM-DD)';

/** The standard column a header names, or null for an unknown one. */
function standardName(header: string): string | null {
  const name = header.trim().toLowerCase();
  return PROJECT_COLUMNS.includes(name) ? name : null;
}

/** The key a header has in a project: the standard name, or the header itself. */
function keyOf(header: string): string {
  return standardName(header) ?? header;
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

/** The problems of a project, in order, against the projects before it. */
function problemsOf(p: Project, others: Project[]): string[] {
  const out: string[] = [];
  if (!isValidCode(p.code)) out.push(CODE_MESSAGE);
  else if (others.some((o) => o.code === p.code)) out.push(`${p.code} already exists`);
  if (p.rateText || (p.rate !== null && (!Number.isFinite(p.rate) || p.rate < 0))) out.push(RATE_NUMBER_MESSAGE);
  else if (p.rate !== null && p.currency === '') out.push(RATE_CURRENCY_MESSAGE);
  if (p.currency !== '' && !/^[A-Z]{3}$/.test(p.currency)) out.push(CURRENCY_MESSAGE);
  if (p.archived !== '' && !isRealDate(p.archived)) out.push(ARCHIVED_MESSAGE);
  return out;
}

function allProblems(projects: Project[]): Problem[] {
  return projects.flatMap((p, i) =>
    problemsOf(p, projects.slice(0, i)).map((message) => ({ line: null, message })),
  );
}

/** Read projects.csv. Rows with problems stay, so nothing is lost on write. */
export function parseProjects(text: string): ProjectsFile {
  const { rows, lines, unterminated } = parseCsv(text);
  const quoteProblem: Problem[] =
    unterminated === null ? [] : [{ line: unterminated, message: `Unclosed quote starting on line ${unterminated}` }];
  if (rows.length === 0) return { projects: [], columns: [...PROJECT_COLUMNS], problems: quoteProblem };

  const header = rows[0]!;
  const columns = [...header];
  for (const name of PROJECT_COLUMNS) {
    if (!header.some((h) => standardName(h) === name)) columns.push(name);
  }

  const projects: Project[] = [];
  const problems: Problem[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    if (cells.every((c) => c.trim() === '')) continue;
    const std: Record<string, string> = {};
    const extra: Record<string, string> = {};
    header.forEach((h, i) => {
      const value = (cells[i] ?? '').trim();
      const name = standardName(h);
      if (name === null) extra[h] = value;
      else if (!(name in std)) std[name] = value;
    });
    const rateText = std.rate ?? '';
    const rate = rateText === '' ? null : Number(rateText);
    const rateBad = rate !== null && !(Number.isFinite(rate) && rate >= 0);
    const project: Project = {
      code: (std.code ?? '').toUpperCase(),
      description: std.description ?? '',
      client: std.client ?? '',
      rate: rateBad ? null : rate,
      ...(rateBad ? { rateText } : {}),
      currency: (std.currency ?? '').toUpperCase(),
      archived: std.archived ?? '',
      extra,
    };
    for (const message of problemsOf(project, projects)) problems.push({ line: lines[r]!, message });
    projects.push(project);
  }
  problems.push(...quoteProblem);
  return { projects, columns, problems };
}

function flat(p: Project): Record<string, string> {
  return {
    ...p.extra,
    code: p.code,
    description: p.description,
    client: p.client,
    rate: p.rateText ?? (p.rate === null ? '' : String(p.rate)),
    currency: p.currency,
    archived: p.archived,
  };
}

function writeRows(columns: string[], records: Record<string, string>[]): string {
  return toCsv([columns, ...records.map((rec) => columns.map((c) => rec[keyOf(c)] ?? ''))]);
}

export function serializeProjects(file: ProjectsFile): string {
  return writeRows(file.columns, file.projects.map(flat));
}

/** Valid codes, first occurrence only, archived included. */
export function knownCodes(projects: Project[]): Set<string> {
  return new Set(projects.map((p) => p.code).filter(isValidCode));
}

export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.archived === '');
}

/** The first problem of `p` among `others` (which leave out `p` itself), or null. */
export function validateProject(p: Project, others: Project[]): string | null {
  return problemsOf(p, others)[0] ?? null;
}

function withProjects(file: ProjectsFile, projects: Project[]): ProjectsFile {
  return { projects, columns: file.columns, problems: allProblems(projects) };
}

function normalise(p: Project): Project {
  return { ...p, code: p.code.toUpperCase(), currency: p.currency.toUpperCase() };
}

export function addProject(file: ProjectsFile, p: Project): ProjectsFile {
  const project = normalise(p);
  const message = validateProject(project, file.projects);
  if (message) throw new Error(message);
  return withProjects(file, [...file.projects, project]);
}

function replaceProject(file: ProjectsFile, key: string, edit: (old: Project) => Project): ProjectsFile {
  const i = file.projects.findIndex((p) => p.code === key);
  if (i < 0) throw new Error(`${key} not found`);
  return withProjects(file, file.projects.map((p, j) => (j === i ? edit(p) : p)));
}

/** Change fields of a row. Throws only for a problem the change adds to that row. */
export function updateProject(
  file: ProjectsFile,
  code: string,
  changes: Partial<Omit<Project, 'code'>>,
): ProjectsFile {
  const key = code.toUpperCase();
  const i = file.projects.findIndex((p) => p.code === key);
  if (i < 0) throw new Error(`${key} not found`);
  const old = file.projects[i]!;
  const { rateText, ...rest } = normalise({ ...old, ...changes, code: key });
  const project: Project = 'rate' in changes || changes.rateText !== undefined ? { ...rest, ...(changes.rateText ? { rateText: changes.rateText } : {}) } : { ...rest, ...(rateText ? { rateText } : {}) };
  const others = file.projects.filter((_, j) => j !== i);
  const before = problemsOf(old, others);
  const added = problemsOf(project, others).find((m) => !before.includes(m));
  if (added) throw new Error(added);
  return replaceProject(file, key, () => project);
}

export function archiveProject(file: ProjectsFile, code: string, date: string): ProjectsFile {
  const key = code.toUpperCase();
  if (!isRealDate(date)) throw new Error(ARCHIVED_MESSAGE);
  return replaceProject(file, key, (p) => ({ ...p, archived: date }));
}

/** Remove the row. A missing code changes nothing. */
export function deleteProject(file: ProjectsFile, code: string): ProjectsFile {
  const key = code.toUpperCase();
  const i = file.projects.findIndex((p) => p.code === key);
  if (i < 0) return file;
  return withProjects(file, file.projects.filter((_, j) => j !== i));
}

/** Rows by code. A repeated code gets a suffix so no row is lost. */
function keyed(file: ProjectsFile): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const p of file.projects) {
    let key = p.code;
    for (let n = 2; out.has(key); n++) key = `${p.code}#${n}`;
    out.set(key, flat(p));
  }
  return out;
}

function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? '') === (b[k] ?? ''));
}

/** Field by field: if local is unchanged take remote, otherwise local wins. */
function mergeRecord(
  base: Record<string, string>,
  local: Record<string, string>,
  remote: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[k] ?? '';
    out[k] = l === (base[k] ?? '') ? (remote[k] ?? '') : l;
  }
  return out;
}

/** Three-way merge of projects.csv texts. This device's edit wins a conflict. */
export function mergeProjects(base: string, local: string, remote: string): string {
  const b = parseProjects(base);
  const l = parseProjects(local);
  const r = parseProjects(remote);
  const baseRows = keyed(b);
  const localRows = keyed(l);
  const remoteRows = keyed(r);

  const columns = [...r.columns];
  for (const c of l.columns) {
    if (!columns.some((x) => keyOf(x) === keyOf(c))) columns.push(c);
  }

  const order = [...remoteRows.keys(), ...[...localRows.keys()].filter((k) => !remoteRows.has(k))];
  const out: Record<string, string>[] = [];
  for (const key of order) {
    const bRow = baseRows.get(key);
    const lRow = localRows.get(key);
    const rRow = remoteRows.get(key);
    if (lRow && rRow) out.push(mergeRecord(bRow ?? {}, lRow, rRow));
    else if (lRow) {
      // gone from remote: stays only if edited here, or new here
      if (!bRow || !sameRecord(bRow, lRow)) out.push(lRow);
    } else if (rRow) {
      // deleted here: stays only if edited there
      if (!bRow || !sameRecord(bRow, rRow)) out.push(rRow);
    }
  }
  return writeRows(columns, out);
}
