# TaskApp backlog

Ideas deliberately left out of v1 ([[TaskApp v1 spec]]). Grouped by theme; not ordered by priority yet.

## Going wider (public release)

- **Decide the model**: open source vs paid app, and choose a licence. Repo stays private until then.
- **App-folder default**: other users get `OneDrive/Apps/TaskApp/` (`Files.ReadWrite.AppFolder`) instead of full-drive access; "choose your own folder" becomes an opt-in.
- **Microsoft publisher verification** of the Entra app, so sign-in doesn't show an "unverified" warning.
- **Onboarding**: first-run flow to sign in, pick storage and create the files.
- **Privacy-friendly usage analytics** (opt-in), only if needed for a public product.
- **Multi-user or shared lists**, if ever wanted; the core is kept free of storage and UI for this.

## Storage

- **Dropbox** adapter.
- **Google Drive** adapter (mind the restricted-scope verification).
- **iCloud Drive**: needs a native iOS app (no web API).
- **Local folder** mode on desktop (File System Access API) for people who sync files their own way.
- **Per-device config overrides** on top of the shared `config.yaml`.

## Platforms

- Desktop wrapper (e.g. Tauri) for Windows, Mac, Linux and Omarchy, with a global hotkey for quick add.
- Native or wrapped mobile apps (e.g. Capacitor, or native) for iOS and Android, if the PWA falls short. Would also allow haptic feedback when a task is lifted for dragging (iPhone web apps can't vibrate).
- A phone-friendly Week board (e.g. bucket tabs). Cut from v1: the board is desktop-only.

## Features

- **Search** (browser Ctrl+F covers v1).
- **Reminders and notifications**.
- **Natural-language dates and repeats** in quick add (e.g. "tomorrow", "every 2nd tue").
- **Priorities, labels, projects, checkbox subtasks.**
- **Other UI languages**, starting with Polish.
- **Export button** (zip of the files, or CSV), for users who don't open their cloud folder.
- **Todoist completion history import**, to seed stats (skipped in v1 because it's too big).
- **More stats**: 30-day view, streaks, charts.
- **Done list / un-complete from history**: v1 un-completes only via Undo; a view of `done.md` with "restore" would cover older completions.
- **Keep unsynced edits across a sign-in redirect in private browsing** (stash in `sessionStorage`): v1 only warns before they are lost.
- **Keep the phone add-sheet draft across an app kill**: v1 keeps it only while the app is open.

## AI

- **In-app "ask Claude about this task"** (like the inspiration's ⌘K): needs API keys and has a per-use cost.
- **CLI or MCP server** for Claude Code and other agents, instead of editing the files directly.

## Testing

- **Nightly real-OneDrive smoke in CI**: v1 runs it by hand; nightly needs a long-lived refresh token stored as a GitHub secret for the smoke, which uses the owner's own account and the `ALAI/TaskApp-e2e` folder.
- **tester.army e2e** agent-driven smoke tests once it reaches 1.0. Today it is pre-1.0, has no real mobile Safari or PWA support, and its natural-language assertions call a model on every run.
