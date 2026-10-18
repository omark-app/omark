# TaskApp v1 spec

Status: agreed in grilling session 2026-10-16 and refined with a clickable UI prototype the same day.
Source: [[TaskApp ideation]]. Out-of-scope ideas: [[TaskApp backlog]].
UI reference: the throwaway prototype on branch `prototype/ui` (`prototype/taskapp-ui-prototype.html`), also published at https://claude.ai/artifact/UP8SDp2tQ4Ku76a1UKS2wz. Where it and this spec disagree, this spec wins.

## 1. Goal and audience

A super simple personal task app replacing the parts of Todoist actually used: dated buckets, a someday list, recurring tasks, and a few always-visible reminder lines. One page, opens in one click, fast to add and move tasks.

- **v1 is personal-first**: one user (me), no accounts, no backend I operate.
- **Ready to go wider later**: all task logic lives in a pure core package with no UI or storage dependencies, so other storage, platforms or a multi-user layer can be added without a rewrite.
- **No user data on my infrastructure**, ever. Tasks live in the user's own cloud storage.

## 2. Platform and hosting

- **PWA** (installable web app), one codebase.
  - Windows 11: installed from Brave, pinned to the taskbar.
  - iPhone: added to the home screen.
  - Linux, Mac and Android work as a PWA for free; native wrappers are backlog.
- **Hosting**: Cloudflare Pages at `tasks.alipka.com` (domain already on Cloudflare). The host serves only the app's static files.
- **CI/CD**: GitHub Actions runs all tests; every push to `main` deploys to Cloudflare Pages.

## 3. Storage

### 3.1 Provider

- **OneDrive** via Microsoft Graph, called directly from the browser.
- Sign-in with a Microsoft account using MSAL (SPA, auth code + PKCE). Requires a one-time free Microsoft Entra app registration that accepts personal accounts.
- **Folder**: `OneDrive/ALAI/TaskApp/` (inside the existing Obsidian vault), chosen by the user. This needs the `Files.ReadWrite` scope.
  - For a later public release the default becomes the app's own folder (`Files.ReadWrite.AppFolder`) — see backlog.
- Storage sits behind an adapter interface so other providers can be added later.

### 3.2 Files

| File | Holds |
|---|---|
| `tasks.md` | ALWAYS lines and all open tasks |
| `done.md` | One line per completion (the stats source) |
| `config.yaml` | User settings (section 10) |

### 3.3 `tasks.md` format

Obsidian Tasks–compatible markdown. Tasks are one flat list; buckets are computed by the app, never stored as headings.

```markdown
# Always
- Walk before the first coffee
- One tab at a time

# Tasks
- [ ] Call the dentist about the crown 📅 2026-10-16
    - ask about zirconia
    - bring the old x-ray
- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-19
- [ ] Send the invoice 📅 2026-10-19
- [ ] Learn Polish sign language
```

- `📅 YYYY-MM-DD` = due date. No date = Someday.
- `🔁 <rule>` = repeat rule (section 6).
- Indented `- ` lines under a task are its notes.
- Line order within the file is the manual order (section 4.3).

### 3.4 `done.md` format

```markdown
- [x] Send the invoice ✅ 2026-10-16
- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-19
```

- Completing a task moves its line from `tasks.md` to `done.md` with today's date.
- Completing a recurring task appends one line to `done.md` and moves the task in `tasks.md` to its next date.
- Un-completing moves the line back to `tasks.md` and removes it from `done.md`.

### 3.5 Saving, sync, offline and conflicts

- **Save** ~1 s after typing stops (configurable), plus on leaving a field and when the app is hidden or closed.
- **Footer status**: a faint `saved` · `syncing`, next to the build's short commit hash (so it is clear which build a device runs).
- **Sync banner** (added 2026-10-18), above the list on every layout, when the files are not in step with OneDrive: `Can't reach OneDrive since 11:02 — showing your last saved copy`, or `Sign in again to reach OneDrive …` with a Sign in button. A sync still running after 4 s gets a quieter one. "Since" is the last time every file was in sync on this device.
- **Nothing waits for ever**: every network request, token request and cache read or write has a time limit, so the status always settles on `saved`, `offline` or `sign in needed`. If the sign-in library does not start within 15 s, the cached list opens anyway.
- **Re-read** all files whenever the app regains focus, so edits from another device, Obsidian or Claude Code show up.
- **Optimistic concurrency**: every write uses the file's eTag (`If-Match`). If the file changed since the last read, re-read and merge.
- **Offline**: the app keeps a cached copy and works fully offline; edits are queued and written on reconnect.
- **Merge**: three-way, task by task (base = last synced version). If the same task changed on both sides, keep both versions as two tasks so nothing is lost; the user deletes one.

