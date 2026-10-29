# Omark one app spec

Status: draft, 2026-10-28, from the Omark Goals brainstorm with AL. AL decided the four points in section 3 marked *(AL)*; the rest are Claude's calls, listed in section 14.
Changes: the [launch spec](../TaskApp%20open%20source%20launch%20spec.md) (6.3, 6.4.1, 6.5, 6.5.1, 6.12, 6.13), the [Time spec](../time/spec.md) (3, 4, 9, 10, 12, 17), the [settings page spec](../Omark%20settings%20page%20spec.md) (section 2) and the [roadmap](../plans/open-source-launch-roadmap.md). Where they disagree, this spec wins.
Related: [Omark Goals spec](../goals/spec.md), which depends on it.

## 1. Intent

Omark Goals only works if it can see the tasks, habits and hours the other apps keep: the connection from vision to goals to daily life is the whole point. Today each Omark app has its own address, sign-in, registrations and folder, and by design none can read another's files.

So Omark becomes **one app at one address**, with Tasks, Time and Goals as parts of it, **one storage provider and one folder** for everything. Each part still works on its own: someone who wants only Tasks gets something that looks and feels like Omark Tasks today.

This has to land before launch. Today the only real data is AL's (and staging's); moving users' folders after launch would be far harder.

## 2. Goals, non-goals, anti-goals

### 2.1 Goals

1. **One address**: `app.omark.app`, with a staging and a demo next to it.
2. **One choice of storage** (OneDrive, Google Drive or a folder on this computer), made once, used by every part.
3. **One folder** with a subfolder per part and shared files at the top.
4. **Parts on or off.** Tasks on by default; Time and Goals when you want them. Nothing you don't use shows, creates files or asks for permissions.
5. **One sign-in per provider** for all of Omark, one Settings page, one icon on the phone.
6. **One demo world**: one made-up person whose goals, projects, habits, tasks and hours tell one story.
7. **Omark Tasks, Omark Time and Omark Goals stay the product names** on the landing page, in docs and in the app's tabs.

### 2.2 Non-goals

- Storing different parts with different providers or in different folders *(AL)*.
- Copying files between providers when the user switches storage (already a later issue in the launch spec).
- Separate installable apps per part.

### 2.3 Anti-goals

- **Tasks gets slower or busier** for someone who uses only Tasks: a longer load, a tab bar, a wider sign-in.
- **A part asks for permissions it doesn't need**: a Tasks-only user is never asked about their calendar.
- **AL's real files are touched** by development or tests. The cutover (section 11) is AL's, by hand.

## 3. Decisions taken

| Topic | Decision |
|---|---|
| One app | **One app at one address**, with Tasks, Time and Goals as parts *(AL)*. |
| Storage | **One provider and one folder for all of Omark**; no per-part choice *(AL)*. |
| Parts alone | Each part can be used alone; unused parts stay hidden *(AL agreed)*. |
| Goals at launch | **Omark Goals launches together with Tasks and Time** *(AL)*. |
| Address | `app.omark.app`; staging `staging-app.omark.app`; demo `demo.omark.app`; previews per PR as today. `omark.app` stays the landing page. *(my call)* |
| Registrations | One Entra registration and one Google Cloud project for production, one of each for staging, named "Omark" and "Omark Staging". |
| Repo | One app folder, `apps/omark`. How Tasks' and Time's code moves into it is the builder's call (section 13). |
| Old hosts | `tasks.omark.app` → `app.omark.app/tasks`, `time.omark.app` → `/time`, and the same for the demo and staging hosts that exist. |

## 4. The folder

```
Omark/                 (OneDrive: Apps/Omark; Google Drive: My Drive/Omark; or the folder the user picks)
  config.yaml          the suite: which parts are on
  projects.csv         shared by Time and Goals, read by Tasks
  tasks/
    tasks.md
    done.md
    config.yaml
  time/
    events-2026.csv
    config.yaml
  goals/
    goals.md
    config.yaml
    images/
```

- **Subfolders per part** *(my call)*: the top stays readable, and each part's files are where its own docs say.
- **A part creates its subfolder and files on first use**, not when it is turned on. A Tasks-only folder holds `config.yaml` and `tasks/` and nothing else.
- **`projects.csv`** keeps its format (`doc/format.md`, Omark Time). It is created by the first part that writes a project.
- **The suite `config.yaml`** at the top holds what follows the user across devices:

  ```yaml
  parts: [tasks, time, goals]   # in tab order; default [tasks]
  ```

  The storage choice stays per device, as today (it is how a device finds the folder).
