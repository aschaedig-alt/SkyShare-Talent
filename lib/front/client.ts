import "dotenv/config";

// One place every Front Core API call goes through, so auth, error shape, and the
// 429 backoff live here instead of being re-implemented at each call site. See
// .claude/skills/front-api for the full endpoint reference and the reasoning behind
// the draft-first default in messages.ts.

const BASE = "https://api2.frontapp.com";

function token(): string {
  const t = process.env.FRONT_API_TOKEN;
  if (!t) {
    throw new Error("FRONT_API_TOKEN is not set");
  }
  return t;
}

type FrontErrorBody = {
  _error?: { status: number; title: string; message: string };
};

export class FrontApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    message: string
  ) {
    super(`Front ${status} on ${method} ${path}: ${message}`);
    this.name = "FrontApiError";
  }
}

type FrontFetchOptions = { retries?: number };

/**
 * Call the Front Core API. Pass a path ("/channels") or a full URL (pagination
 * `_pagination.next` links come back absolute). JSON in, parsed JSON out — except
 * 202 (async send accepted) and 204, which have no body and resolve to undefined.
 *
 * For attachments, pass a FormData `body` and set `headers: { "Content-Type": undefined }`
 * so fetch can attach the multipart boundary itself.
 */
export async function frontFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  { retries = 3 }: FrontFetchOptions = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const method = init.method ?? "GET";

  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      // JSON by default; skip it for multipart so the boundary is set for us.
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

  // Honor Front's retry-after on rate limits rather than hammering it.
  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await new Promise((r) => setTimeout(r, Math.max(1, retryAfter) * 1000));
    return frontFetch<T>(path, init, { retries: retries - 1 });
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as FrontErrorBody;
    throw new FrontApiError(
      res.status,
      method,
      path,
      body._error?.message ?? res.statusText
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }
  // 202 (async send) is documented as a bare acknowledgement, but Front does return
  // the created message plus a link to its conversation — worth keeping so callers can
  // record what thread a send became. Tolerate an empty body either way.
  return (await res.json().catch(() => undefined)) as T;
}

/** Fetch raw bytes (e.g. an inbound attachment) with the same auth + 429 backoff,
 *  bypassing JSON parsing. Pass a path or an absolute Front URL. */
export async function frontFetchBinary(
  path: string,
  { retries = 3 }: FrontFetchOptions = {}
): Promise<ArrayBuffer> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await new Promise((r) => setTimeout(r, Math.max(1, retryAfter) * 1000));
    return frontFetchBinary(path, { retries: retries - 1 });
  }
  if (!res.ok) {
    throw new FrontApiError(res.status, "GET", path, res.statusText);
  }
  return res.arrayBuffer();
}

/** Follow a paginated list endpoint to exhaustion, yielding each result. */
export async function* paginate<T = unknown>(
  startPath: string
): AsyncGenerator<T> {
  let next: string | null = startPath;
  while (next) {
    const page = await frontFetch<{
      _results: T[];
      _pagination?: { next: string | null };
    }>(next);
    for (const item of page._results ?? []) {
      yield item;
    }
    next = page._pagination?.next ?? null;
  }
}
