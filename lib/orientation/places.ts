// Where and when an orientation NORMALLY happens, and how to tell when one
// does not.
//
// WHY THIS FILE EXISTS. Her feedback (Aug 31, cmthlyx3z): "most of our
// orientations are at the same time, but every once in a while the time is
// different, so we need to be able to change the body of the emails that go out
// and the time or location when needed." The TIME half had somewhere to live —
// the session row has always stored a start and an end. The PLACE half did not:
// the session row has an address column, but nothing on the session page could
// set it, and the only addresses in the repo were one HQ constant. So the
// location override in the email could not fire on any session that mattered.
//
// On Sep 2 he recorded the places orientation actually happens (the roadmap has
// the RECORDED line): SkyShare HQ, which is the normal one; Atlantic Aviation
// FBO, sometimes; and Ogden, a chance. On Sep 11 she added that it moves to
// whatever space is free — several offices in SLC and Ogden, some in SVR — so
// place is a PICKLIST with a way to type a new one, not a fixed address. Only
// the three addresses below were ever given to us. Nothing here guesses a fourth.
//
// ONE RESOLVER FOR EVERY SURFACE. The email body, the calendar TITLE, the
// calendar DESCRIPTION, the calendar LOCATION field and the internal summary all
// call resolveSessionPlace, so "where is this session" cannot mean one thing on
// the invite and another in the email — which is the standing propagation rule,
// enforced by construction rather than by somebody remembering four places.
//
// PURE and client-safe: no Prisma, no env, no Front. The session page imports it
// to show the "different than normal" flag live while the time is being typed.

export type KnownPlaceKey = "hq" | "atlantic" | "ogden";

export type KnownPlace = {
  key: KnownPlaceKey;
  /** Short name for a sentence or a picker row: "Atlantic Aviation FBO". */
  label: string;
  /** What the session's `location` column holds for it. HQ's is the schema
      default, so every existing session already matches HQ by name. */
  name: string;
  address: string;
  /** How the invite TITLE names the city: "New Hire Orientation in SLC - …". */
  city: string;
  /** The one place that is not "different than normal". */
  usual: boolean;
};

export const ORIENTATION_PLACES: readonly KnownPlace[] = [
  {
    key: "hq",
    label: "SkyShare HQ",
    name: "SkyShare HQ, Salt Lake City",
    // Byte-identical to the Location: line already in Front templates rsp_qnije
    // and rsp_qnioq, which is what keeps a normal session's email unchanged.
    address: "180 2400 W, Salt Lake City, UT 84116",
    city: "SLC",
    usual: true
  },
  {
    key: "atlantic",
    label: "Atlantic Aviation FBO",
    name: "Atlantic Aviation FBO, Salt Lake City",
    address: "369 N 2370 W, Salt Lake City, UT 84116",
    city: "SLC",
    usual: false
  },
  {
    key: "ogden",
    label: "Ogden",
    name: "Ogden",
    address: "3715 Airport Road, Ogden, UT 84405",
    city: "Ogden",
    usual: false
  }
];

export const USUAL_PLACE: KnownPlace = ORIENTATION_PLACES[0];

/** The normal day: 9:30 AM to 3:00 PM Mountain. `start`/`end` are the values a
    native time input holds; the labels are how a person writes them. */
export const USUAL_HOURS = {
  start: "09:30",
  end: "15:00",
  startLabel: "9:30 AM",
  endLabel: "3:00 PM"
} as const;

const ZONE = "America/Denver";

// --- matching -----------------------------------------------------------------

/** Lowercase, punctuation and spacing flattened, so "180 2400 W, Salt Lake City"
    and "180 2400 W Salt Lake City" are the same place. Deliberately NOT clever
    about "Road" versus "Rd": a typed address that differs in wording is shown as
    typed, never silently merged with a known one. */
export function normalizePlaceText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findKnownPlaceByAddress(address: string | null | undefined): KnownPlace | null {
  const want = normalizePlaceText(address);
  if (!want) return null;
  return ORIENTATION_PLACES.find((p) => normalizePlaceText(p.address) === want) ?? null;
}

function findKnownPlaceByName(location: string | null | undefined): KnownPlace | null {
  const want = normalizePlaceText(location);
  if (!want) return null;
  return (
    ORIENTATION_PLACES.find((p) => normalizePlaceText(p.name) === want || normalizePlaceText(p.label) === want) ?? null
  );
}

/** "…, Salt Lake City, UT 84116" -> "SLC"; "…, Ogden, UT 84405" -> "Ogden".
    Null when the address does not end in the usual City, ST 12345 shape — the
    title then leaves the city out rather than guessing one. */
export function cityFromAddress(address: string | null | undefined): string | null {
  const m = /,\s*([^,]+?)\s*,\s*[A-Za-z]{2}\s*\d{5}(?:-\d{4})?\s*$/.exec((address ?? "").trim());
  if (!m) return null;
  const city = m[1].trim();
  // The invite has always said "in SLC", and that is how the team writes it.
  return /^salt lake city$/i.test(city) ? "SLC" : city;
}

// --- the session's place --------------------------------------------------------

export type SessionPlace = {
  /** What to call it: the session's own location name, else the known place's. */
  name: string;
  /** The street address, or null when genuinely unknown. */
  address: string | null;
  /** For the invite title. Null when it cannot be told from the address. */
  city: string | null;
  known: KnownPlace | null;
  isUsual: boolean;
  /**
   * The session row has no address, and this one was filled in from the place
   * its NAME matches. Every session predating the place picker is like this —
   * four of the six on Sep 22 had a null or HQ-named row — and a null address
   * has always meant "the usual place" on the invite and the summary. Saying so
   * lets a surface that cares (the calendar preview) mention it.
   */
  assumed: boolean;
};

