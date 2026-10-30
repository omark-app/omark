# TaskApp v1 spec

Status: agreed in grilling session 2026-10-16 and refined with a clickable UI prototype the same day.
Source: AL's first ideas note (since removed; its spirit is in [PHILOSOPHY.md](../../PHILOSOPHY.md)). Out-of-scope ideas: [the backlog](../TaskApp%20backlog.md).
UI reference: the throwaway prototype on branch `prototype/ui` (`prototype/taskapp-ui-prototype.html`), also published at https://claude.ai/artifact/UP8SDp2tQ4Ku76a1UKS2wz. Where it and this spec disagree, this spec wins.

## 1. Goal and audience

A super simple personal task app replacing the parts of Todoist actually used: dated buckets, a someday list, recurring tasks, and an always-visible **Important, not urgent** list (section 7). One page, opens in one click, fast to add and move tasks.

- **v1 is personal-first**: one user (me), no accounts, no backend I operate.
- **Ready to go wider later**: all task logic lives in a pure core package with no UI or storage dependencies, so other storage, platforms or a multi-user layer can be added without a rewrite.
- **No user data on my infrastructure**, ever. Tasks live in the user's own cloud storage.

## 2. Platform and hosting

- **PWA** (installable web app), one codebase.
  - Windows 11: installed from Brave, pinned to the taskbar.
  - iPhone: added to the home screen.
  - Linux, Mac and Android work as a PWA for free; native wrappers are backlog.
- **Hosting**: Cloudflare Pages, as part of the one app at `app.omark.app`. The host serves the app's static files and a small stateless sign-in helper (Pages Functions under `/api/auth`).
- **CI/CD**: GitHub Actions runs all tests; every push to `main` deploys to Cloudflare Pages.

## 3. Storage

### 3.1 Provider

