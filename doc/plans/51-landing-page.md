# Landing page and privacy policy at omark.app (#51) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `omark.app` serves a static landing page with a card per app, a privacy policy that Google's review accepts, and terms, deployed from `main`.

**Architecture:** A new workspace package `apps/site`: four hand-written HTML pages and one stylesheet, built by Vite as a multi-page build that ships no JavaScript. The design tokens and Geist font come from the Tasks app, self-hosted. A one-file Pages Function redirects `www` to the bare domain. CI previews each PR that touches the site and deploys `main` to its own Pages project; there is no staging or Promote.

**Tech Stack:** HTML, CSS, Vite 8 (already in the repo), `@fontsource/geist`, Playwright, Vitest, Cloudflare Pages.

**Spec:** [launch spec 6.3.1](../TaskApp%20open%20source%20launch%20spec.md), with [Time spec 10.1 and 10.3](../Omark%20Time%20spec.md) and launch spec 6.4.1 and 6.5 for the policy. Roadmap row 2.2.

## What changes for AL

- `https://omark.app` shows Omark: one line on what it is, a card for Omark Tasks and a card for Omark Time (marked "Coming"), how to start, where your data lives, the principles, open source, and a footer.
- `https://omark.app/privacy/` and `https://omark.app/terms/` exist and are linked from every page. These are what both Google consent screens point at.
- `www.omark.app` redirects to `omark.app`.
- Every PR that touches the site gets a "Site preview" comment; merging to `main` updates `omark.app` within minutes. No Promote.
- AL reads the privacy policy and terms on the PR preview before merge.

## Acceptance criteria

- [ ] The home page has, in this order: the one-liner; the two app cards; how to start (Tasks and Time, three steps each, then install on iPhone and on Chrome or Edge); where your data lives; the principles; open source; the footer.
- [ ] The Omark Tasks card has one line, a screenshot (light and dark) and its buttons. The Omark Time card has one line and says "Coming"; it has no buttons yet.
- [ ] A button or link to something not live yet (the Tasks hosts, the Time hosts, the GitHub repo while private, PHILOSOPHY.md) is plain text "Coming soon", not a dead link. The later items that make them live flip them (see Out of scope).
- [ ] The wordmark is text ("Omark", "Omark Tasks", "Omark Time") inside an element with an empty icon slot, so 2.4 adds the icons without layout changes.
- [ ] Every page's footer links the privacy policy, the terms, `mailto:hello@omark.app` and the MIT licence.
- [ ] The privacy policy covers: who runs Omark and how to reach them; that no Omark server stores user data; the sign-in cookie; the offline cache on the device; the demo; Microsoft OneDrive (`Files.ReadWrite.AppFolder`, `offline_access`, `openid profile`); Google for Omark Tasks (`drive.file`, `openid email`); Google for Omark Time (`calendar.calendarlist.readonly`, `calendar.events.owned.readonly`, `calendar.events.owned`, `drive.file`, `openid email`), each with why and when it is asked; Google's Limited Use statement; no ads, no sale, no AI training, no human reading; Cloudflare as host; how to revoke access and delete data; self-hosted copies are not covered; changes and the date.
- [ ] The terms cover: what the service is; as is, no warranty; limitation of liability; your data is yours and in your storage, keep backups; acceptable use; Microsoft's and Google's terms apply to their services; the code is MIT; we may change or stop the service; governing law; contact.
- [ ] The site sets no cookie, ships no script and makes no request outside its own origin (fonts and images self-hosted). The `_headers` CSP enforces it.
- [ ] Works at phone width (no horizontal scroll at 375 px) and in light and dark mode.
- [ ] A 404 page in the same style.
- [ ] `omark.app` and `www.omark.app` are custom domains of the Pages project `omark-site`; `www` redirects with 301 to `https://omark.app` keeping path and query.
- [ ] CI: the site's e2e runs in both projects; same-repo PRs that touch the site get a preview and a comment; a push to `main` deploys production and checks that `/privacy/` is live.
- [ ] Lighthouse 95+ for performance and accessibility on the home page (checked by hand on the preview, scores quoted in the PR).
- [ ] Docs: `apps/site/README.md` (run, build, deploy, rollback, what to flip when a host goes live); the root README lists the site and its two repository variables; CLAUDE.md's layout lists `apps/site`.

