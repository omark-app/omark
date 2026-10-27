# First-run choice (#94) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new person picks where their tasks live: the demo, OneDrive, Google Drive or a folder on this computer. The choice is remembered on the device and can be changed in Settings.

**Architecture:** The device's choice (`microsoft`, `google` or `folder`) is kept in localStorage. One pure function, `decideStart`, says what start-up opens from that choice, the signed-in provider and whether a folder is saved: a storage, or the first-run screen. The sign-in screen becomes the first-run screen. A Storage card in Settings switches storage: it saves the new choice, then reloads, signs in or shows the folder picker. Each storage keeps its own offline cache, as today, so switching never copies or deletes files, and edits not yet saved wait in their cache until the user switches back. The demo stays its own deployment: "Try the demo" links to it.

**Tech stack:** TypeScript, Svelte 5, Vitest, Playwright. No new dependency.

**Spec:** `doc/TaskApp open source launch spec.md` 6.5.

## What changes for AL

- **His devices:** nothing. A device that is signed in, or that picked a folder, opens as before and remembers that choice from then on.
- **A new device or browser** shows the first-run screen instead of "Sign in with Microsoft":
  - "Use my OneDrive";
  - "Use my Google Drive", where the helper has Google set up;
  - "Use a folder on this computer", in Chrome and Edge on a computer;
  - "Try the demo", a link to `demo-tasks.omark.app`.
- **When a remembered sign-in has ended**, the same screen says "Sign in to open your tasks in OneDrive", with that choice first.
- **Settings gets a Storage card first:** "Your tasks are in OneDrive." with buttons for the other places. If edits are not saved yet, it asks first: they stay on this device and are saved when he switches back.

## Decisions

- **The demo is a link, not a mode inside the hosted app.** The demo build is separate on purpose: the hosted bundle has no demo code, and the public demo makes no outside requests. The link reads `VITE_DEMO_URL`, which defaults to `https://demo-tasks.omark.app`. The demo itself needs nothing remembered.
- **When the choice is saved:** at the click, before the redirect, picker or reload, so start-up knows what was meant. A cancelled sign-in then shows the screen with that choice first ("Sign in to open your tasks in OneDrive"), which reads right for both a new and a returning person.
- **No saved choice** (every device today) opens what is there, the saved folder first and then the signed-in account, and saves that as the choice. No one already using the app sees the first-run screen.
- **A choice that can't be opened** (the remembered folder is gone, or the account is signed out or signed in with the other provider) shows the first-run screen with that choice first. Nothing is opened silently in its place.
- **Fake builds without a stubbed account** count as signed in with Microsoft, as today, so existing e2e specs boot as before.
- **The Storage card goes in through one optional prop on `@omark/settings`' `SettingsPage`** (`extraSections`, cards before the schema's, with nav entries). It is additive, and Omark Time can use it for its storage choice too.

## Acceptance criteria

- [ ] `decideStart` covers every combination: choice none, microsoft, google or folder × signed in with nothing, microsoft or google × a saved folder or none.
- [ ] The first-run screen shows the four choices this build and browser support, with the remembered one first; "Try the demo" links to `VITE_DEMO_URL` (default `https://demo-tasks.omark.app`).
- [ ] Picking OneDrive or Google Drive saves the choice and starts sign-in with that provider; picking a folder saves the choice and opens it; the choice survives a reload.
- [ ] A signed-in device with no saved choice opens its storage without the first-run screen, and saves the choice.
- [ ] Settings has a Storage card naming the current storage, with buttons for the others (folder only where supported); switching asks first when edits are not saved yet, then opens the other storage; switching back opens the first one's files again, edits included.
- [ ] Demo builds show neither screen nor card.
- [ ] `.env.example` lists `VITE_DEMO_URL`.
- [ ] The v1 spec (moved to `doc/tasks/spec.md` by the docs lane) describes the first-run screen and the Storage card. *Written after the docs lane's move merges.*

## Tests I'll write first

1. `apps/tasks/src/lib/storage-choice.test.ts`: `decideStart` table; `loadChoice` / `saveChoice` (unknown values and blocked storage read as none).
2. `apps/tasks/src/env.test.ts`: `demoUrl` (unset, blank, set).
3. `packages/settings` test for `extraSections` (rendered first, with a nav entry), if the package has component tests; otherwise covered by e2e.
4. `apps/tasks/e2e/first-run.spec.ts` (desktop and iphone): the screen and its choices; OneDrive starts sign-in with Microsoft; Google where offered; a remembered choice first; the demo link; folder (desktop): pick, reload, still the folder; Settings: switch from OneDrive to a folder and back, the OneDrive edit still there; a signed-in device skips the screen.
5. Existing e2e that name the old buttons ("Sign in with Microsoft", "Sign in with Google", the old line) change to the new labels. The PR lists them.

## Risks

- **A choice and a session that disagree**, such as a device signed in with Google whose choice says OneDrive: the screen shows OneDrive first, and nothing opens until the user picks. Covered by `decideStart` tests.
- **Old e2e texts:** several specs click "Sign in with Microsoft". They are updated in this PR, and it says so.
- **Unsynced edits left behind on a switch** stay in that storage's cache and sync when the user switches back. The confirm says so. A device that never switches back keeps them in IndexedDB; that is shown, not hidden.

## Out of scope

- Copying files between storages (a later issue, per the spec).
- The cutover checklist (spec 6.5.1, roadmap 3.6). It belongs in `doc/history/`, which the docs lane writes.
- Wiring `VITE_DEMO_URL` into CI (`.github/workflows/ci.yml` is not this lane's). The default is already the right address.

## Tasks

- [ ] **1. Choice.** `apps/tasks/src/lib/storage-choice.ts`: `StorageChoice`, `loadChoice`, `saveChoice`, `decideStart`. Tests first.
- [ ] **2. Start-up.** `boot.ts` uses `decideStart` for real and stubbed fake builds; the `signin` result becomes `choose` with `remembered`, `providers` and `folders`; `ready` gains `switchTo(choice)`. `env.ts`: `DEMO_URL`.
- [ ] **3. Screens.** `FirstRun.svelte` replaces `SignIn.svelte`; `StorageCard.svelte`; the `extraSections` prop on `SettingsPage`; `App.svelte` wiring and the unsaved-edits confirm.
- [ ] **4. e2e.** `first-run.spec.ts`; update the specs that name the old buttons.
- [ ] **5. Docs.** `.env.example`; the spec once the docs lane's move is merged; `packages/settings` README if it has one.
