# Omark Goals spec

Status: agreed in the Omark Goals brainstorm with AL, 2026-10-28; Omark Goals launches with Tasks and Time. The calls in section 15 are Claude's, for AL to check.
Depends on [the one app spec](../suite/one-app-spec.md): one Omark app and folder (section 3 here) and the demo world (section 12 here). Built by milestone G of the [roadmap](../plans/open-source-launch-roadmap.md).
Related: [Omark Tasks spec](../tasks/spec.md), [habits spec](../tasks/habits-spec.md), [Omark Time spec](../time/spec.md), [format](../format.md), [PHILOSOPHY.md](../../PHILOSOPHY.md).

Calls marked *(my call)* were made by Claude during the brainstorm, not by AL; section 15 lists them for checking.

## 1. Intent

Omark Tasks and Omark Time are operations: what you do and where your hours go. Omark Goals adds the strategy above them: where you want your life to go, the few checkpoints on the way, and what you have chosen not to pursue.

Doing things well isn't enough if they are the wrong things. Over 15 years AL used many tools to set direction: a vision board, an ideal end state, goals, affirmations, lessons learned, life quadrants. A few of them shaped real decisions (where to live, which goals and projects to take on). What none of them had was the connection down to daily life: vision → goals → projects, tasks and habits → hours. That connection is what Omark Goals is for.

Two things it should do:

- **Keep the direction written down**, as a board you can look at: life areas with a picture, the vision in your own words, and dated goals.
- **Show when an area goes quiet.** Drift used to be noticed late, from a measurement or from someone close. With the vision and goals in a plain file next to the tasks and hours, the app can show an area that nothing has touched for months, and an agent can point out drift in more detail.

Names: the suite's apps are **Omark Tasks**, **Omark Time** and **Omark Goals**; short forms **O.Tasks**, **O.Time**, **O.Goals**. Inside O.Goals, the board screen is called **Vision**.

## 2. Goals, non-goals, anti-goals

### 2.1 Goals

1. **A board** rendered from one Markdown file: life areas, each with an optional picture, the vision in your words, and its goals.
2. **Areas and goals you manage in the app**: create, edit and delete, on phone and desktop. The file stays editable in Obsidian and by agents.
3. **Configurable areas.** Any number, any names; the user decides.
4. **Goals as dated checkpoints**, usually 1–3 years out, worded as measurable outcomes ("Redpoint 8b by October 2027").
5. **Links down to the other apps**: a goal links to a project (its hours from O.Time, its tasks from O.Tasks); habits and tasks link to an area or a project by tag.
6. **"Needs update"** on an area with no linked activity for a set period (3 months by default), with no check-in for the user to do.
7. **A "Not now" list**: what you've chosen not to pursue.
8. **Agent-ready**: the format in `doc/format.md` and an `omark-goals` skill that can review drift across all three apps' files.

### 2.2 Non-goals for the first version

They go to [the backlog](../TaskApp%20backlog.md).

