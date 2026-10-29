# Security

## Reporting a problem

Please report security problems privately, never in a public issue or discussion:

- on GitHub: the repository's **Security** tab → **Report a vulnerability** (private vulnerability reporting), or
- by email to **security@omark.app**.

Say what you found, how to reproduce it, and what an attacker could do with it. You'll get an answer within a few days. Once a fix is out, we credit you in the release notes unless you'd rather not be named.

Supported: the `main` branch, `omark.app`, the demos, and the hosted app once it is live (`app.omark.app`). Older builds are not.

## What the apps keep, and where

Omark has no database. Users' tasks, hours and calendar events never reach a server of Omark's.

- **Files** stay in the user's own OneDrive or Google Drive (or, soon, a local folder). The app reads and writes them straight from the browser.
- **The offline copy** is kept in the browser's IndexedDB on each device, so the app works offline.
- **Access tokens** are short-lived. The app gets them from the sign-in helper and calls Microsoft Graph or Google's APIs directly.

## The sign-in helper

A small token broker on the app's own origin (`/api/auth/*`, Cloudflare Pages Functions; code in `packages/signin`). It exists so a sign-in lasts 90 days (Microsoft) or 180 days (Google) instead of a browser app's 24 hours.

It keeps:

- the provider's **refresh token, in an encrypted, HttpOnly cookie in the user's own browser**, sent only to `/api/auth/token`. Every refresh replaces it.
- a 10-minute encrypted cookie for the sign-in's state and PKCE verifier, sent only to `/api/auth/callback`.
- the account's name or email, encrypted, for up to 400 days, sent only to `/api/auth/login`, so the next sign-in can suggest the same account.
- a readable cookie that says which provider the user signed in with (no token).

It doesn't keep anything on the server: no database, no store of tokens, and no job that runs with users' tokens. Its secrets (the OAuth client secrets and the cookie encryption key) are Cloudflare Pages secrets.

The POST endpoints need the header `X-TaskApp-Auth: 1` and an `Origin` of the app itself, which blocks cross-site requests.

The scopes are as narrow as the apps allow: OneDrive's app folder (`Files.ReadWrite.AppFolder`) by default, Google Drive's `drive.file` (only files the app created), and for Omark Time read-only calendar access unless colouring is turned on. A self-hosted copy can ask for the whole OneDrive (`ONEDRIVE_SCOPE=full`, `Files.ReadWrite`).

## Known gaps

- **No Content Security Policy in the apps yet**, and few security headers (the omark.app site has them). Adding them, in Report-Only mode first, is planned work.
- **One deploy token for every environment.** CI's Cloudflare token can deploy to every Pages project, so a pull request that changes a workflow could reach production. Until branch protection is on, every PR that touches CI is large and reviewed by a maintainer, and the agents' guard blocks pushes to `main`, merges and Promote.
- **The agent guard is best-effort.** It reads command lines and can't see what a script or alias does.
