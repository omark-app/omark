# Settings page (#45) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings page, opened from the footer gear or `,`, that shows every Omark Tasks setting and writes `config.yaml` key by key, keeping the file's comments. It is built from a shared, schema-driven component that Omark Time can reuse unchanged.

**Architecture:** A new package, `@omark/settings`, holds the generic pieces:
- a schema type, a reader that validates a YAML text against a schema (moved out of `config.ts`, same messages);
- a writer that splices one key into the text by its source range, so every other byte stays;
- a key-by-key three-way merge;
- one Svelte component, `SettingsPage.svelte`.

`tasks-core` describes the Tasks settings as a schema and builds `parseConfig` on that reader, so the reader and the form can't disagree. The Tasks store starts writing `config.yaml` through the existing `FileSync` staging path, with the new merge.

**Tech Stack:** TypeScript, `yaml` 2.x (`parseDocument`, `LineCounter`, node ranges), Svelte 5 runes, Vitest, Playwright (`desktop`, `iphone`).

**Spec:** `doc/Omark settings page spec.md` (approved by AL, section 2 included). Mockup: artboard 6, source `doc/mockups/habits/Settings.dc.html`.

## What changes for AL

- A gear in the footer (desktop and phone) and the `,` key open **Settings**. On the phone it is a full-screen page with `‹ Tasks` to go back. Browser back works too, because the page is `#settings`.
- The page groups every setting into **General**, **Buckets**, **Keyboard** and **config.yaml**, with segmented buttons, selects, number fields and checkboxes as in the mockup. **Habits** is added when #44 lands.
- Each change applies at once and is saved with the usual delay. The footer says `saved`.
- `config.yaml` gains only the keys that differ from the defaults, and keeps its comments and the other lines byte for byte. Setting a value back to its default removes its line.
- Bad input is refused with the reason, e.g. "`i` is already Important on or off".
- **Edit as text** opens the file in a plain editor. The problem line is marked, and the editor saves only text that reads cleanly.
- **Reset to defaults** writes the commented default file, after asking.
- A broken `config.yaml` opens the page on the text editor at the problem line. The config banner gains an "Open Settings" link.
- A change made on another device is merged key by key when the app regains focus. If the same key changed on both sides, this device's newer write wins and the page says so.
- A header switch, "Omark Tasks | Omark Time ↗", links to Time's settings (`time.omark.app/#settings`, or the staging and demo hosts).
- `config.yaml` gains one shortcut command, `settings` (default `,`). Older files keep working because the command is *yielding*, like `important`.

## Global Constraints

- `packages/settings` imports nothing from Tasks (`@omark/tasks-core`, `@omark/storage`, `apps/tasks`). Its `src/*.ts` files are pure: no DOM, network or storage. Only `SettingsPage.svelte` and its child components touch the DOM.
- `tasks-core` stays pure. It may import the pure part of `@omark/settings` (types, reader, writer).
- The existing `config.test.ts` tests pass **unchanged**. Error messages and lines stay as they are, and `parseConfig`'s signature and the `Config` type keep their shape. `Config.shortcuts` gains `settings`.
- No new runtime dependency (`yaml` and `svelte` are already used).
- Copy follows the mockup: section titles, `Save after typing stops` with the hint `seconds`, `Folded when the app opens` with the hint `Empty buckets start folded anyway.`, and the config card's text: "This page writes `<file>` and keeps its comments. Only changed settings are written."
- Plain, short English in UI copy, comments and docs.

## Review Focus