## Tests I'll write first

| Test | Fails before because |
|---|---|
| `apps/site/e2e/home.spec.ts`: sections in order, both cards, Time says Coming, no dead links | there is no site |
| `apps/site/e2e/legal.spec.ts`: privacy lists every scope and the Limited Use statement with its link; terms headings; footer on all four pages | no pages |
| `apps/site/e2e/privacy-guard.spec.ts`: every page makes only same-origin requests, leaves no cookie, has no `<script>`; no horizontal scroll; dark mode changes the background | no site |
| `apps/site/test/www.test.ts`: the redirect rule | no `www.ts` |
| `apps/site/test/source.test.ts`: `_headers` CSP; no `<script`, no absolute URL in `src=`, `<link href=` or CSS `url(` in the sources | no files |
| `tools/ci/test/workflows.test.ts`: site jobs deploy from `apps/site`, are fork-guarded and main-only where they should be | no jobs |

All e2e run in `desktop` and `iphone`.

## Risks

- **Google rejects the homepage or policy.** Mitigation: follow Google's homepage and policy requirements point by point (verified domain, public, describes the apps, links the policy, names match, Limited Use wording and link). The consent-screen app names must be exactly "Omark Tasks" and "Omark Time"; if the staging projects are named "… Staging", they are renamed when they are published (wave 2).
- **The policy says something untrue later.** 3.8 (Google provider) or T.4 may ask for a different scope. Mitigation: the scopes live in one list per app on the policy page, and the PR that changes a scope updates it; the PR template's docs line covers it.
- **Wrangler picks up the root `functions/` (the sign-in helper) into the site.** Mitigation: the site deploys from `apps/site` (`workingDirectory`), so only `apps/site/functions/` ships; a workflows test pins it.
- **The apex record.** `omark.app` already has MX and TXT records (email routing, Search Console). Pages adds a flattened CNAME at the apex, which Cloudflare allows next to them. Check MX and the Search Console TXT are untouched afterwards.
- **`ci.yml` clash with 2.1 (demo deploy job).** New jobs at the end of the file and one added e2e step; whichever merges second merges main.
- **The operator's name and governing law** are AL's to give (see the questions in the hand-over).

## Out of scope

- Icons and favicon: 2.4 fills the icon slots and adds `favicon.svg`.
- `/.well-known/microsoft-identity-association.json`: needs the Omark Entra app id (3.3); added with publisher verification (3.5).
- Flipping "Coming soon" to links: 2.1 (Tasks demo), 3.3/3.6 (Open Tasks), 4.3 (GitHub, CONTRIBUTING), 2.3 (PHILOSOPHY), T.7 and T.9 (Time). `apps/site/README.md` lists each.
- A Time screenshot, until T.6.
- A shared design-tokens package: the site imports `apps/tasks/src/styles/tokens.css` directly for now.
- Polish or other translations.

## Global Constraints

- No framework, no tracking, no cookies, no third-party requests; fonts self-hosted (spec 6.3.1).
- Phone width and light and dark mode, using the app's design tokens (6.3.1).
- Deploys to its own Pages project from `main`, no staging step (6.3.1).
- Names: "Omark", "Omark Tasks", "Omark Time"; hosts `tasks.omark.app`, `demo-tasks.omark.app`, `time.omark.app`, `demo-time.omark.app`; contact `hello@omark.app`; licence MIT.
- Plain, short English (CLAUDE.md, Style). Commit messages short imperative sentences.
- Vite's `build.assetsInlineLimit` is 0, so nothing becomes a `data:` URL.

## Review Focus

