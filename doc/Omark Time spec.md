# Omark Time spec

Status: approved by AL, 2026-10-22. Agreed in the time tracker brainstorm the same day.
Source: AL's vision note "Omark vision update" (2026-10-22). Related: [open source launch spec](TaskApp%20open%20source%20launch%20spec.md) (the suite, the monorepo, the launch), [roadmap](plans/open-source-launch-roadmap.md) (milestone T builds this).

Calls marked *(my call)* were made by Claude during the brainstorm, not by AL; section 16 lists them for checking.

## 1. Intent

The calendar is where people already live with their schedules. Omark Time builds on that rather than adding a second place to log time: you plan and record your day as calendar events, and the tracker turns them into hours per project and category, in plain CSV files you own.

The idea is AL's own need. He plans his day in Google Calendar, does client work across several projects, and wants:

- **client reports** for one or more projects: hours per category, with what was done;
- **trends**: where his time goes, week by week;
- **answers from Claude** ("how many hours on ACME coding last month?") as much as from a dashboard;
- **events added by an AI agent** from what it knows about his day, in the right shape.

It is the second app of the Omark suite and launches together with Omark Tasks. It follows the suite's principles: your data stays in your calendar and your own storage, the files are plain and open, and agents are first-class users.

## 2. Goals, non-goals, anti-goals

### 2.1 Goals

1. **One title format, `CODE; Category; description`**, that turns any calendar event into tracked time.
2. **Hours you can query anywhere**: one CSV row per tracked event, readable by DuckDB, Excel, any dashboard tool and Claude.
3. **Instant feedback in the calendar**: known codes turn green, unknown codes turn red.
4. **A small app** to manage projects and settings, see hours, charts and a fix list, and export a client report.
5. **Agent-ready**: a documented format and a skill, so Claude (or any agent) can add correctly shaped events and answer questions from the files.
6. **Try it in 30 seconds**: a public demo with a fake calendar, like the Tasks demo.
7. **Use it for real** on the hosted app at `time.omark.app`, or self-hosted.

### 2.2 Non-goals for the launch

They can be issues later (section 14).

- Calendars other than Google Calendar (Outlook, iCloud, CalDAV, local `.ics`).
- Calendars you don't own (shared or subscribed ones).
- Background sync while the app is closed. The self-hosted Cloudflare cron is a post-launch issue.
- Giving a project to an invite whose title you can't change.
- An attendees column.
- An Omark MCP server.
- A configurable separator.

### 2.3 Anti-goals

The launch counts as a failure for Omark Time if:

- **Calendar data or tokens reach an Omark server**, other than the short-lived sign-in exchange the helper already does for Tasks. The hosted app never runs a server-side job with users' tokens.
- **It damages a calendar**: changes a title, time, guest list or anything other than an event's colour, or colours events it shouldn't.
- **Development or tests touch AL's real calendar.** Tests use a fake calendar or a test Google account.
- **The hours are wrong in a way the user can't see.** Every tracked event is either in the CSV or listed in the fix list.

## 3. Decisions taken

| Topic | Decision |
|---|---|
| Name and hosts | **Omark Time**. `time.omark.app`, `staging-time.omark.app`, `demo-time.omark.app`. Repo folder `apps/time`. |
| Where it runs | A **PWA**, built and hosted like Omark Tasks. It reads the calendar only while it is open and catches up on everything that changed since the last run, past days included. |
| Background | None on the hosted app. Colours and files lag until the next open; that is accepted. A self-hosted Cloudflare cron on the user's own account is a post-launch option. |
| Calendar | Google Calendar only at launch. |
| Separator | A **semicolon**, fixed. Spaces around it are optional. |
| Project codes | UPPERCASE letters, digits and `_`, starting with a letter. |
| Colours | The tracker's rules overwrite any colour on structured events: green = known code, red = unknown code. Events without structure are left alone. |
| Store | CSV files in the user's storage: **Google Drive or OneDrive** (and a local folder on desktop Chrome or Edge). |
| Event file | One row per tracked event, one file per year (`events-2026.csv`). |
| Projects file | `projects.csv`: code, description, client, rate, currency, archived. |
| Unknown codes | Written to the CSV with `known` = false. |
| What counts | Events shown as free, unanswered invites, all-day events (a fixed number of hours). Declined invites never count. Overlapping events each count fully. |
| Screens | Projects, settings, hours summary, charts, fix list, client report export. |
| Agents | A format doc and a skill. No MCP server. |
| Demo | A public demo at launch. |
| Launch | Together with Omark Tasks, strictly: if Omark Time's build isn't ready, the launch date moves. If only Google's verification is missing on launch day, it launches unverified. |

