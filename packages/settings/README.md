# @omark/settings

A Settings page drawn from a schema. An app describes its settings once (key, label, hint, type, allowed values, default). The package reads and validates the file, draws the form and writes changes back.

- It writes only the keys that differ from the defaults. A value set back to its default removes its key.
- It keeps the file's comments, order and other keys. Every write is read again; a result that does not read is never saved.
- It imports nothing from an app. `src/*.ts` is pure (no DOM, network or storage); only `SettingsPage.svelte` and its child components touch the DOM.

Used by Omark Tasks (`TASKS_SCHEMA` in `packages/tasks-core/src/settings-schema.ts`). Omark Time will use it too.

## The pieces

| file | what it does |
|---|---|
| `schema.ts` | `Schema`, `Section`, `Field` types; `defaults(schema)` |
| `read.ts` | `readSettings(schema, text)` returns `{ values, error }` (the error has a 1-based `line`) |
| `write.ts` | `setSetting(text, path, value)` changes one key by its node range and leaves every other byte alone |
| `merge.ts` | `mergeSettings(schema, base, local, remote)` merges key by key onto the remote and returns `{ text, conflicts, dropped }`. On the same key the local write wins. If the remote reads clean and the merge would add an error, it returns local; an error the remote already had stays in the merged text. If a side does not parse (or local's change can't be written into the remote), it keeps the remote as it is: `dropped` says why (`'remote-broken'` or `'unsafe'`) and `conflicts` lists what local changed |
| `edit.ts` | what the form calls: `applyField`, `captureKey`, `capturedKey`, `writeOnInput`, `numberInput`, `displayKey` |
| `SettingsPage.svelte` | the page |

## Using the page

```svelte
<script lang="ts">
  import SettingsPage from '@omark/settings/SettingsPage.svelte';
  import { MY_SCHEMA, DEFAULT_YAML } from './settings-schema.ts';

  let text = $state('');          // config.yaml as it is now
  const save = (next: string) => { text = next; /* write the file */ };
</script>

<SettingsPage
  schema={MY_SCHEMA}
  {text}
  onwrite={save}
  back={{ label: '‹ Tasks', href: '#' }}
  apps={{ current: 'Omark Tasks', other: { label: 'Omark Time', href: '/time/#settings' } }}
  defaultText={DEFAULT_YAML}
/>
```

Props:

| prop | |
|---|---|
| `schema` | the `Schema` |
| `text` | the file's text. The page re-reads it whenever it changes |
| `onwrite(text)` | called with the whole new text for every change |
| `back` | `{ label, href, onclick? }` of the back link. `onclick` can go back in history instead of following `href` |
| `apps` | `{ current, other: { label, href } }`, the switch between the apps' settings |
| `defaultText` | what "Reset to defaults" writes (the commented default file) |
| `note` | optional message above the cards, e.g. that a change made elsewhere won |
| `status` | optional snippet shown beside the file's buttons, e.g. the save status |
| `extraSections` | optional `{ id, title, body }[]`: the app's own cards (`body` is a snippet), shown before the file's settings and listed in the nav, e.g. where the files are kept |

A file that does not read opens the page on the text editor, at the problem line.

A comment-only edit made in Edit as text is lost if another device changes a setting before it syncs: the merge goes setting by setting, and a comment is not a setting.

### Colours and fonts

The page uses the host's CSS variables. Set them on a parent:

| variable | used for |
|---|---|
| `--bg` | the page background |
| `--surface` | cards, the selected segment |
| `--ink` | text |
| `--muted` | hints, labels |
| `--faint` | the text editor's line numbers |
| `--line` | borders |
| `--chip` | key chips, segment tracks, the line-number gutter |
| `--sel` | the note above the cards, the current app in the switch |
| `--accent` | links, the armed key, the primary button |
| `--danger` | errors and the problem line |
| `--sans`, `--mono` | fonts |
| `--on-accent` | optional: text on the primary button (default `--surface`) |
| `--seg-shadow` | optional: the selected segment's shadow |

## Describing settings

A `Schema` is `{ app, file, sections }`. A section is `{ id, title, fields, accent? }` (`accent` is a colour name for the section). Every field has `path` (where it sits in the file, e.g. `['habits', 'goal']`), `label` and an optional `hint`.

| `type` | options | value |
|---|---|---|
| `choice` | `options: { value, label }[]`, `default`, `ignoreCase?`, `describe?` (replaces "one of: a, b" in the error), `display?: 'segmented' \| 'select'` | one of the option values |
| `number` | `default`, `min?`, `max?`, `integer?`, `percent?` (also accepts `'0%'` to `'100%'`) | a number, or a percent string |
| `set` | `options`, `default: string[]`, `retired?` (names an older file may still hold; read without an error, then dropped) | a list of option values |
| `keys` | `commands: { id, label, default: string[] }[]`, `yielding?` (commands whose default keys give way to a key the file binds to another command), `visible?` (rows shown before "Show all") | command to list of keys; a key belongs to one command |

The reader and the form use the same schema, so they cannot disagree about what is valid.

## Adding a section

Example: the Habits section, as it is in `TASKS_SCHEMA` (#44, #45).

1. **Describe it.** Add a section to the app's schema (`packages/tasks-core/src/settings-schema.ts`):

   ```ts
   {
     id: 'habits',
     title: 'Habits',
     accent: 'violet',
     fields: [
       { type: 'number', path: ['habits', 'maxInProgress'], label: 'Habits in progress at most',
         hint: 'A new habit waits until one is formed or dropped. 0 = no limit.',
         integer: true, min: 0, max: 99, default: 3 },
       { type: 'number', path: ['habits', 'goal'], label: 'Repetitions to form a habit',
         hint: 'Each habit can set its own. Research median: 66 days (Lally, 2010).',
         integer: true, min: 1, max: 999, default: 66 },
       { type: 'number', path: ['habits', 'missesInARow'], label: 'Misses allowed in a row',
         hint: '1 = "never miss twice". One more restarts the count.',
         integer: true, min: 0, max: 99, default: 1 },
       { type: 'number', path: ['habits', 'missesPerAttempt'], label: 'Misses allowed per attempt',
         hint: 'A number, or a share of the goal. 10% of 66 = 6.',
         integer: true, min: 0, max: 999, percent: true, default: '10%' },
     ],
   },
   ```

   The command that turns the Habits view on or off is a field of the existing Keyboard card: add `{ id: 'habit', label: 'Habit on or off', default: ['h'] }` to the `shortcuts` commands, and add `'habit'` to its `yielding` list so an older config that already binds `h` still reads.

2. **Map the values.** `toConfig` in `packages/tasks-core/src/config.ts` turns the read values into `Config`. Add the lines for the new keys, e.g. `habits: { maxInProgress: v['habits.maxInProgress'], goal: v['habits.goal'], missesInARow: v['habits.missesInARow'], missesPerAttempt: ... }`. Values are keyed by the field's path joined with dots. `Config.habits.missesPerAttempt` is `number | { percent: number }`, so `'10%'` becomes `{ percent: 10 }` and a plain number stays a number (an integer field takes only a whole percentage). Add `habit` to `Config.shortcuts` and to `DEFAULT_CONFIG`, and the new keys to `DEFAULT_CONFIG_YAML`.

3. **Test it.** Add cases to `packages/tasks-core/test/config.test.ts` (a good value, a bad one with its message), and an e2e row in `apps/tasks/e2e/settings.spec.ts` that changes one habit setting and checks the file holds only that key. The page, the writer and the merge need no change.
