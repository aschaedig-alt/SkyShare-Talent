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

/** The normal orientation: 9:30-3:00 Mountain at the SLC hangar office. Anything
    that differs is not blocked — it is FLAGGED, because the user's rule is that
    off-normal is allowed but must never pass silently. */
export const ORIENTATION_NORMAL = {
  startHhmm: "9:30 AM",
  endHhmm: "3:00 PM",
  address: "180 2400 W, Salt Lake City, UT 84116",
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

/** "9:30 AM" in Mountain. */
export function mountainTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ORIENTATION_NORMAL.timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(iso));
}

/** "New Hire Orientation in SLC - Tuesday, August 4th" */
export function orientationEventTitle(sessionDate: string): string {
  return `New Hire Orientation in SLC - ${orientationDayLabel(sessionDate)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/**
 * The description, as HTML. Google Calendar renders a small subset — div, br,
 * b, ul/li, a — which is exactly what this uses.
 */
export function orientationEventDescription(input: {
  sessionDate: string;
  endsAt: string | null;
  address: string;
}): string {
  const day = escapeHtml(orientationDayLabel(input.sessionDate));
  const start = mountainTime(input.sessionDate);
  const end = input.endsAt ? mountainTime(input.endsAt) : ORIENTATION_NORMAL.endHhmm;
  const timeLine = escapeHtml(`${start.toLowerCase().replace(" ", "")}-${end.toLowerCase().replace(" ", "")} MT`);
  const address = escapeHtml(input.address);

  return [
    `<div>Hello All!</div><br>`,
    `<div>We are excited to invite you to our New Hire Orientation on <b>${day}</b>, `,
    `from ${timeLine.replace(" MT", "")} in SLC. Please make sure to accept this invitation.</div><br>`,
    `<ul>`,
    `<li><b>Location:</b> ${address}</li>`,
    `<li><b>Time:</b> ${timeLine}</li>`,
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
    `</li>`,
    `<li><b>Contact Info:</b> If you need assistance getting in (the door has a lock code) `,
    `or have any trouble finding the office, please call or text ${escapeHtml(ORIENTATION_CONTACTS)}.</li>`,
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

  // Address: the session's own address wins, but the normal one is the fallback
  // because sessions were created before there was anywhere to put it.
  const address = session.address?.trim() || ORIENTATION_NORMAL.address;
  if (session.address?.trim() && session.address.trim() !== ORIENTATION_NORMAL.address) {
    warnings.push(
      `This session's address is "${session.address.trim()}", not the usual ${ORIENTATION_NORMAL.address}. This is different than normal — check the invitation email says the same thing.`
    );
  }
  if (!session.address?.trim()) {
    warnings.push(`No address on this session, so the invite uses the usual ${ORIENTATION_NORMAL.address}.`);
  }

  // End time. Without one the duration is a guess, and the description would
  // claim a 3:00 finish the calendar block does not match.
  let endIso: string;
  if (session.endsAt) {
    endIso = session.endsAt;
  } else {
    const d = new Date(session.date);
    d.setUTCHours(d.getUTCHours() + 5, d.getUTCMinutes() + 30);
    endIso = d.toISOString();
    warnings.push("This session has no end time, so the invite assumes the usual 5.5 hours (9:30-3:00). Set an end time on the session to be sure.");
  }

  const start = mountainTime(session.date);
  const end = mountainTime(endIso);
  if (start !== ORIENTATION_NORMAL.startHhmm || end !== ORIENTATION_NORMAL.endHhmm) {
    warnings.push(
      `This session runs ${start}-${end} MT, not the usual ${ORIENTATION_NORMAL.startHhmm}-${ORIENTATION_NORMAL.endHhmm}. This is different than normal — the invitation email states the hours too, so check it matches.`
    );
  }

  return {
    summary: orientationEventTitle(session.date),
    description: orientationEventDescription({ sessionDate: session.date, endsAt: endIso, address }),
    location: address,
    startTime: session.date,
    endTime: endIso,
    timeZone: ORIENTATION_NORMAL.timeZone,
    colorId: ORIENTATION_NORMAL.colorId,
    warnings
  };
}