### 3.6 Export

The files are the export. They are plain text in the user's own OneDrive, readable by any editor or Obsidian. No export feature in v1.

## 4. Buckets

### 4.1 Definitions

Weeks run Monday–Sunday. All dates use the device's local time zone; days end at local midnight.

| Bucket | Contains | Default fold |
|---|---|---|
| **Today** | Due today or earlier (overdue folds in) | Open |
| **This week** | Due tomorrow to this Sunday | Open |
| **Next week** | Due next Monday to next Sunday | Open |
| **Later** | Due after next Sunday | Folded |
| **Someday** | No date | Folded |

- Every bucket header shows a count, including when folded.
- Fold state resets to the default every time the app opens.
- Tasks move between buckets by themselves as days pass.

### 4.2 Setting a date ("moving to a bucket")

Moving a task means setting its date:

- **Today** → today.
- **This week** → this Sunday. On a Sunday this is today, so the task lands in Today.
- **Next week** → next Sunday.
- **Pick a date** → any specific date, including today.
- **Someday** → removes the date.

"This week" and "next week" are only date shortcuts. There is no separate flag; the task simply shows as due `Sun`.

### 4.3 Ordering

- Within a bucket: earliest date first, then the line order in `tasks.md`.
- Overdue tasks sit at the top of Today.

### 4.4 Dragging (desktop mouse drag, phone long-press drag)

- **Drop between tasks in the same bucket** → reorder (changes line order in `tasks.md`). Order only applies among tasks with the same date, since date sorts first; dropping among other dates keeps the date and says so.
- **Drop on another bucket** (its header or anywhere in it, including folded headers) → set the date as in 4.2: Today, This week (this Sunday), Next week (next Sunday), Someday (no date). Dropping between two tasks there also places it at that position.
- **Drop on Later** → opens the date picker, pre-filled with the day after next Sunday, because Later has no single date.
- The bucket under the pointer is highlighted; a line shows the insert position.

## 5. Tasks

- A task is a **title plus optional notes** (indented lines).
- Out of v1: priorities, labels, projects, checkbox subtasks, assignees, reminders and notifications.

### 5.1 Task row (one line, vertical space is precious)

- Left: a round complete button. Middle: the title, followed by a faint `≡` when the task has notes. Notes are **not** shown in the list; they appear in the task detail (section 11) or the phone's edit sheet.
- Right: one **meta label**, clickable to open the date picker:
  - a short date: `Thu` in This week and Next week, `12 Nov` in Later; overdue tasks in Today show their date in red (`Wed`, or `3 Oct` if more than a week ago);
  - a repeating task shows `↻` in the same place, before its date (`↻ Thu`, or just `↻` when due today); the full rule is in the tooltip and the detail;
  - no label for non-repeating tasks due today or in Someday; on hover the empty spot shows a faint `today` / `no date` so it can still be clicked (desktop only).

## 6. Recurring tasks

Chosen from a small picker; there is no natural-language parsing.

- daily
- weekdays
- weekly on chosen days
- monthly on day N
- yearly
- every N days or weeks
- every N weeks on chosen days, every N months, every N months on day N (added after v1, 2026-10-17)
- N days after completion (Todoist `every!`)

Completing a recurring task moves it to its next date. An overdue recurring task stays in Today until done; it never skips ahead silently.

- **Next date** = the first date of the pattern that is **after today**, stepping from the current due date. So an "every day" task that is 3 days overdue moves to tomorrow, not to two days ago. "Every Mon, Thu" completed on an overdue Monday on Wednesday moves to Thursday.
- **N days after completion** = today + N.
- **Setting a repeat on a task** keeps its date if the date fits the pattern; otherwise (or if it has no date) the date moves to the first fitting date on or after it (or today).

## 7. ALWAYS lines