- **OneDrive** names the app folder after the registration, so production lands in `Apps/Omark` and staging in `Apps/Omark Staging`, apart by themselves.
- **Google Drive** keeps `drive.file`: the app sees only files it created, now across all parts, because they share one Google project.
- **A local folder** is picked once per device; the directory handle covers every part.
- `doc/format.md` gets the layout and the suite `config.yaml`; each part's own file formats don't change.

## 5. Sign-in

- **One token broker on one origin** (`packages/signin`, `functions/api/auth`), with the Microsoft and Google providers. `OMARK_APP` goes away.
- **Storage sign-in**: Microsoft for OneDrive (`Files.ReadWrite.AppFolder`), Google for Google Drive (`drive.file`), none for a local folder.
- **Calendar sign-in**: Google, asked for **only when Time is turned on**, with incremental consent (`calendar.events.owned.readonly`, and `calendar.events.owned` only when colouring is turned on, as in the Time spec). If the storage is Google Drive, it is the same Google sign-in widened; if not, a second sign-in next to Microsoft.
- **The broker holds a Microsoft session and a Google session at once** (today it holds one session per cookie prefix). The one app uses new cookie, header and IndexedDB names (`omark_*`); it has nothing to migrate, because it is a new origin. *(my call)*
  - *Built in U.4:* `sessions: 'per-provider'` gives each provider its own cookies (`omark_microsoft_session`, `omark_google_signed_in`…), and `token` and `logout` take `?provider=`. The readable signed-in cookie lists the accesses added (`google:calendar`).
  - The calendar next to OneDrive or a folder is a third provider id, `googlecal`: the same Google client and redirect URI, with the calendar as its own scope, so it never asks for Drive. *(my call)*
- **Checked (roadmap U.1, 2026-10-28): one Google project is enough.** On `omark-time-staging` (published, unverified, listing `drive.file` and the sensitive calendar scopes), AL signed in with fresh accounts through a throwaway page:
  - A request for `openid`, `email` and `drive.file` showed **no "unverified app" screen**, and the user cap stayed at 2/100.
  - Widening the same account with `calendar.events.owned.readonly` (`include_granted_scopes`) showed the screen and counted the user (1 → 2).
  - So Google judges each request by the scopes it asks for, not by the scopes the project lists. That matches its docs: the cap counts users who grant unapproved sensitive or restricted scopes.
  - **Decision:** one Google project and one Google session, widened when Time is turned on. Only Time users see the unverified screen and use up the 100 users until "Omark" is verified. The calendar-only second project is not needed.
- **Google lets the user untick Drive.** On the consent screen each scope beyond the basic profile has its own checkbox; in one run `drive.file` came back missing. The app reads the granted scopes after every Google sign-in and, when one it needs is missing, explains why and asks again. The same applies to the calendar scopes when Time is turned on.

## 6. First run

1. **"Try the demo"** or **"Use Omark"**.
2. **Where your files live**: OneDrive, Google Drive, or a folder on this computer (where it works). Sign in or pick the folder.
3. **What you want to use**: Tasks, Time, Goals (Tasks ticked by default; the part in the entry path, such as `/time`, ticked instead when there is one), with a line each on what it does and what it needs ("Time reads your Google Calendar"). The choice can change any time in Settings.
4. If Time is on: the Google calendar sign-in and the calendar picker from the Time spec, now or "later" from the Time tab.
5. Open the first part that is on.

The existing first-run screens (Tasks' storage choice from 3.2, Time's from T.5) merge into this one. A device that opens a folder whose suite `config.yaml` already lists parts skips step 3.

## 7. The app shell

