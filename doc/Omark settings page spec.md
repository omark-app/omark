# Omark settings page spec

Status: approved by AL, 2026-10-26, including section 2 (one shared page design, each app edits its own file). Issue #45.
**Changed 2026-10-28 (AL):** with one Omark app and one folder, section 2 no longer holds: one Settings page edits every part's file. See [the one app spec](suite/one-app-spec.md), section 8.
Source: AL in the habits brainstorm of 2026-10-26: "move the yaml config of tasks into one single editable webpage for both omark tasks and time apps". Related: [v1 spec](tasks/spec.md) section 10, [Omark Time spec](time/spec.md) sections 7.2 and 9, [habits spec](tasks/habits-spec.md) section 11.
Mockup: artboard 6 in https://claude.ai/artifact/VwN7ULDERA3tsd2JoMatWt (source: `doc/mockups/habits/Settings.dc.html`)

## 1. Intent

Every setting today means opening `config.yaml` in an editor, which Obsidian hides by default and the phone can't do at all. A Settings page makes the settings visible and safe to change, while the file stays the source of truth: hand edits, Obsidian and Claude keep working.

## 2. One page, two files

AL asked for one page for both apps. As the suite is designed, one page can't edit both files:

- Each app signs in on its own (Omark Tasks: Microsoft or Google Drive; Omark Time: Google, plus storage), with its own registrations.
- With the app-folder scope each app sees only its own folder (`Apps/Omark Tasks`, `Apps/Omark Time`). A page on one origin can't reach the other app's files without a second sign-in and broader access, which the launch spec rules out.

**Proposal:** one Settings page **design and component**, used by both apps. Each app's page edits its own `config.yaml`, and the header switch "Omark Tasks | Omark Time ↗" opens the other app's page. To the user it looks and works as one page; the data stays apart. *(My call; AL to confirm.)*

The alternative, one shared settings file for the suite, would need both apps to reach a common folder: it breaks the app-folder design and is not proposed.

## 3. What it does

- **Opens** from a gear in the footer (desktop and phone) and the key `,` *(my call)*. On the phone it is a full-screen page with a back link.
- **Shows every setting** of the app, grouped: General, Buckets, Habits, Keyboard for Tasks; Calendars, Colouring, Tracking, Storage for Time (the list in the Time spec, section 9).
- **Each control writes at once** (with the usual save delay), like the task list: no Save button. The footer status shows `saved`.
- **Writes only what differs from the default**, keeping the file's comments and order (the `yaml` library's document API, already used to read). Setting a value back to its default removes the key.
- **Validates as you type** with the same rules as the reader, and says why ("`i` is already Important on or off").
- **Keyboard**: each command shows its keys; click one and press the new key. A key held by another command is refused, naming it.
- **config.yaml section**: the file as it is now; **Edit as text** opens it in a plain editor with the problem line marked; **Reset to defaults** writes the commented default file (asks first).
- **Broken file**: the page opens on the text editor with the problem line, instead of the form.
- **Sync**: the page re-reads on focus like the rest of the app. A change made elsewhere meanwhile is merged key by key; when the same key changed on both sides, this device's change wins and the page names the setting ("Also changed on another device: … Kept the change made here."). *(AL's call, 2026-10-27: settings are small, a lost setting is cheap, and the change you just made is the one you expect to see.)*

## 4. Built once

- A shared, schema-driven component: each app describes its settings (key, label, hint, type, allowed values, default) and the component draws the form, validates and writes. The reader's validation and the form use the same schema, so they can't disagree.
- Omark Tasks gets it first. Omark Time uses it in milestone T (roadmap T.6 already lists a settings screen).
- Where it lives (`packages/settings` now, or inside `apps/tasks` until the monorepo move) is the builder's call.

## 5. Acceptance criteria

- [ ] Opening Settings from the footer or `,` shows every Tasks setting with its current value, on desktop and phone.
- [ ] Changing a setting applies at once and writes only that key; comments and other keys stay byte for byte.
- [ ] Setting a value back to its default removes the key.
- [ ] Invalid input is refused with a reason; a duplicate key names the command that holds it.
- [ ] A broken `config.yaml` opens the text editor at the problem line; fixing it there brings back the form.
- [ ] A change from another device is merged on focus.
- [ ] The Habits section edits the keys of the habits spec (if that ships first).
- [ ] The component takes a schema, so Omark Time can use it without changes to the component.
- [ ] e2e on both projects: change the theme and a shortcut, reload, both kept; the file holds only those keys.

## 6. Out of scope

- One file or one page that edits both apps' settings at once (section 2).
- Per-device settings (backlog: "Per-device config overrides").
- Storage choice and sign-out, which already have their own places.
