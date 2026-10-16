# TaskApp spike findings

Results of the real-device checks for the MSAL sign-in and OneDrive thin slice (build plan Task 4). Each check is recorded as PASS or FAIL with a note. If any check fails, stop and bring the findings to the user before Milestone 2.

| Check | Result | Notes |
| --- | --- | --- |
| 1. Brave on Windows: install the PWA, sign in, edit, and check the edit appears in Obsidian | pending | |
| 2. iPhone: add to the home screen, sign in from standalone mode, and return to the app signed in | pending | |
| 3. Kill the iPhone app, reopen after more than one hour, and confirm silent token refresh works | pending | |
| 4. Edit in Obsidian, then save in the app: a 412 is raised (confirms `If-Match` works on simple upload) | pending | |
| 5. Deploy a trivial change and confirm the iPhone picks it up on the next open | pending | |
