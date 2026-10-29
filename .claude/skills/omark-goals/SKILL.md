---
name: omark-goals
description: Use when reading or editing Omark Goals' goals.md (life areas, vision, dated goals, Not now), reviewing drift between the user's goals and what their tasks, habits and hours show, or helping them word a new area or goal
---

# Omark Goals

Omark Goals keeps the user's direction in one Markdown file: life areas, the vision for each, dated goals, and what they chose not to pursue. It links down to Omark Tasks (tasks and habits) and Omark Time (hours) by tags. The full format is in `doc/format.md` (the Omark Goals part) of the Omark repository, https://github.com/omark-app/omark.

## The files

In the user's synced Omark folder: OneDrive (`Apps/Omark`), Google Drive for desktop (`My Drive/Omark`), or a local folder they chose. Ask where it is if you can't find it.

| File | Holds | You may |
| --- | --- | --- |
| `goals/goals.md` | the vision line, areas (`## Name #tag`), goals, Not now | read; edit by the rules below |
| `goals/config.yaml` | `stale_after` (months before Needs update, default 3) | read |
| `projects.csv` | the project codes (`code,description,…,archived`) | read; add a row only when asked, code and description only |
| `tasks/tasks.md`, `tasks/done.md` | open tasks and habits; completions with `✅` dates | read only |
| `time/events-YYYY.csv` | hours per event and day (`date`, `project`, `known`, `hours`, …) | read only |

Never change Tasks' or Time's files.

## Editing goals.md

Keep every line you don't change byte for byte: other text, headings, comments, notes under goals, front matter, line order. Then:

- **New area**: append `## {Name} #{tag}` after the last area (before `## Not now`), with a blank line before it. Make the tag from the name: lower case, accents dropped, letters and digits joined by `-` (`Family & friends` → `family-friends`); a name of only digits gets `area-` in front (`2027` → `area-2027`). It must not equal a project code in `projects.csv` or another area's tag, ignoring case; if it does, add `-2`, or `-3` and on when that is taken too.
- **Renaming an area**: change the name only. Never change its tag: tasks and habits link by it.
- **New goal**: a line after the area's last goal and the indented note lines under it (never between a goal and its notes): `- [ ] {text} #{CODE} 📅 {due} ➕ {today}`. Leave out `#CODE` when it has no project, and `📅` only when the user truly gives no date (ask for one first). A code must be one in `projects.csv`; only those link.
- **Changing a goal's text, date or project**: rewrite the line as `{box} {text} #{CODE} ✏️ {today} 📅 {due} ➕ {set} ✅ {done}`, where `{box}` stays `- [ ]` or `- [x]` as it was, and an achieved goal keeps its `✅`. Keep its `➕` and any other tags and emoji in the text. `✏️` goes before `📅`; an Obsidian block id (`^id`) stays last.
- **Achieved**: `- [ ]` becomes `- [x]` and `✅ {today}` goes after the other signs (before a `^id`). Achieved goals stay where they are; don't delete them.
- **Deleting** an area or a goal: only when the user asks, and say what goes (an area takes its goals with it).
- **Not now**: plain `- ` lines under `## Not now` at the end of the file; add the section if there is none.

Dates are `YYYY-MM-DD`, today in the user's time zone.

## Reviewing drift

When asked how the user is doing against their goals, or for a review:

1. Read `goals.md`, `projects.csv`, `config.yaml`, `tasks.md`, `done.md` and the last weeks of `events-*.csv` (from `date` up to today, `known` = `true` only).
2. Per area, work out what links to it: its tag, and the codes on its goals; tasks and habits tagged with either (tags match ignoring case); hours on those codes.
3. Report what the app can't judge:
   - where the hours go: most hours on projects that no goal links to, or on one that matches a Not now line;
   - goals near their date (or past it) with little or no linked activity;
   - habits linked to an area that were dropped (`- [-] … ❌` in `done.md`) or have gone quiet;
   - areas the app shows as **Needs update**: linked, with nothing dated since `stale_after` months (a date exactly that old is not stale). Count a goal's code only when it is in `projects.csv`, as the app does;
   - a goal's wording that can't be checked (not a measurable outcome) or has no date.
4. Give facts with numbers and dates ("12 h on NOVA this month, 1 h on COURSE"), then at most a few suggestions. Change nothing unless asked.

## Helping create areas and goals

From a conversation, propose areas with a short vision in the user's words, and goals worded as measurable outcomes with a date, usually 1–3 years out ("Redpoint 8b by October 2027", not "climb more"). Suggest a project code only for goals that will take tracked hours. Show the lines you'd add, and write them after the user agrees.
