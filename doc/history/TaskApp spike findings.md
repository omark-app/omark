# TaskApp spike findings

> Historical, may be out of date. Kept as the record of the v1 sign-in and OneDrive spike (2026-10-16).

Results of the real-device checks for the MSAL sign-in and OneDrive thin slice (build plan Task 4). Each check is recorded as PASS or FAIL with a note. If any check fails, stop and bring the findings to the user before Milestone 2.

Build tested: `v1-build` at c255253 (spike screen), uploaded to Cloudflare Pages production and served at https://tasks.alipka.com on 2026-10-16. Entra app "TaskApp" in the user's own tenant (`alipkagmail.onmicrosoft.com`), personal Microsoft accounts only, redirect URIs `https://tasks.alipka.com/` and `http://localhost:5173/`.

| Check | Result | Notes |
| --- | --- | --- |
| 1. Brave on Windows: install the PWA, sign in, edit, and check the edit appears in Obsidian | PASS | Reported by the user 2026-10-16. First save created `OneDrive/ALAI/TaskApp/tasks.md` (folder did not exist before). |
| 2. iPhone: add to the home screen, sign in from standalone mode, and return to the app signed in | PASS | Reported by the user 2026-10-16. Redirect flow works in standalone mode. |
| 3. Kill the iPhone app, reopen after more than one hour, and confirm silent token refresh works | PASS | Reported by the user 2026-10-16. |
| 4. Edit in Obsidian, then save in the app: a 412 is raised (confirms `If-Match` works on simple upload) | PASS | Reported by the user 2026-10-16. |
| 5. Deploy a trivial change and confirm the iPhone picks it up on the next open | deferred | Checked on the first deploy from `main` (CI deploy job), when the real app replaces the spike. |