- A guided exercise for making the vision (it can come later as an agent skill).
- Affirmations, mantras, quotes, lessons learned, life-quadrant scoring and the other reflection tools from AL's notes.
- Targets the app computes ("at most 35 h a week", "outdoors 6 days a week") with on-track/off-track colours. The app shows facts; judging drift against the goal's words is the agent's job. *(my call)*
- A rule that each area must have a goal no more than 3 years out (AL's idea, kept for later).
- A different stale period per area.
- Showing goals inside O.Tasks or O.Time.
- Reminders or notifications.

### 2.3 Anti-goals

The first version counts as a failure if:

- **It becomes a system to maintain**: forced check-ins, journaling prompts, scores to fill in, or a nagging tone. "Needs update" is a quiet label, not an alarm.
- **Users' files or data reach an Omark server.**
- **It changes another app's files** beyond adding a row to `projects.csv` (section 7.3).
- **Development or tests touch AL's real files.**

## 3. Decisions taken

| Topic | Decision |
|---|---|
| Name | **Omark Goals** (O.Goals). "Omark Vision" was considered and dropped; the board screen is called Vision. Repo folder `apps/goals`, logic in `packages/goals-core`. |
| Where it runs | A part of the one Omark app at `app.omark.app` ([one app spec](../suite/one-app-spec.md)), turned on in Settings or at first run. |
| Storage | **One provider and one folder for all of Omark** (agreed 2026-10-28). The user picks OneDrive, Google Drive or a local folder once, and every Omark app uses it. Different apps can't be stored in different places. This is a separate design that O.Goals depends on: O.Goals has to read O.Tasks' and O.Time's files. |
| The file | One file, `goals.md`, in Goals' part of the Omark folder. Pictures sit beside it in `images/`. |
| Layout | The board with each area's goals inside its card (option A from the brainstorm mockup). |
| Areas | `##` headings in `goals.md`, configurable by the user. The app starts empty. |
| Goals | Checkbox lines under an area, with a target date. |
| Projects | **One list for the suite**: `projects.csv`, in its existing format, becomes a shared file at the top of the Omark folder (moved by the one-folder design). Goals link to a project by its code; projects don't link to goals. |
| Links | A project code or an area tag on a goal, task or habit line, as a `#tag`. |
| Needs update | Derived from activity. No check-in action. Default period 3 months, set in config. |
| Agents | The format and an `omark-goals` skill. No MCP server. |
| Demo | Part of one demo world shared by all three apps. |

## 4. How it works

1. The user opens O.Goals, already signed in to the Omark folder (one-folder design).
2. The app reads `goals.md`, `projects.csv`, O.Tasks' `tasks.md` and `done.md`, and O.Time's `events-*.csv`. Any of the other apps' files may be missing: O.Goals works with whatever is there.
3. It draws the board: the vision line, each area's card with its goals and their status, and the "Not now" list.
4. For each area it works out the date of the last linked activity (section 6) and marks the area **needs update** when that date is older than the period.
5. Edits in the app (the vision line, an area and its place in the order, a goal, a tick, a Not-now line, a picture) are written back to `goals.md` and `images/`, with the storage package's usual conditional writes and offline cache.

## 5. The file: `goals.md`

```markdown
# Vision

I feel happy, fulfilled and peaceful.

## Place #place

![Place](images/place.jpg)

Sun, sea and quality rock within an hour. I move outdoors every day.

- [ ] Live within an hour of quality rock 📅 2028-06-30 ➕ 2026-10-28

## Climbing #climbing

![Climbing](images/climbing.jpg)

Trips across the world to climb in interesting places.

- [ ] Redpoint 8b 📅 2027-10-31 ➕ 2026-10-28
- [ ] Two climbing trips abroad #CLIMB 📅 2027-12-31 ➕ 2026-10-28
- [x] Onsight 7c+ 📅 2026-09-30 ➕ 2025-11-02 ✅ 2026-08-14

## Not now

- New client projects that need an office
- A third Omark app before Time is in use
```

The example uses AL's own board; the demo uses made-up content (section 12).

### 5.1 Parts

- **`# Vision`**: the first `#` heading. The text under it, up to the first `##`, is the vision line shown at the top of the board ("I feel happy, fulfilled and peaceful"). Optional.
- **An area** is a `##` heading other than `## Not now`, in the form `## {name} #{tag}`.
  - **The tag is the area's key**, like a project code in O.Time. The app makes it from the name when the area is created (lower case, letters, digits and `-`) and never changes it afterwards. Renaming an area changes only the name. *(my call)*
  - An area tag can't equal a project code, ignoring case (Obsidian treats `#CLIMB` and `#climb` as the same tag). The app refuses such a tag and suggests another. *(my call)*
  - A `##` heading without a tag is still shown as an area, but nothing can link to it; the app adds a tag the first time the area is edited in the app. *(my call)*
  - Areas appear on the board in file order.
- **The picture** is the first Markdown image in the area, a path relative to `goals.md`. Optional.
- **The vision text** is the area's other text up to its first goal line. Shown in italics under the picture. Optional.
- **A goal** is a checkbox line in an area:
  - `- [ ]` open, `- [x]` achieved;
  - `📅` the target date. The app's form asks for one; a line without one is still read *(my call)*;
  - `➕` the date it was set, written by the app;
  - `✅` the date it was achieved, written by the app when ticked;
  - `✏️` the date it was last changed, written by the app when the text or date is edited *(my call: Omark's own sign, like `🌱` and `🏆` in O.Tasks)*;
  - at most one project code as a `#tag` (upper case, a code in `projects.csv`).
- **`## Not now`**: plain list lines, shown at the bottom of the board. Nothing links to them.

### 5.2 What a tool must keep

As in O.Tasks: every line it doesn't understand, byte for byte (other text, headings, emoji and tags), line order, and achieved goals. Achieved goals stay in place with `✅`; the board folds them under "Achieved (n)" in each card. *(my call, following "nothing gets deleted")*

### 5.3 Obsidian

Goal lines use the Obsidian Tasks signs (`📅`, `➕`, `✅`), so they read well in Obsidian. A side effect: if the Omark folder is part of an Obsidian vault, goals show up in Obsidian Tasks queries. The format doc says how to exclude the file with a global filter or a query path.

## 6. Links and "needs update"

### 6.1 What links to an area

- **Its goals.**
- **Project codes on its goals.** A goal tagged `#CLIMB` links project CLIMB to the goal's area.
- **Tasks and habits in O.Tasks** tagged with the area tag (`Family nature weekend 🌱 🔁 every month #family`) or with a project code linked to the area (`Book flights to Kalymnos #CLIMB`).
- **Hours in O.Time** on a project code linked to the area.

A project code on goals in two areas links to both.

### 6.2 Activity

An area's last activity is the latest of these dates, counting only dates up to today:

| Source | Date |
|---|---|
| A goal in the area | its `➕`, `✏️` or `✅` |
| A completion in `done.md` tagged with the area tag or a linked code | its `✅` (habit completions included) |
| A row in `events-*.csv` with a linked code and `known` = true | its `date`, past only |

Creating or deleting an area or a goal in the app also counts as activity on that area: a new goal brings its `➕`, and the app keeps nothing else. *(Deleting the last goal of an area leaves no trace, so the area may show "needs update" right after. Accepted.)*

### 6.3 Needs update

- An area whose last activity is older than the period shows **Needs update** on its card, with "Nothing linked has happened since 14 July".
- An area with nothing linked at all (no goals, no tagged tasks or habits) shows a quiet hint instead: "Add a goal, or tag a habit with #family". It never shows Needs update, so a new area isn't flagged the moment it's made. *(my call)*
- An area that is linked but has no dated activity yet (a habit tagged but not yet ticked, a goal written without `➕`) doesn't show Needs update either. *(my call, G.1)*
- The period is `stale_after` in Goals' `config.yaml`, in months (1–24, default 3), also on the shared Settings page.
- A habit that is formed leaves O.Tasks' list. If that was the area's only activity, the area goes quiet and later shows Needs update. That is intended: the habit is part of life now, and the area is asking what's next.
- An area with goals but a quiet life still shows Needs update. Busy areas with old goals don't: activity is enough (AL, 2026-10-28).

## 7. Files

All in the Omark folder ([one app spec](../suite/one-app-spec.md), section 4): Goals' files in `goals/`, Tasks' in `tasks/`, Time's in `time/`, and `projects.csv` at the top.

### 7.1 `goals.md` and `images/`

- `goals.md` as in section 5. Created by the app on first edit, not on first open.
- Pictures go to `images/` next to it. The app resizes an added picture to at most 1600 px on its long side and saves it as JPEG, named from the area tag (`images/climbing.jpg`, then `climbing-2.jpg` when replaced). *(Size and naming: my call.)* The old picture stays in the folder when it is replaced.

### 7.2 `config.yaml`

Goals' own config file, read by the shared Settings page:

```yaml
stale_after: 3   # months without linked activity before "Needs update"
```

Unknown keys are kept.

### 7.3 Writing other apps' files

O.Goals only **reads** O.Tasks' and O.Time's files, with one exception: when the user creates a project while linking a goal, O.Goals appends a row to `projects.csv` with `code` and `description` only, following its existing rules (unique upper-case code, codes never renamed). Rates, clients and archiving stay in O.Time.

## 8. Screens

The same design language as O.Tasks and O.Time: calm, phone and desktop, light and dark.

*Built in G.2* ([plan](../plans/G.2-goals-part.md)), as a part of the one app in `apps/omark/src/parts/goals/`. Pictures (adding, showing, replacing) wait for G.2b, which adds binary files to the storage adapters; until then a card shows its plain colour and keeps its picture line. The board links to the one Settings page, where `stale_after` is set.

- **Vision (home), the board:**
  - the vision line at the top, editable in place (tap it, or "Add your vision line" when empty);
  - one card per area: the picture (or a plain colour from the area's name), the name, the vision text in italics, the open goals each with a status, and "Achieved (n)" folded;
  - **Needs update** on stale cards;
  - the "Not now" list at the bottom;
  - "Add area".
- **Goal status chips** (facts, no judging):
  - open with a date ahead: "by Oct 2027";
  - open with the date passed: "was due Oct 2026";
  - achieved: "✓ Aug 2026";
  - with a project code, also: hours on that project this month and since the goal was set (from O.Time), and open tasks (from O.Tasks).
- **Habits on a card**: habits in progress in O.Tasks that link to the area (section 6.1), with O.Tasks' own progress ("Outdoors 23/66"). Read-only.
- **Area form**: name, picture (add, replace, remove), vision text, "Move up" and "Move down" (moves the whole area block in the file), delete. Goals keep file order; reordering goals is done in the file. *(my call)* Delete asks first and removes the area's goals with it; their lines are gone from `goals.md`.
- **Goal form**: text, target date, project (pick from `projects.csv`, or create one: code and description), achieved, delete (asks first).
- **Not now**: add, edit and delete lines.
- **First run** (an empty or missing `goals.md`): placeholder cards, not written to the file, that explain what an area is, what a goal is, how links work and what "Needs update" means, with "Add your first area". Each placeholder disappears once the user has added a real area. *(Wording and number of placeholders: my call, left to the builder.)*
- **Settings**: the shared Settings page, with Goals' `stale_after`.

## 9. O.Tasks changes

- **Tag suggestions in quick add**: typing `#` offers the project codes from `projects.csv` (unarchived) and the area tags from `goals.md`. *(my call: without it, linking means remembering codes.)*
- Nothing else changes in O.Tasks. Tags already survive into `done.md` (checked in G.1, pinned by a tasks-core test).

O.Time needs no change for O.Goals beyond the one-folder design.

## 10. Agents

- **The format** in `doc/format.md`, a new Omark Goals part: `goals.md` (section 5), the links and activity rules (section 6), and `config.yaml`.
- **An `omark-goals` skill** in `.claude/skills/` that teaches an agent to:
  - **read and edit `goals.md`** with the same rules as the app: area tags fixed, `➕`, `✏️` and `✅` written on change, unknown lines kept;
  - **review drift**: for each area, compare the vision text and goals with the last weeks of activity from `done.md`, `tasks.md` and `events-*.csv`, and report what the app can't: hours going mostly to projects that link to no goal or match a Not-now line, goals near their date with no activity, habits dropped in an area, areas marked Needs update. It reports and suggests; it changes nothing unless asked;
  - **help create areas and goals** from a conversation, worded as measurable outcomes with a date.

The skill finds the files in the user's synced Omark folder. It needs no Omark service.

## 11. Architecture

- **`apps/goals`**: the Svelte 5 PWA, with Playwright e2e (desktop Chrome, iPhone WebKit).
- **`packages/goals-core`** (pure: no DOM, network or storage):
  - `goals.md` parse and write, keeping unknown lines byte for byte;
  - area tags and their rules;
  - links and last activity per area (section 6), taking O.Tasks' parsed done lines and O.Time's rows as input;
  - goal status chips.
- **Shared**: `packages/storage`, `packages/signin`, `packages/settings`, the design tokens, `tasks-core` (to read `tasks.md` and `done.md` and habit progress) and `time-core` (to read `projects.csv` and `events-*.csv`).

## 12. Demo

O.Goals is part of **one demo world** shared by all three parts ([one app spec](../suite/one-app-spec.md), section 9): a made-up person whose goals, projects, habits, tasks and hours tell one story. For O.Goals the demo must show:

- four or five areas, some with pictures under a free licence;
- a goal linked to a project with hours and tasks;
- a habit in progress on a card;
- one area showing **Needs update**;
- a story an agent could flag as drift (for example most hours going to a project that no goal links to).

None of it is AL's personal content.

## 13. Acceptance

- **`goals-core` unit tests**: parse and write round trip byte for byte, including unknown lines; area tags (creation, refusing a project code, fixed on rename, untagged headings); every activity source in section 6.2 and the period edge (exactly 3 months); a formed habit; a code on goals in two areas; future dates ignored; status chips.
- **e2e on the demo storage** (desktop and iPhone):
  - first run shows the placeholders, and adding an area replaces them;
  - add, edit and delete an area and a goal, with a picture;
  - tick a goal and see it under "Achieved";
  - create a project from the goal form and find it in `projects.csv`;
  - a stale area shows Needs update, and ticking a linked habit in the demo's O.Tasks data clears it;
  - Not now add, edit and delete;
  - the demo makes no outside requests.
- **O.Tasks e2e**: `#` in quick add suggests codes and area tags.
- **The skill**: Claude, given the skill and the demo world's files, finds the planted drift and edits a goal keeping the file's other lines byte for byte.
- **Manual on staging**: the board on phone and desktop; `goals.md` edited in Obsidian shows correctly in the app.

## 14. After launch

To become issues or backlog entries:

- A guided vision exercise as an agent skill.
- Computed targets on goals (hours limits, habit rates) with on-track colours.
- The "each area needs a goal within 3 years" rule, configurable.
- A different stale period per area.
- Goals shown in O.Tasks or O.Time (a goal next to a project's hours).
- Affirmations and the other reflection tools from AL's notes.

## 15. Calls made by Claude, to check

1. Area tags are made from the name, fixed after creation, and can't equal a project code.
2. Untagged `##` headings are shown as areas and get a tag on their first in-app edit.
3. `✏️` (Omark's own sign) records a goal's last change; `➕` and `✅` as in Obsidian Tasks.
4. Achieved goals stay in place and are folded on the card.
5. The app shows facts on goals, not on-track judgements; drift judgements are the agent's.
6. Deleting an area deletes its goals' lines, after asking.
7. Pictures: resized to 1600 px JPEG, named from the area tag, old ones left in the folder.
8. `goals.md` is created on first edit; first run shows placeholders that are not in the file.
9. O.Goals only appends to `projects.csv` (code and description); everything else about projects stays in O.Time.
10. O.Tasks gets `#` suggestions in quick add.
11. A goal without `📅` is still read; the form asks for one.
12. Hours count only `known` rows up to today.
13. An area with nothing linked shows a hint, never Needs update.
14. The vision line is edited in place; areas move up and down from the area form; goals aren't reordered in the app.

## 16. Left to the builder

- The exact card and form layouts, within the design language.
- The placeholder wording.
- The colour of an area with no picture.
- Check that `#tags` in a task's title are kept on its done line in `done.md`; if not, raise it before building section 6.
