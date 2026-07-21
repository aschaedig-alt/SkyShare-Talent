# Front integration patterns (in-app)

Patterns for the Next.js/TypeScript app. Goal: one typed client so auth, error
handling, and 429 backoff live in a single place, and callers express intent
("draft an orientation email") rather than URLs. Adapt names to match the
surrounding code — this is a shape, not a mandate.

New code goes under `lib/front/`. The token is read server-side only.

## 1. The client wrapper

```ts
// lib/front/client.ts
const BASE = "https://api2.frontapp.com";

function token(): string {
  const t = process.env.FRONT_API_TOKEN;
  if (!t) throw new Error("FRONT_API_TOKEN is not set");
  return t;
}

type FrontError = { _error?: { status: number; title: string; message: string } };

export async function frontFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  { retries = 3 }: { retries?: number } = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get("retry-after") ?? "1") * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return frontFetch<T>(path, init, { retries: retries - 1 });
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as FrontError;
    const msg = body._error?.message ?? res.statusText;
    throw new Error(`Front ${res.status} on ${init.method ?? "GET"} ${path}: ${msg}`);
  }

  // 202 (async send) and 204 have no JSON body.
  if (res.status === 202 || res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

Notes:
- The 429 branch honors `retry-after` and recurses with one fewer retry — the whole
  app inherits correct backoff for free.
- Do **not** set `Content-Type: application/json` when sending attachments; pass a
  `FormData` body and let fetch set the multipart boundary (override the header to
  `undefined` for that call).

## 2. Resolving the channel once

```ts
// lib/front/channels.ts
export async function findChannelIdByAddress(address: string): Promise<string> {
  const { _results } = await frontFetch<{ _results: Array<{ id: string; address: string }> }>(
    "/channels",
  );
  const ch = _results.find((c) => c.address?.toLowerCase() === address.toLowerCase());
  if (!ch) throw new Error(`No Front channel for ${address}`);
  return ch.id;
}
```

Call this once during setup, then hardcode the resulting id in config
(e.g. a `WorkspaceSetting`, matching how the fleet/crew roster config is stored) so
sends don't spend a request resolving the channel every time.

## 3. Draft-first send (the default)

Because there is no test inbox and recipients are real people, the safe path creates a
**draft** a teammate approves inside Front. Prefer this unless the user explicitly
asked to auto-send.

```ts
// lib/front/orientation.ts
export async function draftOrientationEmail(input: {
  channelId: string;
  to: string;
  subject: string;
  html: string;
  authorId?: string;
}) {
  return frontFetch("/channels/" + input.channelId + "/drafts", {
    method: "POST",
    body: JSON.stringify({
      to: [input.to],
      subject: input.subject,
      body: input.html,
      author_id: input.authorId,
      mode: "shared", // visible to the whole HR team, not just the author
    }),
  });
}
```

Only swap `/drafts` for `/messages` (and expect a `202`) once the user has decided a
given flow should send without human review — and say so plainly in the code/PR.

## 4. Ingesting inbound mail

Pull-based ingestion for the shared pipeline (orientation replies, travel, sourcing,
Paycom). Follow pagination and respect rate limits.

```ts
// lib/front/inbound.ts
export async function* iterateConversations(query?: string) {
  let next: string | null = query
    ? `/conversations/search/${encodeURIComponent(query)}`
    : "/conversations";
  while (next) {
    const page = await frontFetch<{
      _results: any[];
      _pagination: { next: string | null };
    }>(next);
    for (const convo of page._results) yield convo;
    next = page._pagination?.next ?? null;
  }
}
```

Then for each conversation of interest, `GET /conversations/{id}/messages` to read the
bodies, download attachments as needed, and — once processed — **tag** or **comment**
the thread (Write scope) so it isn't handled twice. Never delete; the "processed"
signal is a tag, not removal.

If we ever move to event-driven ingestion, that's a Front **rule → webhook** plus the
Application-triggers feature on the token, not polling. Flag that as a scope decision
before building it.

## 5. Error handling expectations

- `401` → token missing/expired: surface clearly, don't retry.
- `403` → the token lacks that scope. Since scopes are frozen at creation, this means a
  new token is needed; don't paper over it.
- `400` → almost always a bad recipient handle or a missing required field
  (`to`/`body`). Validate inputs before the call.
- `429` → handled by the wrapper; if you're bulk-reading, also proactively slow down as
  `x-ratelimit-remaining` approaches zero.

## 6. Testing safely

- Read paths (`GET /channels`, a specific conversation) are safe to run against live —
  use them to prove auth and grab real ids.
- Write paths: exercise the **draft** endpoint and inspect the draft in Front before
  touching the message endpoint.
- Keep any first real send to a single internal recipient, verify it landed, then
  widen. Treat it like a production data write, because it is.
