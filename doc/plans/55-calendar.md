# Calendar sources (`packages/calendar`) Implementation Plan (#55, #56)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@omark/calendar`: an in-memory fake calendar and the contract test every `CalendarSource` passes (part 1, #55, now), then the Google Calendar source (part 2, #56, after 3.8).

**Architecture:** The `CalendarSource` port and its types live in `@omark/time-core` (#54, `src/source.ts`), so the sync logic stays pure; this package re-exports them and holds the implementations. Part 1 is pure (the fake, the demo seed, the contract). Part 2 adds `GoogleCalendarSource`, which calls Google's REST API from the browser with an access token from the sign-in helper, and runs the same contract against an in-test emulation of Google's API, as `@omark/storage` does with `GraphFake`.

**Tech Stack:** TypeScript 5.9, Vitest 3, `fetch` (part 2). No new third-party dependency.

**Spec:** [`doc/Omark Time spec.md`](../Omark%20Time%20spec.md), sections 6, 8, 10, 12, 13 and the spike findings in 15.1. Milestone plan: [53-omark-time-milestone.md](53-omark-time-milestone.md). Time-core plan: [54-time-core.md](54-time-core.md).

## What changes for AL

Nothing visible. Part 1 gives the app (#57), its e2e and the demo (#59) a calendar that never touches Google. Part 2 is what reads `hello@omark.app`'s calendar on staging; it has one manual check against the "Omark Test" calendar.

## Why the split

Part 1 needs nothing from 3.8. Part 2's code needs only a `getToken()` function, which `@omark/storage`'s `Auth` already has, but it waits for 3.8 because 3.8 builds the first Google API client in the repo (Drive) and will settle how Google errors, token refresh and backoff are handled; part 2 uses that rather than writing a second copy. It also needs 3.8's Google provider for the manual check and for colouring's edit-access consent.

## Acceptance criteria

Part 1 (#55):
- [ ] `FakeCalendar` passes `calendarContract`.
- [ ] `demoSeed(today, timeZone)` gives about two weeks of events around today: green, red and untracked, an all-day event, an overlap, an unanswered invite and a declined one, and sample projects.
- [ ] The fake records every colour patch, so the app's e2e can prove that colouring off writes nothing.
- [ ] The fake's state survives `toJSON` / `fromJSON` (the demo keeps it in IndexedDB).

Part 2 (#56):
- [ ] `GoogleCalendarSource` passes `calendarContract` against the Google emulation.
- [ ] A colour patch is `PATCH …/events/{id}?sendUpdates=none` with a body of only `colorId` and `extendedProperties.private.omarkTime`.
- [ ] 429 and 403 rate-limit answers back off and retry; 403 for missing scopes raises `EditAccessRequiredError`; 410 raises `SyncTokenExpiredError`; 401 retries once with a fresh token.
- [ ] Manual: on `hello@omark.app`'s "Omark Test" calendar, a full read, an incremental read after an edit, and a colour set and clear behave as in the emulation.

## Global Constraints

- Only calendars the user owns are listed (`accessRole` = `owner`); the primary calendar's id is reported as `primary`.
- Events are read with `singleEvents=true`; sync tokens are never combined with `timeMin` or `timeMax` (Google answers 400).
- Green and red ids come from `colors.get`: the event colours whose background is `#51b749` and `#dc2127`, falling back to `10` and `11`.
- The tracker writes only `colorId` and the private extended property `omarkTime` (`green` | `red`), always with `sendUpdates=none`.
- Google allows 600 requests a minute per user: colour patches are spaced at least 200 ms apart (≤ 300 a minute). *(My call.)*
- Tests and scripts never touch AL's calendar. The manual check refuses any calendar not named "Omark Test".

## Review Focus

1. **A full read must not return cancelled events, an incremental read must.** Google's full read leaves them out; the contract pins both, so the fake can't drift from Google.
2. **A colour patch is a change.** After `setColour`, the next incremental read returns that event (it did in the spike). The sync loop must not treat its own patch as a user edit that needs another patch: the contract checks the returned event already has the new colour, so `colourAction` returns null for it.
3. **Calendar ids with `@` and `#`** (`en.polish#holiday@group.v.calendar.google.com`) are URL-encoded in every path. Test in Task 4.
4. **Many pages.** A full read of a long-lived calendar runs to many pages; the sync token is only on the last page. Test in Task 4 with three pages.
5. **Clearing a colour** sends `colorId: null` and `omarkTime: null`; Google treats null in a PATCH as "remove". The emulation does the same, and the manual check confirms it on the real API.

---

## File structure

```
packages/calendar/
  package.json            @omark/calendar; depends on @omark/time-core (workspace)
  tsconfig.json           lib ES2023 (part 1); ES2023 + DOM once google.ts lands (part 2)
  vitest.config.ts        name '@omark/calendar', TZ 'Pacific/Auckland'
  src/index.ts            re-exports time-core's source types; FakeCalendar, demoSeed (part 1); GoogleCalendarSource (part 2)
  src/fake.ts             FakeCalendar
  src/seed.ts             demoSeed
  src/contract.ts         calendarContract (exported for other sources' tests)
  src/google.ts           GoogleCalendarSource (part 2)
  test/fake.test.ts
  test/seed.test.ts
  test/google-fake.ts     in-test emulation of the Google endpoints (part 2)
  test/google.test.ts     (part 2)
  scripts/check-google.ts manual check against "Omark Test" (part 2)
```

`contract.ts` sits in `src/` (not `test/`) so a later Outlook or CalDAV source in another package can import it. It imports Vitest; `src/index.ts` does not re-export it (import it from `@omark/calendar/contract`, an extra `exports` entry).

---

## Part 1 (#55)

### Task 1: The contract

**Files:** Create `packages/calendar/{package.json,tsconfig.json,vitest.config.ts}`, `src/index.ts`, `src/contract.ts`. Modify `CLAUDE.md` (Layout: `packages/calendar`: calendar sources, a fake and the Google one).

**Interfaces:**
- Consumes (from `@omark/time-core`): `CalendarSource`, `CalendarEvent`, `CalendarInfo`, `ColourPatch`, `SyncTokenExpiredError`, `EditAccessRequiredError`.
- Produces:

```ts
export interface ContractHarness {
  source: CalendarSource;
  /** Changes made "in Google Calendar" by the user, outside the source. */
  add(event: CalendarEvent): void;
  edit(calendarId: string, id: string, changes: Partial<CalendarEvent>): void;
  cancel(calendarId: string, id: string): void;
  expireTokens(): void;
  readOnly(on: boolean): void;
}
export function calendarContract(name: string, make: () => ContractHarness | Promise<ContractHarness>): void;
```

  The harness starts with two calendars: `primary` (`Europe/Warsaw`, owned) and `work@example.com` (owned); and a not-owned `team@example.com`, which must not be listed.

- [ ] **Step 1: Write the contract's cases** (each makes a fresh harness):
  1. `listCalendars` returns `primary` (`primary: true`, `timeZone: 'Europe/Warsaw'`, `owned: true`) and `work@example.com`, not `team@example.com`.
  2. A full read returns the added events and a token, but not a cancelled one.
  3. With that token: no change → `[]`; after `edit` → the edited event; after `cancel` → `{ id, status: 'cancelled' }`; after `add` → the new event; each read returns a new token.
  4. After `expireTokens`, a read with an old token rejects with `SyncTokenExpiredError`; a full read still works.
  5. `readRange('primary', '2026-10-22T00:00:00+02:00', '2026-10-23T00:00:00+02:00')` returns the instances starting that day only, each instance of a series on its own.
  6. `colourIds()` → `{ green: '10', red: '11' }`.
  7. `setColour(…, { colorId: '10', marker: 'green' })`, then the next incremental read returns the event with `colorId: '10'`, `marker: 'green'` and the same title, start, end and response.
  8. `setColour(…, { colorId: null, marker: null })` clears both.
  9. With `readOnly(true)`, `setColour` rejects with `EditAccessRequiredError` and a full read shows the event unchanged.
  10. Events of `work@example.com` never appear in `primary`'s reads.
- [ ] **Step 2:** No implementation yet; `pnpm typecheck` passes. Commit `Add the calendar package and the CalendarSource contract`.

### Task 2: The fake calendar

**Files:** Create `src/fake.ts`; Test `test/fake.test.ts`

**Interfaces:**
- Produces:

```ts
export interface FakeCalendarState { calendars: CalendarInfo[]; events: CalendarEvent[]; seq: number; changedAt: Record<string, number>; tokenFloor: number; readOnly: boolean }
export class FakeCalendar implements CalendarSource {
  constructor(calendars: CalendarInfo[], events?: CalendarEvent[]);
  readonly patches: { calendarId: string; eventId: string; patch: ColourPatch }[];
  add(event: CalendarEvent): void;
  edit(calendarId: string, id: string, changes: Partial<CalendarEvent>): void;
  cancel(calendarId: string, id: string): void;
  expireTokens(): void;
  readOnly: boolean;
  toJSON(): FakeCalendarState;
  static fromJSON(state: FakeCalendarState): FakeCalendar;
}
```

  Every change (including `setColour`) bumps `seq` and stamps the event's key with it; a token is `fake-<seq>`; a token below `tokenFloor` is expired. Calendars with `owned: false` are kept but not listed.

- [ ] **Step 1: Write the failing test:** `calendarContract('FakeCalendar', () => harnessFor(new FakeCalendar(CALENDARS)))`, plus: `patches` lists each `setColour` call; `FakeCalendar.fromJSON(JSON.parse(JSON.stringify(fake)))` keeps events, tokens and `readOnly`, and its tokens still work.
- [ ] **Step 2: Run** `pnpm vitest run --project @omark/calendar` — FAIL (no `FakeCalendar`).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Add the fake calendar`.

### Task 3: The demo seed

**Files:** Create `src/seed.ts`; Test `test/seed.test.ts`

**Interfaces:**
- Consumes: `FakeCalendar`; from time-core `eventToRows`, `parseProjects`, `knownCodes`, `buildFixList`, `addDays`.
- Produces: `demoSeed(today: string, timeZone: string): { calendars: CalendarInfo[]; events: CalendarEvent[]; projectsCsv: string }`.

  Projects: `ACME` (Acme Corp website rebuild, Acme Corp, 120 EUR), `MYAPP` (My app, product work), `OLD` (Old client, Old Co, 90 PLN, archived). Events on weekdays from 10 days before `today` to 4 days after, in `timeZone`: ACME Coding / Meetings / CS, MYAPP Design, a red `ACMEE; Coding; typo`, untracked `Lunch` and `Gym`, an all-day `MYAPP; Conference`, two overlapping ACME events on one day, an unanswered invite `ACME; Meetings; kickoff` and a declined `ACME; Meetings; skipped`.

- [ ] **Step 1: Write the failing test:** for `today = '2026-10-26'` in `Europe/Warsaw`, turning the seed into rows with time-core shows hours for ACME and MYAPP, at least one unknown row (`ACMEE`), one all-day row, one overlap day in `buildFixList`, the invite counted, the declined event not; every event starts within 10 days before and 4 days after; the seed for another `today` is the same shape moved by the difference in days.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Seed the demo calendar`. Push, open the PR (`Closes #55`), fresh-eyes review.

## Part 2 (#56), after 3.8 merges

Before starting: read 3.8's merged code. If it added a shared Google request helper (token, 401 refresh, backoff, error mapping), use it in Task 4 and drop what it covers from this task; the tests stay.

### Task 4: Google source: reads

**Files:** Create `src/google.ts`, `test/google-fake.ts`, `test/google.test.ts`. Modify `tsconfig.json` (`lib` gains `DOM`).

**Interfaces:**
- Produces:

```ts
export interface GoogleCalendarOptions {
  getToken(opts?: { fresh?: boolean }): Promise<string>; // @omark/storage's Auth fits
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Minimum gap between colour patches. Default 200. */
  patchIntervalMs?: number;
  /** Retries on 429, 403 rate limit and 5xx. Default 5. */
  maxRetries?: number;
}
export class GoogleCalendarSource implements CalendarSource { constructor(opts: GoogleCalendarOptions) }
```

  Base `https://www.googleapis.com/calendar/v3`. `listCalendars`: `GET /users/me/calendarList` (all pages), owned only, the `primary: true` entry's id reported as `primary`, `name` = `summaryOverride ?? summary`. `readChanges`: `GET /calendars/{id}/events?singleEvents=true&maxResults=2500` plus `syncToken` when given, following `nextPageToken`, returning the last page's `nextSyncToken`. `readRange`: the same with `timeMin`/`timeMax`, no token. Mapping: `summary` → `title`, `attendees.find(a => a.self)?.responseStatus ?? null` → `response`, `extendedProperties.private.omarkTime` (`green`|`red` only) → `marker`. Errors: 410 → `SyncTokenExpiredError`; 401 → `getToken({ fresh: true })` and one retry, then `AuthRequiredError` (from `@omark/storage`); a network failure → `OfflineError`; 429, 403 with reason `rateLimitExceeded` or `userRateLimitExceeded`, and 5xx → wait `Retry-After` or 1, 2, 4, 8, 16 s, up to `maxRetries`.

  `GoogleFake` (test) answers `fetch` for those endpoints from an in-memory state shaped like `FakeCalendar`'s, with switches `unauthorized`, `rateLimited` (next N answers 429), `readOnly`, `pageSize`, and a `calls` log.

- [ ] **Step 1: Write the failing tests:** `calendarContract('GoogleCalendarSource', …)` over `GoogleFake` (cases 1–6 and 10 pass after this task; 7–9 after Task 5, so run with `.skip` on them until then and remove it in Task 5); three pages with `pageSize: 2` and five events → all five, the token from the last page; calendar id `en.polish#holiday@group.v.calendar.google.com` is sent as `en.polish%23holiday%40group.v.calendar.google.com`; two 429s then success → two sleeps of 1000 and 2000 ms; `Retry-After: 7` → a sleep of 7000; 401 once → a fresh token and success; 401 twice → `AuthRequiredError`; no request ever has `timeMin` together with `syncToken`.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Read Google calendars and events`.

### Task 5: Google source: colours

**Files:** Modify `src/google.ts`, `test/google-fake.ts`, `test/google.test.ts`

- [ ] **Step 1: Write the failing tests:** un-skip contract cases 7–9; the PATCH for `{ colorId: '10', marker: 'green' }` is `PATCH /calendars/primary/events/abc?sendUpdates=none` with body exactly `{"colorId":"10","extendedProperties":{"private":{"omarkTime":"green"}}}`, and the clearing body has `null` for both; 403 with `insufficientPermissions` (Google's answer for a read-only scope) → `EditAccessRequiredError`, no retry; three patches in a row are at least 200 ms apart (fake clock); `colourIds()` picks ids by background (`#51b749`, `#dc2127`) when Google numbers them differently, and falls back to `10` and `11` when neither is present.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `Set event colours in Google Calendar`.

### Task 6: Manual check and finish

**Files:** Create `scripts/check-google.ts`; Modify `packages/calendar/package.json` (script `check:google`).

The script reads an access token from the file named by `GOOGLE_TOKEN_FILE` (never printed), finds the calendar named "Omark Test" (exits with an error if there is none; it never reads or writes any other calendar), and prints, without event titles: the number of events in a full read, the number in an incremental read after it asks you to edit one event in Google Calendar, and the result of setting and then clearing the colour of the first event.

- [ ] Run `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm --filter tasks build` — all PASS.
- [ ] Get a token for `hello@omark.app` with 3.8's helper on staging (or the spike's method), run `pnpm --filter @omark/calendar check:google`, paste the printed counts into the PR.
- [ ] Commit `Add a manual check against the test calendar`. Push, open the PR (`Closes #56`), fresh-eyes review.

## Risks

- **The emulation can agree with the code and both be wrong about Google.** The contract cases come from the spike's findings (15.1), and the manual check runs the same steps on the real API.
- **3.8's helper may not fit** the calendar API (it is written for Drive). Then part 2 keeps its own small request function and the PR says why.
- **A renamed series with no end** returns many instances in one incremental read (spec 15.1, open). Paging handles the size; #57 measures it.

## Out of scope

- The sync and colouring loops, progress and resume, consent for edit access: #57.
- Outlook, iCloud, CalDAV, `.ics` (spec 14).
- Calendars shared with the user (spec 14).