- **Each part has its own path**: `app.omark.app/tasks`, `/time`, `/goals`. `/` opens the first part that is on. A path to a part that is off offers to turn it on. Sign-in callbacks return to the path they started from. *(my call)*
- **Any part can be the only one on**, Tasks included: a Time-only user is supported.
- **One part on: no tab bar.** The screen is that part's, exactly as today.
- **Two or three parts on: tabs** Tasks · Time · Goals, in the order of `parts`. At the bottom on the phone, at the top on desktop. Each part keeps its own scroll and state when you switch.
- **Keyboard**: a key per part to switch (the builder picks keys that don't clash with Tasks' commands; they go into Tasks' keyboard settings).
- **Links between parts**: a Goals card's hours open Time on that project; a goal's tasks open Tasks filtered by its tag. *(my call; small, can follow after launch if it costs much)*
- **Offline and sync**: one storage session, one offline cache, one status line. Each part's files sync as today (`FileSync` per file).
- **The PWA**: one manifest, name "Omark", the suite icon from `brand/png/omark`. The part icons from 2.4 are used for the tabs and the landing page.

## 8. Settings

One Settings page (`packages/settings`) with:

- **General**: storage (provider, folder, sign-ins), parts on and off, sign out;
- a section per part that is on, each editing its own `config.yaml` with its existing schema.

Section 2 of the settings page spec ("one page design, each app edits its own file") is replaced: one page now edits all the files, because one app can reach them all.

*Built in U.5* ([plan](../plans/U.5-one-settings-page.md)):
- The page is at `/settings`, opened from Tasks' gear and `,` and from Time's Settings view.
- Its first card is titled **Omark**, not General, because Tasks' own first section is already called General.
- Time's section is Time's own Settings view, as Time has no schema.
- A part turned on or off offline is kept on the device and written when the folder can be reached.
- Sign out ends every sign-in and forgets the device's storage choice. *(my calls)*

## 9. The demo world

The demo at `demo.omark.app` (and every PR preview) is **one made-up person** across all parts, replacing Tasks' sample tasks and Time's fake calendar seed. No sign-in, edits kept in the browser, "Reset demo", no outside requests, as the demos do today. All dates are relative to today.

The person *(my call; the builder writes the data)*: **Maya, a freelance product designer in Lisbon.**

- **Goals** (areas): *Health* (run a half marathon), *Family & friends* (a weekly dinner with friends), *Work* (launch her own design course), *Home* (move closer to the sea). Pictures under a free licence for two areas; the others show the plain colour.
- **Projects**: `NOVA` (a client, with a rate), `COURSE` (her course, linked to the Work goal), `RUN` (training, linked to Health).
- **Time**: about two weeks of events; most hours on `NOVA`, only a little on `COURSE`; an unknown code to fix; the cases the Time demo already shows (all-day, overlap, invite, declined).
- **Tasks**: today and overdue tasks, some tagged `#COURSE` or `#RUN`; two habits in progress, one tagged `#family-friends`; a done history.
- **The story**: *Home* shows **Needs update** (nothing linked for months); the course goal has a date six months out but the hours go to the client. That is the drift the `omark-goals` skill should find.

The Tasks and Time demos' existing checks (no outside requests, Reset demo, the footer) carry over.

**Built (U.6, 2026-10-29).** A demo build of the one app (`VITE_STORAGE=demo`) opens at once on Tasks, with the three tabs and no welcome or sign-in. The files are in IndexedDB (`omark-demo:*`), seeded for today when empty; the pictures are `apps/omark/src/lib/demo/*.jpg`, made for this repo (CC0), and only the demo build has them. Time reads a made-up calendar made for the same day, with edit access and colouring on, and has a **Calendar** view that draws the week's events in their colours (Time spec 12). Each tab's footer says DEMO, with **Reset demo** (asks first, then reseeds every part) and **Use it for real** (`VITE_REAL_USE_URL`). Settings says the files are in this browser and offers no Change, sign-in or Sign out. The code is in `apps/omark/src/lib/demo/`; `apps/omark/e2e/demo.spec.ts` checks it.

## 10. Hosting, CI and deploys

*Built 2026-10-29 (roadmap U.7, [plan](../plans/U.7-ci-hosts-redirects.md)): `omark-preview`, `omark-staging`, `omark-demo` and Promote's `omark`; the old per-app hosts redirect; the Goals card is on the landing page. The old Pages projects are retired in 3.7.*

- **Cloudflare Pages projects**: one for production (`app.omark.app`), one for staging (`staging-app.omark.app`), one for the demo (`demo.omark.app`), plus `omark.app` for the site. The per-app projects that exist are retired after the redirects are in place.
- **CI**: one app build, one preview per PR, one staging deploy from `main`, one demo deploy, one Promote (no app question). The per-app jobs, artifacts and variables (`TASKS_*`, `CF_TASKS_*` and Time's) become one set.
- **Self-hosting** (`doc/self-hosting.md`): one app, one Pages project, one Entra registration and one Google project.
- **Landing page**: the cards for Tasks, Time and Goals link to their part's path (`app.omark.app/time`) and the demo's; a Goals card is added.
- **AL's own instance until the cutover**: the bridge jobs stay. CI keeps building `apps/tasks` for `tasks-staging.alipka.com` and Promote keeps a "bridge" target for `tasks.alipka.com` (flat `ALAI/TaskApp`, drive-root scope), next to the one app's jobs, until 3.6. The one app never runs in bridge mode: pointed at the flat folder it would read Tasks' `config.yaml` as the suite file. 3.7 then removes `apps/tasks`'s bridge build, its jobs and variables. *(my call)*

## 11. Moving what exists

Nobody but AL has real data, so this is short.

- **AL's cutover (roadmap 3.6)** now targets `app.omark.app`: sign in with OneDrive once so `Apps/Omark` exists, then copy `tasks.md`, `done.md` and `config.yaml` from `ALAI/TaskApp` into `Apps/Omark/tasks/`. The rest of the checklist stays (wait for "saved" everywhere, check counts, re-add the phone icon, redirect `tasks.alipka.com`, keep `ALAI/TaskApp` a month).
- **Staging** uses `Apps/Omark Staging` from the new staging registration. `ALAI/TaskApp-staging` stays as it is until the bridge is removed (3.7).
- **Time on AL's calendar** (T.11) starts on `app.omark.app`, so there is no Time data to move.
- **Test data** in the old staging Google projects is left behind.

## 12. Acceptance

- **Before the build, a short check** of the Google risk in section 5, with the staging project: a `drive.file`-only consent on a project that also lists the calendar scopes. *Done 2026-10-28: no unverified screen and no cap use; one Google project (section 5).*
- **e2e** (desktop and iPhone, on the fake storage):
  - first run with Tasks only: no tab bar, no calendar question, only `config.yaml` and `tasks/` created;
  - turning Time and Goals on in Settings: tabs appear, each part's first use creates its subfolder;
  - switching tabs keeps each part's state;
  - a second device opening the same folder skips the parts question;
  - the demo world: all three parts show the same person; Home shows Needs update; no outside requests.
- **Each part's existing e2e** passes inside the shell (Tasks' and Time's specs move, they don't change behaviour).
- **Manual on staging**: OneDrive and Google Drive each create the layout in section 4; Time's calendar sign-in with OneDrive storage; the old hosts redirect.

## 13. Left to the builder

- How Tasks' and Time's code moves into `apps/omark` (folders inside the app, or UI packages), as long as each part can be tested on its own and Tasks' load time doesn't grow for a Tasks-only user (lazy-load the other parts).
- The tab bar's look, within the design language, and the switching keys.
- The exact first-run wording.
- The demo data, within section 9.

## 14. Calls made by Claude, to check

1. The address `app.omark.app`, staging `staging-app.omark.app`, demo `demo.omark.app`.
2. A subfolder per part (`tasks/`, `time/`, `goals/`) with `projects.csv` and a suite `config.yaml` at the top.
3. `parts` in the suite `config.yaml`, so it follows the user; the storage choice stays per device.
4. No tab bar with one part; tabs at the bottom on the phone, at the top on desktop.
5. One Google project. *(Checked 2026-10-28: a `drive.file`-only consent shows no unverified screen and doesn't count toward the cap, so the calendar-only fallback isn't needed.)*
6. The demo person Maya and her story.
7. Links between parts (Goals → Time, Goals → Tasks) are nice to have at launch.
8. The old hosts redirect to their part's path; the per-app Pages projects are retired afterwards.
9. Each part has its own path; any part can be the only one on.
10. AL's bridge instance keeps its own `apps/tasks` build and jobs until the cutover; the one app has no bridge mode and uses new `omark_*` names.
11. The broker holds a Microsoft and a Google session at once.

## 15. Steps only AL can do

1. **Entra**: two registrations, "Omark" and "Omark Staging" (instead of the planned "Omark Tasks" and "Omark Time" pairs), with Web redirect URIs on `app.omark.app` and `staging-app.omark.app`, and their client secrets into the Pages secrets.
2. **Google Cloud**: a production project "Omark" (consent screen with the `omark.app` homepage and privacy policy, `drive.file` and the calendar scopes, a Web client). For staging, rename the existing `omark-time-staging` consent screen to "Omark Staging", add `drive.file` if missing and the new redirect URIs; retire `omark-tasks-staging`.
3. **Cloudflare**: Pages projects and DNS for `app.`, `staging-app.` and `demo.omark.app`; redirect rules for the old hosts to their part's path.
4. **Google verification** of "Omark" (the video covers Drive and Calendar; Claude writes the script). Not a launch blocker.
5. **The cutover** (section 11).
6. Approve this spec.