1. **A page reached without the trailing slash** (`/privacy`, `/terms`): Pages redirects to `/privacy/`; links in the site always use the slash form. Test: `legal.spec.ts` follows every footer link and expects 200.
2. **Dark mode on the screenshot:** the dark screenshot shows in dark mode, not a white block. Test: `privacy-guard.spec.ts` in dark checks the `<picture>` picked `tasks-dark`.
3. **Long words at 320 px** (scope names like `calendar.events.owned.readonly`) must wrap, not scroll sideways. Test: the no-horizontal-scroll check runs on the privacy page at 320 px too.
4. **A `www` request to a deep path with a query** keeps both. Test: in `www.test.ts`.
5. **Preview hosts** (`*.omark-site.pages.dev`) are not redirected. Test: in `www.test.ts`.

---

## File structure

```
apps/site/
  package.json            name "site"; scripts dev, build, preview, typecheck, e2e, test
  vite.config.ts          root src, outDir ../dist, four inputs, assetsInlineLimit 0, publicDir ../public
  tsconfig.json           for functions/, www.ts, tests, configs
  playwright.config.ts    desktop + iphone, port from apps/tasks/e2e/port.ts plus 1000
  vitest.config.ts
  README.md
  www.ts                  wwwRedirect(url) — pure, used by the middleware
  functions/_middleware.ts
  public/_headers         CSP and security headers
  public/robots.txt
  src/site.css            tokens import, fonts, layout
  src/index.html  src/privacy/index.html  src/terms/index.html  src/404.html
  src/img/tasks-light.png  src/img/tasks-dark.png
  e2e/home.spec.ts  e2e/legal.spec.ts  e2e/privacy-guard.spec.ts  e2e/pages.ts
  test/www.test.ts  test/source.test.ts
```

Shared files touched: `vitest.config.ts` (add `apps/site`), `.github/workflows/ci.yml`, `tools/ci/test/workflows.test.ts`, `README.md`, `CLAUDE.md`, `pnpm-lock.yaml`.

### Task 1: The package and the home page

**Files:** create `apps/site/{package.json,vite.config.ts,tsconfig.json,playwright.config.ts,vitest.config.ts}`, `src/index.html`, `src/site.css`, `src/img/*`, `e2e/pages.ts`, `e2e/home.spec.ts`; modify `vitest.config.ts` (root).

**Interfaces:**
- Produces: `e2e/pages.ts` exports `PAGES = ['/', '/privacy/', '/terms/', '/404.html']` and `expectNoSideScroll(page)`. CSS classes `.brand`, `.brand-icon` (empty, `aria-hidden`), `.wordmark`, `.card`, `.coming`, `footer.site-footer`. Later pages copy the header and footer markup from `index.html`.
- Dependencies: `@fontsource/geist` (same range as Tasks), devDependencies `vite`, `@playwright/test`, `typescript`, `vitest`, `wrangler@4.151.1` (same versions as the workspace).

