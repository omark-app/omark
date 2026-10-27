---
name: omark-time
description: Use when adding calendar events for Omark Time, answering questions about hours from its events-*.csv and projects.csv, or drafting a client report from them
---

# Omark Time

Omark Time turns Google Calendar events titled `CODE; Category; description` into hours, one CSV row per event per day. The full format is in `doc/format.md` (the Omark Time part) in the Omark repository.

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
3. Write the title as `CODE; Category; description`, with the code in upper case and one space after each `;`. Leave out empty trailing parts: `ACME`, `ACME; Coding`, `ACME; Coding; new feature`. Reuse the categories the project already has in `events-*.csv` (same spelling) unless the user names a new one.
4. Create the event with the calendar tool you have (a Google Calendar connector or MCP server), in the user's own calendar and time zone. Don't set a colour; the app does that on its next sync if colouring is on.
5. Never change or delete other events.

Examples: "2 hours of ACME coding on the login page this morning" is `ACME; Coding; login page`, 09:00–11:00. "Lunch" stays a plain event: it isn't tracked.

## Answering questions about hours

Rules, so your numbers match the app:

- Count only rows with `known` = `true`. Report unknown codes separately ("plus 1 h on unknown codes"), if any.
- Count only **done** time, rows whose `end` is at or before now, unless the user asks about planned time.
- A row belongs to a period by its `date` column. Ranges include both ends.
- Weeks start on `week_start` from `config.yaml` (default Monday). "Last week" is the seven days starting on the `week_start` before this week's.
- Group categories ignoring case (`Coding` and `coding` are one), and show the spelling most rows use. Rows with an empty category are "(no category)".
- Add hours as whole seconds: `round(hours × 3600)` per row, add, divide by 3600 once, and show at most 4 decimals with no trailing zeros. Adding the 4-decimal values directly drifts.

With DuckDB (`duckdb` on the command line, or Python's `duckdb`), run from the folder. It reads `start` and `end` as timestamps with time zone, and `known` as a boolean.

Hours per project and category for a month:

```sql
SELECT project, coalesce(mode(category), '') AS category,
       round(sum(round(hours * 3600)) / 3600, 4) AS hours
FROM read_csv('events-*.csv')
WHERE known
  AND date BETWEEN DATE '2026-10-01' AND DATE '2026-10-31'
  AND "end" <= now()
GROUP BY project, lower(category)
ORDER BY project, hours DESC;
```

Hours per week and project (`date_trunc('week', …)` starts weeks on Monday; with another `week_start`, shift the date first):

```sql
SELECT CAST(date_trunc('week', date) AS DATE) AS week, project,
       round(sum(round(hours * 3600)) / 3600, 4) AS hours
FROM read_csv('events-*.csv')
WHERE known AND "end" <= now()
GROUP BY ALL
ORDER BY week, project;
```

Hours and amount per project for one client:

```sql
SELECT e.project, round(sum(round(e.hours * 3600)) / 3600, 4) AS hours, p.currency,
       round(sum(round(e.hours * 3600)) * p.rate / 3600, 2) AS amount
FROM read_csv('events-*.csv') e
JOIN read_csv('projects.csv') p ON p.code = e.project
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

DuckDB's `mode()` may pick either spelling when two are used equally often; the app picks the one that sorts first.

Without DuckDB, read the CSV files directly and apply the same rules. For a long range, write a short script rather than adding numbers by hand.

## Drafting a client report

Use the same shape as the app's Markdown export, so the user can compare:

- Title: the client (or the project codes), then the range.
- "Done time only." (or "Done and planned time."), plus "Rounded up to N minutes per event." when the user asks for rounding (5, 15 or 30 minutes, applied to each row before adding).
- One section per project, sorted by code; under it one section per category, sorted by name with "(no category)" last; under each, one line per row in date order with its hours and description.
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
- To retire a project, set `archived` to today's date. Never rename or delete a code: its past events would become unknown. Ask before deleting a row.
- The app merges outside changes to this file, so edits made while it is open are kept.
