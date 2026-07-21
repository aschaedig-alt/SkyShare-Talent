# Front Core API — endpoint reference

Base URL `https://api2.frontapp.com` · header `Authorization: Bearer <FRONT_API_TOKEN>`.
Source: Front dev docs (dev.frontapp.com). Confirm against the live reference if a
call behaves unexpectedly — Front adds fields over time.

## Table of contents
- [Sending & drafting](#sending--drafting)
- [Reading / inbound ingestion](#reading--inbound-ingestion)
- [Channels & inboxes](#channels--inboxes)
- [Tags, comments, contacts](#tags-comments-contacts)
- [Attachments](#attachments)
- [Rate limiting & errors](#rate-limiting--errors)
- [Handles & recipient format](#handles--recipient-format)

---

## Sending & drafting

### Send a new message from a channel
`POST /channels/{channel_id}/messages` → **202 Accepted** (async delivery).

Two things the docs get wrong or leave out, both confirmed by a live send (Jul 2026):
- **The 202 DOES return a body** with the created message `id` and a
  `_links.related.conversation` URL. Keep them — that's how you record which Front
  thread a send became (e.g. against a new-hire record). The conversation id is the
  last path segment of that URL.
- **Front archives the conversation on send by default.** If the sending inbox is one
  humans watch, that silently hides your sends. Pass `options: { archive: false }` to
  leave the thread open in the inbox.

Body (JSON):
| Field | Type | Notes |
| --- | --- | --- |
| `to` | string[] | **required** — recipient handles (email addresses) |
| `body` | string | **required** — HTML body |
| `subject` | string | email subject |
| `text` | string | optional plain-text alternative |
| `cc` / `bcc` | string[] | copy recipients |
| `sender_name` | string | display name on the From |
| `author_id` | string | teammate id to attribute the send to |
| `signature_id` | string | specific signature |
| `should_add_default_signature` | boolean | auto-resolve signature |
| `attachments` | file[] | requires multipart/form-data (see below) |
| `options` | object | `{ "tags": ["Tag Name"], "archive": true }` — tag and/or archive on send |

### Reply into an existing conversation
`POST /conversations/{conversation_id}/messages` — same body shape as above minus the
channel path. Use this to continue a thread rather than starting a new one, so the
new-hire's replies stay threaded.

### Create a draft (new conversation) — the safe default
`POST /channels/{channel_id}/drafts` → returns the created draft.

| Field | Type | Notes |
| --- | --- | --- |
| `body` | string | **required** |
| `to` | string[] | recipient handles |
| `subject` | string | |
| `cc` / `bcc` | string[] | |
| `author_id` | string | teammate the draft is attributed to |
| `mode` | string | `"private"` (author only) or `"shared"` (team can see/edit) |
| `signature_id`, `should_add_default_signature` | | as above |

### Create a draft reply
`POST /conversations/{conversation_id}/drafts` — same body, threads onto an existing
conversation. A human then reviews and hits send inside Front.

---

## Reading / inbound ingestion

Used by the inbound pipeline (orientation replies, travel confirmations, sourcing,
Paycom). All GETs; all paginated via a `_pagination.next` URL you follow until null.

- `GET /conversations` — list conversations. Filter with the search API when you need
  a subset: `GET /conversations/search/{query}` (Front's query DSL, e.g. by inbox,
  tag, status, contact).
- `GET /conversations/{conversation_id}` — single conversation metadata (status,
  assignee, tags, recipient).
- `GET /conversations/{conversation_id}/messages` — the messages in a thread, newest
  activity included. This is where the email bodies live.
- `GET /conversations/{conversation_id}/events` — audit/events for a thread.
- `GET /messages/{message_id}` — a single message by id.

Pagination shape:
```json
{ "_results": [ ... ], "_pagination": { "next": "https://api2.frontapp.com/..." } }
```
Follow `_pagination.next` (already a full URL with the same auth header) until it's
null. Respect rate limits while looping — see below.

---

## Channels & inboxes

- `GET /channels` — every channel (mailbox) in the company. Each has an `id`
  (the `channel_id` used to send) and a `type` (e.g. `smtp`). **Gotcha:** the
  `address` field is Front's *internal* `@in.frontapp.com` routing address — NOT the
  mailbox you recognize. The outward-facing address is in **`send_as`** (mirrored in
  `name`). Match on `send_as`/`name`, never `address`. Store the resolved id in config.
  Confirmed SkyShare channels (Jul 2026): `hr@` `cha_g7t22`, `recruiting@` `cha_g7t3u`,
  `hrotasks@` `cha_g7u1m`, `pilotapp@` `cha_g9gii`. (There is no `hro@`.)
- `GET /channels/{channel_id}` — one channel.
- `GET /inboxes` and `GET /inboxes/{inbox_id}/channels` — inbox → channel mapping if
  you need to resolve which channels belong to a shared inbox.

---

## Tags, comments, contacts

- `GET /tags` — list company/team tags (id + name). Tag ids or names go in the send
  `options.tags` array, or apply after the fact.
- `POST /conversations/{conversation_id}/tags` — add tags to a thread
  (`{ "tag_ids": ["tag_..."] }`). Use to mark a thread "processed/routed".
- `DELETE /conversations/{conversation_id}/tags` — remove tags (this is a *Write*
  scope operation on tags/conversations, not the destructive Delete scope).
- `POST /conversations/{conversation_id}/comments` — internal note on a thread
  (`{ "author_id": "...", "body": "..." }`). Great for an audit trail of what the
  automation did.
- `GET /contacts` / `GET /contacts/{contact_id}` — look up a contact to match a
  sender to a candidate. `POST /contacts` only if we decide to sync candidates in.

---

## Attachments

Sending or drafting **with** attachments requires `multipart/form-data`, not JSON.
Encode each scalar field as a form field and files as `attachments[]`. Total payload
cap is **25 MB**. For inbound, download an attachment from the URL Front provides on
the message's `attachments[]` entries (needs the Attachments→Read scope).

Minimal multipart send (conceptual):
```
POST /channels/{channel_id}/messages
Content-Type: multipart/form-data
  to[]=newhire@example.com
  subject=Welcome
  body=<p>...</p>
  attachments[]=@/path/to/orientation.pdf
```

---

## Rate limiting & errors

- Limits are **per company**, by plan: Starter 50 rpm, Professional 100 rpm,
  Enterprise 200 rpm. A short burst buffer (~50% of the limit over ~10 min) exists.
- Every response carries: `x-ratelimit-limit`, `x-ratelimit-remaining`,
  `x-ratelimit-reset` (unix ts), plus burst variants.
- On overflow: **HTTP 429** with a `retry-after` header (seconds). Body:
  ```json
  { "_error": { "status": 429, "title": "Too Many Requests", "message": "Rate limit exceeded. Please retry in ..." } }
  ```
- **Always honor `retry-after`** on a 429 and back off; when bulk-reading, watch
  `x-ratelimit-remaining` and slow down before you hit zero.
- Other errors follow the same `_error` envelope: `400` bad request (usually a
  malformed handle or missing required field), `401` bad/expired token, `403` scope
  the token wasn't granted (remember Delete/Send were deliberate choices), `404`
  wrong id.

---

## Handles & recipient format

Recipient handles in `to`/`cc`/`bcc` are the raw email addresses as strings
(`"jane@example.com"`). Front resolves them to contacts. Sender identity is set by the
channel you post to (the mailbox address) plus optional `sender_name`/`author_id`;
you do not set an arbitrary From address.
