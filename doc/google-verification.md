# Google verification of "Omark"

What to submit for the production Google project `omark-app` ("Omark"), so users stop seeing the "unverified app"
screen when they turn Time on, and the 100-user cap goes away. Time spec 10.3; one app spec 15, step 4.

## What's already done

- `omark.app` is verified in Google Search Console, owned by `hello@omark.app` (2026-10-26).
- The consent screen's branding (name "Omark", links) points at `omark.app`. Check before submitting that it has
  the logo, the homepage, the privacy policy and terms links, and `omark.app` as an authorised domain: Google
  reviews the branding too.
- The privacy policy (`omark.app/privacy/`) carries Google's Limited Use statement.
- The project is published (In production, unverified).

## What's left

1. Record the video below and upload it to YouTube as **Unlisted**.
2. Google Auth Platform → **Verification Center** → start verification. Paste the justifications below and the
   video link.
3. Answer Google's emails (they come to `hello@omark.app`). Google quotes 3–5 business days; reports say up to
   several weeks, often with a question or two first.

Only the calendar scopes need the review. `drive.file`, `openid` and `email` are not sensitive. None of the scopes is
restricted, so no security assessment (CASA) is needed.

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