- Plain text lines in the `# Always` section of `tasks.md`.
- Always visible on the same page as the tasks (where exactly depends on the view, section 11); editable inline; "+ Add a line" adds one, emptying a line removes it.
- Not completable, no dates, not counted, not in stats.
- No hard limit; the layout is designed for about 1–3 lines.

## 8. Stats

Shown compactly, e.g. `Today 4 (3.2) · 7d 23 (19 ↑) · All 412`.

| Stat | Value | In brackets |
|---|---|---|
| **Today** | Completions today | Daily average since the first completion, counting zero days, excluding today |
| **7d** | Completions in the last 7 *complete* days (excluding today) | The previous 7 days, plus ↑ more / ↓ fewer / → equal |
| **All** | All completions ever | — |

- Every completion of a recurring task counts.
- Un-completing removes it from the stats. Deleted tasks never count.
- **Cold start** (no imported history): counts start at 0. Today's average shows `–` until one full day exists; the 7d comparison and arrow show `–` until 14 full days exist.

## 9. Interaction

### 9.1 Desktop (keyboard-first)

- An always-visible input at the top. `/` or `n` focuses it; Enter adds the task to Today (configurable) and keeps the input focused for the next one.
- Click a task, or `j` / `k` / ↑ / ↓, to select it. Selecting shows its detail (section 11).
- With a task selected:

| Key | Action |
|---|---|
| `t` | Today |
| `w` | This week (on a Sunday: Today) |
| `e` | Next week |
| `d` | Pick a date |
| `s` | Someday |
| `r` | Set repeat |
| `x` | Complete |
| Enter (or double-click) | Edit: jumps into the detail's title. Enter saves, Shift+Enter starts a new note line, Ctrl+Enter saves from the notes, Esc leaves the field (and saves) |
| Delete / Backspace | Delete (with undo) |
| Esc | Close the detail (deselect) |

- Global: `z` or Ctrl+Z undo; `v` switch view (section 11).
- Clicking a task's date label opens the date picker; the picker has Today, Tomorrow, This week, Next week, Someday and a calendar field.
- Mouse drag between and within buckets (section 4.4).
- Every change shows a short toast with **Undo** (e.g. "Moved to Next week · Sun", "Done · next Mon 19 Oct").
- A strip of keyboard hints along the bottom.
- All shortcuts are configurable.

### 9.2 iPhone (touch)

- A large + button at the bottom opens an add sheet: text field plus bucket chips (Today selected by default, also This week, Next week, Someday).
- **Tap** a task → edit sheet: title, notes box, due date and repeat summary, the move options below, Delete, Save.
- **Swipe right** → complete.
- **Swipe left** → move sheet: Today, This week, Next week, Pick a date…, Someday, Repeat…, Delete.
- Tapping a task's date label opens the date picker directly.
- **Long-press (~0.4 s, finger still) then drag** → move between and within buckets (section 4.4). The row lifts as a floating copy that follows the finger; the page auto-scrolls near the top and bottom edges; page scrolling is blocked only while dragging. No haptic feedback (not available to iPhone web apps). The iOS long-press text callout is disabled on task rows.
- Swipe, tap, scroll and long-press are told apart by movement: moving before the hold time is a swipe or scroll; holding still is a drag.
- Sheets slide up from the bottom; on desktop the same content appears as a small centred dialog.

## 10. Config

- `config.yaml` beside `tasks.md`, so it syncs to every device. Editable by hand, by Obsidian, or by Claude Code; no rebuild needed.
- Built-in defaults; the file only needs overrides. On first run the app writes a fully commented copy.
- Reloaded whenever the app regains focus.
- If the file is invalid, show a small banner naming the problem line and fall back to defaults. Never crash.
- One config for all devices.
- Note: Obsidian hides `.yaml` files unless "Detect all file extensions" is on.

Settings in v1:

| Setting | Default |
|---|---|
| Keyboard shortcuts | As in section 9.1 |
| Default view on desktop | Task list |
| First day of week | Monday |
| Buckets folded on open | Later, Someday |
| Theme | System (light/dark) |
| Date label style | `Thu` / `12 Nov` |
| Bucket for new tasks | Today |
| Save delay after typing | 1 s |

Bucket rules themselves stay in code.

## 11. Design and views

### 11.1 Look

