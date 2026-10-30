# Seeded issues for the launch (#105)

Roadmap item 4.1. Spec: [open source launch spec](../TaskApp%20open%20source%20launch%20spec.md), section 6.9. Refreshed for the one app on 2026-10-30, with three Goals issues added, and created as written here (fast mode: no approval wait).

## What changes for users

Contributors find 16 `ready` issues, each sized, labelled with its app, and written with acceptance criteria, so they (or their agents) can start without asking. Three are `good first issue`; the rest are `help wanted`.

## Acceptance criteria

- [ ] Each issue below exists on GitHub with the title, form headings and labels shown, and the agent footer.
- [ ] Every issue has `ready`, a kind label, a size label, `good first issue` or `help wanted`, and one `app:` label; format changes also have `format`.
- [ ] The roadmap's 4.1 row can point to the issue numbers (the coordinator updates it).

## Tests I'll write first

None in code: this creates issues only. Before creating them, a dry run prints each issue's title and labels from this file. Afterwards, `gh api` lists the `ready` issues to check that the count and labels match.

## Calls made, to check

1. **"Read calendars shared with you" is large, not small.** Spec 6.9 lists it as small and `good first issue`. But it adds the scope `calendar.events.readonly`, and the factory sizes any sign-in change as large. So it is drafted as large and `help wanted`. That leaves three `good first issue`s instead of four.
2. **Security headers is a `task`, not an `enhancement`**: users don't see it.
3. **Reopening a completed task keeps its `done.md` line.** The completion happened. Reopening adds the task back to `tasks.md` and rewrites nothing, in line with "nothing gets deleted".
4. **The attendees column is a minor format version (1.1).** Old readers keep unknown columns, so it adds without breaking.

## Risks

- Issues that are vague or too big put contributors off. Each one names the files to start from and what done looks like.
- Once the repository is public, these issues are public. They name no person and no private detail.

## Out of scope

- Asking developers to take one (4.2, AL).
- Discussions ideas for things that aren't accepted work.

---

## The issues

Each block is the issue body, using its form's headings.

### 1. Import Todoist priority 1 as ⏫

Labels: `enhancement`, `ready`, `size:small`, `good first issue`, `app:tasks`

**App:** Omark Tasks

**The problem:** The Todoist import (`tools/todoist-import`) drops priorities, so tasks that were P1 in Todoist lose their importance.

**Who has it:** Anyone moving from Todoist.

**How I'll know it works:**