1. **A hand-formatted file** (flow maps `{complete: c}`, block lists, trailing comments, CRLF line endings, no final newline): the writer changes only the one key and every other byte stays. *Test: Task 2, "keeps other bytes" table.*
2. **A comment-only or empty file** (as Reset leaves it after a later edit, or a new user's file): adding a key appends it and the file still reads. Adding `shortcuts.complete` creates the `shortcuts:` block. *Test: Task 2.*
3. **Typing in the text editor while a save is pending, then focus brings a remote change**: the local text is not lost; the merge keeps it (local edits win on the keys they touch). *Test: Task 5, "unstaged config edit survives a refresh".*
4. **Capturing a key that a yielding default holds** (e.g. pressing `,` for Complete): the reader accepts it, and the page must not refuse what the reader allows. The form validates by re-reading the result, so this follows. *Test: Task 6, "applyField accepts a key a yielding default holds".*
5. **Leaving Settings with an edit still in the save delay** (back link, `,` from the list, a reload): the edit is not lost. `flush` stages the config on page hide like the task files do. *Test: Task 5, "flush stages a pending config edit".*

---

### Task 1: `@omark/settings`: schema types and the reader

**Files:**
- Create: `packages/settings/package.json` (`@omark/settings`; `exports`: `"."` → `./src/index.ts`, `"./SettingsPage.svelte"` → `./src/SettingsPage.svelte`; deps `yaml`; peer `svelte`; scripts `typecheck` (`svelte-check`), `test` like tasks-core)
- Create: `packages/settings/tsconfig.json`, `packages/settings/vitest.config.ts` (copy tasks-core's)
- Create: `packages/settings/src/schema.ts`, `packages/settings/src/read.ts`, `packages/settings/src/index.ts`
- Test: `packages/settings/test/read.test.ts`, `packages/settings/test/no-app-imports.test.ts`

**Interfaces:**
- Produces (`schema.ts`):
  ```ts
  export type Path = readonly string[];            // ['theme'], ['habits','goal'], ['shortcuts','complete']
  interface Base { path: Path; label: string; hint?: string }
  export interface ChoiceField extends Base { type: 'choice'; options: { value: string; label: string }[]; default: string;
    ignoreCase?: boolean; describe?: string; display?: 'segmented' | 'select' }
  export interface NumberField extends Base { type: 'number'; default: number | string; min?: number; max?: number;
    integer?: boolean; percent?: boolean }   // percent: also accepts '0%'..'100%' strings
  export interface SetField extends Base { type: 'set'; options: { value: string; label: string }[]; default: string[]; retired?: string[] }
  export interface KeysField extends Base { type: 'keys'; commands: { id: string; label: string; default: string[] }[];
    yielding?: string[]; visible?: number }  // visible: rows shown before "Show all"
  export type Field = ChoiceField | NumberField | SetField | KeysField;
  export interface Section { id: string; title: string; fields: Field[]; accent?: string }
  export interface Schema { app: string; file: string; sections: Section[] }
  export type Values = Record<string, unknown>;    // keyed by path.join('.'); keys field → Record<cmd, string[]>
  export interface SettingsError { line: number | null; message: string }
  export const fieldId: (f: Field) => string;      // path.join('.')
  export const allFields: (s: Schema) => Field[];
  export const defaults: (s: Schema) => Values;
  ```
- Produces (`read.ts`):
  - `readSettings(schema, text): { values: Values; error: SettingsError | null }`. It never throws; on any error it returns `defaults(schema)` and the first error.
  - `checkValue(field: Exclude<Field, KeysField>, raw: unknown): { value: unknown } | { error: string }`.
  - `keyOwner(field: KeysField, keys: Record<string, string[]>, key: string): string | null` (a command id).

- [ ] **Step 1: Write the failing tests** in `read.test.ts` against a small demo schema written in the test (a choice `theme`, a number `delay` with `min: 0`, a set `folded` with `retired: ['overdue']`, a nested number `habits.goal` with `integer`, `min 1`, `max 999`, a percent number `habits.misses` with default `'10%'`, and a keys field `shortcuts` with commands `a: ['x']`, `b: ['y']` and a yielding `c: [',']`):
  - `readSettings(demo, '')` gives `{ values: defaults(demo), error: null }`.
  - `'theme: dark\n'` sets `values.theme` to `'dark'`.
  - `'habits:\n  goal: 30\n'` sets `values['habits.goal']` to `30`.
  - `'habits:\n  goal: 0\n'` gives error line 2, with a message containing `habits.goal`.
  - `'habits:\n  misses: 25%\n'` gives `'25%'`; `'habits:\n  misses: 101%\n'` gives an error.
  - `'foo: 1\n'` gives `{ line: 1, message: 'Unknown setting "foo"' }`.
  - `'habits:\n  foo: 1\n'` gives `{ line: 2, message: 'Unknown setting "habits.foo"' }`.
  - `'shortcuts:\n  zz: q\n'` gives `{ line: 2, message: 'Unknown shortcut command "zz"' }`.
  - `'shortcuts:\n  a: y\n'` gives the message `Key "y" is bound to both a and b`.
  - `'shortcuts:\n  a: ","\n'` is accepted: `c` yields, so it becomes `[]`.
  - `'folded: [overdue, x1]'`, with options `x1`, gives `['x1']`.
  - `'theme: [\n'` gives error line 1.
  - `keyOwner(field, { a: ['x'], b: ['y'], c: [] }, 'y')` is `'b'`.

  `no-app-imports.test.ts` reads every file under `packages/settings/src` and expects none to contain `@omark/tasks-core`, `@omark/storage` or `apps/tasks`.

- [ ] **Step 2: Run** `pnpm vitest run --project @omark/settings`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `readSettings`.** Move the line logic, `ConfigFailure`, `keyName`, the YAML-error line clamp, the yielding pass and the duplicate check from `packages/tasks-core/src/config.ts` into `read.ts`, generalised over the schema:
  - A top-level name that is the first segment of nested fields must be a map (`<name> must be a list of "setting: value" lines`).
  - The keys field keeps its own wording (`shortcuts must be a list of "command: key" lines`, `Unknown shortcut command`, `Shortcut "<cmd>" must be a key or a non-empty list of keys`).
  - The messages are:
    - choice: `<id> must be <describe ?? 'one of: ' + values.join(', ')>`
    - number: `<id> must be a number ≥ <min>`, or with `integer` and `max`: `<id> must be a whole number from <min> to <max>`; with `percent`, `…, or a percentage from 0% to 100%`
    - set: `<id> must be a list of: …`

- [ ] **Step 4: Run** `pnpm vitest run --project @omark/settings`. Expected: PASS.

- [ ] **Step 5: Commit** `Add the settings package with a schema-driven config reader`.

### Task 2: the comment-keeping writer

**Files:**
- Create: `packages/settings/src/write.ts` (export from `index.ts`)
- Test: `packages/settings/test/write.test.ts`

**Interfaces:**
- Produces: `setSetting(text: string, path: Path, value: unknown | undefined): string`. `undefined` removes the key. It throws `Error('config.yaml has a mistake; fix it as text first')` when the text doesn't parse or its root isn't a map.

- [ ] **Step 1: Write the failing tests:**
  - **Replace**: `setSetting(DEMO, ['theme'], 'dark')` on a text with comments above and after `theme: system   # mine` gives the same text with only `system` replaced (`theme: dark   # mine`). Assert the whole string.
  - **Keeps other bytes** (table): for each of `'shortcuts: {a: q}\nfolded:\n  - x1\n'`, a CRLF file, a file with no final newline and the full `DEFAULT_CONFIG_YAML`-style file (copy it into the test as a fixture), set `theme` and assert that every line except the changed or added one is identical.
  - **Add to root**: `setSetting('# only a comment\n', ['theme'], 'dark')` is `'# only a comment\ntheme: dark\n'`; `setSetting('', …)` is `'theme: dark\n'`; with no final newline, a newline is added before the new key.
  - **Add nested, parent missing**: `setSetting('theme: dark\n', ['habits','goal'], 30)` is `'theme: dark\nhabits:\n  goal: 30\n'`.
  - **Add nested, parent present**: `'shortcuts:\n  a: q   # mine\n# after\nother: 1\n'` plus `['shortcuts','b']` and `['z']` inserts `  b: z` right after the `a:` line, with the same indent.
  - **Remove**: removing `theme` deletes exactly its line. Removing the only child of `shortcuts:` removes the `shortcuts:` line too, but keeps a comment line above it.
  - **Flow parent**: `'shortcuts: {a: q, b: z}\n'` minus `['shortcuts','a']` gives `'shortcuts: {b: z}\n'`.
  - **Values that need quotes**: `[',']` is written as `[',']`, `'Escape'` as `Escape`, `['/', 'n']` as `['/', 'n']`, `'10%'` as `10%`.
  - **Block value replaced**: `'folded:\n  - x1\n'` set to `['x1','x2']` gives `'folded: [x1, x2]\n'`.
  - Every result reads back: `parseDocument(out).getIn(path)` is the value (or `undefined`), with no errors.
  - A broken text (`'theme: [\n'`) throws.

- [ ] **Step 2: Run** `pnpm vitest run --project @omark/settings write`. Expected: FAIL.

- [ ] **Step 3: Implement `setSetting`.** Use `parseDocument` with `keepSourceTokens: false` and find nodes with `doc.getIn(path, true)` and the parent map's `items`. Edit the original string by node `range` offsets; never call `doc.toString()`. Format values with `stringify(value, { collectionStyle: 'flow', flowCollectionPadding: false, singleQuote: true }).trimEnd()`. Then:
  - **Replace** a scalar: splice `[value.range[0], value.range[1]]`.
  - **Replace** a block collection: splice from the key's end to the value's `range[1]` with `: <flow>`.
  - **Remove** from a block map: delete whole lines, from the start of the key's line to the end of the value's last line.
  - **Remove** from a flow map: re-render that parent's value as a flow map.
  - **Add**: insert after the last item of the deepest existing block map, at its first item's indent, or append at the end of the text.

  Re-parse the result and assert it reads back. If not, throw: a bug, never a silent bad write.

- [ ] **Step 4: Run** the tests. Expected: PASS.

- [ ] **Step 5: Commit** `Write one config key at a time, keeping the rest of the file`.

### Task 3: key-by-key merge and field edits

**Files:**
- Create: `packages/settings/src/merge.ts`, `packages/settings/src/edit.ts` (export both)
- Test: `packages/settings/test/merge.test.ts`, `packages/settings/test/edit.test.ts`

**Interfaces:**
- Produces:
  - `mergeSettings(schema, base, local, remote): { text: string; conflicts: Field[] }`
    - `local === base` → `remote`; `remote === base` → `local`.
    - If any of the three doesn't parse → `local`.
    - Otherwise start from `remote`. For each leaf path (each non-keys field; each `[keysPath, cmd]`) whose raw local value differs from base, apply it with `setSetting`. A path that remote also changed to something else is a conflict. Local wins: its write is the newer one.
  - `applyField(schema, text, field, value): { text: string } | { error: string }`
    - Writes `undefined` when `value` deep-equals the field's default, else `value`.
    - Re-reads with `readSettings` and returns `{ error: message }` if that fails.
    - For keys fields `value` is the whole `Record<cmd, string[]>`. Only commands whose list changed are written; a command equal to its default is removed.
  - `captureKey(field: KeysField, keys, cmd, index, key): { keys } | { error: string }`. A key held by another command gives `` `${key}` is already ${label} ``.
  - `valueOf(values: Values, field): unknown`.

- [ ] **Step 1: Write the failing tests:**
  - Merge, both changed different keys: base `''`, local `'theme: dark\n'`, remote `'# r\ndelay: 2\n'` → text `'# r\ndelay: 2\ntheme: dark\n'`, conflicts `[]`.
  - Same key changed to different values: base `'theme: light\n'`, local `'theme: dark\n'`, remote `'theme: system\n'` → `'theme: dark\n'`, conflicts `[themeField]`.
  - Local removed a key that remote kept: the key is removed.
  - A broken remote with a local change → local.
  - `applyField` with the default value removes the key. With `-1` for `delay` it returns `{ error: 'delay must be a number ≥ 0' }`.
  - `applyField` on keys, changing only `a`, writes only `shortcuts.a`.
  - `applyField accepts a key a yielding default holds`: setting `a` to `[',']` writes `a: [',']` and no error.
  - `captureKey(field, keys, 'a', 0, 'y')` → `` { error: '`y` is already B' } ``.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** in `merge.ts` and `edit.ts`.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit** `Merge config changes key by key and validate field edits`.

### Task 4: the Tasks schema and `parseConfig` on top of it

**Files:**
- Create: `packages/tasks-core/src/settings-schema.ts`
- Modify: `packages/tasks-core/src/config.ts` (replace the `switch` with `readSettings(TASKS_SCHEMA, text)` plus mapping; add `settings` to `Command` and the defaults; add `settings: ','` to `DEFAULT_CONFIG_YAML` with a quote, `settings: ','`)
- Modify: `packages/tasks-core/package.json` (dep `@omark/settings: workspace:*`), `packages/tasks-core/src/index.ts` (export `TASKS_SCHEMA`)
- Test: `packages/tasks-core/test/config.test.ts` (add tests only)

**Interfaces:**
- Produces: `TASKS_SCHEMA: Schema`, with `app: 'Omark Tasks'` and `file: 'Apps/Omark Tasks/config.yaml'`, and these sections:
  - **General** (`general`):
    - `theme`: choice System, Light, Dark; segmented.
    - `defaultView`: Desktop view on open: Task list (`list`), Week board (`board`).
    - `firstDayOfWeek`: First day of the week; select Monday…Sunday (`monday`…); `ignoreCase`; describe `a day name: monday, …`.
    - `dateLabels`: Date labels: `Thu · 12 Nov` (`short`), `2026-11-12` (`iso`).
    - `newTaskBucket`: New tasks go to; select Today, Tomorrow, This week, Next week, Someday.
    - `saveDelaySeconds`: number, min 0, hint `seconds`.
  - **Buckets** (`buckets`): `foldedOnOpen`, a set of the six buckets with their app names, `retired: ['overdue']`, and the hint above.
  - **Keyboard** (`keyboard`): `shortcuts`, a keys field. Each command has a label: Focus the add box, Down, Up, Today, Tomorrow, This week, Next week, Pick a date, Someday, Repeat, Important on or off, Complete, Edit, Delete, Deselect, Undo, Switch view, Search, Open settings. `yielding: ['tomorrow', 'important', 'settings']`; `visible: 4`.
  - `Config.firstDayOfWeek` stays a number: the mapping does `DAYS.indexOf(value.toLowerCase())`.

- [ ] **Step 1: Write the failing tests** (added to `config.test.ts`):
  - `parseConfig('').config.shortcuts.settings` equals `[',']`.
  - `parseConfig('shortcuts:\n  complete: ","\n')` has no error, `complete` is `[',']` and `settings` is `[]`.
  - "every Config key has a schema field": the top-level ids of `allFields(TASKS_SCHEMA)` equal `Object.keys(DEFAULT_CONFIG)` as a set, and `defaults(TASKS_SCHEMA)` maps back to `DEFAULT_CONFIG`.

- [ ] **Step 2: Run** `pnpm vitest run --project @omark/tasks-core`. Expected: the new tests FAIL; the old ones pass.

- [ ] **Step 3: Implement**, then delete the moved helpers from `config.ts`.

- [ ] **Step 4: Run** `pnpm vitest run --project @omark/tasks-core` and `pnpm typecheck`. Expected: all PASS, with old tests unchanged. Then add `case 'settings': return false;` beside `search` in `apps/tasks/src/lib/commands.svelte.ts`.

- [ ] **Step 5: Commit** `Read config.yaml through the shared settings schema`.

### Task 5: the store writes `config.yaml`

**Files:**
- Modify: `apps/tasks/src/lib/workspace.ts`:
  - `stage` and `save` accept `config?: { text; base }`.
  - `mergeConfig` becomes `mergeSettings(TASKS_SCHEMA, …)`, reporting conflicts to `onConfigConflict(cb: (ids: string[]) => void)`.
  - The "never writes config.yaml" comment goes.
- Modify: `apps/tasks/src/lib/store.svelte.ts`:
  - `base.config`; `configText` becomes reactive state and is exposed.
  - Add `writeConfig(text: string): void`: it applies at once, `unsynced = true`, and schedules the save.
  - `stageNow` stages config when `configText !== base.config`; `isDirty` includes config.
  - `adopt` three-way merges config like tasks (`mergeSettings(TASKS_SCHEMA, base.config, configText, next.config)`).
  - Add `configNote: string | null`, set from conflicts: `Also changed on another device: <labels>. Kept the change made here.`
- Test: `apps/tasks/src/lib/store.test.ts`, `apps/tasks/src/lib/workspace.test.ts` (add tests)

**Interfaces:**
- Produces on `AppStore`: `readonly configText: string`, `readonly configNote: string | null`, `writeConfig(text: string): void`.

- [ ] **Step 1: Write the failing tests:**
  - `writeConfig('theme: dark\n')`: `store.config.theme` is `'dark'` at once, and after `flush()` the fake drive's `config.yaml` is `'theme: dark\n'`.
  - `flush stages a pending config edit`: write, then `flush()` before the timer, and the cache holds it.
  - `unstaged config edit survives a refresh`: `writeConfig('theme: dark\n')`, an external write of `'saveDelaySeconds: 2\n'`, then `refresh()` → the drive text holds both keys.
  - A conflict on `theme`: `configNote` names Theme.
  - Workspace: `stage({ config })` writes the file, and a 412 merge reports the conflict ids.

- [ ] **Step 2: Run** `pnpm vitest run --project tasks`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `pnpm vitest run --project tasks`. Expected: PASS.

- [ ] **Step 5: Commit** `Let the store write config.yaml and merge it key by key`.

### Task 6: `SettingsPage.svelte`, the shared component

**Files:**
- Create in `packages/settings/src/`: `SettingsPage.svelte`, `Field.svelte` (one row per field type), `KeysCard.svelte` (recorder and Show all), `TextEditor.svelte` (textarea, line gutter, problem line)
- Test: `packages/settings/test/edit.test.ts` (any pure helpers the component needs go in `edit.ts` with tests). The component itself is covered by Task 7's e2e.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces the props:
  ```ts
  {
    schema: Schema; text: string;                 // the file as it is now
    onwrite: (text: string) => void;              // called with the whole new text
    back: { label: string; href: string };        // '‹ Tasks'
    apps: { current: string; other: { label: string; href: string } };
    note?: string | null;                         // the merge note
    status?: Snippet;                             // footer status (the app's StatusLine)
    saveDelayMs: number;                          // text editor debounce
    defaultText: string;                          // Reset to defaults
  }
  ```
- Test ids (Task 7 uses them):
  - `settings`, `settings-back`, `settings-nav`, `settings-section-<id>`
  - `field-<id>` on each row, with its control inside
  - `field-error-<id>`, `key-<cmd>-<i>`, `keys-show-all`, `keys-error`
  - `config-text` (the `<pre>`), `edit-as-text`, `reset-defaults`
  - `text-editor` (textarea), `text-error` (shows `Line N: message`), `text-line-<n>` with `data-problem` on the problem line, `text-done`
  - `settings-note`

- [ ] **Step 1: Write the failing pure tests** for any helper added to `edit.ts` (e.g. `optionLabelFor`, `displayKey(' ')` → `Space`, `displayKey('ArrowDown')` → `↓`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Build the component** to the mockup's layout and tokens (use the app's CSS variables: `--surface`, `--line`, `--muted`, `--accent`, `--sans`, `--mono`; no hard-coded colours, so the dark theme works). Then:
  - **Layout**: the nav is a column on desktop; at phone width (`max-width: 640px`) it is hidden and the cards stack.
  - **Number and text inputs** validate on `input`: show the reason in `field-error-<id>` and don't write. A valid value writes at once; the store applies its own save delay.
  - **Keys**: clicking a key chip arms capture (`aria-pressed`); the next `keydown` (with `preventDefault` and `stopPropagation`) calls `captureKey`; a click elsewhere or blur cancels. The first `visible` commands show, then `keys-show-all` reveals the rest.
  - **Text editor**: `readSettings` runs on each input; the error line gets `data-problem`. A valid text is written after `saveDelayMs`; an invalid one is never written. `text-done` is enabled only when the text is valid and returns to the form.
  - **Opening**: when `readSettings(schema, text).error` is set, the page opens with the editor shown.
  - **Reset**: `window.confirm('Reset every setting to its default? Comments you added are lost.')`, then `onwrite(defaultText)`.
- [ ] **Step 4: Run** `pnpm typecheck` and `pnpm vitest run --project @omark/settings`. Expected: PASS.
- [ ] **Step 5: Commit** `Add the shared Settings page component`.

### Task 7: Settings in Omark Tasks, with e2e

**Files:**
- Modify: `apps/tasks/package.json` (dep `@omark/settings`)
- Modify: `apps/tasks/src/App.svelte`:
  - `page` comes from `location.hash === '#settings'`, with a `hashchange` listener.
  - It renders `SettingsPage` in place of the views and the FAB.
  - The `,` key goes through `commandFor` → `settings` → `location.hash = 'settings'`, ignored while on the page.
  - Search is ignored while on the page.
- Modify: `apps/tasks/src/components/StatusLine.svelte` (a gear `<a href="#settings" data-testid="open-settings" aria-label="Settings">`)
- Modify: `apps/tasks/src/components/ConfigBanner.svelte` (an "Open Settings" link)
- Create: `apps/tasks/src/lib/other-app.ts`: `timeSettingsUrl(host: string): string`. `staging-tasks.*` → `https://staging-time.omark.app/#settings`, `demo-tasks.*` → demo, anything else → `https://time.omark.app/#settings`.
- Test: `apps/tasks/src/lib/other-app.test.ts`, `apps/tasks/e2e/settings.spec.ts`

- [ ] **Step 1: Write the failing tests.** `other-app.test.ts` has the three hosts. `settings.spec.ts` runs on both projects and uses `openApp`, `driveFile`, `externalWrite` and the existing `regainFocus` pattern from `lifecycle.spec.ts`:
  1. **The footer gear opens Settings with every setting**: each `field-<id>` of `allFields(TASKS_SCHEMA)` is visible (keyboard after `keys-show-all`), and a seeded `theme: dark` shows Dark pressed. Desktop also opens it with `,`. On the phone, `settings-back` returns to the list.
  2. **The theme applies at once and only that key is written**: seed the full default-style file with comments. Click Dark; `html[data-theme=dark]` shows at once. Poll `driveFile`: it equals the seed with only `theme: system` → `theme: dark`. With an empty seed, the file becomes exactly `theme: dark\n`.
  3. **Back to the default removes the key**: seed `theme: dark\n`, click System, and the file becomes `''`.
  4. **Invalid input is refused**: typing `-1` in Save after typing stops shows a reason, and the file is unchanged. Capturing `i` for Complete shows `` `i` is already Important on or off ``, and the file is unchanged.
  5. **A broken file opens the editor at the problem line**: seed `theme: dark\nfoo: [\n`. Opening Settings shows `text-editor`, the problem line has `data-problem`, and `text-error` says `Line 2`. Fix the text to `theme: dark\n`, `text-done` turns on, and clicking it shows the form. The drive holds the fixed text.
  6. **A change from another device is merged on focus**: open Settings and click Dark, wait for `saved`. `externalWrite('config.yaml', driveText + 'saveDelaySeconds: 2\n')`, then `regainFocus`. The page's field shows `2`, and Dark is still pressed.
  7. **Theme and a shortcut survive a reload; the file holds only those keys**: set Dark and capture `c` for Complete. The drive text equals `theme: dark\nshortcuts:\n  complete: c\n`. Re-seed the init script with that text, `page.reload()`, and Dark plus `c` are shown; on desktop, pressing `c` on a selected task completes it.
- [ ] **Step 2: Run** `pnpm --filter tasks e2e -- settings`. Expected: FAIL (no `open-settings`).
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `pnpm e2e`. Expected: all specs PASS on both projects.
- [ ] **Step 5: Commit** `Open Settings from the footer gear and the comma key`.

### Task 8: docs and the #44 hand-over

**Files:**
- Modify: `doc/TaskApp v1 spec.md` (section 10: the Settings page, the `settings` command, "the app writes config.yaml only from Settings")
- Modify: `README.md` (the Settings line)
- Modify: `.claude/skills/taskapp-files/SKILL.md` (the `settings` shortcut; that the app now writes `config.yaml`, only the keys that differ, so Claude should keep edits minimal too)
- Create: `packages/settings/README.md` (how an app uses the component; how to add a section)

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** If #44 is on `main`, merge `main` and add the Habits section, following `packages/settings/README.md`, with the mockup's labels and hints and an e2e row. If not, comment on #44 with the three steps from that README.
- [ ] **Step 3: Commit** `Document the Settings page`.

## Acceptance criteria

- [ ] Opening Settings from the footer or `,` shows every Tasks setting with its current value, on desktop and phone. *(e2e 1)*
- [ ] Changing a setting applies at once and writes only that key; comments and other keys stay byte for byte. *(Task 2, e2e 2)*
- [ ] Setting a value back to its default removes the key. *(Task 3, e2e 3)*
- [ ] Invalid input is refused with a reason; a duplicate key names the command that holds it. *(Task 3, e2e 4)*
- [ ] A broken `config.yaml` opens the text editor at the problem line; fixing it there brings back the form. *(e2e 5)*
- [ ] A change from another device is merged on focus. *(Task 5, e2e 6)*
- [ ] The Habits section edits the habits spec's keys, if #44 ships first; otherwise #44 gets the steps. *(Task 8)*
- [ ] The component takes a schema, so Omark Time can use it without changes to the component. *(Task 1 import test, Task 6 props)*
- [ ] e2e on both projects: change the theme and a shortcut, reload, both kept; the file holds only those keys. *(e2e 7)*

## Tests I'll write first

The reader table (Task 1), the writer's byte-for-byte table (Task 2), merge and `applyField` (Task 3), the `settings` command (Task 4), the store writing and merging config (Task 5), and `settings.spec.ts` (Task 7). Each is run red before its code.

## Risks

- **Conflicts with #44**, which also edits `config.ts`. Mitigation: `parseConfig` and `Config` keep their shape. The habits session has the plan (shared notes, `45-settings-for-44-habits.md`), and whichever lands second ports the other's change.
- **Writer edge cases** with unusual YAML (anchors, multi-document files, tabs). Mitigation: every write re-reads its result, and a bad result throws instead of saving. The page then shows "Edit as text".
- **The app now writes `config.yaml`**; before, it never did. A bug could damage a hand-edited file. Mitigation: writes happen only from Settings; the byte-for-byte tests; the merge keeps remote text whenever local didn't change.

## Out of scope

- One file or page that edits both apps' settings (spec section 2).
- Per-device settings (backlog).
- Storage choice and sign-out.
- Omark Time's schema (milestone T).
- Adding or removing extra keys for a command from the recorder: it replaces one key at a time; extra keys stay editable as text.
