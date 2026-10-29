# TaskApp backlog

Ideas deliberately left out of v1 ([the Tasks spec](tasks/spec.md)). Grouped by theme; not ordered by priority yet.

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

- **The one app's part-switching keys in Settings**: Alt+1–3 switch tabs (U.3), fixed; the one app spec (section 7) wants them in Tasks' keyboard settings. Moved out of U.5, 2026-10-29.
- **Reopen a completed task from search**: search shows completed tasks read-only; a Reopen action there would move the line back from `done.md` (like un-completing) for completions older than Undo reaches.
- **Reminders and notifications**.
- **More natural-language dates and repeats** in quick add, beyond the shortcut words of #19 (e.g. "next fri", "in 3 days", "every 2nd tue"). A word for This week or Next week was left out on purpose (`next` is too common in titles).
- **More priority levels, labels, projects, checkbox subtasks.** One Important flag (`⏫`) came with #19.
- **Todoist p1 as Important** in the import tool (`⏫`).
- **Other UI languages**, starting with Polish.
- **Export button** (zip of the files, or CSV), for users who don't open their cloud folder.
- **Todoist completion history import**, to seed stats (skipped in v1 because it's too big).
- **More stats**: 30-day view, streaks, charts.
- **Done list / un-complete from history**: v1 un-completes only via Undo; a view of `done.md` with "restore" would cover older completions.
- **Keep unsynced edits across a sign-in redirect in private browsing** (stash in `sessionStorage`): v1 only warns before they are lost.
- **Keep the phone add-sheet draft across an app kill**: v1 keeps it only while the app is open.
- **Several windows or tabs on one origin** (e.g. the installed PWA plus a Brave tab) share the offline cache: coordinate them, with a single writer via `navigator.locks` or by merging in record. v1: online etags protect; offline, closing one window can drop its unsynced edits.
- **Odd heading order in `tasks.md`** (`# Tasks` before `# Always`, or `# Always` with no `# Tasks`): tolerate it. v1 hides some lines from the app (the text is kept).
- **Fragments typed into a title** (🔁 or 📅 text): escape or reject them so they don't become fields on re-read.
- **Security headers and CSP** (`public/_headers`): start Report-Only; `connect-src` would enforce the privacy rule.
- **First offline run orders `done.md` completions before remote history**: cosmetic.
- **Contrast on selected rows**: `--muted` (4.27:1) and `--danger` (4.41:1) on `--sel` are under 4.5:1 app-wide (e.g. an overdue date on a selected row). Found during #44; the habit colours were fixed there.

## AI

- **In-app "ask Claude about this task"** (like the inspiration's ⌘K): needs API keys and has a per-use cost.
- **CLI or MCP server** for Claude Code and other agents, instead of editing the files directly.

## Testing

- **Nightly real-OneDrive smoke in CI**: v1 runs it by hand; nightly needs a long-lived refresh token stored as a GitHub secret for the smoke, which uses the owner's own account and the `TaskApp-e2e` folder in the app folder.
- **tester.army e2e** agent-driven smoke tests once it reaches 1.0. Today it is pre-1.0, has no real mobile Safari or PWA support, and its natural-language assertions call a model on every run.

## Factory

Left out of phase 1 of [the factory spec](history/TaskApp%20factory%20spec.md) (its section 13).

- **Branch protection** on `main` (PR and checks required), once the repo is on GitHub Pro or public.
- **claude-code-action** (`@claude` in issues and PRs, automatic PR review): it uses Actions minutes. Revisit if minutes allow.
- **"Issue opened" trigger** that starts work at once (an Action calling a routine's API trigger).
- **Multi-reviewer panel** per PR (security, UX, UI, code) and a separate approver agent.
- **Auto-merge** of small PRs.
- **Mutation testing**, and proving tests fail by reverting the fix in CI.
- **Native apps and multi-user**: need their own specs. iOS needs an Apple Developer account ($99 a year) and macOS runners (10× the Actions minutes); Android needs a Google Play account ($25 once).
