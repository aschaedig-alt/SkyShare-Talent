---
name: front-api
description: >-
  Working with Front (the email/inbox platform behind SkyShare's hro@/recruiting@
  mailboxes — NOT front-end/UI work) in the Journey app: sending and drafting
  messages, reading and ingesting inbound mail (orientation, travel confirmations,
  sourcing, Paycom), plus auth, token scopes, and rate limits. Use this whenever the
  task touches Front, the Front API, api2.frontapp.com, a Front
  channel/conversation/draft/inbox, the inbound-email pipeline, or FRONT_API_TOKEN —
  and also for the intent even when Front is not named: "send the orientation email",
  "email the new hire", "wire up the recruiting mailbox", "pull emails into the app",
  or building lib/front. Consult it too before creating or editing a Front API token,
  so the right scopes (and no Delete) get chosen.
---

# Front API — SkyShare Journey

Front is the email platform behind SkyShare's recruiting/HR mailboxes. This app
talks to it over the **Core API** to send orientation email, create human-approved
drafts, and pull inbound mail into the Journey pipeline. This skill is the
memory of how that integration works and the guardrails around it.

## Read this first — the environment is live and shared

Two things make Front calls higher-stakes than a normal API:

1. **Sending is irreversible and goes to real people** (new hires, candidates).
   There is no sandbox inbox. A stray `POST /channels/{id}/messages` emails a real
   person. **Default to the draft-first flow** (create a draft a teammate approves
   in Front) unless the user has explicitly asked to send automatically.
2. **The token acts as the whole company**, and the DB it feeds is the one shared
   live Neon database (see the repo CLAUDE.md). Treat writes as production writes:
   small batch, verify, then scale.

When in doubt about anything that sends, tags, or archives real conversations,
show the user what you're about to do and confirm.

## Auth and configuration

- **Base URL:** `https://api2.frontapp.com`
- **Auth header:** `Authorization: Bearer <FRONT_API_TOKEN>` on every request.
- **Where the token lives:** `FRONT_API_TOKEN` in `.env` locally and as a Vercel
  environment variable in prod — same pattern as the Neon credential. Never commit
  it; never log it. Read it server-side only (route handlers / server actions), the
  same way other secrets in this app are read.
- **Content type:** `application/json` for normal calls; `multipart/form-data` only
  when uploading attachments (see references/endpoints.md).

There is no Front integration code in the repo yet — this is greenfield. New code
belongs in `lib/front/` (a small typed client) with the token read from the
environment, mirroring how `lib/prisma` and other server utilities are structured.

## Token scopes (locked at creation — pick correctly the first time)

Front bakes scopes into a token permanently; you cannot edit them later. The chosen
set for this integration (guiding rule: Read is harmless so be generous, Write only
where we act, **Delete nowhere**):

- **Feature:** Access resources. (Application triggers only if we go webhook-driven.)
- **Resource permissions:**
  - Messages — **Read + Send**  ← the Send box is the single most important checkbox
  - Drafts — Read + Write
  - Conversations — Read + Write
  - Channels — Read · Inboxes — Read · Attachments — Read
  - Tags — Read + Write · Comments — Read + Write
  - Contacts — Read (+ Write only if we sync candidates into Front)
  - Read-only future-proofing: Teammates, Teams, Statuses, Events, Custom fields,
    Message templates, Signatures
  - **No Delete on anything.** Archiving a thread is a Conversations *Write*.

If asked to help create/modify a token, walk through these and stop them before they
tick any Delete box or miss Messages→Send.

## The four operations we actually use

Full field lists and response shapes are in **references/endpoints.md** — read it
before writing request bodies. The shape at a glance:

| Goal | Endpoint |
| --- | --- |
| Send a **new** email from a mailbox | `POST /channels/{channel_id}/messages` |
| **Reply** into an existing thread | `POST /conversations/{conversation_id}/messages` |
| **Draft** a new email for approval | `POST /channels/{channel_id}/drafts` |
| **Draft a reply** for approval | `POST /conversations/{conversation_id}/drafts` |
| Find the mailbox to send from | `GET /channels` |
| Ingest inbound | `GET /conversations`, `GET /conversations/{id}/messages` |

`channel_id` is the specific mailbox (`hro@` vs `recruiting@`). Get it once from
`GET /channels`, then store it in config — don't re-fetch on every send.

## Building the integration

When you're writing or extending the in-app client, read
**references/integration-patterns.md** — it has the typed `fetch` wrapper, the
draft-first send flow, inbound ingestion, and rate-limit/retry handling that every
call should route through. Don't hand-roll `fetch` calls scattered across the app;
funnel them through the one client so auth, error handling, and the 429 backoff live
in one place.

## Poking at Front by hand (setup & debugging)

`scripts/front-cli.mjs` is a small **read-only** helper for setup and diagnosis —
list channels, fetch a channel or conversation, show your rate-limit headers. It
deliberately does not send. Run it with the token in the environment:

```
FRONT_API_TOKEN=xxxx node .claude/skills/front-api/scripts/front-cli.mjs channels
```

Use it to grab the `channel_id` after the admin creates the token, or to confirm the
token authenticates, before you write any app code.

## Verifying without a sandbox

There is no test mailbox, and (per repo CLAUDE.md) the Browser pane can't render this
app's pages. So verify the safe way: read-only GETs via the CLI helper prove auth and
surface real channel/conversation IDs; for send logic, exercise the **draft** path
first and eyeball the draft inside Front before ever calling the message endpoint.
Say plainly when something (like an auto-send path) has only been dry-run, not truly
sent.