- [ ] **Step 1: Write the failing e2e** `home.spec.ts`:
  - `shows the sections in order`: the `h2` texts of `main` equal `['Omark Tasks', 'Omark Time', 'How to start', 'Where your data lives', 'Principles', 'Open source']` (cards' titles are `h2`); the `h1` contains "plain files".
  - `marks Omark Time as coming`: the Time card contains "Coming" and no `a`.
  - `has no dead links`: every `a[href^="/"]` returns 200 via `page.request`; every absolute `a[href]` host is in `['omark.app', 'github.com', 'developers.google.com', 'policies.google.com', 'www.microsoft.com', 'myaccount.google.com', 'account.live.com', 'opensource.org']` or the href is `mailto:hello@omark.app`.
  - `has the wordmark with an icon slot`: `.brand .brand-icon` exists and `.brand .wordmark` reads "Omark".
- [ ] **Step 2: Run** `pnpm --filter site e2e` — expected FAIL (no package / page). Save the failing line.
- [ ] **Step 3: Write the package, config and `index.html`.** Copy per spec 6.3.1 in its order; buttons not live yet render as `<span class="button coming">Coming soon</span>`. `site.css` starts `@import "../../tasks/src/styles/tokens.css"; @import "@fontsource/geist/latin-400.css"; @import "@fontsource/geist/latin-600.css";`. Screenshots: capture the Tasks fake build (`apps/tasks` e2e server, iPhone 15 viewport, light and dark) once with Playwright, save as PNG at 2x, under 150 kB each; show them in `<picture>` with a `(prefers-color-scheme: dark)` source and explicit `width`/`height`. The Playwright port is `e2ePort(cwd, env) + 1000` so it never collides with Tasks' preview. Add `'apps/site'` to the root `vitest.config.ts` projects.
- [ ] **Step 4: Run** `pnpm --filter site e2e` — PASS in both projects.
- [ ] **Step 5: Commit** "Add the omark.app landing page".

### Task 2: Privacy policy, terms and 404

**Files:** create `src/privacy/index.html`, `src/terms/index.html`, `src/404.html`, `e2e/legal.spec.ts`.

**Interfaces:** consumes the header, footer and classes from Task 1.

- [ ] **Step 1: Write the failing e2e** `legal.spec.ts`:
  - `footer on every page`: for each of `PAGES`, the footer has links with `href` `/privacy/`, `/terms/`, `mailto:hello@omark.app`, and one whose text contains "MIT".
  - `privacy lists every scope`: the page text contains each of `Files.ReadWrite.AppFolder`, `offline_access`, `drive.file`, `openid`, `calendar.calendarlist.readonly`, `calendar.events.owned.readonly`, `calendar.events.owned`; a section with `id="google"` contains "Limited Use" and a link to `https://developers.google.com/terms/api-services-user-data-policy`.
  - `privacy says no data on our servers and one sign-in cookie`: text contains "We don't store your data on our servers" and "sign-in cookie".
  - `privacy and terms show a date`: a `time[datetime]` in each.
  - `terms headings`: `h2`s include "No warranty", "Limitation of liability", "Your data", "Governing law".
  - `404 page`: `/does-not-exist` has status 404 under Pages; under Vite preview just check `/404.html` renders the footer and a link home.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Write the pages.** The Google section ends with this sentence, verbatim apart from the names: "Omark Tasks' and Omark Time's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements." Each scope is a row in a table per app: scope, why, when asked (from Time spec 10.1 and launch spec 6.4.1, 6.5). Operator and governing law from AL's answers. Add the two inputs to `vite.config.ts`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** "Add the privacy policy, terms and 404 page".

### Task 3: No cookies, no scripts, no outside requests, phone and dark

**Files:** create `public/_headers`, `public/robots.txt`, `test/source.test.ts`, `e2e/privacy-guard.spec.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `source.test.ts`: `_headers` has, under `/*`, `Content-Security-Policy: default-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. No file under `src/` contains `<script`; no `src="http`, `<link … href="http` or `url(http`.
  - `privacy-guard.spec.ts`, for each of `PAGES`: every request's origin equals the page's origin; `context.cookies()` is empty after the visit; `page.locator('script')` count is 0; `expectNoSideScroll` at the project's width and at 320 px.
  - `dark mode`: with `colorScheme: 'dark'` the computed `body` background differs from light, and the Tasks screenshot's `currentSrc` contains `tasks-dark`.
- [ ] **Step 2: Run** — FAIL (no `_headers`, and whatever the earlier pages miss).
- [ ] **Step 3: Write `_headers` and fix what fails** (e.g. wrapping of scope names with `overflow-wrap: anywhere` in tables).
- [ ] **Step 4: Run** `pnpm --filter site test` and `pnpm --filter site e2e` — PASS.
- [ ] **Step 5: Commit** "Lock the site to its own origin".

### Task 4: www redirect

**Files:** create `www.ts`, `functions/_middleware.ts`, `test/www.test.ts`.

**Interfaces:** produces `wwwRedirect(url: URL): Response | null` — a 301 to the same path and query on the bare host when the host starts with `www.`, else `null`. `_middleware.ts` exports `onRequest: PagesFunction` that returns `wwwRedirect(new URL(request.url)) ?? next()`.

- [ ] **Step 1: Write the failing test:** `https://www.omark.app/privacy/?a=1` → 301 with `Location` `https://omark.app/privacy/?a=1`; `https://omark.app/` → `null`; `https://pr-3.omark-site.pages.dev/` → `null`.
- [ ] **Step 2: Run** `pnpm --filter site test` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; `pnpm --filter site typecheck` passes.
- [ ] **Step 5: Commit** "Redirect www.omark.app to omark.app".

### Task 5: CI and deploy

**Files:** modify `.github/workflows/ci.yml`, `tools/ci/test/workflows.test.ts`; create `apps/site/README.md`; modify `README.md`, `CLAUDE.md`.

**Interfaces:** repository variables `CF_SITE_PROJECT` (`omark-site`) and `SITE_URL` (`https://omark.app`).

- [ ] **Step 1: Write the failing tests** in `workflows.test.ts`:
  - `site jobs deploy only apps/site`: `site-preview` and `site-production` have a wrangler step with `workingDirectory: apps/site` and a command starting `pages deploy dist --project-name=${{ vars.CF_SITE_PROJECT }}`.
  - `site-preview` is fork-guarded and needs `DEPLOY_ENABLED` (the existing `forkProblems` check covers it once the job exists); `site-production`'s `if` starts with `MAIN_ONLY`.
  - the `e2e` job runs `pnpm --filter site e2e --project=${{ matrix.project }}`.
  - Changed existing test: "gives every deployed build the CI run number" now looks only at `pnpm --filter tasks build` steps, because the site has no build number. The PR says so.
- [ ] **Step 2: Run** `pnpm test -- workflows` — FAIL.
- [ ] **Step 3: Add the jobs.** `site-preview`: same guard as `tasks-preview`, needs `[check, e2e]`, `fetch-depth: 0`, skips its remaining steps unless `git diff --quiet origin/$BASE...HEAD -- apps/site apps/tasks/src/styles/tokens.css pnpm-lock.yaml` finds a change, builds, deploys `--branch=pr-<n>`, comments with marker `<!-- site-preview -->` linking `/`, `/privacy/` and `/terms/`. `site-production`: `MAIN_ONLY` + `DEPLOY_ENABLED`, needs `[check, e2e]`, concurrency group `site`, builds, deploys `--branch=main`, then `curl -fsSL "$SITE_URL/privacy/" | grep -q "Limited Use"`. Add the site e2e step to `e2e`. Write `apps/site/README.md` (run, build, deploy, rollback by re-running an older `site-production` job or Cloudflare's rollback, the "Coming soon" flip list); add the site and its variables to the root README and `apps/site` to CLAUDE.md's layout.
- [ ] **Step 4: Run** the four commands — all PASS.
- [ ] **Step 5: Commit** "Deploy the site from CI".

### Task 6: Cloudflare and DNS (done by Claude, no code)

- [ ] `wrangler pages project create omark-site --production-branch main`.
- [ ] Add custom domains `omark.app` and `www.omark.app` through the Pages API (wrangler OAuth token). If Pages doesn't create the records, add proxied CNAMEs `omark.app` and `www` → `<subdomain>.pages.dev` with the DNS token.
- [ ] Check the MX records and the Search Console TXT record are unchanged.
- [ ] Set the repository variables `CF_SITE_PROJECT` and `SITE_URL` with `gh api`.
- [ ] Push; the PR gets its site preview. Run Lighthouse on the preview (desktop and mobile) and quote the scores.
- [ ] Until the merge, `omark.app` serves nothing; once AL merges, `site-production` deploys and its curl check passes.

### Hand-over

PR with `Closes #51`, the failing lines, the changed existing test, the Lighthouse scores, the fresh-eyes review's findings fixed, and `NEEDS AL`: read the privacy policy and terms on the preview, then merge.