## 4. How it works

1. **Sign in with Google** through the sign-in helper (section 10). The browser then talks to Google directly with a short-lived access token.
2. **Pick where the files live**: Google Drive (no second sign-in), OneDrive (a Microsoft sign-in too) or a local folder. The choice is per device, as in Tasks.
3. **On open, and on "Sync now"**, the app:
   1. reads `projects.csv` and `config.yaml`;
   2. asks Google for the events that changed in each chosen calendar since this device's last sync (a full read on the first run or a rebuild);
   3. turns each event into zero or more rows (sections 5–6) and updates the year files;
   4. sets the colour of every structured event whose colour is wrong (section 8);
   5. shows the result: "Synced just now · 3 to fix".
4. **Changing projects** (adding ACMEE, archiving OLD) re-checks the `known` flag and the colours of the events already in the files, without a full re-read.
5. **Rebuild** (in settings) throws away the year files and the sync state and reads everything again. The calendar is the source of truth, so this always restores correct files. It is also how a new column reaches old rows.

## 5. The title format

```
CODE; Category; description
```

- **CODE** is required: 2–20 characters, `A–Z`, `0–9` and `_`, starting with a letter. *(Length limits: my call.)*
- **Category** is optional free text, for example `Coding`, `CS`, `Meetings`.
- **description** is optional free text.
- **Spaces around `;` are optional** and are trimmed.
- **Only the first two semicolons split the title.** Further semicolons stay in the description.

How a title is read:

| Title | Result |
|---|---|
| `ACME; Coding; new featureX` | ACME / Coding / new featureX |
| `ACME;Coding` | ACME / Coding / (none) |
| `ACME; ; quick call` | ACME / (none) / quick call |
| `ACME; CS; ticket 12; then 13` | ACME / CS / ticket 12; then 13 |
| `ACME` (alone, ACME is a project) | ACME / (none) / (none), green |
| `OOO` (alone, not a project) | not structured, untouched |
| `OOO; away` (not a project) | unknown code OOO, red |
| `acme; coding` | not structured, untouched (lower case), but listed as a near miss in the fix list when ACME exists |
| `Lunch; with Tom`, `John-Mary call` | not structured, untouched |

So an event is **structured** when its first segment matches the code pattern and either the title contains a `;` or the whole title is a known code. *(The "code alone" rule: my call.)*

Category is stored as typed. Summaries and charts group categories ignoring case and show the spelling used most. *(My call.)*

## 6. What counts, and how hours are computed

**The window.** The tracker reads, colours and writes rows only for events that start between the "track from" date in settings and **90 days ahead** of today. Older events are never coloured.

- Google's sync tokens can't be limited to a window, so the full read filters locally.
- Recurring events are read as single instances.
- As days pass, each sync also reads the days that newly entered the 90-day window, because an unchanged event there would not appear in the incremental changes.

*(The window: my call.)*

**Which events.** Every structured event in a chosen calendar within the window, except:

- events you declined;
- cancelled events (they leave the files on the next sync).

Events shown as "free" and invites you haven't answered count.

**Time zone.** Dates and times use the time zone of the user's primary Google calendar. Rows store local times with their offset, for example `2026-10-22T09:00+02:00`.

