# Omark Time demo (#59, T.7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public demo of Omark Time at `demo-time.omark.app`, deployed from `main`. It runs on a fake calendar and needs no sign-in, so anyone can try every screen in 30 seconds (spec 12).

**Architecture:** A third build mode, `VITE_STORAGE=demo`, beside `google` and `fake`. It reuses the fake build's parts, with demo choices made for the visitor:
- the calendar is `@omark/calendar`'s `demoSeed`, two weeks around today in the browser's time zone;
- the files live in an `IdbDrive`, seeded with the demo's `projects.csv` and a `config.yaml` that has colouring on;
- the sign-in is a stub that is always signed in, with edit access;
- the first run is done, so the demo opens on Hours.

A **Calendar** view, in the demo only, draws the week's events in their colours. With no Google Calendar to look at, it shows what colouring does. The footer reads "DEMO", with "Reset demo" (clears the demo's IndexedDB and reloads) and "Use it for real" (to omark.app). Nothing in the demo build talks to anything outside its own origin.

**Tech Stack:** Svelte 5, `@omark/calendar` (`FakeCalendar`, `demoSeed`), `@omark/storage` (`IdbDrive`), Playwright. No new dependency.

**Spec:** [`doc/time/spec.md`](../time/spec.md) section 12. Tasks' demo, for its shape: [31-demo-mode.md](31-demo-mode.md).

## What changes for AL

- `demo-time.omark.app` opens straight on Hours, with about two weeks of events: two projects, a red ACMEE event in the fix list, an overlap, an all-day event, an unanswered invite and a declined one.
- **Calendar** shows this week and last week, the events in green, red or grey, as they would look in Google Calendar with colouring on.
- Everything works: add ACMEE as a project and its event turns green in Calendar; archive; reports download.
- Edits stay in the browser. "Reset demo" brings the seed back.
- No sign-in, and no request outside the site.

## Acceptance criteria

- [ ] e2e on the demo build (desktop and iPhone):
  - it opens with no sign-in on Hours, showing hours;
  - the fix list has the red ACMEE event and an overlap day;
  - Calendar shows ACMEE in red, and in green after adding it as a project.
- [ ] e2e: the demo makes no request outside its own origin, while going through every view.
- [ ] e2e: "Reset demo" brings back the seed, after an edit and a reload.
- [ ] CI: a `time-demo` job modelled on `tasks-demo`.
  - It builds with `VITE_STORAGE=demo` and deploys `apps/time/dist` from `apps/time`, so the sign-in helper (`functions/`) is left out.
  - It has "Skip if main has moved on".
  - It checks the site with `check-demo.mjs`: `/` is the app, and there's no `/api/auth`.
  - Workflow tests and `.env.example` follow.
- [ ] The demo build has no Google code paths: no `GoogleCalendarSource` or `createAuth` in its bundle, which a build check asserts.

## Tests I'll write first

- `src/lib/demo.test.ts`:
  - the demo deps start signed in, with edit access, with the first run done and colouring on;
  - the seed is dated around today in the zone given;
  - reset empties the demo's databases.
- `e2e/demo.spec.ts` on a second Playwright web server (the demo build, as `apps/tasks` does): one test per criterion above.
- `tools/ci/test/workflows.test.ts`: the `time-demo` job's shape.

## Tasks

1. **The demo mode.** `storageMode` takes `demo`. In `boot.ts`, `openDemo()` builds on `openFake()` with demo choices (above). The prefs are seeded so the first run is skipped.
2. **The footer:** DEMO, "Reset demo" (asks first, clears the demo databases, reloads) and "Use it for real" (`VITE_REAL_USE_URL`, default omark.app). Settings hides Sign out and shows "In this browser (demo)".
3. **Calendar view:** a week strip, Monday to Sunday by `week_start`, one column per day. Events are coloured by `colorId`: the green id, the red id, or none for grey. Back and forward move by a week. Demo only.
4. **e2e** on a second web server with the demo build.
5. **CI:** `time-demo`, its workflow tests, and `.env.example` (`CF_TIME_DEMO_PROJECT`, `TIME_DEMO_URL`; both already set).

## Steps only AL can do

- In the Cloudflare dashboard, add the custom domain `demo-time.omark.app` to the Pages project `omark-time-demo`, and let Cloudflare add the DNS record. (Claude made the project and set the variables. This session may not change domains or DNS.)

## Risks

- **The seed is dated around today.** A demo left open over midnight keeps its days; "Reset demo" redates it.
- **Bundle size:** the demo build carries the fake calendar and the seed, a few kB.

## Out of scope

- A demo of the Google sign-in or the storage choice: the demo starts past them.
- Production Time (`time.omark.app`, T.9).
