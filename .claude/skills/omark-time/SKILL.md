---
name: omark-time
description: Use when adding calendar events for Omark Time, answering questions about hours from its events-*.csv and projects.csv, or drafting a client report from them
---

# Omark Time

Omark Time turns Google Calendar events titled `CODE; Category; description` into hours, one CSV row per event per day. The full format is in `doc/format.md` (the Omark Time part) of the Omark repository, https://github.com/omark-app/omark.

## The files

In the user's synced `Omark Time` folder: Google Drive for desktop (`My Drive/Omark Time`), OneDrive (`Apps/Omark Time`), or a local folder they chose. Ask where it is if you can't find it.

| File | Holds | You may |
| --- | --- | --- |
| `events-YYYY.csv` | one row per tracked event per day, one file per year | read only. The app rewrites it from the calendar on every sync, so edits are lost |
| `projects.csv` | `code,description,client,rate,currency,archived` | read; edit only when asked (below) |
| `config.yaml` | `calendars`, `track_from`, `all_day_hours`, `week_start`, `colour_events` | read; leave it to the app's settings |

The calendar is the source of truth. To change hours, change the event.

## Adding an event

1. Read `projects.csv`. The codes you may use are the rows with an empty `archived`.
2. If the user names a code that isn't there, or one that is archived, don't guess: say so and ask. They can pick another code, or add the project first.
3. Write the title as `CODE; Category; description`, with the code in upper case and one space after each `;`. Leave out empty trailing parts: `ACME`, `ACME; Coding`, `ACME; Coding; new feature`. A description without a category keeps the empty part: `ACME; ; quick call` (`ACME; quick call` would make "quick call" the category). A category never contains `;`.
   - Category: take it from the user's words, in the spelling the project already uses in `events-*.csv` (`Coding`, not `coding`, if that is what its rows say). If the project has no events yet, use the user's word as they wrote it. If the user gave no hint, leave it out rather than invent one.
   - Description: the user's words about what was done; leave it out when there are none.
4. Check the calendar (or `events-*.csv`) for a tracked event that already covers the same time. Overlapping events each count fully, so say so and ask before adding a second one.
5. Create the event with the calendar tool you have (a Google Calendar connector or MCP server), in the user's time zone, in a calendar listed under `calendars` in `config.yaml` (`primary` is the main calendar). Events in other calendars, before `track_from` or more than 90 days ahead are not tracked. Don't set a colour; the app does that on its next sync if colouring is on.
6. Never change or delete other events.

Examples: "2 hours of ACME coding on the login page this morning" is `ACME; Coding; login page`, 09:00–11:00. "Lunch" stays a plain event: it isn't tracked.

## Answering questions about hours

Rules, so your numbers match the app:

- Count only rows with `known` = `true`. Mention hours on unknown codes separately, if any ("plus 1 h on unknown codes"). The app's summary shows them for the whole range, done and planned together.
- Count only **done** time, rows whose `end` is at or before now, unless the user asks about planned time.
- A row belongs to a period by its `date` column. Ranges include both ends.
- Weeks start on `week_start` from `config.yaml` (default Monday). "Last week" runs from 7 days before this week's first day to the day before it.
- Group categories ignoring case (`Coding` and `coding` are one), and name each group by the spelling most of **its rows in the period** use; on a tie, the one that sorts first. Rows with an empty category are "(no category)".
- Add hours as whole seconds: `round(hours × 3600)` per row, add, divide by 3600 once, and show at most 4 decimals with no trailing zeros. Adding the 4-decimal values directly drifts.