- A Todoist task with priority P1 (the API's `priority: 4`) becomes `- [ ] {title} ⏫`. Other priorities import as today.
- A test in `tools/todoist-import/test/` covers P1 to P4.
- The README's "Coming from Todoist?" line mentions it.

### 2. Security headers and a Content Security Policy in Report-Only mode

Labels: `task`, `ready`, `size:small`, `good first issue`, `app:suite`

**App:** Several, or the whole suite

**What and why:** The app's `apps/omark/public/_headers` sets only cache headers. The landing page (`apps/site/public/_headers`) already sends a CSP and security headers. The app should too, starting in Report-Only mode so nothing breaks.

**Done when:**

- The app sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`, and a `Content-Security-Policy-Report-Only`. It allows only the app itself (with its sign-in helper) and the APIs it calls: Microsoft Graph, Google Drive and Google Calendar.
- A test checks the app's `_headers`, like the site's.
- The e2e passes, and the browser console on a preview shows no CSP reports in normal use.
- SECURITY.md's "Known gaps" says Report-Only, with a follow-up to enforce it.

### 3. Stats: a 30-day count and a streak

Labels: `enhancement`, `ready`, `size:small`, `good first issue`, `app:tasks`

**App:** Omark Tasks

**The problem:** The stats line shows today, 7 days and all time. It doesn't show the last month, or how many days in a row you got something done.

**Who has it:** People who use the stats to keep going.

**How I'll know it works:**

- `computeStats` (`packages/tasks-core/src/stats.ts`) returns `last30` and `streak`. The streak counts consecutive days with at least one completion, ending today, or yesterday when today has none yet.
- The stats line shows them compactly, for example `30d 87 · 5-day streak`, on desktop and phone.
- Unit tests in `packages/tasks-core/test/` cover a gap day, today without completions, and an empty `done.md`.
- `doc/tasks/spec.md` section 8 is updated.

### 4. Natural-language dates in quick add ("in 3 days", "next fri")

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:tasks`

**App:** Omark Tasks

**The problem:** Quick add understands `tod`, `tom`, weekdays and a few more words (`packages/tasks-core/src/quick-add.ts`), but not "in 3 days", "next fri", "in 2 weeks" or "12 nov".

**Who has it:** Everyone who adds tasks with the keyboard.

**How I'll know it works:**

- These forms set the `📅` and are highlighted and dismissible like today's shortcut words: "in N days", "in N weeks", "next <weekday>", "<day> <month>" and "<month> <day>". Each takes English month names and their 3-letter forms.
- Text that isn't one of them stays in the title.
- Unit tests cover each form, the week settings, and a date already past this year (next year).
- `doc/tasks/spec.md` section 9.4 lists the new words.
- The plan says how this stays English-only until translations exist.

### 5. Download the three files as a zip

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:tasks`

**App:** Omark Tasks

**The problem:** The files are the export, but on a phone, or with Google Drive, there is no easy way to get a copy of all three at once.

**Who has it:** People who want a backup, or who are moving storage.

**How I'll know it works:**

- Settings has "Download my files". It saves a zip of `tasks.md`, `done.md` and `config.yaml` as this device has them, offline and in the demo too.
- Nothing is sent anywhere.
- The plan picks between a small zip library and a hand-written "stored" zip (no compression), with the size cost of each.
- An e2e test unzips the download and compares the files.

### 6. Polish translation, and the i18n groundwork it needs

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:suite`

**App:** Several, or the whole suite

**The problem:** Omark is English only, in all three parts. `apps/tasks/src/lib/messages.ts` already gathers Tasks' toast wording in one place; nothing else does.

**Who has it:** Polish speakers first; anyone adding another language after.

**How I'll know it works:**

- Every UI string, in Tasks, Time, Goals, the shell and Settings, comes from one message catalogue per language. A test checks that every key exists in every language.
- The language follows the browser, with a setting to choose. Dates and bucket names are localised.
- The files don't change: repeat rules stay in English in `tasks.md` (`🔁 every week on Monday`), and the app shows them translated.
- Polish is complete.
- `CONTRIBUTING.md` says how to add a language.

### 7. Dropbox storage

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:suite`

**App:** Several, or the whole suite

**The problem:** Omark keeps files in OneDrive, Google Drive or a local folder. Dropbox users have no way in.

**Who has it:** Dropbox users.

**How I'll know it works:**

- A `DropboxAdapter` in `packages/storage` passes the shared `adapterContract` test. It keeps the files in Dropbox's app folder and makes conditional writes with the file's `rev`.
- The sign-in helper gets a Dropbox provider (authorization code with PKCE). As with the others, it keeps the refresh token only in the user's encrypted cookie.
- The storage choice on the first run and in Settings offers Dropbox.
- `doc/self-hosting.md` and `doc/architecture.md` describe it, and the privacy policy names it.

### 8. The week board on phones, as bucket tabs

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:tasks`

**App:** Omark Tasks

**The problem:** On phones the app always shows the task list; the week board is desktop only.

**Who has it:** People who plan their week on the phone.

**How I'll know it works:**

- On narrow screens the board view shows one bucket at a time, with a row of tabs and their counts: Today, Tomorrow, This week, Next week, Later, Someday. You can swipe between buckets.
- Moving a task uses the existing move sheet and long-press drag.
- The desktop board is unchanged.
- e2e on the `iphone` project covers switching tabs and moving a task.
- `doc/tasks/spec.md` section 11.2 is updated.

### 9. Reopen a completed task from search

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:tasks`

**App:** Omark Tasks

**The problem:** Search finds completed tasks (`searchDone`), but a task completed by mistake days ago can't be brought back. Undo works only right after completing.

**Who has it:** Everyone, now and then.

**How I'll know it works:**

- A completed task in the search results has "Reopen". It adds the task to `tasks.md` with its title, `⏫` and `🔁` rule and its notes, due today.
- `done.md` is not changed: the completion happened.
- Habit lines (`🌱`, `🏆`, `❌`) can't be reopened.
- Unit tests in `tasks-core` and one e2e test cover it.
- `doc/tasks/spec.md` section 9.3 and the `taskapp-files` skill are updated.

### 10. Time: a self-hosted Cloudflare cron that syncs around the clock

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:time`

**App:** Omark Time

**The problem:** Omark Time syncs and colours only while the app is open, so files and colours lag until the next open.

**Who has it:** People who want their CSV files and calendar colours always current.

**How I'll know it works:**

- A Worker with a cron trigger, deployed by the user to their own Cloudflare account, runs the same sync as the app. It uses `time-core` unchanged, and the calendar and storage code.
- The user's refresh tokens live only in that Worker's own secrets or storage. No Omark service runs it or sees them.
- `doc/self-hosting.md` has the setup steps.
- A test runs the Worker's sync against the fake calendar and fake drive.

### 11. Time: an attendees column ("time on calls with X")

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `format`, `app:time`

**App:** Omark Time

**The problem:** You can't ask how much time you spent in meetings with a given person.

**Who has it:** People who bill or review time by client contact.

**How I'll know it works:**

- `events-YYYY.csv` gets an `attendees` column at the end: the other attendees' email addresses, separated by `;`. A rebuild fills it for old rows.
- `doc/format.md` goes to version 1.1 and describes it; old readers keep it as an unknown column.
- The README or the `omark-time` skill gets a DuckDB example: hours with one person last month.
- The privacy policy says attendee addresses are written to the user's own files.
- The plan confirms the existing read scope covers attendees.

### 12. Time: an Outlook / Microsoft 365 calendar source

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:time`

**App:** Omark Time

**The problem:** Omark Time reads only Google Calendar.

**Who has it:** People whose calendar is Outlook or Microsoft 365.

**How I'll know it works:**

- A `CalendarSource` for Microsoft Graph in `packages/calendar` passes the shared calendar contract test. It uses delta queries for incremental sync.
- Sign-in uses the Microsoft provider with a read-only calendar scope.
- Colouring is either supported (Outlook categories) or left out for Outlook, as the plan decides.
- `doc/time/spec.md` and `doc/self-hosting.md` are updated.

### 13. Time: read calendars shared with you

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:time`

**App:** Omark Time

**The problem:** Omark Time lists only calendars you own, so time logged in a team or shared calendar isn't counted.

**Who has it:** People who log work in a calendar someone else shared with them.

**How I'll know it works:**

- The calendar picker also lists calendars shared with you (any access role). Choosing one asks Google for `calendar.events.readonly` through incremental consent.
- Shared calendars are read only: they are never coloured.
- Their rows carry their calendar id, and `doc/time/spec.md`, the privacy policy and the scopes table are updated.
- A test with the fake calendar covers a shared calendar.
- Omark's Google verification covers only the owned-calendar scopes, so the new scope needs a new review. A maintainer re-submits it (`needs-human`) before the change reaches production.

### 14. Goals: a guided vision exercise as an agent skill

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:goals`

**App:** Omark Goals

**The problem:** Writing the vision for an area is the hardest part of `goals.md`, and the app on purpose has no wizard for it (`doc/goals/spec.md` section 2.2).

**Who has it:** People starting their goals, or redoing them once a year.

**How I'll know it works:**

- A skill in `.claude/skills/` walks the user through one area at a time: the end state they want in a few years, then one to three dated goals. It asks one question at a time and suggests nothing the user didn't say.
- It writes `goals.md` only as the `omark-goals` skill and `doc/format.md` allow, and keeps every other line byte for byte.
- It is tried on the demo world's `goals.md`; the plan shows a short sample conversation.
- `doc/goals/spec.md` section 14 is updated.

### 15. Goals: show in Time which goal a project serves

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `app:goals`

**App:** Omark Goals

**The problem:** A goal tagged with a project code (`#CLIMB`) links that project's hours to the goal, but Time's hours don't say which goal they serve. You switch to Goals to see why the hours matter.

**Who has it:** People who use Goals and Time together.

**How I'll know it works:**

- In Time's hours summary, a project linked to a goal shows the goal's title and date, and opens it in Goals.
- Nothing shows when Goals is off or `goals.md` is missing.
- The link is worked out in `goals-core` (pure), with unit tests; one e2e test on the demo world.
- `doc/goals/spec.md` (sections 2.2 and 14) and `doc/time/spec.md` are updated.

### 16. Goals: a different "Needs update" period per area

Labels: `enhancement`, `ready`, `size:large`, `help wanted`, `format`, `app:goals`

**App:** Omark Goals

**The problem:** An area shows "Needs update" after `stale_after` months without linked activity, the same for every area. Some areas move slowly (a five-year plan), others weekly.

**Who has it:** People whose areas move at different speeds.

**How I'll know it works:**

- An area can set its own period in `goals.md`; the plan proposes the syntax. Areas without one use `stale_after`.
- Files without it are read and written as today, byte for byte.
- The area form has the field; `goals-core` has unit tests for it.
- `doc/format.md`, the `omark-goals` skill and `doc/goals/spec.md` (sections 6.3 and 14) are updated.
