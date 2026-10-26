# Omark brand

The icon family for Omark apps. The source is `src/family.ts`; everything else here is generated from it.

## The family rule

- Every icon is a solid tile with a thick ring: the O of Omark.
- Each app has its own tile colour and one glyph inside the ring (Tasks: a tick, Time: clock hands).
- The brand mark is the bare ring on ink. Staging builds swap the colours: a cream tile with a coloured ring.

## Palette

| name | value | use |
|---|---|---|
| ink | `#151A22` | the Omark brand tile |
| blue | `#2B59D6` | Tasks tile |
| green | `#2C8A55` | Time tile |
| white | `#FFFFFF` | ring and glyph |
| staging | `#F6E7C8` | staging tile |

## Files

Run `pnpm --filter @omark/brand render` after any change to `src/`. The test fails with "stale" if you forget.

| files | where they go |
|---|---|
| `apps/tasks/public/icons/` (192, 512, maskable 512, apple-touch-icon, favicon-32, favicon.svg) | the Tasks app |
| `apps/tasks/public/icons/staging/` (same six) | the Tasks staging build |
| `png/time/` (same six) | the Time app (see below) |
| `png/omark/` (same six) | the Omark landing page |
| `png/omark-avatar-500.png` | GitHub and social avatars |
| `png/social-preview.png` (1280x640) | the repo social preview and link cards |
| `svg/omark-mark.svg`, `svg/tasks.svg`, `svg/time.svg` | full-bleed sources for other tools |
| `svg/favicon-{omark,tasks,time}.svg` | rounded favicons with thicker strokes |
| `png/sources.json` | a hash of each PNG's source, used by the freshness test |
| `contact-sheet.html` | every PNG at 1x on a light and a dark ground |

Rounded icons have transparent corners. The apple-touch and maskable icons are full-bleed, because iOS and Android apply their own mask.

## Adding an app

1. Add a glyph and a tile colour in `src/family.ts`.
2. Add an `appSet(...)` line in `src/outputs.ts`.
3. Run `pnpm --filter @omark/brand render`, then check `contact-sheet.html`.

## For the landing page

Take `png/omark/favicon.svg`, `png/omark/favicon-32.png`, `png/omark/apple-touch-icon.png` and `png/social-preview.png`, plus the app icons from `apps/tasks/public/icons/` and `png/time/`.

Write the text wordmark as Geist Bold "Omark" with letter-spacing -0.03em. The ring from `svg/omark-mark.svg` may stand in for the O.

## For apps/time

Copy or point the Time set (`png/time/`) at `apps/time/public/icons/`.
