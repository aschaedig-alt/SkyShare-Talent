import { prisma } from "@/lib/prisma";

// Everything a REMOTE orientation attendee needs that an in-person one does not.
//
// Asked for Nov 19 2026: "we need to send links to the video and the presentation
// and anything else to remote employees before orientation... also give them best
// practices like distraction free, camera, muted. order lunch for remote people too."
//
// Two pieces, both WorkspaceSetting JSON rather than new columns, so nothing here
// needs a migration against the shared live database:
//
//   LINKS — one STANDING list (he said they are the same every orientation). The
//     "4. Remote" Front template carries an [Orientation Links] placeholder and the
//     send fills it from this list, so a changed link is edited here once instead
//     of in Front. The session's own Meet link is filled separately from
//     OrientationSession.meetLink, because that one DOES change per session.
//
//   LUNCH — per remote attendee, because the room's lunch order (the session's
//     lunchVendor / lunchArrivalAt) feeds the people in SLC. Someone joining from
//     home gets delivery to their own address, in their own time zone, so the
//     questions are different: where to, what, has it been ordered, when it lands.

const SCOPE = "orientation";
const LINKS_KEY = "remote-links";
const LUNCH_KEY = "remote-lunch";

export type RemoteLink = { label: string; url: string };

export type RemoteLunch = {
  /** Where it is delivered. Typed, because NewHire has no home address field. */
  address: string;
  /** What they asked for, and from where. */
  order: string;
  ordered: boolean;
  /** Free text on purpose: the arrival is in THEIR time zone ("11:45am PT"),
      and a datetime field would silently read it as Mountain. */
  arrival: string;
  notes: string;
  updatedAt?: string;
};

export const EMPTY_LUNCH: RemoteLunch = { address: "", order: "", ordered: false, arrival: "", notes: "" };

/** http(s) only — these go into an email as href, so nothing else is let through. */
function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeRemoteLinks(input: unknown): RemoteLink[] {
  if (!Array.isArray(input)) return [];
  const out: RemoteLink[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const url = cleanUrl(r.url);
    if (!url) continue;
    const label = typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 120) : url;
    out.push({ label, url });
  }
  return out.slice(0, 20);
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function normalizeRemoteLunch(input: unknown): RemoteLunch {
  if (!input || typeof input !== "object") return { ...EMPTY_LUNCH };
  const r = input as Record<string, unknown>;
  return {
    address: str(r.address, 400),
    order: str(r.order, 600),
    ordered: r.ordered === true,
    arrival: str(r.arrival, 80),
    notes: str(r.notes, 600),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined
  };
}

async function readJson(key: string): Promise<unknown> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key }, select: { valueJson: true } });
  if (!row?.valueJson) return null;
  try {
    return JSON.parse(row.valueJson) as unknown;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const valueJson = JSON.stringify(value);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key } },
    create: { scope: SCOPE, key, valueJson },
    update: { valueJson }
  });
}

export async function getRemoteLinks(): Promise<RemoteLink[]> {
  return normalizeRemoteLinks(await readJson(LINKS_KEY));
}

export async function saveRemoteLinks(input: unknown): Promise<RemoteLink[]> {
  const links = normalizeRemoteLinks(input);
  await writeJson(LINKS_KEY, links);
  return links;
}

type LunchMap = Record<string, RemoteLunch>;

async function readLunchMap(): Promise<LunchMap> {
  const raw = await readJson(LUNCH_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as LunchMap) : {};
}

/** attendeeId -> lunch, for just these attendees. Missing = nothing entered yet. */
export async function getRemoteLunches(attendeeIds: string[]): Promise<Record<string, RemoteLunch>> {
  if (!attendeeIds.length) return {};
  const map = await readLunchMap();
  const out: Record<string, RemoteLunch> = {};
  for (const id of attendeeIds) if (map[id]) out[id] = normalizeRemoteLunch(map[id]);
  return out;
}

export async function saveRemoteLunch(attendeeId: string, input: unknown): Promise<RemoteLunch> {
  const lunch = { ...normalizeRemoteLunch(input), updatedAt: new Date().toISOString() };
  const map = await readLunchMap();
  map[attendeeId] = lunch;
  await writeJson(LUNCH_KEY, map);
  return lunch;
}

// --- the email fill ----------------------------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** Matches the Front templates' own Verdana 9pt markup, so the inserted lines do
    not read as pasted in by a machine. */
const SPAN_OPEN = `<span style="font-family: Verdana, sans-serif;"><span style="background-color: transparent; font-size: 9pt;">`;
const SPAN_CLOSE = `</span></span>`;

export function linksHtml(links: RemoteLink[]): string {
  if (!links.length) return "";
  return (
    `<ul>` +
    links
      .map((l) => `<li>${SPAN_OPEN}<a href="${esc(l.url)}">${esc(l.label)}</a>${SPAN_CLOSE}</li>`)
      .join("") +
    `</ul>`
  );
}

export function meetLinkHtml(meetLink: string): string {
  return `<a href="${esc(meetLink)}">${esc(meetLink)}</a>`;
}

/** The placeholders the "4. Remote" Front template uses. Brackets tolerate the
    &nbsp; and casing a rich-text editor tends to introduce. */
export const LINKS_PLACEHOLDER = /\[(?:\s|&nbsp;)*Orientation(?:\s|&nbsp;)+Links(?:\s|&nbsp;)*\]/gi;
export const MEET_PLACEHOLDER = /\[(?:\s|&nbsp;)*Meet(?:\s|&nbsp;)+Link(?:\s|&nbsp;)*\]/gi;

/**
 * Fill [Orientation Links] and [Meet Link] in a template body. Every gap is
 * reported rather than left to be noticed in the recipient's inbox: no links on
 * the standing list, no Meet link on the session, or a template that has lost
 * a placeholder (somebody reworded it in Front).
 */
export function fillRemotePlaceholders(
  html: string,
  links: RemoteLink[],
  meetLink: string | null | undefined
): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  let text = html;

  const hasLinks = [...text.matchAll(LINKS_PLACEHOLDER)].length > 0;
  if (!hasLinks) {
    warnings.push(
      "The Front template has no [Orientation Links] placeholder, so the video and presentation links are NOT in this email. Add them in the box below, or put the placeholder back in the template."
    );
  } else if (!links.length) {
    warnings.push(
      "No orientation links are saved yet (Remote attendees panel → Links), so this email has none. Add the video and presentation links before sending."
    );
    text = text.replace(LINKS_PLACEHOLDER, "");
  } else {
    text = text.replace(LINKS_PLACEHOLDER, linksHtml(links));
  }

  const meet = meetLink?.trim();
  const hasMeet = [...text.matchAll(MEET_PLACEHOLDER)].length > 0;
  if (hasMeet) {
    if (meet) {
      text = text.replace(MEET_PLACEHOLDER, meetLinkHtml(meet));
    } else {
      warnings.push(
        "This session has no Meet link saved, so the email points them at the link in their calendar invite instead. Add one with “Change time or place” if you want it in the email."
      );
      text = text.replace(MEET_PLACEHOLDER, "the Google Meet link in your calendar invite");
    }
  } else if (meet) {
    warnings.push("The Front template has no [Meet Link] placeholder, so this session's Meet link is not in the email.");
  }

  return { text, warnings };
}
