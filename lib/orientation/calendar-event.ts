// The orientation calendar invite, built from a session.
//
// This is the app's copy of the wording Aimee uses by hand — title format and
// description — so "create the invite" produces the same event every time
// instead of depending on who is typing that day.
//
// Deliberately PURE: no Prisma, no Google, no env. It turns a session into an
// event shape and a list of warnings, which means the preview the user approves
// and the event that actually gets created come from one function and cannot
// disagree. Same principle as lib/front/orientation-email.ts.
//
// THE STANDING RULE this implements: the date and the address appear in the
// TITLE, the DESCRIPTION and the LOCATION field, and a change has to reach all
// of them. Building all three from one session in one pass is how that stops
// being something a human has to remember.

import { ordinalDayLabel } from "@/lib/dates/ordinal";
import {
  describeOffNormal,
  mapsSearchUrl,
  mountainClock,
  placeLine,
  resolveSessionPlace,
  USUAL_HOURS,
  USUAL_PLACE,
  type SessionPlace
} from "./places";

/** The normal orientation: 9:30-3:00 Mountain at the SLC hangar office. Anything
    that differs is not blocked — it is FLAGGED, because the user's rule is that
    off-normal is allowed but must never pass silently.
    The hours and the address now come from lib/orientation/places.ts, which also
    holds the other places orientation is held, so there is one definition of
    "normal" rather than one here and another wherever the email checks it. */
export const ORIENTATION_NORMAL = {
  startHhmm: USUAL_HOURS.startLabel,
  endHhmm: USUAL_HOURS.endLabel,
  address: USUAL_PLACE.address,
  /** Clean share link. NOT the google.com/url?q= wrapper Calendar emits on copy:
      that carries tracking params and a timestamp, and it rots. */
  mapsUrl: "https://maps.app.goo.gl/pHtBNvaNucXBzNPq7",
  timeZone: "America/Denver",
  /** Aimee's renamed "Orientation" colour in this Workspace. The API only ever
      exposes the number; the label is visible in her UI alone. */
  colorId: "5"
} as const;

/** Who a lost new hire should call on the day. Edit here — it appears in every
    invite from now on. */
export const ORIENTATION_CONTACTS = "Aimee at 863-514-4907 or Kevin at 801-859-3089";

/** "Tuesday, August 4th" — always the MOUNTAIN day, so a late-evening UTC
    instant can't roll the date forward. Shared with the orientation EMAIL via
    lib/dates/ordinal so the same session cannot read two different ways. */
export function orientationDayLabel(sessionDate: string): string {
  return ordinalDayLabel(sessionDate, ORIENTATION_NORMAL.timeZone);
}

/** "9:30 AM" in Mountain. Delegates to places.ts, which flattens the narrow
    no-break space some ICU versions put before AM/PM — the description below
    squeezes that space out with replace(" ", ""), which a U+202F would survive. */
export function mountainTime(iso: string): string {
  return mountainClock(iso);
}

/**
 * "New Hire Orientation in SLC - Tuesday, August 4th"
 *
 * The TITLE carries the city as well as the date, so it is one of the four
 * places a change of venue has to reach. It used to be "in SLC" whatever the
 * session said, which would have titled an Ogden orientation as SLC. The city
 * comes from the session's place; left out (never guessed) when it cannot be
 * told. Defaulting to SLC keeps every existing caller and every HQ session
 * byte-identical.
 */
