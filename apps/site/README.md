# Site

The omark.app landing page, privacy policy and terms. Plain static HTML and CSS built with Vite into `dist/`, plus one Pages Function (`functions/_middleware.ts`) that redirects `www.omark.app` to `omark.app`, and `public/_headers`.

## Run

| command | what it does |
| --- | --- |
| `pnpm --filter site dev` | dev server |
| `pnpm --filter site build` | build into `apps/site/dist` |
| `pnpm --filter site e2e` | Playwright tests (`desktop` and `iphone`) |

## Deploy

Needs the repository variables `DEPLOY_ENABLED`, `CF_SITE_PROJECT` and `SITE_URL` (root README, Environment variables).

- **Pull request:** `site-preview` deploys a preview to `pr-<n>` and comments the link, but only when the PR changes `apps/site`, `apps/tasks/src/styles/tokens.css` or `pnpm-lock.yaml`.
- **Merge to main:** `site-production` deploys to https://omark.app, then checks that `/privacy/` is live. There is no staging and no Promote.

Both jobs deploy from `apps/site`, so wrangler bundles only this folder's `functions/`, never the sign-in helper in the root `functions/`.

**Rollback:** Cloudflare dashboard, `omark-site`, Deployments, Rollback, or revert the commit on `main`. Re-running an older run's `site-production` job doesn't work: a deploy job skips when its commit is no longer main's tip (#81).

## Privacy policy

A PR that changes a sign-in scope or cookie must update `src/privacy/index.html`.

## "Coming soon" to flip

When these ship, turn the "Coming soon" label into a link:

- 3.3 / 3.6: Tasks "Open" to https://tasks.omark.app
- 2.3: the PHILOSOPHY link
- 4.3: the GitHub repo and CONTRIBUTING links
- T.7: Time demo to https://demo-time.omark.app
- T.9: Time "Open" to https://time.omark.app
- 3.5: `/.well-known/microsoft-identity-association.json`
