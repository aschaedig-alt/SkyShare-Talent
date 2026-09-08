import { CANDIDATE_LIST_LIMIT, CANDIDATE_PAGE_SIZES } from "@/lib/candidates/list-config";
import { isCandidateBucket } from "@/lib/candidates/buckets";

/**
 * The candidates view somebody last used — the segment and the page size.
 *
 * WHY A COOKIE. "However I last left it" is a personal preference, and this repo
 * has no migrations, so a per-user table would mean a schema change straight at
 * the live shared database. A WorkspaceSetting would be wrong in a different
 * way: it is shared, so the last person to touch it would decide what everyone
 * else sees.
 *
 * A cookie is per-person, needs no schema, and — the reason it beats
 * localStorage here — is sent WITH the request, so the server renders the right
 * list first time. localStorage can only be read after the page has mounted,
 * which means painting Everyone/100 and then yanking it away.
 *
 * WRITTEN IN MIDDLEWARE, not by an effect in the page. It began as a client
 * component that set document.cookie on mount, which is a mechanism nothing here
 * can check: the browsers available in this environment hydrate the app shell
 * but not the page inside it, on every page, so "did the effect run" is not a
 * question that can be answered before shipping. Middleware already runs on
 * every request to /candidates, so it can set the cookie on the response — no
 * JavaScript, no hydration, no flash, and a Set-Cookie header that curl can
 * read. See middleware.ts.
 *
 * ONLY THE VIEW, never a filter. The segment and page size are how you like to
 * look at the list; a search, a tag or a department is something you did once
 * and should not silently come back three days later.
 */
export const CANDIDATE_VIEW_COOKIE = "skyshare.candidates.view";

export type CandidateViewPreference = {
  bucket: string | null;
  size: number;
};

/**
 * Percent-decode if it is percent-encoded, and hand back the original if not.
 *
 * Both readers of this cookie — next/headers cookies() in the page, and
 * request.cookies in middleware — decode once already, so the value arrives as
 * plain JSON. It did not always: the writer used to encodeURIComponent before
 * handing the value to a cookie API that encodes as well, which stored it
 * double-encoded. That round-tripped only because the reader decoded twice too,
 * and would have broken the moment anything else looked at it. Values written
 * back then are still out there in people's browsers, so this stays.
 */
function decodeIfEncoded(raw: string): string {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Parse the cookie, tolerating anything — a bad value just means no preference. */
export function parseViewPreference(raw: string | undefined): CandidateViewPreference {
  const empty: CandidateViewPreference = { bucket: null, size: CANDIDATE_LIST_LIMIT };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(decodeIfEncoded(raw)) as {
      bucket?: unknown;
      size?: unknown;
    };
    const size = Number(parsed.size);
    return {
      bucket: typeof parsed.bucket === "string" && parsed.bucket ? parsed.bucket : null,
      // Validated against the offered sizes rather than trusted: a hand-edited
      // cookie asking for 50,000 rows would otherwise reach the query.
      size: CANDIDATE_PAGE_SIZES.includes(size as (typeof CANDIDATE_PAGE_SIZES)[number])
        ? size
        : CANDIDATE_LIST_LIMIT
    };
  } catch {
    return empty;
  }
}

/**
 * Plain JSON, NOT percent-encoded — the cookie API encodes on the way out.
 * Encoding here too stored it double-encoded; see decodeIfEncoded above.
 */
export function serializeViewPreference(pref: CandidateViewPreference): string {
  return JSON.stringify({ bucket: pref.bucket, size: pref.size });
}

/**
 * ?bucket=all — "show me everyone", said out loud.
 *
 * Not the same as leaving ?bucket= off, and that difference is the whole point.
 * A bare /candidates means "give me back what I was looking at", so without a
 * way to say otherwise the Everyone tile — which sets no bucket — produced
 * exactly that URL, the remembered segment was restored, and Everyone became a
 * tile you could not click your way back to.
 *
 * It is deliberately NOT a valid bucket: isCandidateBucket rejects it, so it
 * resolves to "no segment", and its mere PRESENCE is what says the choice was
 * made here and now rather than remembered.
 *
 * Lives here, next to the parser that has to recognise it, and is re-exported
 * from lib/candidates/list-url.ts for the links — so the middleware and the
 * tiles cannot drift onto two spellings of the same sentinel.
 */
export const BUCKET_ALL_PARAM = "all";

/**
 * What the URL asks to REMEMBER, merged over what is already remembered.
 *
 * MERGED, not replaced, because the two halves are set by different controls.
 * The page-size buttons rewrite only ?size=, so on a first visit — before any
 * tile has been clicked and while the URL carries no ?bucket= — replacing would
 * throw away the segment somebody had chosen on their last visit.
 *
 * Returns null when the URL asks for nothing, which is the signal not to write
 * a cookie at all: a bare visit is somebody arriving, not somebody choosing.
 */
export function viewPreferenceFromParams(
  params: URLSearchParams,
  current: CandidateViewPreference
): CandidateViewPreference | null {
  const rawBucket = params.get("bucket");
  const rawSize = params.get("size");
  if (rawBucket === null && rawSize === null) return null;

  let bucket = current.bucket;
  if (rawBucket !== null) {
    // The sentinel means Everyone, and anything unrecognised is treated the same
    // way rather than stored — a hand-edited URL should not be able to put a
    // value into the cookie that the page will later refuse to honour.
    bucket = isCandidateBucket(rawBucket.trim()) ? rawBucket.trim() : null;
  }

  let size = current.size;
  if (rawSize !== null) {
    const asked = Number(rawSize);
    size = CANDIDATE_PAGE_SIZES.includes(asked as (typeof CANDIDATE_PAGE_SIZES)[number])
      ? asked
      : CANDIDATE_LIST_LIMIT;
  }

  return { bucket, size };
}
