# Omark icon family (#62) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Omark icon family, drawn once in code, that gives Omark Tasks its full icon set (production and staging), Omark Time its set for later, and the landing page its brand mark, avatar and social preview.

**Architecture:** A new workspace package `@omark/brand` in `brand/` holds the family as data (tile, frame, glyphs, palette) and turns it into SVG strings (pure, unit-tested). A render script writes those SVGs to `brand/svg/`, rasterises them with Playwright's Chromium into PNGs, and copies each output to its targets (`brand/png/…`, `apps/tasks/public/icons/…`). PNGs are committed; CI does not render, it checks that every PNG exists at the right size and was made from the current source (a hash file).

**Tech Stack:** TypeScript run with `node --experimental-strip-types`, Vitest, Playwright (already in the lockfile), `@fontsource/geist` and `@fontsource/ibm-plex-mono` (already in the lockfile) for the social preview.

**Spec:** `doc/TaskApp open source launch spec.md` 6.6 (icon family), 6.3.1 (landing page); roadmap 2.4 in `doc/plans/open-source-launch-roadmap.md`. Directions mockup: `doc/mockups/icons/directions.html` (published at https://claude.ai/artifact/Pq9cP3JbfTNGe6nPAbMgRt).

## What changes for AL

- Omark Tasks gets a real icon from the picked direction: on the home screen, in the browser tab, and when installed on Windows. The old tick-on-blue square goes.
- Staging gets its own icon on the cream staging colour, so the two home-screen icons are easy to tell apart.
- `brand/` holds everything else the launch needs: the Omark brand mark, a 500 px avatar for the GitHub org, the 1280×640 social preview, and the Omark Time icons ready for `apps/time`.
- Changing or adding an icon later is: edit `brand/src/family.ts`, run `pnpm --filter @omark/brand render`, commit.

## Acceptance criteria

- [ ] AL picked a direction; `brand/src/family.ts` draws it, and `brand/README.md` states its family rule.
- [ ] `brand/svg/` has `omark-mark.svg`, `tasks.svg`, `time.svg` (full-bleed 512 sources) and `favicon-omark.svg`, `favicon-tasks.svg`, `favicon-time.svg` (rounded tiles).
- [ ] Omark Tasks, production: `icon-192.png`, `icon-512.png` (rounded, transparent corners, purpose `any`), `icon-512-maskable.png` (full-bleed, purpose `maskable`), `apple-touch-icon.png` (180, full-bleed, opaque), `favicon.svg`, `favicon-32.png`, all in `apps/tasks/public/icons/`.
- [ ] Omark Tasks, staging: the same six files in `apps/tasks/public/icons/staging/`, on the `#F6E7C8` tile; `manifest-staging.webmanifest` and the staging page use them.
- [ ] Omark Time: the same six files in `brand/png/time/`, not wired anywhere yet.
- [ ] Suite: `brand/png/omark-avatar-500.png` and `brand/png/social-preview.png` (1280×640).
- [ ] Every glyph stays inside the maskable safe zone, uses only colours from `tokens.css` (plus `#FFFFFF` and `#F6E7C8`), and has 3:1 contrast or more against its tile.
- [ ] Unit tests prove the above; a freshness test fails with "run pnpm --filter @omark/brand render" when a PNG is missing, the wrong size or older than its source.
- [ ] e2e (desktop and iphone): the manifest lists 192 `any`, 512 `any` and 512 `maskable`; the page links the SVG favicon, the 32 px PNG and the apple-touch-icon; every icon URL answers 200 with an image type. Staging (desktop, as `environment.spec.ts` does): manifest and links point at `/icons/staging/`.
- [ ] `brand/README.md` says how the landing page and `apps/time` take their files, and how to write the text wordmark (font, weight, case, letter-spacing).
- [ ] Installed on AL's iPhone from the PR preview, the home-screen icon is the new one.

## Tests I'll write first

- `brand/src/family.test.ts`: safe zone, palette, contrast, staging variant, shapes (Task 1).
- `brand/src/outputs.test.ts`: every target exists, right size, hash matches (Task 2). Fails first with `ENOENT … brand/png/omark-avatar-500.png`.
- `apps/tasks/src/lib/icons.test.ts`: `iconsFor('staging')` (Task 3).
- `apps/tasks/e2e/icons.spec.ts`: manifest and links (Task 3). Fails first with `Expected: true, Received: false` on the maskable entry.
- One more case in `apps/tasks/e2e/environment.spec.ts` for the staging icons (Task 3).

## Risks

- **iOS keeps the old icon** until the app is removed and added again from the home screen. "Try this" says so.
- **Two sessions touch shared files.** This plan edits `pnpm-workspace.yaml` (one line), `vitest.config.ts` (one entry), `apps/tasks/vite.config.ts` (the icons array), `apps/tasks/index.html` (the icon links) and `apps/tasks/src/main.ts` (one call). The demo work (2.1) also edits `apps/tasks`; keep these edits small and merge `main` before the PR.
- **Rasterising differs by OS**, so the freshness check hashes the SVG source, never the PNG bytes.
- **16 px legibility** can't be unit-tested. The favicon tiles use slightly thicker strokes (`small: true`), and the PR shows a contact sheet for AL to judge.

## Out of scope

- The landing page itself and its copy of the files (2.2 takes them from `brand/`).
- `apps/time` and its manifest (it doesn't exist yet).
- A Windows `.ico` (the 32 px PNG and the SVG cover every current browser) and Android monochrome icons.
- Uploading the GitHub org avatar and the social preview: a `needs-human` step for AL after merge, listed in the PR.

## Global Constraints

- Colours: only values from `apps/tasks/src/styles/tokens.css` (light and dark sets), plus `#FFFFFF` and the staging colour `#F6E7C8`.
- Maskable safe zone: everything drawn sits inside the centre circle of radius 40% (204.8 at 512).
- Output sizes: 192, 512, maskable 512, apple-touch-icon 180, favicon SVG + 32 px PNG, avatar 500, social preview 1280×640.
- No new third-party package: Playwright and the two `@fontsource` packages are already in the lockfile; reuse their versions.
- Don't create or edit anything under `apps/site/` (2.2 owns it) or the CI workflow.
- Plain, short English in the README and comments; commit messages are short imperative sentences.

## Review Focus

- **Apple-touch-icon with transparent corners** shows black corners on iOS. Expect: apple-touch and maskable outputs are full-bleed squares. Pinned in Task 1 (`shape` per output kind) and Task 2 (registry test).
- **Staging and production installed side by side** must differ at a glance. Expect: staging tile is `#F6E7C8`, production is not. Pinned in Task 1.
- **A source edited without re-rendering** ships stale PNGs. Expect: a failing test naming the command. Pinned in Task 2.
- **The staging page on iPhone** reads `apple-touch-icon` from the DOM when added to the home screen, after boot. Expect: the staging link is set before mount. Pinned in Task 3 (unit test on `applyIcons`, e2e on desktop; the iPhone check is by hand on staging, as for the staging name today).
- **A dark browser tab** with a dark tile hides the tile edge. Expect: the glyph still reads, since it is light on the tile. Pinned by the contrast test in Task 1 and the contact sheet in Task 2.

---

### Task 1: The family as data, in `@omark/brand`

**Files:**
- Create: `brand/package.json`, `brand/tsconfig.json`, `brand/vitest.config.ts` (copy the shape of `tools/todoist-import/`)
- Create: `brand/src/family.ts`, `brand/src/family.test.ts`
- Modify: `pnpm-workspace.yaml` (add `- brand`), `vitest.config.ts` (add `'brand'` to `projects`)

**Interfaces:**
- Produces:
  ```ts
  export type App = 'tasks' | 'time' | 'omark';            // 'omark' is the brand mark
  export type Variant = 'production' | 'staging';
  export type Shape = 'square' | 'rounded';                 // square = full bleed; rounded = radius 22.5%, transparent corners
  export type Mark =
    | { kind: 'line'; points: [number, number][]; width: number; color: string; cap: 'round' | 'square' }
    | { kind: 'circle'; cx: number; cy: number; r: number; width: number | null; color: string } // width null = filled
    | { kind: 'path'; d: string; bounds: [number, number, number, number]; color: string };       // filled shape, e.g. C's page
  export interface IconSpec { tile: string; marks: Mark[] }  // 512×512 space
  export function iconSpec(app: App, variant?: Variant, opts?: { small?: boolean }): IconSpec;
  export function iconSvg(app: App, opts?: { variant?: Variant; shape?: Shape; small?: boolean }): string;
  export const PALETTE: Readonly<Record<string, string>>;  // named colours used by the family
  ```
- `small: true` (favicons) multiplies line widths by 1.2.

- [ ] **Step 1: Write the failing tests** in `brand/src/family.test.ts`:
  - `every mark stays in the maskable safe zone`: for each app × variant × small, every `line` point and `circle` edge plus half its width, and every `path` bounds corner, is within 204.8 of (256, 256).
  - `uses only token colours`: read `apps/tasks/src/styles/tokens.css`, collect every `#RRGGBB`; each `tile` and mark `color` (uppercased) is in that set ∪ {`#FFFFFF`, `#F6E7C8`}.
  - `glyphs have 3:1 contrast with the tile`: WCAG relative-luminance ratio of every mark colour against its `tile` is ≥ 3 (a filled `path` the glyph sits on, like C's page, counts as the glyph's ground instead).
  - `staging differs from production`: `iconSpec(app, 'staging').tile === '#F6E7C8'` and `iconSpec(app, 'production').tile !== '#F6E7C8'` for `tasks` and `time`.
  - `shapes`: `iconSvg('tasks', { shape: 'square' })` contains `<rect width="512" height="512"` with no `rx`; `shape: 'rounded'` has `rx="115.2"`; both start with `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"`.
- [ ] **Step 2: Run** `pnpm vitest run --project brand`. Expected: FAIL, `Cannot find module './family.ts'`.
- [ ] **Step 3: Implement `brand/src/family.ts`.** Port the picked direction's `icon(app)` from `doc/mockups/icons/directions.html` into `Mark` data (the mockup's `notes` glyph is not ported). Staging: tile `#F6E7C8`; any light frame or glyph colour becomes ink `#151A22`, and the app colour switches to its light-theme token (`#2B59D6`, `#A84C08`, `#2C8A55`) so the contrast test holds. `iconSvg` serialises the marks with `stroke-linejoin` matching the cap.
- [ ] **Step 4: Run** `pnpm vitest run --project brand`, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `Add the Omark icon family as data`.

### Task 2: Render the outputs and check they are fresh

**Files:**
- Create: `brand/src/outputs.ts` (the registry), `brand/src/render.ts` (the script), `brand/src/social.html` (social preview template), `brand/src/outputs.test.ts`
- Create (generated): `brand/svg/*.svg`, `brand/png/**`, `brand/png/sources.json`, `apps/tasks/public/icons/**`, `brand/contact-sheet.html`
- Create: `brand/README.md`
- Modify: `brand/package.json` (script `render`, devDependencies `playwright`, `@fontsource/geist`, `@fontsource/ibm-plex-mono` at the lockfile's versions)

**Interfaces:**
- Consumes: `iconSvg`, `App`, `Variant`, `Shape` from Task 1.
- Produces:
  ```ts
  export interface Output { path: string; size: [number, number]; svg: () => string } // path from the repo root
  export const OUTPUTS: Output[];
  export function sourceHash(o: Output): string; // sha256 hex of `${o.size}:${o.svg()}`
  ```
  `brand/png/sources.json` maps each PNG `path` to its `sourceHash`.

`OUTPUTS` (one `appSet(app, variant, dir)` helper makes the six per-app files):

| file in `dir` | size | svg |
|---|---|---|
| `icon-192.png` | 192 | rounded |
| `icon-512.png` | 512 | rounded |
| `icon-512-maskable.png` | 512 | square |
| `apple-touch-icon.png` | 180 | square |
| `favicon-32.png` | 32 | rounded, small |
| `favicon.svg` | n/a, written as text | rounded, small |

Sets: tasks/production → `apps/tasks/public/icons/`; tasks/staging → `apps/tasks/public/icons/staging/`; time/production → `brand/png/time/`. Suite: `brand/png/omark-avatar-500.png` (omark, square, 500); `brand/png/social-preview.png` (1280×640, from `social.html`: ink ground, the brand mark, the wordmark as the picked direction writes it, the line "Small plain-file tools you own.", and the Tasks and Time icons with their names); `brand/svg/{omark-mark,tasks,time}.svg` (square) and `brand/svg/favicon-{omark,tasks,time}.svg` (rounded, small).

- [ ] **Step 1: Write the failing test** `brand/src/outputs.test.ts`:
  - `every PNG exists at its size`: for each PNG output, read bytes 16–23 (IHDR width and height, big-endian) and expect them to equal `size`.
  - `every PNG was made from the current source`: `sources.json[path] === sourceHash(o)`, failing with the message `stale: run pnpm --filter @omark/brand render`.
  - `full-bleed where iOS and Android mask`: outputs named `apple-touch-icon.png` or `*-maskable.png` come from `shape: 'square'`; `icon-192.png` and `icon-512.png` from `'rounded'`.
  - `every SVG output on disk matches iconSvg`.
- [ ] **Step 2: Run** `pnpm vitest run --project brand`. Expected: FAIL with `ENOENT … brand/png/omark-avatar-500.png`; save the line for the PR.
- [ ] **Step 3: Implement `render.ts`**: launch Chromium, for each output `page.setViewportSize(size)`, `page.setContent` with the SVG (or `social.html` with the fonts as `file://` URLs) and `screenshot({ path, omitBackground: true })` for rounded, `false` for square; write SVG files as text; write `sources.json`; write `contact-sheet.html` showing every PNG at 1× on light and dark grounds. Script: `"render": "node --experimental-strip-types --disable-warning=ExperimentalWarning src/render.ts"`.
- [ ] **Step 4: Run** `pnpm --filter @omark/brand render`, then `pnpm vitest run --project brand`. Expected: PASS. Open `brand/contact-sheet.html` and look at 16 and 32 px on both grounds.
- [ ] **Step 5: Write `brand/README.md`**: the family rule in three lines; the palette; a table of every file and where it goes; "Adding an app": add a glyph in `family.ts`, an `appSet` line in `outputs.ts`, run render; "For the landing page": take `svg/favicon-omark.svg`, `png/social-preview.png` and the `omark` apple-touch set from `brand/`, and write the text wordmark as the picked direction does (font, weight, case, letter-spacing); "For apps/time": point the time set at `apps/time/public/icons/`.
- [ ] **Step 6: Commit** `Render the icon set and check it is fresh`.

### Task 3: Wire the icons into Omark Tasks

**Files:**
- Create: `apps/tasks/src/lib/icons.ts`, `apps/tasks/src/lib/icons.test.ts`, `apps/tasks/e2e/icons.spec.ts`
- Modify: `apps/tasks/vite.config.ts` (manifest `icons`), `apps/tasks/public/manifest-staging.webmanifest`, `apps/tasks/index.html` (icon links), `apps/tasks/src/main.ts` (one call after `applyLook`), `apps/tasks/e2e/environment.spec.ts` (one added test)

**Interfaces:**
- Consumes: the files from Task 2 at `/icons/…` and `/icons/staging/…`.
- Produces:
  ```ts
  export interface PageIcons { favicon: string; favicon32: string; appleTouch: string }
  export function iconsFor(env: AppEnv): PageIcons | null;   // null = keep the links in index.html
  export function applyIcons(icons: PageIcons, doc: Document): void;
  ```
  Kept out of `environment.ts` so the demo work there doesn't conflict.

- [ ] **Step 1: Write the failing tests.**
  - `icons.test.ts`: `iconsFor('staging')` equals `{ favicon: '/icons/staging/favicon.svg', favicon32: '/icons/staging/favicon-32.png', appleTouch: '/icons/staging/apple-touch-icon.png' }`; `iconsFor` is `null` for `production`, `preview` and `local`; `applyIcons` on a document built from `index.html`'s head sets the three `href`s.
  - `e2e/icons.spec.ts` (both projects): `manifest lists 192, 512 and a maskable 512` (exact `icons` array: `{src:'icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'}`, the 512 `any`, and `icons/icon-512-maskable.png` `maskable`); `page links the favicons and the apple-touch-icon` (`link[rel="icon"][type="image/svg+xml"]` → `/icons/favicon.svg`, `link[rel="icon"][sizes="32x32"]` → `/icons/favicon-32.png`, `link[rel="apple-touch-icon"]` → `/icons/apple-touch-icon.png`); `every icon answers with an image` (each URL above: 200 and `content-type` starts with `image/`).
  - `environment.spec.ts`: `staging host gets the staging icons`: the three links and every manifest icon `src` start with `/icons/staging/`, and each answers 200.
- [ ] **Step 2: Run** `pnpm --filter tasks test` and `pnpm --filter tasks e2e -- icons environment`. Expected: FAIL (`Cannot find module './icons.ts'`; the maskable entry missing). Save the e2e line for the PR.
- [ ] **Step 3: Implement.** Manifest icons as in the test; staging webmanifest the same with `/icons/staging/` paths; `index.html` gets the three links; `main.ts` calls `applyIcons` with `iconsFor(env)` (when not null) right after `applyLook(LOOK, document)`, before mount. `includeAssets` lists `icons/apple-touch-icon.png` and `icons/staging/apple-touch-icon.png`.
- [ ] **Step 4: Run** all four commands: `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm --filter tasks build`. Expected: all green.
- [ ] **Step 5: Docs.** In the v1 spec, add one line under the `apps/tasks` row of the layout table pointing to `brand/README.md` for icons; tick 2.4 in the roadmap with the PR number.
- [ ] **Step 6: Commit** `Use the Omark icons in Omark Tasks`.

### Hand over

- [ ] Fresh-eyes review subagent on `git diff main...HEAD` against this plan; fix what holds up; re-run the four commands.
- [ ] Merge `main`, push, open the PR from the template (`Closes #62`), with the contact sheet attached and these steps under "Try this on the phone": remove the old Omark Tasks icon from the home screen; open the preview in Safari → Share → Add to Home Screen; check the icon and its name. `needs-human` after merge: upload `brand/png/omark-avatar-500.png` as the org avatar and `brand/png/social-preview.png` as the repo's social preview.
