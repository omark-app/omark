# Omark Time milestone T: plan (#53)

Splits roadmap milestone T (T.1–T.11) into issues. Implements [the Omark Time spec](../Omark%20Time%20spec.md); the spike (T.2) is done and its findings are in spec section 15.1. Each code issue gets its own detailed plan when its turn comes, except T.3 and T.4, planned now in [54-time-core.md](54-time-core.md) and [55-calendar.md](55-calendar.md).

## What changes for AL

Nothing visible yet. When the milestone is done, Omark Time runs at `staging-time.omark.app`, `demo-time.omark.app` and, after T.9 and T.11, `time.omark.app`.

## Issues

| Roadmap | Issue | Size | Needs |
|---|---|---|---|
| T.3 | #54 `packages/time-core`: parser, event → rows, colour decision, files, models, summaries, charts, reports | large | nothing |
| T.4, part 1 | #55 `packages/calendar`: `CalendarSource` (types from #54), fake calendar, contract test | large | #54's first task (the types) |
| T.4, part 2 | #56 Google `CalendarSource`: calendar list, sync tokens, colour patch with throttling | large | #55; 3.8's Google provider |
| T.5 | #57 `apps/time` shell: sign-in, first run, storage choice, sync and colouring loops, rebuild, offline cache, staging | large | #54, #55, #56; 3.1; 3.8 |
| T.6 | #58 screens: hours, charts, fix list, projects, settings, report export | large | #57; #45's settings component |
| T.7 | #59 demo at `demo-time.omark.app` | large | #57; #55's seeded fake; 2.1's demo pattern (#31) |
| T.8 | #60 format doc, `omark-time` skill, DuckDB examples | small | #54; 2.3's `doc/format.md` if it has landed |

T.1, T.2 are done. T.9, T.10 and T.11 are AL's steps; they get `needs-human` issues when #57 is on staging, so the steps are batched with the other sessions' asks.

T.8 is small as in the roadmap: docs and a skill, no change to code or file formats. The formats are fixed by #54.

## Order and parallel work

```
#54 time-core ─┬─────────────────────────────┬─> #57 shell ─┬─> #58 screens ─┐
               ├─> #55 calendar (fake) ─┐     │              └─> #59 demo ───┼─> T.11 a week on AL's calendar
               │                        └─> #56 Google ──┘                   │
               └─> #60 agents (docs, skill)                                  │
3.8 Google provider + Drive ─────────────────> #56, #57          T.9 production (AL) ┘
3.1 local folder ────────────────────────────> #57
#45 settings component ──────────────────────> #58
```

- **Now (wave 1–2):** #54, then #55 as soon as #54's types are pushed. One session builds both, #54 first.
- **When 3.8's provider has merged:** #56. #60 can run in parallel with it in its own session.
- **When #54, #55, #56, 3.1 and 3.8 have merged:** #57.
- **After #57:** #58 and #59 in parallel (two sessions); #58 also waits for #45's component, or builds the settings form itself if #45 has not merged.

## What each issue needs from 3.1 and 3.8

| Issue | From 3.8 (Google Drive, Google provider) | From 3.1 (local folder) |
|---|---|---|
| #54 | nothing | nothing |
| #55 | nothing | nothing |
| #56 | The Google provider in `@omark/signin`, picked by `OMARK_APP`, with Time's scopes (`calendar.calendarlist.readonly`, `calendar.events.owned.readonly`, `openid email`) and incremental consent (`include_granted_scopes=true`, the new refresh token replacing the sealed cookie). The source itself only needs `getToken()` from `@omark/storage`'s `Auth`, so its unit tests run against a mocked API; the provider is needed for the manual check and for colouring's edit-access consent. | nothing |
| #57 | The `GoogleDriveAdapter` (`drive.file`, a folder `Omark Time` in My Drive) and whatever conditional-write safeguard it settles on (spec 7.4); asking for `drive.file` only when the user picks Drive, and `calendar.events.owned` only when colouring is turned on. | The `LocalFolderAdapter`, folder picking and the permission re-prompt, so desktop Chrome or Edge can keep the files in a local folder. |
| #58–#60 | nothing beyond #57 | nothing beyond #57 |

What #57 needs that 3.8 might not plan for, to tell that session now: a provider configured per app (Tasks asks for Drive at sign-in when Drive is picked; Time signs in for the calendar and asks for Drive later), and an "add scopes" call that both apps can use.

## Acceptance criteria

- [ ] Issues #54–#60 exist with acceptance criteria and a size.
- [ ] #54 and #55 have approved plans; #56's part of the plan is approved too, its build waits for 3.8.
- [ ] Every section of the Time spec maps to an issue (table below).

| Spec section | Issue |
|---|---|
| 1–3 intent and decisions | all |
| 4 how it works | #57 (loop), #54 (the pure steps) |
| 5 title format | #54 |
| 6 what counts | #54 |
| 7 files | #54 (formats), #57 (where they live, sync state) |
| 8 colours | #54 (decision), #56 (patch, throttling), #57 (consent, loop, resume) |
| 9 screens | #54 (summaries, charts, reports), #58 |
| 10 Google | #56, #57; AL in T.9, T.10 |
| 11 agents | #60 |
| 12 demo | #55 (seeded fake), #59 |
| 13 architecture | #54, #55, #56, #57 |
| 15 acceptance | each issue's tests; manual steps in #57 and T.11 |

## Risks

- **3.8 slips** and holds #56 and #57, the longest chain. #54 and #55 don't wait for it, so the chain loses only what 3.8 loses.
- **#45's settings component** may not fit Time's settings (calendar picker, colouring consent). #58 then builds those two fields itself and uses the component for the rest.
- **A renamed series with no end** may return many instances (spec 15.1, open point). #57's plan measures it on the test calendar.

## Out of scope

Everything in spec section 14 (after launch).