- Calm, framed panes in the spirit of the inspiration; light and quiet.
- Monospace (IBM Plex Mono) for everything the user wrote; a sans (Geist) for app chrome like labels and buttons. System fallbacks if the fonts fail to load.
- **Cool neutral palette** (cool off-white, white surfaces, graphite ink, one cobalt accent; red for overdue, green for completing), not warm beige; it must not look Claude-like.
- Light and dark mode follow the system (theme setting can force one).

### 11.2 Views

Two views on desktop, switched with `v` (default from config). **Phones (narrow screens, under ~720 px) always get the Task list**; the Week board is desktop-only.

**Task list** (default):
- One framed sheet with two panes.
- **Left pane "tasks"**: the add input, then the five buckets stacked (section 4), one-line rows (5.1).
- **Right pane**: when a task is selected, its **detail** on top and the **ALWAYS** lines right below it; with nothing selected, just ALWAYS. The completion **stats** (section 8) sit at the bottom of the right pane.
- **Task detail**: bucket name, editable title, editable notes (one per line), Due (button opening the date picker, red when overdue) with quick chips Today / This week / Next week / Someday, Repeat (button opening the repeat picker), Complete and Delete buttons, and an `esc` close button.
- Below the sheet: the keyboard-hint strip and the save status.

**Week board** (desktop only):
- Left rail: app name and today's date, the stats, then one box that shows ALWAYS, or the selected task's detail in its place; then the hint strip and save status.
- Main area: the add input, then four columns: Today | This week | Next week | Later + Someday stacked (Later and Someday folded on open as usual; the first three columns never fold). Columns wrap to two per row on narrower desktop windows.

**Phone (Task list)**: a compact stats line at the top, the buckets, ALWAYS at the bottom, a + button at the bottom right. No detail pane; tap opens the edit sheet (9.2).

## 12. Claude Code integration

- Claude Code edits the local OneDrive copies of `tasks.md`, `done.md` and `config.yaml` directly. No CLI, API or MCP server in v1.
- The repo ships a Claude Code skill describing the file formats and rules: how dates and repeats are written, that completing means moving a line to `done.md` with today's date, and how the next date of a repeating task is computed.
- The app picks up external changes on focus (section 3.5).

## 13. Todoist import

- A one-time script run on the PC (by Claude Code), not an app feature.
- Uses a Todoist API token supplied at run time and never stored.
- Imports **open tasks only**, with dates, repeat rules and descriptions (as notes). No completion history.
- Writes `tasks.md` and lists every repeat rule it could not convert, for manual review.

## 14. Architecture

TypeScript monorepo (pnpm workspaces):

| Package | Responsibility |
|---|---|
| `packages/core` | Pure TS with no UI or IO: parse/serialize `tasks.md`, `done.md` and `config.yaml`; bucket logic; recurrence; stats; three-way merge; config defaults and validation |
| `packages/storage` | Storage adapter interface, OneDrive (Graph + MSAL) implementation, in-memory fake for tests, offline cache and write queue |
| `apps/web` | Svelte 5 + Vite PWA: UI, keyboard and touch handling, service worker |
| `tools/todoist-import` | One-time import script |

`core` is what gets reused by future platforms.

## 15. Testing

TDD throughout: tests are written first.

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | All of `packages/core`; the bulk of the tests |
| Integration | Vitest | Core + storage against the in-memory fake OneDrive: external changes, eTag conflicts, offline queue, merge |
| End-to-end | Playwright | The real app in desktop Chromium and iPhone emulation (WebKit, touch, viewport), against the fake OneDrive. Runs on every commit. Long-press drag is poorly supported by Playwright's touch emulation, so the drop rules (4.4) are covered by unit tests and e2e keeps one drag smoke test |
| Real-OneDrive smoke | Playwright | A few checks against a dedicated test OneDrive account; nightly or by hand, never blocking CI |

## 16. Implementation risks to check early

- MSAL sign-in and token refresh inside an iOS home-screen PWA (standalone mode and redirect flow).
- Graph file download/upload from the browser (CORS, eTag behaviour on simple uploads).
- Service worker caching and update flow on iOS.
- Line-level three-way merge on hand-edited markdown (Obsidian or Claude Code may reformat lines).
- Long-press drag on a real iPhone: telling hold, swipe and scroll apart, and blocking scroll only while dragging. The prototype's approach (touch events, a non-passive `touchmove` that cancels scrolling once a row is lifted) is the starting point; a touch-capable drag library (e.g. SortableJS or svelte-dnd-action) is an option.