**Splitting.** An event that crosses midnight becomes one row per local day, each with that day's part of the time.

**All-day events** count `all_day_hours` per day (a setting, default 8). A three-day all-day event is three rows.

**Overlaps.** Each event counts fully, so a day can add up to more than 24 hours. The fix list shows every day where tracked events overlap.

**Planned and done.** The files hold future events too: the calendar is both plan and log. The hours summary, charts and reports separate **done** (ended before now) from **planned**. Reports include only done time unless asked. *(My call.)*

**Recurring events** count per instance. Each instance is its own row with its own instance id.

**Precision.** `hours` is the exact length in hours, written with at most 4 decimals and no trailing zeros (`1.5`, `0.3333`). Rounding, for example to quarter hours for billing, happens only in reports.

## 7. Files

All files are UTF-8 CSV (RFC 4180: commas, a header row, fields quoted when needed) or YAML. They live in an `Omark Time` folder in the chosen storage:

- Google Drive: a folder `Omark Time` the app creates in My Drive.
- OneDrive: the app folder `Apps/Omark Time`.
- Local folder: the folder the user picks.

### 7.1 `projects.csv`

```
code,description,client,rate,currency,archived
ACME,Acme Corp website rebuild,Acme Corp,120,EUR,
MYAPP,My app - product work,,,,
OLD,Old client,Old Co,90,PLN,2026-06-30
```

- `code`: as in section 5, unique.
- `description`: free text.
- `client`: free text, optional. It groups projects in reports.
- `rate`: a decimal per hour, optional.
- `currency`: an ISO 4217 code, required when `rate` is set.
- `archived`: a date, or empty. An archived project is still known, so its events stay green and counted. It is hidden from pickers and from the codes the agent skill suggests.

The app is the normal way to edit this file. It is also edited by hand or by an agent, so the app merges outside changes the way Tasks does. Unknown columns are kept.

### 7.2 `config.yaml`

```yaml
calendars: [primary]   # Google calendar ids to read
track_from: 2026-01-01 # first day that counts
all_day_hours: 8
week_start: monday
```

Defaults on first run: the primary calendar, 1 January of the current year, 8, Monday. Unknown keys are kept.

### 7.3 `events-YYYY.csv`

One row per tracked event per local day, in the file of that day's year.

```
date,start,end,hours,project,category,description,all_day,known,calendar,event_id
2026-10-22,2026-10-22T09:00+02:00,2026-10-22T10:30+02:00,1.5,ACME,Coding,new featureX,false,true,primary,abc123
2026-10-22,2026-10-22T11:00+02:00,2026-10-22T11:30+02:00,0.5,OOO,,away,false,false,primary,def456
```

- **`start` and `end`** are the row's own part of the event. For all-day rows they are 00:00 and the next day's 00:00. `hours` then comes from the setting.
- **`known`** says whether the code was a project when the row was written.
- **`calendar`** is the Google calendar id (`primary` for the primary calendar).
- **A row's key is `calendar` + `event_id` + `date`.**
- **Rows are sorted** by `start`, then `calendar` and `event_id`, so a sync changes as few lines as possible.
- **The app owns these files.** Hand edits are overwritten on the next sync; the doc says so.
- **The column order is fixed.** New columns are only ever added at the end, and a rebuild fills them for old rows.

*(The `all_day` and `calendar` columns, and the row key: my call. Both are needed once several calendars and all-day events count.)*

### 7.4 Sync state

Each device keeps its own sync tokens and a copy of the files in IndexedDB, like Tasks' offline cache. No sync state is written to the shared folder.

Two devices can sync the same files. Rows are added and removed by key, so applying the same change twice is harmless. A write uses the storage's conditional write (eTag). When another device wrote first, the app reloads the file, applies its changes again and retries.

