# Omark Time core (`packages/time-core`) Implementation Plan (#54)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pure logic of Omark Time: titles, event → rows, the year files, colours, projects, config, summaries, charts, the fix list and reports.

**Architecture:** A new workspace package `@omark/time-core`, shaped like `@omark/tasks-core`: TypeScript sources exported from `src/index.ts`, Vitest tests in `test/`, no build step. It is pure: its `tsconfig.json` has `lib: ["ES2023"]` and `types: []`, so DOM, `fetch`, IndexedDB and Node APIs fail the typecheck. Time zones use `Intl.DateTimeFormat` only. The package also owns the `CalendarSource` types (a port), which `packages/calendar` (#55, #56) implements, so the sync logic here can later run unchanged in a Cloudflare cron.

**Tech Stack:** TypeScript 5.9, Vitest 3, `yaml` 2.9 (already used by `tasks-core`).

**Spec:** [`doc/Omark Time spec.md`](../Omark%20Time%20spec.md), sections 5–7 and 9 (and 8 for the colour decision). Milestone plan: [53-omark-time-milestone.md](53-omark-time-milestone.md).

## What changes for AL

Nothing visible: this is the engine the app (#57, #58) and the demo (#59) are built on. The PR lists what the tests prove.

## Acceptance criteria

- [ ] Every row of the title table in spec section 5 is a test.
- [ ] Section 6 is tested: the window (track from, 90 days ahead), midnight split, all-day hours, declined and cancelled events, overlaps, a calendar time zone different from the machine's, a DST change, recurring instances.
- [ ] `events-YYYY.csv`, `projects.csv` and `config.yaml` round-trip; unknown columns and keys are kept; `config.yaml` keeps its comments when a setting changes.
- [ ] Applying the same calendar changes twice gives the same files.
- [ ] Summaries split done from planned and group categories ignoring case; reports never add amounts in different currencies.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm --filter tasks build` pass.

## Global Constraints

- Separator `;`, fixed; only the first two split the title; spaces around it are trimmed.
- Code: 2–20 characters, `A–Z`, `0–9`, `_`, starting with a letter; case-insensitive in titles, stored in upper case everywhere.
- Window: events that start on or after `track_from` and before today + 90 days (local dates in the primary calendar's zone).
- Times are written as local time with offset, `2026-10-22T09:00+02:00` (`:ss` only when seconds aren't zero; UTC as `+00:00`).
- `hours`: at most 4 decimals, no trailing zeros (`1.5`, `0.3333`, `8`).
- Event file columns, in this order: `date,start,end,hours,project,category,description,all_day,known,calendar,event_id`. Row key: `calendar` + `event_id` + `date`. Rows sorted by start instant, then `calendar`, then `event_id`.
- `projects.csv` columns: `code,description,client,rate,currency,archived`. Unknown columns kept.
- `config.yaml` defaults: `calendars: [primary]`, `track_from` = 1 January of this year, `all_day_hours: 8`, `week_start: monday`, `colour_events: false`. Unknown keys and comments kept.
- Colours: green = colour id 10, red = 11 (passed in from `colors.get`, never hard-coded in the decision); the marker is the private property `omarkTime` = `green` | `red`.
- CSV: RFC 4180 fields (quote when a field has `,` `"` CR or LF; `""` inside quotes). Written with LF line ends and a final newline; read with LF or CRLF and an optional BOM. *(LF: my call; DuckDB and Excel read both.)*
- No new dependencies besides `yaml`.

## Calls made in this plan, to check

1. **Overlaps ignore all-day rows**: an all-day event (holiday, conference) would otherwise overlap every timed event that day.
2. **A zero-length event** gives one row with 0 hours, so it is never silently missing.
3. **Report rounding goes up** to the next 5, 15 or 30 minutes, per row (an event split at midnight rounds per day). Common for client billing; nearest is a one-line change.
4. **"Done"** means the row's end is at or before now; a row in progress counts as planned.
5. **Category spelling** shown is the one with the most rows; a tie goes to the first in code-point order.
6. **Field conflicts in `projects.csv`** (the same field changed on this device and elsewhere): this device's edit wins; an edit beats a delete.
7. **A colour the user changed by hand** on an event the tracker had coloured, whose title later lost its structure: the tracker drops only its marker and leaves the user's colour.
8. **Declined and cancelled events are never coloured or cleared.**

## Review Focus

1. **DST change.** An event 01:00–04:00 on 2026-10-25 in `Europe/Warsaw` is 4 hours, written `…T01:00+02:00` to `…T04:00+01:00`, and sorts by instant, not by string. Test in Task 4 and Task 5.
2. **The machine's zone is not the calendar's.** Tests run with `TZ=Pacific/Auckland` while the calendar is `Europe/Warsaw` or `America/New_York`; nothing may use the process zone. Set in Task 1's `vitest.config.ts`.
3. **Midnight and year edges.** An event ending exactly at 00:00 gives no 0-hour row for the next day; 23:00 on 31 December to 01:00 on 1 January gives rows in two year files. Tests in Task 4 and Task 5.
4. **Hand-edited `projects.csv`** with a BOM, CRLF, lowercase codes, a quoted comma, an unknown column and a rate without currency: nothing is lost, problems are reported with line numbers. Test in Task 7.
5. **A user's own colour** on an event the tracker coloured before: kept when the title loses its structure (call 7). Test in Task 6.

---

## File structure

```
packages/time-core/
  package.json, tsconfig.json, tsconfig.test.json, vitest.config.ts
  src/index.ts          re-exports everything
  src/source.ts         CalendarSource port: CalendarEvent, CalendarInfo, ColourPatch, errors
  src/zone.ts           time-zone and date-string helpers (Intl only)
  src/title.ts          title parser and formatter, code rules
  src/csv.ts            RFC 4180 read and write
  src/hours.ts          hours rounding and formatting
  src/rows.ts           EventRow, the window, eventToRows
  src/events-file.ts    events-YYYY.csv read/write, row order
  src/apply.ts          apply calendar changes to the year files, recheck known, newly-in-window days
  src/colour.ts         the colour decision and the colouring plan
  src/projects.ts       projects.csv model, edits, three-way merge
  src/config.ts         config.yaml model and comment-keeping writer
  src/categories.ts     case-insensitive category grouping (used by summary, charts, report)
  src/summary.ts        named ranges, hours summary
  src/charts.ts         weekly series
  src/fix-list.ts       unknown codes and overlapping days
  src/report.ts         client report: model, Markdown, CSV
  test/<same names>.test.ts
```

Also: one line for `packages/time-core` under "Layout" in `CLAUDE.md`.

---

### Task 1: Package, the `CalendarSource` port and time-zone helpers

**Files:**
- Create: `packages/time-core/{package.json,tsconfig.json,tsconfig.test.json,vitest.config.ts}`, `src/index.ts`, `src/source.ts`, `src/zone.ts`
- Test: `packages/time-core/test/zone.test.ts`
- Modify: `CLAUDE.md` (Layout: `packages/time-core`: Omark Time's logic, pure)

`package.json`, `tsconfig*.json` copy `packages/tasks-core`'s (name `@omark/time-core`, dependency `yaml` only). `vitest.config.ts`: `name: '@omark/time-core'`, `env: { TZ: 'Pacific/Auckland' }` with a comment that the calendar zone is always passed in, so the machine's zone must not matter. Root `vitest.config.ts` already picks up `packages/*`.

**Interfaces:**
- Produces (`source.ts`, types only plus two error classes):

```ts
export type EventTime = { date: string } | { dateTime: string }; // date: all-day, YYYY-MM-DD, end exclusive; dateTime: RFC 3339 with offset
export type ResponseStatus = 'needsAction' | 'declined' | 'tentative' | 'accepted';
export type TrackerColour = 'green' | 'red';
export interface CalendarEvent {
  calendarId: string;            // 'primary' for the primary calendar
  id: string;                    // instance id
  status: 'confirmed' | 'tentative' | 'cancelled';
  title: string;                 // '' when absent (a cancelled instance has none)
  start: EventTime | null;       // null on a cancelled instance
  end: EventTime | null;
  response: ResponseStatus | null; // the user's own reply; null when not an invite
  colorId: string | null;
  marker: TrackerColour | null;  // extendedProperties.private.omarkTime
  recurringEventId: string | null;
  htmlLink: string | null;
}
export interface CalendarInfo { id: string; name: string; primary: boolean; timeZone: string; owned: boolean }
export interface ChangesResult { events: CalendarEvent[]; syncToken: string }
export interface ColourPatch { colorId: string | null; marker: TrackerColour | null } // the values to set; null clears
export interface CalendarSource {
  listCalendars(): Promise<CalendarInfo[]>;
  /** Every page. A null token is a full read. Throws SyncTokenExpiredError (Google: 410). */
  readChanges(calendarId: string, syncToken: string | null): Promise<ChangesResult>;
  /** Instances starting in [from, to), RFC 3339 instants; no sync token. */
  readRange(calendarId: string, from: string, to: string): Promise<CalendarEvent[]>;
  colourIds(): Promise<Record<TrackerColour, string>>;
  /** Throws EditAccessRequiredError when the sign-in has read-only access. */
  setColour(calendarId: string, eventId: string, patch: ColourPatch): Promise<void>;
}
export class SyncTokenExpiredError extends Error {}
export class EditAccessRequiredError extends Error {}
```

- Produces (`zone.ts`):
  - `parseInstant(rfc3339: string): number` (ms)
  - `localDate(ms: number, tz: string): string` → `YYYY-MM-DD`
  - `formatLocal(ms: number, tz: string): string` → `2026-10-22T09:00+02:00`
  - `startOfDay(date: string, tz: string): number` → the first instant of that local date
  - `addDays(date: string, n: number): string`, `daysBetween(a: string, b: string): number`
  - `weekday(date: string): number` (0 = Monday … 6 = Sunday)

- [ ] **Step 1: Write the failing tests** in `test/zone.test.ts`:

```ts
test('formats an instant in the calendar zone, not the machine zone', () => {
  const ms = parseInstant('2026-10-22T07:00:00Z');
  expect(formatLocal(ms, 'Europe/Warsaw')).toBe('2026-10-22T09:00+02:00');
  expect(formatLocal(ms, 'America/New_York')).toBe('2026-10-22T03:00-04:00');
  expect(formatLocal(ms, 'UTC')).toBe('2026-10-22T07:00+00:00');
  expect(formatLocal(parseInstant('2026-10-22T07:00:30Z'), 'UTC')).toBe('2026-10-22T07:00:30+00:00');
});
test('local dates and midnights across the autumn DST change', () => {
  expect(formatLocal(startOfDay('2026-10-25', 'Europe/Warsaw'), 'Europe/Warsaw')).toBe('2026-10-25T00:00+02:00');
  expect(startOfDay('2026-10-26', 'Europe/Warsaw') - startOfDay('2026-10-25', 'Europe/Warsaw')).toBe(25 * 3600_000);
  expect(localDate(parseInstant('2026-10-21T23:30:00Z'), 'Europe/Warsaw')).toBe('2026-10-22');
});
test('a day whose midnight does not exist starts at the first local instant', () => {
  // America/Santiago skips 00:00 → 01:00 on 2026-09-06.
  expect(formatLocal(startOfDay('2026-09-06', 'America/Santiago'), 'America/Santiago')).toBe('2026-09-06T01:00-03:00');
});
test('date arithmetic', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  expect(daysBetween('2026-10-01', '2026-12-30')).toBe(90);
  expect(weekday('2026-10-26')).toBe(0);
});
```

- [ ] **Step 2: Run `pnpm vitest run --project @omark/time-core`** — FAIL, `zone.ts` has no exports.
- [ ] **Step 3: Implement `zone.ts`.** Read the zone's offset from `Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year…second })` parts (offset = parts as UTC − instant). `startOfDay`: guess `Date.UTC(date) − offset(Date.UTC(date))`, correct once with the offset at the guess; if the result's local date is still the previous day (a skipped midnight), move forward by the offset difference. Date-string arithmetic goes through `Date.UTC`, never the local zone. `source.ts` as above.
- [ ] **Step 4: Run** — PASS. Run `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `Add the time-core package with the calendar port and zone helpers`.

### Task 2: Title parser

**Files:** Create `src/title.ts`; Test `test/title.test.ts`

**Interfaces:**
- Produces: `CODE_PATTERN: RegExp` (`/^[A-Za-z][A-Za-z0-9_]{1,19}$/`); `isValidCode(code: string): boolean`; `interface ParsedTitle { code: string; category: string; description: string; known: boolean }` (`''` = none, `code` upper case); `parseTitle(title: string, knownCodes: ReadonlySet<string>): ParsedTitle | null` (null = not structured); `formatTitle(p: { code: string; category?: string; description?: string }): string`.

- [ ] **Step 1: Write the failing tests**: one `test.each` over spec section 5's table, with `known = new Set(['ACME'])`:

| title | expected |
|---|---|
| `ACME; Coding; new featureX` | ACME / Coding / new featureX, known |
| `ACME;Coding` | ACME / Coding / '' |
| `ACME; ; quick call` | ACME / '' / quick call |
| `ACME; CS; ticket 12; then 13` | ACME / CS / `ticket 12; then 13` |
| `acme; coding; new featureX` | ACME / coding / new featureX, known |
| `ACME`, `acme`, `  acme  ` | ACME / '' / '', known |
| `OOO`, `Lunch` | null |
| `OOO; away` | OOO / away / '', not known |
| `Lunch; with Tom` | LUNCH / with Tom / '', not known |
| `John-Mary call`, `Call: John`, `Q&A; prep`, `''` | null |
| `A; x` (1 char), `ABCDEFGHIJKLMNOPQRSTU; x` (21), `1ACME; x` | null |
| `ABCDEFGHIJKLMNOPQRST; x` (20), `A_1; x` | structured |

  Plus `formatTitle({ code: 'ACME', description: 'quick call' })` → `ACME; ; quick call`, `formatTitle({ code: 'ACME', category: 'Coding' })` → `ACME; Coding`, `formatTitle({ code: 'ACME' })` → `ACME`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Trim the title; split at the first two `;` only; trim each part.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Parse Omark Time event titles`.

### Task 3: CSV and hours

**Files:** Create `src/csv.ts`, `src/hours.ts`; Test `test/csv.test.ts`, `test/hours.test.ts`

**Interfaces:**
- Produces: `parseCsv(text: string): { rows: string[][]; lines: number[] }` (`lines[i]` = 1-based line where row `i` starts; blank lines skipped; BOM dropped); `toCsv(rows: string[][]): string`; `roundHours(h: number): number` (4 decimals); `formatHours(h: number): string`; `hoursBetween(startMs: number, endMs: number): number` (rounded).

- [ ] **Step 1: Write the failing tests:**
  - round trip of `[['a','b, c','say "hi"','line\nbreak','']]` through `toCsv` → `parseCsv` is identity; `toCsv` output is `a,"b, c","say ""hi""","line\nbreak",\n`;
  - `parseCsv('﻿code,rate\r\nACME,120\r\n\r\nX,\n')` → rows `[['code','rate'],['ACME','120'],['X','']]`, lines `[1,2,4]`;
  - `formatHours(1.5)` `'1.5'`, `(1/3)` `'0.3333'`, `(8)` `'8'`, `(0)` `'0'`, `(2.00004)` `'2'`, `(0.99996)` `'1'`;
  - `hoursBetween(0, 20 * 60_000)` → `0.3333`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (a small state machine for quotes). **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Read and write CSV and format hours`.

### Task 4: Event → rows

**Files:** Create `src/rows.ts`; Test `test/rows.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent` (Task 1), `parseTitle` (Task 2), zone helpers, `hoursBetween`, `roundHours`.
- Produces:

```ts
export const WINDOW_DAYS = 90;
export interface EventRow {
  date: string; start: string; end: string; hours: number;
  project: string; category: string; description: string;
  allDay: boolean; known: boolean; calendar: string; eventId: string;
  extra: Record<string, string>; // unknown columns from the file, kept
}
export interface RowContext { knownCodes: ReadonlySet<string>; timeZone: string; allDayHours: number; trackFrom: string; today: string }
export function windowEnd(today: string): string;              // addDays(today, 90), exclusive
export function inWindow(startDate: string, ctx: Pick<RowContext, 'trackFrom' | 'today'>): boolean;
export function eventToRows(event: CalendarEvent, ctx: RowContext): EventRow[];
```

- [ ] **Step 1: Write the failing tests** (helper `ev(partial)` builds a confirmed event on `primary`, `ctx` = Warsaw, `ACME` known, 8 h, track from `2026-01-01`, today `2026-10-26`):
  - `ACME; Coding; x` 09:00–10:30 → one row `{ date: '2026-10-22', start: '2026-10-22T09:00+02:00', end: '2026-10-22T10:30+02:00', hours: 1.5, project: 'ACME', category: 'Coding', description: 'x', allDay: false, known: true, calendar: 'primary', eventId }`;
  - `OOO; away` → one row, `known: false`; `Lunch` → `[]`;
  - 22:00–02:00 → two rows, 2 h on `2026-10-22` (end `2026-10-23T00:00+02:00`) and 2 h on `2026-10-23`;
  - 09:00 to 00:00 the next day → one row only;
  - 2026-12-31T23:00 to 2027-01-01T01:00 → rows dated `2026-12-31` and `2027-01-01`;
  - the DST event of Review Focus 1 → one row, 4 h, end `2026-10-25T04:00+01:00`;
  - an event sent as `2026-10-22T09:00:00-04:00` (New York) → start `2026-10-22T15:00+02:00`;
  - all-day `{date:'2026-10-21'}`–`{date:'2026-10-24'}` → three rows, 8 h each, `allDay: true`, start `…T00:00+02:00`, end next day 00:00;
  - `response: 'declined'` → `[]`; `'needsAction'` and `'tentative'` → counted; `status: 'cancelled'` → `[]`;
  - start date `2025-12-31` → `[]`; `2026-01-01` → counted; start `2027-01-23` (today + 89) counted, `2027-01-24` (+90) → `[]`;
  - zero-length 09:00–09:00 → one row, 0 h;
  - two instances of one series (`recurringEventId` set, different ids) → one row each, keyed by their own ids.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** Timed: walk from the start, cutting at each `startOfDay(next date)` before the end. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Turn calendar events into tracked rows`.

### Task 5: Year files and applying changes

**Files:** Create `src/events-file.ts`, `src/apply.ts`; Test `test/events-file.test.ts`, `test/apply.test.ts`

**Interfaces:**
- Consumes: `EventRow`, `eventToRows`, `RowContext`, `windowEnd` (Task 4), `parseCsv`/`toCsv`/`formatHours` (Task 3).
- Produces:

```ts
export const EVENT_COLUMNS: readonly string[]; // the 11 columns, in order
export function eventsFileName(year: string): string;  // 'events-2026.csv'
export function compareRows(a: EventRow, b: EventRow): number; // start instant, calendar, event_id, date
export function parseEventsFile(text: string): { rows: EventRow[]; badLines: number[] };
export function serializeEventsFile(rows: EventRow[]): string; // sorted; unknown columns after the fixed ones, first-seen order
export type YearFiles = Map<string, EventRow[]>; // year → rows
export function applyChanges(files: YearFiles, events: CalendarEvent[], ctx: RowContext): { files: YearFiles; changedYears: Set<string> };
export function recheckKnown(files: YearFiles, knownCodes: ReadonlySet<string>): { files: YearFiles; changedYears: Set<string> };
export function newlyInWindow(lastToday: string | null, today: string): { from: string; to: string } | null; // local dates, [from, to)
```

- [ ] **Step 1: Write the failing tests:**
  - the spec 7.3 sample (two rows) parses and serialises back byte for byte;
  - a file with an extra column `billed` keeps it on every row; a file missing `event_id` reads it as `''`; a row with `hours` = `abc` is left out and its line is in `badLines`;
  - serialising rows `02:30+02:00` and `02:15+01:00` on 2026-10-25 puts `02:30+02:00` first (earlier instant);
  - `applyChanges` adds a new event's rows to its year, replaces an edited event's rows (moved to another day: old row gone), removes a cancelled one's rows, moves a 31 Dec → 1 Jan event into both years; applying the same events twice gives equal files and an empty `changedYears` the second time; an event whose title lost its structure loses its rows;
  - `recheckKnown` after adding `OOO` flips `known` on OOO rows and reports only their years;
  - `newlyInWindow(null, t)` → null; `('2026-10-26','2026-10-26')` → null; `('2026-10-26','2026-10-29')` → `{ from: '2027-01-24', to: '2027-01-27' }`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** `applyChanges` copies only the years it touches; it removes rows by `calendar` + `event_id` across all years before adding the new ones. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Read and write the year files and apply calendar changes`.

### Task 6: Colour decision

**Files:** Create `src/colour.ts`; Test `test/colour.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent`, `ColourPatch`, `TrackerColour` (Task 1), `parseTitle` (Task 2), `inWindow` (Task 4), `localDate`, `parseInstant`.
- Produces:

```ts
export interface ColourContext { knownCodes: ReadonlySet<string>; ids: Record<TrackerColour, string>; timeZone: string; trackFrom: string; today: string }
export function colourAction(event: CalendarEvent, ctx: ColourContext): ColourPatch | null; // null = leave alone
export function clearAction(event: CalendarEvent, ids: Record<TrackerColour, string>): ColourPatch | null; // for turning colouring off
export function colourPlan(events: CalendarEvent[], ctx: ColourContext): { event: CalendarEvent; patch: ColourPatch }[]; // newest start first
```

- [ ] **Step 1: Write the failing tests** (`ids = { green: '10', red: '11' }`):
  - known `ACME; x`, no colour → `{ colorId: '10', marker: 'green' }`; a user colour `'5'` → overwritten the same way; already `'10'` with marker `green` → null; `'10'` without marker → patch (marker added);
  - unknown `OOO; x` → `{ colorId: '11', marker: 'red' }`;
  - `Lunch` with no marker → null; `Lunch` with `colorId '10'`, marker `green` → `{ colorId: null, marker: null }`; with `colorId '5'`, marker `green` → `{ colorId: '5', marker: null }` (call 7);
  - declined, cancelled, before `track_from`, 90+ days ahead → null;
  - `clearAction`: marker `red`, colour `'11'` → `{ colorId: null, marker: null }`; no marker → null;
  - `colourPlan` of three events returns only those needing a patch, the latest start first.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Decide event colours`.

### Task 7: Projects

**Files:** Create `src/projects.ts`; Test `test/projects.test.ts`

**Interfaces:**
- Consumes: `parseCsv`/`toCsv` (Task 3), `isValidCode` (Task 2).
- Produces:

```ts
export const PROJECT_COLUMNS: readonly string[]; // code,description,client,rate,currency,archived
export interface Project { code: string; description: string; client: string; rate: number | null; currency: string; archived: string; extra: Record<string, string> }
export interface Problem { line: number | null; message: string }
export interface ProjectsFile { projects: Project[]; columns: string[]; problems: Problem[] }
export function parseProjects(text: string): ProjectsFile;
export function serializeProjects(file: ProjectsFile): string;
export function knownCodes(projects: Project[]): Set<string>;   // valid codes, archived included
export function activeProjects(projects: Project[]): Project[];  // not archived
export function validateProject(p: Project, others: Project[]): string | null;
export function addProject(file: ProjectsFile, p: Project): ProjectsFile;      // throws Error(validateProject message)
export function updateProject(file: ProjectsFile, code: string, changes: Partial<Omit<Project, 'code'>>): ProjectsFile;
export function archiveProject(file: ProjectsFile, code: string, date: string): ProjectsFile;
export function deleteProject(file: ProjectsFile, code: string): ProjectsFile;
export function mergeProjects(base: string, local: string, remote: string): string;
```

- [ ] **Step 1: Write the failing tests:**
  - the spec 7.1 sample round-trips; empty text → no projects, the six columns;
  - Review Focus 4: `'﻿code,description,rate,currency,owner\r\nacme,"Acme, Inc",120,,ann\r\n'` → code `ACME`, description `Acme, Inc`, `extra.owner = 'ann'`, a problem on line 2 `Rate needs a currency`; serialised with columns `code,description,rate,currency,owner` (file's order kept, missing standard columns appended) and code upper case;
  - problems with line numbers: bad code `Q&A`, duplicate `ACME` (second ignored by `knownCodes`), rate `abc`, currency `EURO`, archived `soon`; the rows stay in the file;
  - `knownCodes` includes `OLD` (archived) and leaves out `Q&A`; `activeProjects` leaves out `OLD`;
  - `validateProject` messages: `Code must be 2–20 letters, digits or _, starting with a letter`, `ACME already exists`, `Rate needs a currency`; currency is upper-cased;
  - `updateProject` cannot change a code (type) and keeps `extra`; `deleteProject` removes the row;
  - `mergeProjects`: local adds `NEW`, remote edits `ACME.rate` → both; both edit `ACME.description` differently → local's; local edits `OLD`, remote deletes it → kept with local's edit; both add `X` with the same fields → one row; remote's column `owner` survives a local edit.
- [ ] **Step 2–4:** Run (FAIL), implement (merge per code, field by field), run (PASS).
- [ ] **Step 5: Commit** `Read, edit and merge projects.csv`.

### Task 8: Config

**Files:** Create `src/config.ts`; Test `test/config.test.ts`

**Interfaces:**
- Consumes: `Problem` (Task 7), `yaml`'s `parseDocument`, `LineCounter`.
- Produces:

```ts
export type WeekStart = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export interface TimeConfig { calendars: string[]; trackFrom: string; allDayHours: number; weekStart: WeekStart; colourEvents: boolean }
export function defaultTimeConfig(today: string): TimeConfig;
export function defaultTimeConfigText(today: string): string; // spec 7.2's commented file
export function parseTimeConfig(text: string, today: string): { config: TimeConfig; problems: Problem[] };
export function setTimeConfig(text: string, changes: Partial<TimeConfig>, today: string): string;
```

  YAML keys: `calendars`, `track_from`, `all_day_hours`, `week_start`, `colour_events`.

- [ ] **Step 1: Write the failing tests:**
  - `''` and `defaultTimeConfigText('2026-10-26')` both parse to `{ calendars: ['primary'], trackFrom: '2026-01-01', allDayHours: 8, weekStart: 'monday', colourEvents: false }` with no problems;
  - invalid values fall back to the default with a problem on their line: `all_day_hours: 30`, `all_day_hours: 0`, `week_start: someday`, `track_from: 2026-13-01`, `calendars: []`, `colour_events: maybe`; broken YAML → defaults and one problem with its line;
  - `calendars: work@example.com` (a string) reads as one calendar; `week_start: Sunday` reads as `sunday`;
  - `setTimeConfig(text, { colourEvents: true })` on spec 7.2's text changes only that line, keeps every comment and an unknown key `theme: dark`; on `''` it writes the default file with the change.
- [ ] **Step 2–4:** Run (FAIL), implement with `parseDocument` and `doc.set`, run (PASS).
- [ ] **Step 5: Commit** `Read and write config.yaml`.

### Task 9: Summaries and charts

**Files:** Create `src/categories.ts`, `src/summary.ts`, `src/charts.ts`; Test `test/summary.test.ts`, `test/charts.test.ts`

**Interfaces:**
- Consumes: `EventRow` (Task 4), `parseInstant`, `addDays`, `weekday` (Task 1), `WeekStart` (Task 8).
- Produces:

```ts
// categories.ts
export function groupCategories(rows: EventRow[]): Map<string, { name: string; rows: EventRow[] }>; // key = lower case; name = most-used spelling (call 5); '' = none
// summary.ts
export type RangeName = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';
export interface DateRange { from: string; to: string } // inclusive
export function namedRange(name: RangeName, today: string, weekStart: WeekStart): DateRange;
export function isDone(row: EventRow, nowMs: number): boolean;  // end ≤ now
export interface CategoryHours { name: string; done: number; planned: number }
export interface ProjectHours { code: string; done: number; planned: number; categories: CategoryHours[] }
export interface Summary { projects: ProjectHours[]; done: number; planned: number; unknown: number }
export function summarise(rows: EventRow[], range: DateRange, nowMs: number): Summary;
// charts.ts
export interface WeeklySeries { weeks: string[]; series: { key: string; label: string; hours: number[] }[] }
export function weeklyByProject(rows: EventRow[], range: DateRange, weekStart: WeekStart, nowMs: number, includePlanned?: boolean): WeeklySeries;
export function weeklyByCategory(rows: EventRow[], code: string, range: DateRange, weekStart: WeekStart, nowMs: number, includePlanned?: boolean): WeeklySeries;
```

  Summary: known rows only (unknown rows add to `unknown`); projects sorted by total hours, then code; categories by total, then name, none last. Hours added up then rounded with `roundHours`.

- [ ] **Step 1: Write the failing tests:**
  - `namedRange('thisWeek', '2026-10-28', 'monday')` → `2026-10-26`–`2026-11-01`; with `sunday` → `2026-10-25`–`2026-10-31`; `lastMonth` from `2026-01-15` → `2025-12-01`–`2025-12-31`;
  - `summarise`: rows `Coding` ×2, `coding` ×1, `CS` ×1 and a category-less row on ACME, one unknown OOO row, one row outside the range, one row ending after now → categories `Coding` (spelling with most rows), `CS`, `''`; done and planned apart; `unknown` = OOO's hours; the out-of-range row ignored;
  - `weeklyByProject` over three weeks with nothing in the middle week → that week is `0`; planned rows left out unless `includePlanned`; `weeklyByCategory` for ACME splits by category.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Summarise hours and build weekly chart series`.

### Task 10: Fix list and reports

**Files:** Create `src/fix-list.ts`, `src/report.ts`; Test `test/fix-list.test.ts`, `test/report.test.ts`

**Interfaces:**
- Consumes: `EventRow`, `Project`, `DateRange`, `isDone`, `groupCategories`, `formatTitle`, `formatHours`, `serializeEventsFile`.
- Produces:

```ts
// fix-list.ts
export interface UnknownEvent { calendar: string; eventId: string; code: string; title: string; dates: string[]; hours: number }
export interface OverlapDay { date: string; rows: EventRow[] }
export interface FixList { unknown: UnknownEvent[]; overlaps: OverlapDay[]; count: number }
export function buildFixList(rows: EventRow[]): FixList; // latest first; count = unknown.length + overlaps.length
// report.ts
export type Rounding = 0 | 5 | 15 | 30;
export interface ReportOptions { range: DateRange; codes?: string[]; client?: string; rounding: Rounding; includePlanned: boolean; nowMs: number }
export interface Money { amount: number; currency: string }
export interface ReportLine { date: string; hours: number; description: string }
export interface ReportCategory { name: string; hours: number; lines: ReportLine[] }
export interface ReportProject { code: string; description: string; client: string; hours: number; money: Money | null; categories: ReportCategory[] }
export interface Report { options: ReportOptions; projects: ReportProject[]; hours: number; money: Money[] } // money: one per currency
export function roundUp(hours: number, minutes: Rounding): number;
export function buildReport(rows: EventRow[], projects: Project[], opts: ReportOptions): Report;
export function reportToMarkdown(report: Report): string;
export function reportToCsv(rows: EventRow[], projects: Project[], opts: ReportOptions): string; // the chosen rows, events-file columns, hours rounded
```

  Selection: known rows in the range; `codes` if given, else the projects whose `client` equals `client`, else all; planned rows only with `includePlanned`.

- [ ] **Step 1: Write the failing tests:**
  - fix list: an unknown event split over two days appears once with both dates and `title` `OOO; ; away`; two timed rows 09:00–10:00 and 09:30–11:00 make an overlap day; 09:00–10:00 and 10:00–11:00 don't; an all-day row and a timed row don't (call 1); a zero-length row doesn't;
  - `roundUp(0.3333, 15)` → `0.5`, `(0.25, 15)` → `0.25`, `(0, 15)` → `0`, `(8, 30)` → `8`, `(1.1, 0)` → `1.1`;
  - `buildReport` for client `Acme Corp` with ACME (120 EUR) and ACME2 (100 PLN): money per project, `report.money` = `[{ 'EUR', … }, { 'PLN', … }]`, never one sum; a project with no rate → `money: null`; planned rows out by default; an unknown row never in;
  - `reportToMarkdown` of a two-project report equals an inline expected string with this shape:

```md
# Acme Corp: 2026-10-01 to 2026-10-31

Done time only. Rounded up to 15 minutes per event.

## ACME: Acme Corp website rebuild

### Coding: 3.5 h

- 2026-10-22: 1.5 h, new featureX
- 2026-10-23: 2 h

**ACME: 3.5 h, 420.00 EUR**

## Totals

| Project | Hours | Amount |
|---|---|---|
| ACME | 3.5 | 420.00 EUR |
| ACME2 | 1 | 100.00 PLN |
| **Total** | **4.5** | **420.00 EUR, 100.00 PLN** |
```

  (Title: the client, or the codes joined with `, `, or `All projects`. The second line says `Done and planned time.` with `includePlanned`, and leaves out the rounding sentence when rounding is 0. A line without description ends after the hours.)
  - `reportToCsv` has the 11 event columns and rounded hours.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Build the fix list and client reports`.

### Task 11: Finish

- [ ] `src/index.ts` exports every module; `test/index.test.ts` imports one name from each through `../src/index.ts`.
- [ ] Run `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm --filter tasks build` — all PASS.
- [ ] Commit `Export time-core's modules`. Push, open the PR (`Closes #53`, `Closes #54`), run the fresh-eyes review.

## Risks

- **`Intl` zone data differs between runtimes** (Node in CI, Safari on the iPhone). Only the tz database is used, which both ship; the DST and skipped-midnight tests pin it on Node.
- **Rounded hours** (4 decimals) summed over many rows can differ from the exact total by a few ten-thousandths. Summaries round to 4 decimals; screens show 2.
- **`projects.csv` merge** is new code, not Tasks' diff3. It is keyed by code, so it can't duplicate a project, but it can pick the wrong side of a real conflict; call 6 says which.

## Out of scope

- Reading or writing files, IndexedDB, the network: #57.
- The sync loop that calls `CalendarSource` and the storage adapters, colouring progress and resume: #57.
- Screens: #58. The settings form: #45's component in #58.
- An `attendees` column and the other post-launch items (spec 14).