/**
 * Where a session is, from its two columns.
 *
 * The rules, in order, and why:
 *   1. An address on the row wins. Matched against the known places so a typed
 *      copy of the Atlantic address still reads as Atlantic.
 *   2. No address, and the name is empty or names a known place: that place.
 *      This is what a session created before the picker looks like, and it is
 *      the same fallback the invite and the summary already used for HQ.
 *   3. No address and an unknown name ("SVR hangar"): the address is UNKNOWN.
 *      Not HQ — assuming HQ for a session somebody named as elsewhere is exactly
 *      how a new hire gets sent to the wrong building. Callers must say so.
 */
export function resolveSessionPlace(session: { location?: string | null; address?: string | null }): SessionPlace {
  const location = session.location?.trim() || "";
  const address = session.address?.trim() || "";

  if (address) {
    const known = findKnownPlaceByAddress(address);
    return {
      name: location || known?.name || address,
      address,
      city: known?.city ?? cityFromAddress(address),
      known,
      isUsual: known?.usual ?? false,
      assumed: false
    };
  }

  const byName = location ? findKnownPlaceByName(location) : USUAL_PLACE;
  if (byName) {
    return {
      name: location || byName.name,
      address: byName.address,
      city: byName.city,
      known: byName,
      isUsual: byName.usual,
      assumed: true
    };
  }

  return { name: location, address: null, city: null, known: null, isUsual: false, assumed: false };
}

/**
 * The one line that says where it is — the email's "Location:" line, the
 * invite's location field and its Location bullet, and the internal summary.
 *
 * The usual place is its bare address, exactly as the Front templates already
 * write it, so a normal session's email and invite stay byte-identical. Anywhere
 * else carries its NAME as well, because "369 N 2370 W" alone does not tell a new
 * hire which of several buildings on that ramp to walk into.
 */
export function placeLine(place: SessionPlace): string {
  if (!place.address) return place.name;
  if (place.isUsual) return place.address;
  if (place.known) return `${place.known.label}, ${place.address}`;
  const name = place.name.trim();
  if (!name || normalizePlaceText(place.address).includes(normalizePlaceText(name))) return place.address;
  return `${name}, ${place.address}`;
}

/** A place some session was actually held at that is NOT one of the known three,
    offered in the picker so a venue typed once does not have to be typed again.
    That is what turns "whatever space is free" into a list that grows by use,
    without a settings screen to maintain. See lib/orientation/places-used.ts. */
export type UsedPlace = { location: string; address: string };

/** A map search for any address. The session page already links one this way. */
export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// --- time -------------------------------------------------------------------------

/** "9:30 AM" in Mountain. Whitespace is flattened because some ICU versions put
    a narrow no-break space before AM/PM, and a string compared against "9:30 AM"
    typed in source would then never match. Nothing here compares these strings
    anyway — see mountainMinutes — but anything displayed should look the same. */
export function mountainClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
    .format(new Date(iso))
    .replace(/\s+/g, " ");
}

/** Minutes past midnight, Mountain wall clock. Numbers, not strings, so the
    comparison cannot be defeated by how a runtime spaces "AM". */
export function mountainMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function hhmmMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export const USUAL_START_MINUTES = hhmmMinutes(USUAL_HOURS.start);
export const USUAL_END_MINUTES = hhmmMinutes(USUAL_HOURS.end);

// --- different than normal -----------------------------------------------------

export type OffNormalInput = {
  date: string;
  endsAt: string | null;
  location?: string | null;
  address?: string | null;
};

/**
 * Plain sentences for everything about this session that is NOT the usual
 * orientation. Empty means a normal session.
 *
 * HIS STANDING RULE: a time or place that is not the normal one is allowed, but
 * it is FLAGGED as different than normal, visibly, and never quietly written.
 * Every surface that shows a session or builds something from it — the session
 * header, the time-and-place editor, the three send dialogs, the calendar
 * preview, the reminder dry run — takes its wording from here, so the flag says
 * the same thing wherever it appears.
 */
export function describeOffNormal(session: OffNormalInput): string[] {
  const lines: string[] = [];

  const start = mountainMinutes(session.date);
  if (session.endsAt) {
    const end = mountainMinutes(session.endsAt);
    if (start !== USUAL_START_MINUTES || end !== USUAL_END_MINUTES) {
      lines.push(
        `It runs ${mountainClock(session.date)} – ${mountainClock(session.endsAt)} MT, not the usual ${USUAL_HOURS.startLabel} – ${USUAL_HOURS.endLabel}.`
      );
    }
  } else if (start !== USUAL_START_MINUTES) {
    lines.push(
      `It starts at ${mountainClock(session.date)} MT, not the usual ${USUAL_HOURS.startLabel}, and has no end time recorded.`
    );
  }

  const place = resolveSessionPlace(session);
  if (!place.isUsual) {
    lines.push(
      place.address
        ? `It is at ${placeLine(place)}, not the usual ${USUAL_PLACE.label} (${USUAL_PLACE.address}).`
        : `It is at "${place.name}", which has no street address recorded — not the usual ${USUAL_PLACE.label}.`
    );
  }

  return lines;
}