- **OneDrive** via Microsoft Graph, called directly from the browser.
- Sign-in with a Microsoft account through the sign-in helper (a token broker on the same origin: auth code + PKCE as a confidential web app, the refresh token in an encrypted HttpOnly cookie, a 90-day rolling session). Graph is still called from the browser with a short-lived access token. Requires a one-time free Microsoft Entra app registration that accepts personal accounts. (It replaced MSAL.js, whose SPA refresh tokens last 24 hours and whose hidden-iframe renewal Safari and Brave block.)
- **Google Drive** (added with issue #61) is a second storage, through the same sign-in helper with the `drive.file` scope: the app sees only files it created, kept in one My Drive folder (`Omark Tasks`; `Omark Tasks Staging` on staging). Writes use the Drive v2 `If-Match` etag. Drive allows several files with one name, and the oldest is the one in use. When `tasks.md`, `done.md` or `config.yaml` starts meaning another file than the one this device last synced (two first runs at once, or an older folder restored from the trash), both files are merged and the result written to the file in use, so tasks saved only in the other copy stay; the other copy is left in Drive as it was (#67). A task deleted or completed in only one copy may come back once. A file trashed and made again by another device is not a second copy: it is taken as it is. See `doc/history/61-google-drive.md`.
- **A folder on this computer** (added with issue #86), in Chrome and Edge on a computer (the File System Access API; Safari, Firefox and phones don't offer it, and the first-run screen says where it works). **Use a folder on this computer** (on the first-run screen or in Settings) picks any folder, including one a sync client (OneDrive, Dropbox, iCloud, Google Drive for desktop) keeps in step. No sign-in. The folder's handle is kept in IndexedDB, so the next start opens it again; when the browser wants permission again, the app opens from its offline copy with `Allow access again to reach the folder Tasks …` and an **Allow access** button. The eTag is a SHA-256 of the file's text, so an outside edit (Obsidian, an agent, a sync client) is merged like a OneDrive conflict. A write checks the eTag, then replaces the file: an outside save landing in that instant is not caught. A write that fails after creating a file removes the empty file again, and a file found missing is merged from an empty base when it comes back, so a half-made file never removes tasks. A folder that has gone away (renamed, unplugged) reads as offline, and **Pick the folder again** (also offered when access is refused) carries the offline copy over to the folder picked. Sync conflict copies of any of the three files (`tasks (1).md`, `tasks 2.md`, `done-DESKTOP-4F2K.md`, `config.sync-conflict-….yaml`) are named in a note and never merged. The files are read as UTF-8; a file in another encoding is rewritten as UTF-8 on the first save. See `doc/history/86-local-folder.md`.
- **First-run choice** (added with issue #94). A device with nothing chosen yet shows the first-run screen: **Use my OneDrive**, **Use my Google Drive** (only where the sign-in helper has Google set up), **Use a folder on this computer** (only where the browser can pick one; elsewhere a small line says it works in Chrome or Edge on a computer), and a **Try the demo** link to the demo deployment (`VITE_DEMO_URL`, default `https://demo.omark.app/tasks`).
  - The choice is kept on the device (localStorage `omark:storage`) and opens on every start. A device that was already signed in, or had a folder picked, opens that and keeps it as its choice, with no first-run screen.
  - A choice that can't be opened (signed out, signed in with the other provider, the folder gone) shows the first-run screen with it first: "Sign in to open your tasks in OneDrive, or choose another place." Nothing else opens in its place.
  - A start that had to guess (the saved folder or the sign-in client too slow to answer) opens what it guessed but keeps no choice, so the next start looks again.
  - **Switching** is the Storage card in Settings (section 10). Each storage keeps its own offline copy, so switching copies and deletes nothing. Edits not yet saved wait on the device and are saved when the user switches back; the app asks first when there are some. A folder already picked is offered by name and opens without the picker; **Pick another folder** shows it.
  - Demo builds show neither the screen nor the card. See `doc/plans/94-first-run.md`.
- **Folder**: the app's own OneDrive folder (`Apps/Omark/tasks/`), through the `Files.ReadWrite.AppFolder` scope: the app sees nothing else in the drive.
- Storage sits behind an adapter interface so other providers can be added later.

### 3.2 Files

| File | Holds |
|---|---|
| `tasks.md` | All open tasks |
| `done.md` | One line per completion (the stats source), with the task's notes under it |
| `config.yaml` | User settings (section 10) |

### 3.3 `tasks.md` format

Obsidian Tasks–compatible markdown. Tasks are one flat list; buckets are computed by the app, never stored as headings.

```markdown
# Tasks
- [ ] Call the dentist about the crown 📅 2026-10-16
    - ask about zirconia
    - bring the old x-ray
- [ ] Water the plants 🔁 every week on Monday 📅 2026-10-19
- [ ] Send the invoice 📅 2026-10-19
- [ ] Learn Polish sign language
- [ ] One tab at a time ⏫
```

- `📅 YYYY-MM-DD` = due date. No date = Someday, or Important, not urgent when the task has `⏫` (section 7).
- `🔁 <rule>` = repeat rule (section 6).
- `⏫` = Important (added 2026-10-19, #19), Obsidian Tasks' high priority. It can sit anywhere in the line (every `⏫` counts as the one flag); the app writes it right after the title: `- [ ] Call the bank ⏫ 🔁 every day 📅 2026-10-20`. The other priority signs (`🔺 🔼 🔽 ⏬`) stay in the title as text.
- `🌱` = habit (added 2026-10-26, #44): a repeating task with a finish line, `🌱` or `🌱 30` (own goal, 1–999). The app writes it after `⏫` and before `🔁`: `- [ ] Meditate 10 min ⏫ 🌱 🔁 every day 📅 2026-10-27`. It needs a `🔁` rule other than `when done`; without one it stays in the title as text. See the [habits spec](habits-spec.md).
- Indented `- ` lines under a task are its notes.
- Line order within the file is the manual order (section 4.3).
- Anything above `# Tasks` is kept as it is. Files from before #38 have a `# Always` section above `# Tasks` (one `- text` line per reminder). On the next sync the app turns each such line into `- [ ] text ⏫` at the top of `# Tasks`, in the same order, and removes the section; other lines in it stay above `# Tasks`. New files start as just `# Tasks`.

### 3.4 `done.md` format

```markdown
- [x] Send the invoice ✅ 2026-10-16
- [x] Call the dentist about the crown ✅ 2026-10-16
    - ask about zirconia
    - bring the old x-ray
- [x] Water the plants 🔁 every week on Monday ✅ 2026-10-19
```

- A completed important task keeps its `⏫`: `- [x] Call the bank ⏫ ✅ 2026-10-20`. A repeating one stays important on its next date.
- A completed habit keeps its `🌱` (without the goal): `- [x] Meditate 10 min 🌱 🔁 every day ✅ 2026-10-26`. Two more habit lines are boundaries, not completions: `- [x] {title} 🌱 🏆 {date}` (formed) and `- [-] {title} 🌱 ❌ {date}` (dropped). They have no `✅`, so they are kept as they are and never counted in the stats. Habit progress is worked out from `done.md`, never stored (see the [habits spec](habits-spec.md)).
- Nothing is deleted on completion: completing a task moves its line from `tasks.md` to `done.md` with today's date, and its notes go along as indented lines under the done line, byte for byte as they were in `tasks.md`.
- Completing a recurring task appends its done line, with a copy of its notes, to `done.md` and moves the task in `tasks.md` (notes included) to its next date.
- A task whose line has `🔁` text the app can't read as a rule (say `🔁 every blue moon`) may be a recurring task misread, so completing it logs the done line and leaves the task in `tasks.md` as it was. The toast says the rule can't be read; fix the rule or delete the task.
- A `- [x]` line ticked outside the app (e.g. in Obsidian) moves to `done.md` on the next sync with its notes.
- Each `- [x] … ✅ date` line counts once in the stats; the indented note lines under it never count. Older one-line entries without notes stay valid, and lines the app doesn't recognise are kept as they are.
- A done line and its notes are one block when `done.md` is merged (section 3.5), so completions on two devices never mix up their notes.
- Un-completing (Undo) moves the task back to `tasks.md` with its notes and removes its block from `done.md`.

### 3.5 Saving, sync, offline and conflicts

- **Save** ~1 s after typing stops (configurable), plus on leaving a field and when the app is hidden or closed.
- **Footer status**: a faint `saved` · `syncing`, next to the build's version, e.g. `v143 · 22 Oct` (the UTC day it was built; so it is clear which build a device runs). The number is the CI run that made the build and goes up with every build; staging and production show the same number for the same build (Promote ships the build staging ran). The commit hash and build time are in its tooltip; a build made outside CI shows the hash (`dev` when unknown). Issue #36.
- **Sync banner** (added 2026-10-18), above the list on every layout, when the files are not in step with OneDrive: `Can't reach OneDrive since 11:02 — showing your last saved copy`, or `Sign in again to reach OneDrive …` with a Sign in button. A sync still running after 4 s gets a quieter one. "Since" is the last time every file was in sync on this device. When saves fail because the storage is full (#68), it reads `Your Google Drive is full — changes are kept on this device until there's room` (`Your OneDrive is full …`, `The disk with the folder Tasks is full …`); edits stay on the device, the app keeps retrying, and the banner goes once a save goes through.
- **Nothing waits for ever**: every network request, token request and cache read or write has a time limit, so the status always settles on `saved`, `offline` or `sign in needed`. If the sign-in library does not start within 15 s, the cached list opens anyway.
- **Re-read** all files whenever the app regains focus, so edits from another device, Obsidian or Claude Code show up.
- **Optimistic concurrency**: every write uses the file's eTag (`If-Match`). If the file changed since the last read, re-read and merge.
- **Offline**: the app keeps a cached copy and works fully offline; edits are queued and written on reconnect.
- **New builds** (added 2026-10-22, issue #32): the app asks `/version.json` which build is deployed when it opens, on every return (again after 2 s and 5 s if that fails), on focus, when it comes back online, and every 30 minutes while visible. A newer build loads at once on open or return: the edits are saved first (and again just before the reload) and `updating…` shows briefly while the page takes no input. If something is open, dragged or focused, or the add field holds a draft, and on a page in use, it waits until none of that is true and there has been no input for a minute; meanwhile the footer shows `New version · tap to update`, which loads it now (asking first if edits would be lost). Edits that can't be saved block the reload until later. Offline, or when the check fails, the saved build keeps running. At most two tries per new build and tab, so a half-done deploy can't cause a reload loop; without sessionStorage only the footer offers it.
- **Merge**: three-way, task by task (base = last synced version). If the same task changed on both sides, keep both versions as two tasks so nothing is lost; the user deletes one.

### 3.6 Export

The files are the export. They are plain text in the user's own OneDrive, readable by any editor or Obsidian. No export feature in v1.

## 4. Buckets

### 4.1 Definitions

Weeks run Monday–Sunday. All dates use the device's local time zone; days end at local midnight.

| Bucket | Contains | Default fold |
|---|---|---|
| **Today** | Due today or earlier (overdue tasks are part of Today since #26) | Open |
| **Tomorrow** | Due tomorrow (#26) | Open |
| **This week** | Due the day after tomorrow to this Sunday; empty on Saturday and Sunday | Open |
| **Next week** | Due next Monday to next Sunday (on a Sunday, Monday is in Tomorrow) | Open |
| **Later** | Due after next Sunday | Folded |
| **Someday** | No date, not important | Folded |

- Every bucket header shows a count, including when folded.
- An empty bucket shows its header only (count 0), folded.
- Fold state resets to the default every time the app opens. Folding or unfolding a bucket by hand wins over the default (also over the empty-bucket rule) until then.
- Tasks move between buckets by themselves as days pass.
- Important tasks with no date are not in Someday: they are in **Important, not urgent** (section 7), which is not a bucket and never folds.

### 4.2 Setting a date ("moving to a bucket")

Moving a task means setting its date:

- **Today** → today.
- **Tomorrow** → tomorrow.
- **This week** → this Sunday. On a Saturday this is tomorrow and on a Sunday today, so the task lands in Tomorrow or Today, and the This week chip is not offered.
- **Next week** → next Sunday.
- **Pick a date** → any specific date, including today.
- **Someday** → removes the date. A task in Important, not urgent also loses `⏫`, so it lands in Someday; any other important task keeps `⏫` and so lands in Important, not urgent (#38).

"This week" and "next week" are only date shortcuts. There is no separate flag; the task simply shows as due `Sun`.

### 4.3 Ordering

- Within a bucket: important tasks first (#19), then earliest date, then the line order in `tasks.md`.
- So in Today: important tasks first, then overdue tasks (oldest first), then today's. Overdue dates show in red (5.1).

### 4.4 Dragging (desktop mouse drag, phone long-press drag)

- **Drop between tasks in the same bucket** → reorder (changes line order in `tasks.md`). Order only applies among tasks with the same importance and date, since those sort first; dropping among other dates or the other kind keeps the task's date and flag and says so.
- **Drop on another bucket** (its header or anywhere in it, including folded headers) → set the date as in 4.2: Today, Tomorrow, This week (this Sunday), Next week (next Sunday), Someday (no date). Dropping between two tasks there also places it at that position.
- Overdue tasks are in Today, so dropping one between Today's tasks reorders it and keeps its date (and says so).
- **Drop on Important, not urgent** → removes the date and sets `⏫`; dropping between two of its tasks places it there. Dropping between its own tasks reorders them (#38).
- **Drop on Later** → opens the date picker, pre-filled with the day after next Sunday, because Later has no single date.
- The bucket under the pointer is highlighted; a line shows the insert position.

## 5. Tasks

- A task is a **title plus optional notes** (indented lines).
- A task can be flagged **Important** (#19): one level only.
- Out of v1: more priority levels, labels, projects, checkbox subtasks, assignees, reminders and notifications.

### 5.1 Task row (one line, vertical space is precious)

- An important task has an amber circle and an amber title, in light and dark.
- Left: a round complete button. Middle: the title, followed by a faint `≡` when the task has notes. Notes are **not** shown in the list; they appear in the task detail (section 11) or the phone's edit sheet. A web link in the title (`https://…`, `www.…`, or Markdown `[label](https://…)`, shown by its label) is clickable: it opens in a new browser tab, or in the default browser from the installed app, without selecting the task.
- Right: one **meta label**, clickable to open the date picker:
  - a short date: `Thu` in Tomorrow, This week and Next week, `12 Nov` in Later; overdue tasks show their date in red (`Wed`, or `3 Oct` if more than a week ago);
  - a habit shows its progress instead (`12/66`, in violet) and no `↻`, and is never shown as overdue (see the [habits spec](habits-spec.md));
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

Completing a recurring task moves it to its next date. An overdue recurring task stays in Today, with its date in red, until done; it never skips ahead silently.

- **Next date** = the first date of the pattern that is **after today**, stepping from the current due date. So an "every day" task that is 3 days overdue moves to tomorrow, not to two days ago. "Every Mon, Thu" completed on an overdue Monday on Wednesday moves to Thursday.
- **N days after completion** = today + N.
- **Setting a repeat on a task** keeps its date if the date fits the pattern; otherwise (or if it has no date) the date moves to the first fitting date on or after it (or today).

## 7. Important, not urgent

Replaced the ALWAYS lines on 2026-10-23 (#38).

**Why.** The group comes from D. Eisenhower's four-box matrix (urgent / not urgent × important / not important). Important but not urgent tasks are the ones that get put off forever, because nothing forces them, yet over time they matter most. So they stay in sight on the main page, not buried in Someday. They don't have to be things to finish: they can also be reminders of what to do, how to behave, what to notice. Seen every day, the group is a habit-building machine as much as a to-do list.

- Holds every open task with `⏫` and no `📅`. Nothing else marks it in the file.
- Shown where ALWAYS was (section 11): the right pane of the task list, the left rail of the week board (in place of the detail while no task is open), below the buckets on the phone. Header with its name and count; never folds; an empty group says so.
- Its tasks are ordinary tasks: amber, completable (logged in `done.md` and counted in stats), editable, with the same keys, swipes and move sheet.
- Order: line order in `tasks.md`, so new ones come last. Drag a task within the group to reorder it (desktop mouse drag, phone long press).
- Getting in: flag an undated task important (`i`, the toggle, `imp`), add one with `imp` and Someday, or drop any task on the group. Getting out: give it a date (it stays important, now urgent too), unflag it, or move it to Someday (which unflags it).

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

- An always-visible input at the top. `/` or `n` focuses it; Enter adds the task to Today (configurable), or to the date of a shortcut word typed in it (9.4), and keeps the input focused for the next one.
- Click a task, or `j` / `k` / ↑ / ↓, to select it. Selecting shows its detail (section 11).
- With a task selected:

| Key | Action |
|---|---|
| `t` | Today |
| `m` | Tomorrow |
| `w` | This week (on a Saturday: Tomorrow; on a Sunday: Today) |
| `e` | Next week |
| `d` | Pick a date |
| `s` | Someday |
| `r` | Set repeat |
| `i` | Important on or off |
| `h` | Habit on or off (a habit needs a repeat rule; at the limit of habits in progress it says so) |
| `x` | Complete |
| Enter (or double-click) | Edit: jumps into the detail's title. Enter saves, Shift+Enter starts a new note line, Ctrl+Enter saves from the notes, Esc leaves the field (and saves) |
| Delete / Backspace | Delete (with undo) |
| Esc | Close the detail (deselect) |

- Global: `z` or Ctrl+Z undo; `v` switch view (section 11); `f` or Ctrl+K search (9.3); `,` settings (section 10).
- Clicking a task's date label opens the date picker; the picker has Today, Tomorrow, This week, Next week, Someday and a calendar field.
- Mouse drag between and within buckets (section 4.4).
- Every change shows a short toast with **Undo** (e.g. "Moved to Next week · Sun", "Done · next Mon 19 Oct").
- A strip of keyboard hints along the bottom.
- All shortcuts are configurable.

### 9.2 iPhone (touch)

- A large + button at the bottom opens an add sheet: text field (with shortcut words, 9.4), date chips (Today selected by default, also Tomorrow, This week, Next week, Someday, plus the day of a typed weekday word), an Important toggle and a Habit toggle. A chip or the toggle tapped after typing wins over the typed word.
- **Tap** a task → edit sheet: title, notes box, the links found in them (each opens in the browser), due date and repeat summary, the move options below, Delete, Save.
- **Swipe right** → complete.
- **Swipe left** → move sheet: Today, Tomorrow, This week, Next week, Pick a date…, Someday, Repeat…, Mark important (or Not important), Make it a habit (or Not a habit), Delete.
- Tapping a task's date label opens the date picker directly.
- A 🔍 button at the top of the list, beside the save status, opens search full-screen (9.3).
- **Long-press (~0.4 s, finger still) then drag** → move between and within buckets (section 4.4). The row lifts as a floating copy that follows the finger; the page auto-scrolls near the top and bottom edges; page scrolling is blocked only while dragging. No haptic feedback (not available to iPhone web apps). The iOS long-press text callout is disabled on task rows.
- Swipe, tap, scroll and long-press are told apart by movement: moving before the hold time is a swipe or scroll; holding still is a drag.
- Sheets slide up from the bottom; on desktop the same content appears as a small centred dialog.

### 9.3 Search (added after v1, 2026-10-18)

For finding an old task by any word in it, then opening it to read.

- **Opening**: `f` or Ctrl+K (desktop, both views; not while typing in a field or with a sheet open) opens a search panel over the page, command-palette style. On the phone the 🔍 button opens the same search full-screen. Esc, ✕ or a click outside closes it and puts focus back where it was. `f` is configurable (`search`); Ctrl+K is fixed.
- **Matching**: one free-text box; results update as you type. Every word must appear, in any order and as part of a word, in the title or a note. Case and diacritics are ignored (`zwloknienia` finds `zwłóknienia` and the other way round; `ł` counts as `l`).
- **Results**: the title with the matched words highlighted, the task's date label as in the list (the bucket name, `Today` or `Someday`, where the row shows none; red when overdue, never for a habit; `↻` when repeating), and the best matching note line when a word matched outside the title. Order: every word in the title first, then words split between title and notes, then note-only matches; within each, earliest date first, undated last. ↑/↓ move through the results, Enter opens one; click or tap works too.
- **Completed tasks**: only open tasks are searched at first. A last row, "Also search N completed", adds the matches from `done.md` (kept until search closes): struck through, with their ✅ date, newest first within the same order. At most 100 are shown; another word narrows them. Done entries' notes are matched too. A habit's formed (`🏆`) and dropped (`❌`) lines are not completions and are never results.
- **Opening a result**: an open task opens in the detail (desktop: the side pane or the board's rail) or the edit sheet (phone). Closing it (Esc, `esc`, Save, ✕) comes back to search with the query and results kept; selecting another task leaves search. A completed task opens a read-only sheet: title, notes (their links clickable), completion date and repeat rule. It can't be reopened from there (backlog).
- Out of scope: filters, saved searches, search syntax.

### 9.4 Shortcut words (added 2026-10-19, #19)

Typed anywhere in a task's title: when adding (the phone's add sheet, the desktop add input) or editing (the phone's edit sheet, the desktop detail). Each counts as its 3-letter form or the full word, in any case: `tod` / `today`, `tom` / `tomorrow`, `mon` … `sun` / `monday` … `sunday`, `som` / `someday`, `imp` / `important`, `hab` / `habit`. Other forms (`tomo`, `some`) and longer words (`tomato`) stay text.

- A matched word turns bold on a tint as it is typed (blue for dates, amber for `imp`, violet for `hab`), and the date chip or the Important or Habit toggle follows it. `hab` with no `🔁` typed adds `🔁 every day` and goes to Today.
- A weekday word is the next such day after today (on a Monday, `mon` is next Monday).
- Bold words leave the title. With two date words the last one wins; a typed `📅 date` wins over both. Words inside a typed `🔁` rule are never shortcut words.
- Backspace right after a bold word deletes nothing: it turns the word back into plain text. A space doesn't bring it back; changing the word (deleting a letter and typing it again) does.
- When editing, only words typed during the edit count: they move, flag or make a habit of the task when it saves (Save, Enter, leaving the field, or the save delay on desktop) and then leave the title. Words the title already had stay plain text, so opening "Call Tom" never moves it.

## 10. Config

- `config.yaml` beside `tasks.md`, so it syncs to every device. Editable by hand, by Obsidian, or by Claude Code; no rebuild needed.
- Built-in defaults; the file only needs overrides. On first run the app writes a fully commented copy.
- After that the app writes `config.yaml` only from the Settings page (below). Nothing else changes it.
- Reloaded whenever the app regains focus. A change made on another device meanwhile is merged key by key; if the same key changed on both sides, this device's change wins and the page says so. If the other device's file has a mistake, it is kept as it is, and the page says this device's change was not applied.
- If the file is invalid, show a small banner naming the problem line and fall back to defaults. Never crash.
- One config for all devices.
- Note: Obsidian hides `.yaml` files unless "Detect all file extensions" is on.

**Settings page**: the gear in the footer or the `settings` shortcut (default `,`, yielding like `tomorrow`) opens `#settings`: a form with every setting, in General, Buckets, Habits and Keyboard. On the phone it is a full-screen page with a back link.

- **Storage** comes first (not in demo builds): "Your tasks are in OneDrive." and a button for each other storage this build and browser offer (section 3.1, "First-run choice"). It stays in reach while the file is edited as text.

- Each control applies at once and saves with the usual delay. No Save button.
- It writes only the keys that differ from the defaults. Setting a value back to its default removes the key. Comments, order and other keys stay as they are.
- Input is checked with the same rules as the reader. A key another command already shows is refused, naming that command.
- **Edit as text** opens the file in a plain editor; **Reset to defaults** writes the commented default file (asks first).
- A file that does not read opens the page on the text editor at the problem line. The config banner has an "Open Settings" link.
- The page is the shared `@omark/settings` component, drawn from a schema (`packages/settings/README.md`).

Settings in v1:

| Setting | Default |
|---|---|
| Keyboard shortcuts | As in sections 9.1 and 9.3 |
| Default view on desktop | Task list |
| First day of week | Monday |
| Buckets folded on open | Later, Someday |
| Theme | System (light/dark) |
| Date label style | `Thu` / `12 Nov` |
| Bucket for new tasks | Today |
| Save delay after typing | 1 s |
| Habits (#44) | `habits` block: at most 3 in progress, goal 66, 1 miss in a row, 10% misses per attempt; shortcut `h` (see the [habits spec](habits-spec.md), section 11) |

The `habits` keys are `maxInProgress` (0–99, 0 = no limit), `goal` (1–999), `missesInARow` (0–99) and `missesPerAttempt` (a number, or a percentage of the goal such as `10%`); `shortcuts.habit` is a key. The ranges are in the [habits spec](habits-spec.md), section 11.

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
- **Left pane "tasks"**: the add input, then the buckets stacked (section 4: Today, Tomorrow, This week, Next week, Later, Someday), one-line rows (5.1).
- **Right pane**: when a task is selected, its **detail** on top and **Important, not urgent** (section 7) right below it; with nothing selected, just the group. Habits in progress get their own **Habits** group above Important, not urgent (and a habit block in the detail); a History dialog lists formed and dropped habits (see the [habits spec](habits-spec.md)). The completion **stats** (section 8) sit at the bottom of the right pane.
- **Task detail**: bucket name, editable title (wraps onto more lines when long), editable notes (one per line), the links found in the title and notes (each opens in a new tab), Due (button opening the date picker, red when overdue; a habit is never overdue, its old date reads as today) with quick chips Today / Tomorrow / This week / Next week / Someday, Repeat (button opening the repeat picker), an Important toggle (Flag), Complete and Delete buttons, and an `esc` close button. A habit also gets a habit block under the notes: its progress, Goal (its own or the default), Not a habit and Drop habit.
- Below the sheet: the keyboard-hint strip and the save status.

**Week board** (desktop only):
- Left rail: app name and today's date, the stats, then the Habits group (when there are habits) above Important, not urgent, or the selected task's detail in their place (both would make the rail taller than the window); then the hint strip and save status. `j`/`k` stay on the board.
- Main area: the add input, then the buckets in four columns. The buckets keep their order (Today, Tomorrow, This week, Next week, Later, Someday) and are cut into four groups of one or more, stacked within a column. The cuts are chosen so the tallest column is as short as possible, counting a folded or empty bucket as one row (its header) and an open one as one row plus one per task; among equally tall layouts the best balanced one wins (the next tallest column as short as possible, and so on), then the one closest to the default `Today | Tomorrow + This week | Next week | Later + Someday` (fewest buckets out of their default column). Example: Today 3 tasks, Tomorrow 7, This week 2, Next week 3, Later and Someday folded gives `Today | Tomorrow | This week | Next week + Later + Someday` (8 rows tall, against 11 for the default).
- The layout is worked out when the board is shown (the app opens or reloads, or the view switches to the board) and then kept while you work: completing, adding, moving, dragging or folding never moves a bucket to another column. Starting from the offline cache, it is worked out once more if the first sync brings changes. A bucket that empties meanwhile keeps its place as an empty header.
- Today, Tomorrow, This week and Next week start open on the board whatever `foldedOnOpen` says (an empty one still starts folded); Later and Someday fold on open as usual. Every bucket header folds and unfolds on click.
- Columns wrap to two per row on narrower desktop windows (the same four groups in a 2×2 grid) (packing added after v1, 2026-10-18).

**Phone (Task list)**: a compact stats line at the top, a sideways row of habit cards (when there are habits), the buckets, Important, not urgent at the bottom, a + button at the bottom right. No detail pane; tap opens the edit sheet (9.2).

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
| `packages/tasks-core` | Pure TS with no UI or IO: parse/serialize `tasks.md`, `done.md` and `config.yaml`; bucket logic; recurrence; stats; search matching and ranking; three-way merge; config defaults and validation |
| `packages/storage` | Storage adapter interface, OneDrive (Graph), Google Drive (`drive.file`) and local-folder (File System Access API) implementations, sign-in client, in-memory fake for tests, offline cache and write queue |
| `packages/signin` | The sign-in helper behind `/api/auth/*` (served by `functions/` at the repo root as Cloudflare Pages Functions) |
| `apps/tasks` | Svelte 5 + Vite PWA: UI, keyboard and touch handling, service worker. Icons: `brand/README.md` |
| `tools/todoist-import` | One-time import script |

`core` is what gets reused by future platforms.

## 15. Testing

TDD throughout: tests are written first.

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | All of `packages/tasks-core`; the bulk of the tests |
| Integration | Vitest | Core + storage against the in-memory fake OneDrive: external changes, eTag conflicts, offline queue, merge |
| End-to-end | Playwright | The real app in desktop Chromium and iPhone emulation (WebKit, touch, viewport), against the fake OneDrive. Runs on every commit. Long-press drag is poorly supported by Playwright's touch emulation, so the drop rules (4.4) are covered by unit tests and e2e keeps one drag smoke test |
| Real-OneDrive smoke | Playwright | A few checks against a dedicated test OneDrive account; nightly or by hand, never blocking CI |

## 16. Implementation risks to check early

- Sign-in and token refresh inside an iOS home-screen PWA (standalone mode and redirect flow).
- Graph file download/upload from the browser (CORS, eTag behaviour on simple uploads).
- Service worker caching and update flow on iOS.
- Line-level three-way merge on hand-edited markdown (Obsidian or Claude Code may reformat lines).
- Long-press drag on a real iPhone: telling hold, swipe and scroll apart, and blocking scroll only while dragging. The prototype's approach (touch events, a non-passive `touchmove` that cancels scrolling once a row is lifted) is the starting point; a touch-capable drag library (e.g. SortableJS or svelte-dnd-action) is an option.