export function orientationEventTitle(sessionDate: string, city: string | null = "SLC"): string {
  const where = city?.trim() ? ` in ${city.trim()}` : "";
  return `New Hire Orientation${where} - ${orientationDayLabel(sessionDate)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/**
 * The description, as HTML. Google Calendar renders a small subset — div, br,
 * b, ul/li, a — which is exactly what this uses.
 *
 * THE DIRECTIONS ARE HQ'S. Parking among the hangars, the security gate, the
 * sidewalk along the ramp, the downstairs conference room, the door code — every
 * word of that describes 180 2400 W and nowhere else. So they are written only
 * for a session at HQ. A session anywhere else gets a map link for ITS address
 * and a contact line that does not mention HQ's door, rather than directions to
 * a different building. For HQ the output is byte-identical to before, which is
 * what keeps an existing invite reading as in step.
 */
export function orientationEventDescription(input: {
  sessionDate: string;
  endsAt: string | null;
  place: SessionPlace;
}): string {
  const day = escapeHtml(orientationDayLabel(input.sessionDate));
  const start = mountainTime(input.sessionDate);
  const end = input.endsAt ? mountainTime(input.endsAt) : ORIENTATION_NORMAL.endHhmm;
  const timeLine = escapeHtml(`${start.toLowerCase().replace(" ", "")}-${end.toLowerCase().replace(" ", "")} MT`);
  const where = escapeHtml(placeLine(input.place));
  const city = input.place.city
    ? `in ${escapeHtml(input.place.city)}`
    : `at ${escapeHtml(input.place.known?.label ?? input.place.name)}`;

  const directions = input.place.isUsual
    ? [
        `<li><b>Directions:</b> <a href="${ORIENTATION_NORMAL.mapsUrl}">Google Maps Link</a> `,
        `(if you put our address into your GPS, it will bring you right to the parking lot)`,
        `<ul>`,
        `<li>As you enter the parking lot, you&apos;ll notice it is surrounded by a few hangars. `,
        `If you see an airport security gate leading to the ramp area, you are in the right place, `,
        `so feel free to park anywhere.</li>`,
        `<li>To find our office, walk down the sidewalk bordering the ramp area.</li>`,
        `<li>Once inside, orientation will be held in the downstairs conference room, `,
        `which is the first door on the left.</li>`,
        `</ul>`,
        `</li>`
      ]
    : input.place.address
      ? [`<li><b>Directions:</b> <a href="${escapeHtml(mapsSearchUrl(input.place.address))}">Google Maps Link</a></li>`]
      : [];

  const contact = input.place.isUsual
    ? [
        `<li><b>Contact Info:</b> If you need assistance getting in (the door has a lock code) `,
        `or have any trouble finding the office, please call or text ${escapeHtml(ORIENTATION_CONTACTS)}.</li>`
      ]
    : [`<li><b>Contact Info:</b> If you have any trouble finding it, please call or text ${escapeHtml(ORIENTATION_CONTACTS)}.</li>`];

  return [
    `<div>Hello All!</div><br>`,
    `<div>We are excited to invite you to our New Hire Orientation on <b>${day}</b>, `,
    `from ${timeLine.replace(" MT", "")} ${city}. Please make sure to accept this invitation.</div><br>`,
    `<ul>`,
    `<li><b>Location:</b> ${where}</li>`,
    `<li><b>Time:</b> ${timeLine}</li>`,
    ...directions,
    ...contact,
    `</ul><br>`,
    `<div>Looking forward to seeing you there!</div>`
  ].join("");
}

export type OrientationEventDraft = {
  summary: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  colorId: string;
  /** Things the user should see before approving. Off-normal is allowed, never silent. */
  warnings: string[];
};

export type SessionForCalendar = {
  date: string;
  endsAt: string | null;
  location: string | null;
  address: string | null;
};

/**
 * Build the whole event from a session, plus the warnings that implement the
 * "flag anything off-normal" rule.
 */
export function buildOrientationEvent(session: SessionForCalendar): OrientationEventDraft {
  const warnings: string[] = [];

  // Where: one resolver shared with the emails and the summary (places.ts), so
  // the invite and the email cannot disagree about the building. The session's
  // own address wins; a session with none falls back to the place its name
  // matches — HQ for every session created before the place picker existed.
  const place = resolveSessionPlace(session);

  // End time. Without one the duration is a guess, and the description would
  // claim a finish the calendar block does not match.
  let endIso: string;
  if (session.endsAt) {
    endIso = session.endsAt;
  } else {
    const d = new Date(session.date);
    d.setUTCHours(d.getUTCHours() + 5, d.getUTCMinutes() + 30);
    endIso = d.toISOString();
    // Names the end it is about to use. This used to say "(9:30-3:00)" whatever
    // the start was, which on an 11:00 session described an event it was not
    // creating.
    warnings.push(
      `This session has no end time, so the invite assumes the usual length of 5.5 hours and ends at ${mountainTime(endIso)} MT. Set an end time on the session to be sure.`
    );
  }

  // Different than normal. The wording comes from describeOffNormal, the same
  // sentences the session page and the email dialogs show, so the flag reads the
  // same wherever it appears. Checked against the REAL end when there is one;
  // with none, only the start can honestly be compared.
  for (const line of describeOffNormal({
    date: session.date,
    endsAt: session.endsAt,
    location: session.location,
    address: session.address
  })) {
    warnings.push(
      `Different than normal: ${line} The invitation emails state the time and place too — check they say the same.`
    );
  }

  if (!session.address?.trim()) {
    warnings.push(
      place.address
        ? `No address on this session, so the invite uses ${place.isUsual ? "the usual" : `the one on file for ${place.known?.label ?? place.name},`} ${place.address}. Set the place on the session to make it explicit.`
        : `This session's place, "${place.name}", has no street address, so the invite's location field just says that and there is no map link. Set the address on the session.`
    );
  }
  if (!place.isUsual && place.address) {
    warnings.push(
      `The HQ parking directions (hangars, security gate, downstairs conference room) are left out of the invite, because this session is not at HQ. It links a map of ${place.address} instead.`
    );
  }

  return {
    summary: orientationEventTitle(session.date, place.city),
    description: orientationEventDescription({ sessionDate: session.date, endsAt: endIso, place }),
    location: placeLine(place),
    startTime: session.date,
    endTime: endIso,
    timeZone: ORIENTATION_NORMAL.timeZone,
    colorId: ORIENTATION_NORMAL.colorId,
    warnings
  };
}