With DuckDB (`duckdb` on the command line, or Python's `duckdb`), run from the folder. It reads `start` and `end` as timestamps with time zone, and `known` as a boolean. `now()` is the computer's clock, which is what "done" means.

- `events-[0-9][0-9][0-9][0-9].csv` reads only the year files. A plain `events-*.csv` would also read sync conflict copies such as `events-2026 (1).csv` and count their rows twice. If you find such a copy, tell the user; the app rebuilds the real file from the calendar.
- `union_by_name = true` keeps the read working when an older file has a column a newer one lacks.

Hours per project and category for a month:

```sql
SELECT project, coalesce(mode(category), '') AS category,
       round(sum(round(hours * 3600)) / 3600, 4) AS hours
FROM read_csv('events-[0-9][0-9][0-9][0-9].csv', union_by_name = true)
WHERE known
  AND date BETWEEN DATE '2026-10-01' AND DATE '2026-10-31'
  AND "end" <= now()
GROUP BY project, lower(category)
ORDER BY project, lower(category) IS NULL, hours DESC;
```

DuckDB's `mode()` may pick either spelling when two are used equally often; the app picks the one that sorts first in code-point order (`Coding` before `coding`).

Hours per week and project. `date_trunc('week', …)` starts weeks on Monday; for weeks starting on Sunday, use `CAST(date_trunc('week', date + 1) AS DATE) - 1` (shift by one day, round, shift back), and likewise for other days.

```sql
SELECT CAST(date_trunc('week', date) AS DATE) AS week, project,
       round(sum(round(hours * 3600)) / 3600, 4) AS hours
FROM read_csv('events-[0-9][0-9][0-9][0-9].csv', union_by_name = true)
WHERE known AND "end" <= now()
GROUP BY ALL
ORDER BY week, project;
```

Hours and amount per project for one client:

```sql
SELECT e.project, round(sum(round(e.hours * 3600)) / 3600, 4) AS hours, p.currency,
       round(round(sum(round(e.hours * 3600)) * p.rate / 36, 6)) / 100 AS amount
FROM read_csv('events-[0-9][0-9][0-9][0-9].csv', union_by_name = true) e
JOIN (SELECT upper(trim(code)) AS code, trim(client) AS client, CAST(rate AS DOUBLE) AS rate,
             upper(trim(currency)) AS currency
      FROM read_csv('projects.csv', all_varchar = true)) p ON p.code = e.project
WHERE e.known AND p.client = 'Acme Corp'
  AND e.date BETWEEN DATE '2026-10-01' AND DATE '2026-10-31'
  AND e."end" <= now()
GROUP BY e.project, p.rate, p.currency
ORDER BY e.project;
```

On the example files in `doc/time/examples/`, the last query gives:

| project | hours | currency | amount |
| --- | --- | --- | --- |
| ACME | 17.1667 | EUR | 2060.00 |

The amount is rounded the way the app rounds it (to the cent, halves up). `projects.csv` is read as text and trimmed, with `code` and `currency` in upper case, as the app reads it. If a code appears twice, the app uses the first row; tell the user. A project with a rate but no currency has no amount.

Without DuckDB, read the CSV files directly and apply the same rules. For a long range, write a short script rather than adding numbers by hand.

## Drafting a client report

Use the same shape as the app's Markdown export, so the user can compare:

- Only known rows, of the chosen client's projects (or the chosen codes). Unknown codes never appear in a report.
- Title: the client (or the project codes), then the range as asked. "October so far" ends today.
- "Done time only." (or "Done and planned time."), plus "Rounded up to N minutes per event." when the user asks for rounding (5, 15 or 30 minutes, applied to each row before adding).
- One section per project, sorted by code; under it one section per category, sorted by name in code-point order (upper case before lower case, so `CS` comes before `Coding`) with "(no category)" last; under each, one line per row in date and time order with its hours and description.
- Each project ends with its total and, when it has a rate, the amount: rate × hours, to 2 decimals, in its currency.
- A totals table at the end. Amounts in different currencies are listed apart, never added.

The app's export for client Acme Corp, October 2026, on the example files:

````markdown
# Acme Corp: 2026-10-01 to 2026-10-31

Done time only.

## ACME: Acme Corp website rebuild

### CS: 2.3333 h

- 2026-10-13: 2 h, ticket 7
- 2026-10-20: 0.3333 h, call with Tom

### Coding: 5.3333 h

- 2026-10-05: 2.5 h, new feature
- 2026-10-12: 1.3333 h, bug 12
- 2026-10-19: 1.5 h, new feature

### Meetings: 1.5 h

- 2026-10-05: 0.5 h, weekly sync
- 2026-10-15: 1 h, sprint review

### Workshop: 8 h

- 2026-10-08: 8 h, on site

**ACME: 17.1667 h, 2060.00 EUR**

## Totals

| Project | Hours | Amount |
|---|---|---|
| ACME | 17.1667 | 2060.00 EUR |
| **Total** | **17.1667** | **2060.00 EUR** |
````

## Editing projects.csv (only when asked)

- Keep the header and every other row and column as they are.
- A new code: 2–20 characters, `A–Z`, `0–9` and `_`, starting with a letter, upper case, not already in the file. `currency` (ISO 4217, such as `EUR`) is required when `rate` is set.
- To retire a project, set `archived` to today's date; to bring it back, clear `archived`. Never rename or delete a code: its past events would become unknown. Ask before deleting a row.
- The app merges outside changes to this file, so edits made while it is open are kept.
