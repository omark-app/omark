# Smoke test

A 10-minute check by hand after a deploy, on staging (`staging-app.omark.app`) before a Promote and on production
(`app.omark.app`) after it. It doesn't replace the automated checks: typecheck, the unit tests and every e2e spec run
before each push, and `pnpm ship` and `pnpm promote` check the sign-in helper, the demo and the site once they're live.

Staging keeps its files in `Apps/Omark Staging` (OneDrive) or the staging Google project's folder; production in
`Apps/Omark` or `My Drive/Omark`. Use a test account for Google on staging.

## The app

1. **It opens** and the footer shows the build number `pnpm ship` printed.
2. **OneDrive**: "Use Omark" → OneDrive → sign in → Tasks only → Start. Tasks opens; the OneDrive folder has
   `config.yaml` and `tasks/`.
3. **Tasks**: add a task, complete one, reload. Both stick, and `tasks.md` and `done.md` in OneDrive show them.
4. **A second device** (the iPhone): sign in with the same storage. It skips "What you want to use" and shows the
   same tasks.
5. **Offline**: airplane mode, add a task, go back online. It says "saved" and the task is in OneDrive.
6. **Parts**: Settings → turn Time and Goals on. Tabs appear; each opens.
7. **Time**: the calendar sign-in, pick a calendar, and this week's hours show.
8. **Google Drive** (a private window): "Use Omark" → Google Drive. Once, leave the Drive box unticked: the app
   says to sign in again and tick it. Then tick it: the folder appears in My Drive.

## Around it

9. **Demo**: `demo.omark.app/tasks`, `/time` and `/goals` show Maya's world with no sign-in.
10. **Site**: `omark.app` shows the three cards, and each "Try the demo" opens its part.
11. **Old hosts**: `demo-tasks.omark.app` lands on `demo.omark.app/tasks`.

On production, 1 to 3 are enough unless the change touched sign-in, storage or sync.