Google Drive may not offer a true conditional write (launch spec 6.4.1). For the event files a lost race does no lasting harm: the next sync on either device recomputes the rows from the calendar. `projects.csv` and `config.yaml` use whatever safeguard the shared Drive adapter settles on.

**OneDrive** needs a Microsoft sign-in for Omark Time with its own Entra registrations, "Omark Time" and "Omark Time Staging", so the files land in `Apps/Omark Time`, apart from the task files. *(My call, mirroring Tasks.)*

## 8. Colours

- **Green** (Google's colour 10, "Basil") for a structured event with a known code.
- **Red** (colour 11, "Tomato") for a structured event with an unknown code.
- **Left alone** when the event is not structured. If the tracker coloured it before, it clears the colour back to the calendar default.

**Which ids mean green and red** is checked against `colors.get` at run time.

**The tracker writes only `colorId`**, plus a private extended property (`omarkTime` = `green` or `red`) that marks which colours it set. It never changes any other field.

**Invites.** For events organised by someone else, the patch touches only the user's copy. A spike confirms this before the build (section 15).

**Throttling.** Google allows 600 requests a minute per user. The first run can colour thousands of events:

- it colours newest first, stays well under the limit, and backs off on 403 or 429;
- it shows progress;
- it resumes where it left off if the app is closed.

**Event labels.** Google's newer event labels (`eventLabelId`) are not used. `colorId` works for every Google account and needs no extra scope.

**Recurring events.** How they are coloured (per instance, or once on the series when the series title qualifies) is left to the builder. No instance is ever left with a wrong colour.

## 9. Screens

The same design language as Omark Tasks: one calm page per view, the shared design tokens, phone and desktop, light and dark.

- **First run**: "Try the demo" or "Sign in with Google", then the storage choice, then the calendars to read.
- **Hours** (the home view):
  - a range picker (this week, last week, this month, last month, custom);
  - hours per project with categories under each, done and planned shown apart;
  - totals;
  - a status line with the last sync, "Sync now" and the fix count.
- **Charts**: hours per week per project, and per category for one project, over a chosen range. They are drawn in the app with no third-party requests. *(The chart library or hand-drawn SVG is the builder's call.)*
- **Fix list**: red events, near misses (section 5) and overlapping days. Each line has the date, the title and actions: "Add CODE as a project" (opens the project form filled in) and "Open in Google Calendar".
- **Projects**:
  - a list with add, edit, archive and delete;
  - codes can't be renamed, because that would turn past events red, so the user archives the old project and adds a new one *(my call)*;
  - delete warns that the project's events will turn red and suggests archiving.
- **Settings**: calendars, track from, all-day hours, week start, storage, "Rebuild", sign out.
- **Report export**:
  - pick one client, or one or more projects, and a range;
  - get a CSV of the rows, or a Markdown report grouped by project and category with descriptions, totals, and money (rate × hours per currency, never summed across currencies);
  - an optional rounding (none, 5, 15 or 30 minutes per event).

## 10. Google

### 10.1 Scopes

| Scope | Why | Class |
|---|---|---|
| `calendar.calendarlist.readonly` | list calendars to choose from; read the primary time zone | sensitive *(to check in the Console)* |
| `calendar.events.owned` | read events with sync tokens and set colours on calendars the user owns | sensitive |
| `drive.file` | only when the user picks Google Drive: files the app created | non-sensitive |
| `openid email` | show who is signed in | non-sensitive |

Drive is asked for only when the user picks Google Drive (incremental authorisation), so Calendar-only users never grant it. The calendar picker lists only calendars the user owns.

### 10.2 Sign-in

`@omark/signin` gets a Google provider next to Microsoft (see the launch spec's monorepo section). It is the same token broker:

- an auth code with PKCE, `access_type=offline`;
- the refresh token sealed in an HttpOnly cookie;
- `/api/auth/token` returns a short-lived access token.

Google doesn't rotate refresh tokens; the session lasts until the user signs out or revokes access. Nothing is stored on the server.

### 10.3 Projects and verification

- **Google Cloud projects:** "Omark Time" for production and "Omark Time Staging" for staging and previews, each with its own OAuth client and secret. Staging is published unverified, so its tokens don't expire after 7 days, and is used only by AL and the test account. *(Separate projects: my call, mirroring the separate Entra registrations.)*
- **Verification** of the production project for the sensitive scopes needs:
  - `omark.app` verified in Google Search Console;
  - the landing page as the homepage;
  - the privacy policy on `omark.app`, with Google's Limited Use statement;
  - a demo video of the sign-in and of each scope in use;
  - a short justification of the scopes.

  Google quotes 3–5 business days; reports say 5–12 weeks. **The request goes in as soon as the landing page and privacy policy are live**, weeks before launch.
- **Until verified**, users see Google's "unverified app" screen and the project is limited to 100 users over its lifetime. The launch does not wait for verification.

### 10.4 Self-hosting

A self-hoster creates their own Google Cloud project and OAuth client, keeps it unverified for personal use (the warning, but no 7-day expiry when published), and deploys like Tasks. `doc/self-hosting.md` covers both apps.

## 11. Agents

Omark ships no MCP server. It ships:

- **The format** in `doc/format.md` (the Time part): the title grammar, the three files and their columns, and the rules in sections 5–7.
- **An agent skill** (`omark-time`) that teaches an agent to:
  - **add events**: read `projects.csv`, use only known, unarchived codes (or ask), write titles in the format, and create the event with whatever Google Calendar tool the user has (Claude's Google Calendar connector or any calendar MCP). Colouring is optional; the app sets it on its next run;
  - **answer questions** by reading `events-*.csv` and `projects.csv` (DuckDB if available, plain reading otherwise), counting only `known` rows and only done time unless asked;
  - **draft a client report** in the same shape as the app's Markdown export.
- **README examples**: DuckDB queries, such as hours per project per category for a month and a weekly trend.

The skill finds the files in the user's synced folder (Google Drive for desktop, OneDrive or the local folder). It needs no Omark service.

## 12. Demo

A `demo` mode like Tasks' (launch spec 6.3):

- a fake calendar seeded with about two weeks of events relative to today:
  - green, red and untracked events;
  - an all-day event, an overlap, an unanswered invite and a declined one;
- sample projects, stored in the browser (IndexedDB) with no sign-in;
- "DEMO" in the footer, "Reset demo", and a link to the real options;
- colours shown on a simple calendar strip inside the app, since there is no Google Calendar to look at *(my call)*.

It is deployed at `demo-time.omark.app` from `main`. It makes no request outside its own origin, and an e2e test checks this.

## 13. Architecture

In the monorepo (launch spec section 6.12):

- **`apps/time`**: the Svelte 5 PWA, with its Playwright e2e (desktop Chrome, iPhone WebKit).
- **`packages/time-core`** (pure: no DOM, network or storage):
  - the title parser;
  - event → rows;
  - hours and day splitting;
  - the colour decision;
  - CSV and YAML read and write;
  - the projects and config models;
  - summaries, chart series and report building.
- **`packages/calendar`**: a `CalendarSource` interface (list calendars, incremental event changes, set colour), the Google implementation, and a fake for tests and the demo. A later Outlook or CalDAV source implements the same interface.
- **Shared with Tasks**:
  - `packages/storage` (Google Drive, OneDrive and local-folder adapters, cache, conditional writes);
  - `packages/signin` (Google and Microsoft providers);
  - the design tokens.

The sync logic in `time-core` is written so a later Cloudflare cron (section 14) can run it unchanged.

## 14. After launch

To become issues:

- A self-hosted Cloudflare cron that runs the sync 24/7 on the user's own Cloudflare account.
- Giving a project to an invite you can't rename (a private property on your copy of the event).
- An `attendees` column ("time on calls with X"), filled by a rebuild.
- Calendars shared with you (adds `calendar.events.readonly`).
- Other calendars: Microsoft 365 / Outlook, iCloud or CalDAV, a local `.ics`.
- An Omark MCP server with code-checking tools.
- A configurable separator.

## 15. Acceptance

- **Spike first** (a short throwaway with a second Google account), answering:
  - patching only `colorId` on an invite changes only the attendee's copy, with `calendar.events.owned`;
  - `calendar.events.owned` covers invites on the primary calendar;
  - how recurring instances come back from incremental sync;
  - which ids are green and red in `colors.get`.

  The findings go into this spec before the build.
- **`time-core` unit tests** cover every row of the table in section 5, the rules in section 6 (midnight split, all-day, declined, cancelled, overlaps, time zones, recurring) and the CSV round trip.
- **Contract tests**: the fake and the Google `CalendarSource` pass the same contract test, with Google's API mocked.
- **e2e on the fake calendar** (desktop and iPhone):
  - first run;
  - add a project and see a red event turn green;
  - archive and delete;
  - the hours summary for a range;
  - the fix list actions;
  - a report export;
  - rebuild;
  - the demo makes no outside requests.
- **Manual, on staging, with the test Google account and a test calendar**:
  - events are coloured in Google Calendar on web and phone;
  - an edit to a past event in Google Calendar changes the CSV on the next open;
  - files appear in Google Drive and in OneDrive;
  - DuckDB reads `events-*.csv` with the README queries.
- **The agent skill**: Claude, given the skill and the test files, adds a correctly shaped event through a calendar connector, and answers "hours per category on ACME last week" to match the app's summary.
- **AL's real calendar is never written by tests.** The real e2e uses the test account only.

## 16. Calls made by Claude, to check

1. Code: 2–20 characters; a title that is only a known code counts; a lone unknown code is untouched, not red.
2. Categories are grouped ignoring case in summaries.
3. The files hold future events up to 90 days ahead, and nothing before "track from" is read, coloured or written. Summaries and reports separate done from planned, and reports default to done.
4. `hours` keeps at most 4 decimals; rounding only in reports.
5. Extra columns `all_day` and `calendar`; the row key is calendar + event id + date.
6. `config.yaml` for settings, synced in the folder; storage choice per device.
7. Codes can't be renamed; delete warns and suggests archive.
8. The first-run colouring goes newest first, throttled and resumable; Google's event labels are not used.
9. Only calendars the user owns at launch.
10. Separate Google Cloud projects for production and staging; staging published unverified.
11. The demo shows colours on an in-app calendar strip.
12. Near misses (`acme; coding`) are listed in the fix list.
13. OneDrive storage uses its own Entra registrations ("Omark Time", "Omark Time Staging").
14. On Google Drive, a lost write race on the event files is accepted, because the next sync repairs it.

## 17. Steps only AL can do

1. Verify `omark.app` in Google Search Console.
2. Create the Google Cloud projects "Omark Time" and "Omark Time Staging":
   - the consent screen (app name, logo, the `omark.app` homepage and privacy policy, scopes);
   - a Web OAuth client with the redirect URIs;
   - the client secret into the Pages secrets.
3. Create a test Google account with a test calendar for staging and the real e2e.
4. Two Entra registrations, "Omark Time" and "Omark Time Staging", with Web redirect URIs on `time.omark.app` and `staging-time.omark.app` and their client secrets (for OneDrive storage).
5. Cloudflare Pages projects and DNS for `time.`, `staging-time.` and `demo-time.omark.app`.
6. Record the verification demo video (Claude writes the script) and submit verification.
7. Approve this spec, and later the plan.

## 18. Left to the builder

- Chart drawing (a small bundled library or hand-written SVG), as long as no third-party request is made.
- How recurring events are coloured (section 8).
- Throttle numbers and backoff.
- The exact layout of each screen, within the Tasks design language.
- How milestone T splits into issues and PRs.
