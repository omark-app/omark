# Google verification of "Omark"

What to submit for the production Google project `omark-app` ("Omark"), so users stop seeing the "unverified app"
screen when they turn Time on, and the 100-user cap goes away. Time spec 10.3; one app spec 15, step 4.

## Status

**Submitted 2026-10-30. Google came back on 2026-11-02 with three asks; answering them.**

- `omark.app` is verified in Google Search Console, owned by `hello@omark.app` (2026-10-26).
- Branding verified and published (2026-10-30): name "Omark", the Omark logo (120 px, from
  `brand/png/omark-avatar-500.png`), homepage, privacy and terms links, `omark.app` as the authorised domain.
- The privacy policy (`omark.app/privacy/`) carries Google's Limited Use statement.
- The project is published (In production). One OAuth client, "Omark web" (`141879606503-…`).
- Video: <https://youtu.be/XjJhFhpdWnk> (Unlisted).
- Google counts only `calendar.events.owned` and `calendar.events.owned.readonly` as sensitive; the calendar list,
  `drive.file`, `openid` and `email` are not. None is restricted, so no security assessment (CASA).

## Google's asks (2026-11-02)

1. **AI.** Google read the site's "for people and their AI agents" as Omark sending Google data to AI services, and
   asked for a list of AI providers, tiers and gateways. Omark has none: no AI feature, no model, no AI service. The
   privacy policy now says so in its own section (`omark.app/privacy/#ai`) and the home page says Omark has no AI
   built in. The reply says there are no third-party AI integrations, aggregators or self-hosted models, so the lists
   are empty, and points at that section.
2. **A new video**, with every consent screen's scopes fully expanded ("Show all services" or the scope details
   opened), and only the scopes configured in the Cloud console. The app asks for exactly these: `openid`, `email`,
   `drive.file` (when Google Drive is the storage), `calendar.calendarlist.readonly` and
   `calendar.events.owned.readonly` (connecting Google Calendar), `calendar.events.owned` (colouring). Check the
   console's Data Access page lists the same six and nothing else before recording. The steps are below.
3. **Test credentials and steps.** None needed: sign-in is Google's own page, so any Google account works, and there
   is no Omark login, phone check or payment. The reply gives the reviewer the steps from the video.

## What's left

1. Answer Google's emails (they come to `hello@omark.app`). Google quotes 3–5 business days; reports say up to
   several weeks, often with a question or two first. Don't change the scopes, branding or publishing status while
   the review runs: Google says that can restart it.
2. When it's approved, the "unverified app" screen and the 100-user cap go away. Check by connecting Google Calendar
   on app.omark.app with a fresh account.

## What was submitted

The Data Access page takes one justification for all sensitive scopes (1000 characters at most). This went in:

> Omark Time turns the user's own calendar events into hours per project. It runs in the browser: calendar data is
> never sent to or stored on Omark's servers (ours only exchange sign-in tokens). The hours go to CSV files in the
> user's own Google Drive.
>
> calendar.events.owned.readonly: reads the events on the calendars the user picked, for the days they choose, and
> adds up hours by project from each title ("CODE; Category; description"). It is the narrowest scope that gives
> event times and titles.
>
> calendar.events.owned: asked for only if the user turns on "Colour my events" in Settings (incremental
> authorization). The app then colours the user's own events: green for a known project code, red for an unknown
> one, so typos show in the calendar. It changes only colorId and a private marker of the colours it set, never the
> title, time or guests. No narrower scope can set an event's colour.

Additional info: the edit scope is incremental; the video shows both consent screens with the client ID; the
project has one OAuth client; links to app.omark.app and demo.omark.app; `omark-tasks-staging` serves staging only
and is being retired. Questionnaire: not personal, internal, testing-only or a WordPress plugin.

The longer per-scope wording below is for answering Google's questions.

## Scope justifications

**`https://www.googleapis.com/auth/calendar.calendarlist.readonly`**
Omark Time turns the user's calendar events into hours per project. On first use it lists the calendars the user
owns, so they can pick which ones count. It reads only the list of calendars (names and ids) and changes nothing.

**`https://www.googleapis.com/auth/calendar.events.owned.readonly`**
The app reads the events on the calendars the user picked, for the days they choose, and adds up their hours by
project and category from each event's title (`CODE; Category; description`). The hours are written to CSV files in
the user's own Google Drive or OneDrive. Nothing is sent to or stored on Omark's servers: the app runs in the
browser, and our server only exchanges sign-in tokens. This read-only scope is the narrowest that gives the event
times and titles.

**`https://www.googleapis.com/auth/calendar.events.owned`**
Asked for only if the user turns on "Colour my events" in Settings (incremental authorisation). The app then sets
the colour of the user's own events: green for a known project code, red for an unknown one, so mistakes show in
the calendar. It changes only the event's colour (`colorId`) and a private marker of the colours it set, never the
title, time, guests or anything else. There is no narrower scope that allows setting an event's colour.

## The video (3–4 minutes, English, screen recording with the address bar visible)

On every Google consent screen, open the full list of permissions before continuing ("Show all services" or each
permission's details) and hold it on screen long enough to read.

Use a test Google account with a few events titled like `ACME; Development; Login page` on its calendar.

1. **The app and its homepage** (15 s): show `omark.app`, then open `app.omark.app`.
2. **Sign-in with Google Drive** (30 s): "Use Omark" → Google Drive. On Google's screen, show the app name "Omark" and,
   in the address bar, the `client_id` (`141879606503-…`). Tick the Drive box, Continue. Say: "Omark keeps its files
   in a folder in the user's Drive; `drive.file` lets it see only files it created."
3. **Turning Time on** (60 s): Settings → turn Time on → Connect Google Calendar. On the consent screen, show both
   calendar permissions (the calendar list and the events, read-only). Continue.
4. **calendar.calendarlist.readonly in use** (20 s): the "Which calendars count?" picker lists the account's
   calendars. Pick one, Start.
5. **calendar.events.owned.readonly in use** (40 s): the Time tab shows this week's hours by project and category,
   from the events' titles. Open the events CSV in Google Drive to show where the data goes.
6. **calendar.events.owned in use** (45 s): Settings → "Colour my events" → Google asks for the extra permission
   (show the screen) → Continue. In Google Calendar, the `ACME` event turns green and an event with an unknown code
   turns red. Show that the title and time are unchanged.
7. **Turning it off** (15 s): switch "Colour my events" off and clear the colours. The permission can be revoked in
   the Google Account.

Keep the narration short. Google checks that the consent screen, the client ID and each scope's use are visible.
