# #153: Count visits and sign-ins on the server, anonymously

## What changes for users

Nothing they can see, and no script, cookie or identifier is added. The site, the demo and the sign-in helper add one line to a count in Cloudflare Analytics Engine:

- **A visit** to omark.app or the demo: the host, the page, the referring site's host (never the full address), the country Cloudflare reports, and the time. Only real page loads count (`Sec-Fetch-Dest: document`), so asset files and most bots are skipped.
- **A sign-in** that succeeded: the provider and any access added, and the time.

No IP address, user agent, account name, token or file content is written. Analytics Engine stamps each row with its time, so the policy says "the time", not "the day". It keeps rows for 3 months.

The privacy policy changes from "no analytics" to exactly this. Being plain about it matters more than the numbers.

## Acceptance criteria

- [ ] A small package, `packages/counts`, with `countVisit` and `countSignIn`. Each builds a row from fixed fields only, and does nothing when the `COUNTS` binding is missing, so staging and previews stay uncounted. Neither can throw to its caller.
- [ ] `apps/site/functions/_middleware.ts` counts visits, next to the www redirect, which keeps working.
- [ ] `apps/site` has a `_routes.json` that runs functions on page paths only, so assets don't use up the free plan's daily function requests.
- [ ] The demo gets its own small middleware that only counts, and a `_routes.json` for page paths. The app's functions stay out, and `tools/ci/check-demo.mjs` still proves the sign-in helper isn't on the demo.
- [ ] `ci.yml` and `tools/ci/local-deploy.mjs` deploy the demo with that middleware.
- [ ] `handleAuth` takes an optional `count` in `Deps` and calls it only when a sign-in succeeds. `apps/omark/functions/api/auth/[[path]].ts` passes it. A failing count never changes the response.
- [ ] The privacy policy (its text and its description), `README.md`, `SECURITY.md`, `REVIEW.md` and the comment on `handleAuth` say exactly what is counted, and no longer say "no analytics" or "keeps nothing". They still say no tokens, account names or files are kept, and that there's no script, no cookie and no tracking of a person.
- [ ] `doc/self-hosting.md` lists the optional `COUNTS` binding. A self-hosted copy without it counts nothing.

## Tests I'll write first

- `packages/counts`: a visit's row holds only the fixed fields. A referrer is cut to its host, and a bad one is dropped. Anything but `Sec-Fetch-Dest: document` isn't counted. A missing binding and a binding that throws do nothing.
- `packages/signin`: `count` is called once on a successful callback, with the provider and access only. It isn't called on any failure path. A throwing `count` still signs in.
- `apps/site`: the middleware counts a page load and passes it on, and www still redirects. `_routes.json` leaves assets out.
- `tools/ci/test/workflows.test.ts`: the demo deploy ships only the counting middleware, and `check-demo` still runs after it.
- `apps/site` e2e or `docs.test.ts`: the privacy page names what is counted and no longer says "no analytics".

## Risks

- **The launch audience reads the privacy policy.** "No analytics" is a strong line to give up, and the change is public in the repo's history. Mitigation: plain wording, no script and no cookie, and the code is open.
- **A privacy policy Google has just verified changes.** The permissions Omark asks for don't change, and the policy stays accurate, so I don't expect a new verification. I can't confirm that from here.
- **Legal.** With no cookie and nothing stored on the device, I don't expect a consent banner to be needed, but this isn't legal advice. Cloudflare sees IP addresses as the host either way, and the policy already covers that.
- **Sign-in is the riskiest place to add a line.** Mitigation: the count runs after the session is built, can't throw, and is tested on every path.
- **Untestable against real Cloudflare before merge.** The worst case is missing numbers. Staging has no binding, so a real check comes on the site after merge and on the app after Promote.
- **Undercounting.** The demo counts first loads only, because cached or installed visits never reach Cloudflare. Some bots send `Sec-Fetch-Dest` and will be counted.
- **The free plan's daily function limit** is shared across the account. `_routes.json` makes it about one request per visit. Past the limit counting stops, and pages keep working, because Pages fails open.

## Out of scope

- Counting visits to app.omark.app itself, or anything inside the apps.
- The script that reads the numbers: it lives in the private management repo.
- Any dashboard.
