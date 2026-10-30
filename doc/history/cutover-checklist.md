# Cutover: from tasks.alipka.com to app.omark.app

Roadmap 3.6; launch spec 6.5.1, as changed by the one app spec (section 11). Run by hand, once. Nobody else has real
data, so this is the founder's move only.

Paths are the PC's OneDrive folder (`%USERPROFILE%\OneDrive`). The old files are in `ALAI\TaskApp`; the new app keeps
its files in `Apps\Omark` (OneDrive names that folder after the "Omark" Entra registration), Tasks' in `Apps\Omark\tasks`.

## Before

- [ ] **Production has a build.** `app.omark.app` answers 522 until the first Promote: ask Claude to run `pnpm promote`
      (or run it in a terminal at the repository root). It deploys what staging runs and checks the sign-in.
- [ ] **A quick look at staging** (5 minutes, optional but worth it): open `staging-app.omark.app`, choose
      "Use Omark", OneDrive, Tasks only. Add a task. `Apps\Omark Staging\tasks\tasks.md` appears with it.

## The move

1. [ ] **Every device saves its last edits.** On the PC and the iPhone, open `tasks.alipka.com` and wait for
       "saved". From here on, don't edit in the old app.
2. [ ] **The new folder.** On the PC, open `app.omark.app` → "Use Omark" → OneDrive → sign in → Tasks only.
       OneDrive creates `Apps\Omark` with `config.yaml` and `tasks\`. Close the tab.
3. [ ] **Copy the three files** over the fresh ones, in PowerShell:

       ```powershell
       $from = "$env:USERPROFILE\OneDrive\ALAI\TaskApp"
       $to = "$env:USERPROFILE\OneDrive\Apps\Omark\tasks"
       Copy-Item "$from\tasks.md", "$from\done.md", "$from\config.yaml" -Destination $to -Force
       ```

       If `ALAI\TaskApp` holds anything else the app wrote, ask before leaving it behind. Wait for OneDrive's green
       tick on the three files.
4. [ ] **Check.** Open `app.omark.app` on the PC: the same open tasks, habits and stats as the old app showed (the
       counts on Home and in Done). Then on the iPhone: open `app.omark.app` in Safari, sign in with OneDrive, check
       the same counts, Share → Add to Home Screen, and remove the old icon.
5. [ ] **Tell Claude it's done.** Claude then makes `tasks.alipka.com` redirect to `app.omark.app/tasks` and starts
       roadmap 3.7 (the bridge's Pages projects, its old Entra secret and the bridge values go).
6. [ ] **Keep `ALAI\TaskApp` untouched for a month** (until 2026-12-01) as the backup, then archive it.
7. [ ] **Obsidian** (optional): open `Apps\Omark` as a vault of its own, or skip it.

## After

- [ ] **Time on your calendar** (roadmap T.11): Settings → turn Time on → the Google calendar sign-in → pick your
      calendars. Use it for a week before launch.
- [ ] **Goals** when you want it: Settings → turn Goals on.
