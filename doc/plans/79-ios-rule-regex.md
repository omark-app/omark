# Plan for #79: repeating tasks survive completion on the iPhone

Issue: [#79](https://github.com/omark-app/omark/issues/79). Size: large (the parser and completion, which deletes task lines).

## What changes for AL

- On the iPhone, repeating tasks show their rule (↻) instead of `🔁 every 2 days` in the title, and completing one moves it to its next date, as on the PC.
- If a task's title still holds 🔁 text the app can't read as a rule, completing it no longer deletes it. It is logged in done.md, stays in the list, and the toast says why.

## Cause

`RULE_END` (`/[ \t]#[^\s#]|📅|✅|…/u`) never matches on iOS WebKit (checked on AL's iPhone, iOS 26.6.1). A rule then runs to the end of the line, `parseRepeat` rejects `every 2 days 📅 2026-10-29`, and the text stays in the title. Lone `/📅/u`, the same pattern without `u`, and `indexOf` all work there.

## Acceptance criteria

- [ ] The 🔁 rule's end is found without a regex: the nearest field emoji by `indexOf`, or a ` #tag` by a regex without emoji.
- [ ] `takeDate` finds 📅, ✅ and the habit dates by `indexOf` too, so no parser regex holds an emoji.
- [ ] `ruleSpans` (the add box's word highlighting) uses the same rule-end search.
- [ ] A test emulating the iPhone engine (regexes with the `u` flag and an emoji alternation never match) parses `🔁 every 2 days 📅 …` and weekly rules correctly.
- [ ] A guard test fails if a regex literal in `packages/tasks-core/src` holds an emoji.
- [ ] Completing a task whose line has 🔁 text but no readable rule appends its done line and keeps the task, unchanged, with a toast that says so. One-off tasks without 🔁 text still leave tasks.md.
- [ ] Existing parser, merge, store and e2e tests pass unchanged.
- [ ] The two repeating tasks the bug deleted are put back in the maintainer's tasks.md after the fix is promoted.

## Tests I'll write first

- `tasks-file.test.ts`: reads rules and dates when the engine misses emoji alternation with the u flag (#79). It patches `RegExp.prototype.exec` to return null for such regexes, as the iPhone does. It should fail now with the rule left in the title.
- `tasks-file.test.ts`: no regex literal in tasks-core's source holds an emoji (#79).
- `ops.test.ts`: completing a task with unreadable 🔁 text keeps it (#79). It should fail now: the task is deleted.
- `store.test.ts`: the toast for that case says the task stays.

## Risks

- The new search must stop at exactly the same places as the regex, or lines would read differently on the PC. The existing tasks-file tests cover the field emoji, tags and VS16, and must pass unchanged.
- A real one-off title with a 🔁 emoji in it can no longer be completed away. AL deletes it instead. That is rare, and safer than losing a task.

## Out of scope

- `sweepCompleted` (lines ticked in Obsidian): with the parser fixed it reads rules correctly. An unreadable rule there still goes to done.md as today.
- A device check in CI: Playwright's WebKit does not have this bug, so the emulation test stands in for it.
