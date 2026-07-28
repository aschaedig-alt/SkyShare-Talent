/**
 * Read a recruiting-event invitation out of an email.
 *
 * Events reach us as mail from an organizer — a career-fair confirmation, a
 * school inviting us to a hiring day, a conference exhibitor packet — and the
 * details we need (when, where, who to call, ship-your-booth-here) are prose,
 * not fields. This turns that prose into a DRAFT.
 *
 * Two things it is not:
 *
 *  - It is not authoritative. Everything returned is a suggestion the user sees
 *    and edits before anything is written, the same contract as
 *    lib/extraction/travel-confirmation.ts. Nothing here auto-saves.
 *  - It is not the whole story. The Claude path (event-email-ai.ts) is what
 *    actually runs, and it reads these emails far better than pattern-matching
 *    can. This module is the floor beneath it: it covers an API error, a
 *    refusal or a rate limit, and fills in any field the model left null, so a
 *    bad minute degrades the feature instead of breaking it.
 *
 *    To be clear, since this has caused confusion twice: the key IS configured.
 *    ANTHROPIC_API_KEY lives in .env.local, Next.js loads it at runtime, and the
 *    app resolves it fine. Only standalone tsx scripts miss it, because
 *    "dotenv/config" reads .env alone — run those with
 *    node --env-file=.env.local. Do NOT copy the key into .env to "fix" this;
 *    duplicated secrets drift at the next rotation (see CLAUDE.md).
 *
 * Fields it cannot read confidently come back null rather than guessed. A blank
 * box the user fills in costs a few seconds; a wrong date on a career fair costs
 * the fair.
 */

import { parsePastedDate } from "@/lib/dates/parse-pasted-date";
import { startOfOfficeDay } from "@/lib/dates/display";
import type { EventType } from "@/lib/events/constants";

export type ParsedEventDraft = {
  name: string | null;
  type: EventType;
  /** ISO instants, at midnight in the office timezone (day known, time not). */
  startsAt: string | null;
  endsAt: string | null;
  /** "9:00 AM – 2:00 PM" as written — kept as text, since Event stores days. */
  timeOfDay: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  shipToAddress: string | null;
  /**
   * The email talks about a static display / bringing an aircraft. Not a
   * decision — it flags the question so the aircraft field starts UNDECIDED
   * with a reason to look, rather than silently defaulting to "no".
   */
  aircraftMentioned: boolean;
  notes: string | null;
};

// US state names -> postal codes. Organizers write "Logan, Utah" as often as
// "Logan, UT", and the state column is a two-letter field.
const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC"
};

const STATE_CODES = new Set(Object.values(STATES));

const MONTH_WORD =
  "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";

/** Strip the reply/forward noise a subject collects on its way to us. */
function cleanSubject(subject: string): string {
  return subject
    .replace(/^\s*(?:re|fw|fwd|rE)\s*:\s*/gi, "")
    .replace(/\[(?:external|ext|spam)\]/gi, "")
    .trim();
}

/**
 * Event name from the subject line.
 *
 * Organizers put the actual name there ("Utah State University Aviation Career
 * Fair Additional Information"), usually with a trailing administrative phrase.
 * Those tails are trimmed so the event is filed under its name and not under a
 * description of the email that announced it.
 */
function nameFromSubject(subject: string): string | null {
  let s = cleanSubject(subject);
  if (!s) return null;
  s = s
    .replace(
      /\s*[-–—:|]?\s*(additional information|more information|information|details|confirmation|reminder|invitation|invite|save the date|registration(?: is)?(?: now)? open|follow[- ]up|update|announcement)\s*!*\s*$/i,
      ""
    )
    .trim();
  return s.length >= 3 ? s.slice(0, 160) : null;
}

/**
 * Which kind of event, from the words used. Ordered most-specific first: an
 * "aviation career fair at the airshow" is a career fair, and CAREER_FAIR is the
 * safe default because it is overwhelmingly what we are invited to.
 */
function detectType(text: string): EventType {
  const t = text.toLowerCase();
  if (/\bcareer fair\b|\bjob fair\b|\bhiring (?:fair|event|day)\b|\bcareer expo\b/.test(t)) return "CAREER_FAIR";
  if (/\bair\s?show\b|\bfly[- ]?in\b|\bstatic display day\b/.test(t)) return "AIRSHOW";
  if (/\bconference\b|\bsymposium\b|\bconvention\b|\bsummit\b|\bexpo\b|\bNBAA\b|\bEAA\b/i.test(t)) return "CONFERENCE";
  if (/\b(?:high school|university|college|campus|classroom|school)\b|\bcareer day\b|\bstudent\b/.test(t)) return "SCHOOL";
  if (/\bcommunity\b|\bopen house\b|\bchamber of commerce\b|\bscout\b/.test(t)) return "COMMUNITY";
  return "CAREER_FAIR";
}

/**
 * Every date-shaped run of text, in order, as yyyy-mm-dd.
 *
 * The substrings are handed to parsePastedDate rather than parsed here, so this
 * inherits its month table, its ordinal handling ("24th"), its US month-first
 * rule and its Feb-30 rejection — and there is one date parser in the app, not
 * two that can disagree.
 */
function findDates(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    // "September 24th, 2026" / "Sept 24 2026"
    new RegExp(`\\b${MONTH_WORD}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"),
    // "24 September 2026" / "24-Sep-2026"
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?[ -]${MONTH_WORD}\\.?[ -]\\d{4}\\b`, "gi"),
    // "09/24/2026", "9-24-26", "2026-09-24"
    /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g,
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g
  ];

  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const iso = parsePastedDate(m[0].replace(/\s+/g, " ").trim());
      if (iso && !seen.has(iso)) {
        seen.add(iso);
        out.push(iso);
      }
    }
  }
  return out.sort();
}

/**
 * A same-month day range written once — "September 24-25, 2026". findDates only
 * sees the 25th there (the 24 has no year attached to it), so the opening day
 * would be lost and a two-day fair would land as a one-day event on its last day.
 */
function findDateRange(text: string): { start: string; end: string } | null {
  const re = new RegExp(
    `\\b(${MONTH_WORD})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|—|through|thru|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
    "i"
  );
  const m = text.match(re);
  if (!m) return null;
  const start = parsePastedDate(`${m[1]} ${m[2]}, ${m[4]}`);
  const end = parsePastedDate(`${m[1]} ${m[3]}, ${m[4]}`);
  if (!start || !end || end < start) return null;
  return { start, end };
}

/** "9:00 AM – 2:00 PM", kept verbatim — Event stores days, not clock times. */
function findTimeOfDay(text: string): string | null {
  const m = text.match(
    /\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\s*(?:-|–|—|to|until|till)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))/i
  );
  return m ? `${m[1].toUpperCase().replace(/\./g, "")} – ${m[2].toUpperCase().replace(/\./g, "")}` : null;
}

/** "Logan, Utah" or "Logan, UT 84321" -> city + state code. */
function findCityState(text: string): { city: string | null; state: string | null } {
  const coded = text.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}),\s*([A-Z]{2})\b(?:\s+\d{5})?/);
  if (coded && STATE_CODES.has(coded[2])) {
    return { city: coded[1].trim(), state: coded[2] };
  }
  const named = text.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}),\s*([A-Za-z]{4,20}(?:\s+[A-Za-z]+)?)\b/);
  if (named) {
    const code = STATES[named[2].trim().toLowerCase()];
    if (code) return { city: named[1].trim(), state: code };
  }
  return { city: null, state: null };
}

/**
 * The venue — an airport, hangar, or building name. Taken from the line that
 * names one, since that is how these emails are laid out ("Logan-Cache Airport
 * ▪ 900 West 2500 North ▪ FL9A ▪ Logan, Utah").
 */
function findVenue(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const re =
    /\b(airport|hangar|center|centre|centre|college|university|school|hotel|conference cent|convention cent|campus|fbo|terminal|arena|fairgrounds|pavilion|ballroom)\b/i;
  for (const line of lines) {
    if (line.length > 130 || !re.test(line)) continue;
    // Signature/URL/boilerplate lines match the keywords too but are not venues.
    if (/^https?:|@|\bphone\b|\bemail\b|\bweb:/i.test(line)) continue;
    // Bullet-separated address lines: the venue is the first segment.
    const first = line.split(/\s*[▪•|]\s*/)[0].trim();
    const candidate = (re.test(first) ? first : line).replace(/[.,;]$/, "").trim();
    if (candidate.length >= 4) return candidate.slice(0, 160);
  }
  return null;
}

/**
 * The ship-your-materials-ahead address.
 *
 * Worth pulling out on its own: it is the one piece of an exhibitor email with a
 * hard deadline attached, and it is always several lines below the words that
 * announce it. Captured as the block following the shipping instruction.
 */
function findShipTo(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const trigger =
    /\b(?:ship|send|mail)\b[^.\n]{0,80}\b(?:materials|items|boxes|shipment|packages?|booth|display|to the following address|ahead)\b|\bshipping address\b|\bship to\b/i;
  const idx = lines.findIndex((l) => trigger.test(l));
  if (idx === -1) return null;

  const block: string[] = [];
  for (let i = idx + 1; i < lines.length && block.length < 6; i += 1) {
    const line = lines[i];
    if (!line) {
      if (block.length) break;
      continue;
    }
    // Stop at the next instruction — an address block is names and numbers.
    if (/^(?:if you|please|note|day of|booth|hospitality)\b/i.test(line)) break;
    block.push(line);
    if (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(line)) break; // ends at the ZIP
  }
  const joined = block.join("\n").trim();
  return joined.length >= 10 ? joined.slice(0, 400) : null;
}

/** First http(s) or bare-domain link that is not a tracking/social/map URL. */
function findWebsite(text: string): string | null {
  const urls = [...text.matchAll(/\bhttps?:\/\/[^\s<>"')\]]+/gi)].map((m) => m[0]);
  const bare = [...text.matchAll(/\b(?:www\.[a-z0-9-]+\.[a-z]{2,}|[a-z0-9-]+\.(?:edu|org|aero))\b/gi)].map((m) => m[0]);
  const skip = /goo\.gl|maps\.|google\.com\/maps|facebook|twitter|x\.com|linkedin|instagram|youtube|unsubscribe|mailchimp|list-manage|frontapp/i;
  for (const raw of [...urls, ...bare]) {
    const url = raw.replace(/[.,;)]+$/, "");
    if (skip.test(url)) continue;
    return url.startsWith("http") ? url : `https://${url}`;
  }
  return null;
}

function findEmail(text: string): string | null {
  const m = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (!m) return null;
  // Our own addresses are the recipient, never the organizer.
  return /@skyshare\.com$/i.test(m[0]) ? null : m[0];
}

function findPhone(text: string): string | null {
  const m = text.match(/(?:\+1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/);
  return m ? m[0].trim() : null;
}

/**
 * The organizer's name, read off the sign-off block. Anchored to "Best regards"
 * / "Thanks" and friends because a bare capitalised line appears all over an
 * email; after a sign-off it is a person.
 */
function findContactName(text: string, contactEmail: string | null): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const signOff = /^(?:best regards|kind regards|warm regards|regards|sincerely|thanks|thank you|cheers|best)\b[,.!]?$/i;
  const idx = lines.findIndex((l) => signOff.test(l));
  if (idx !== -1) {
    for (let i = idx + 1; i < Math.min(idx + 6, lines.length); i += 1) {
      const line = lines[i];
      if (!line || /^\[?cid:/i.test(line)) continue;
      if (/^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/.test(line) && line.length <= 60) return line;
    }
  }
  // Fall back to the local part of the address — "jordan.averett@usu.edu".
  if (contactEmail) {
    const local = contactEmail.split("@")[0];
    if (/^[a-z]+[._][a-z]+$/i.test(local)) {
      return local
        .split(/[._]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(" ");
    }
  }
  return null;
}

/**
 * Does this email raise the aircraft question?
 *
 * "Static display" is the term of art an organizer uses, and it is exactly the
 * thing that needs deciding early — so it is detected and surfaced rather than
 * left buried in a wall of exhibitor instructions.
 */
function mentionsAircraft(text: string): boolean {
  return /\bstatic display\b|\baircraft (?:display|on (?:the )?(?:ramp|static))\b|\bbring(?:ing)? (?:an? )?(?:aircraft|airplane|jet|plane)\b|\bramp space\b|\bair[- ]?stairs\b|\bGPU\b|\bdisplay aircraft\b/i.test(
    text
  );
}

/** A short "what else the email said" note, for the parts we do not model. */
function buildNotes(text: string, timeOfDay: string | null): string | null {
  const bits: string[] = [];
  if (timeOfDay) bits.push(`Hours: ${timeOfDay}`);

  const arrival = text.match(/\b(?:do not arrive until|arrive(?:al)? (?:by|at|no later than)|check[- ]?in (?:begins|opens|at))\s+[^.\n]{0,60}/i);
  if (arrival) bits.push(arrival[0].trim());

  const booth = text.match(/\b(?:a\s+)?(?:six|6|eight|8|ten|10)[- ]foot\s+(?:folding\s+)?table[^.\n]{0,80}/i);
  if (booth) bits.push(booth[0].trim());

  const fee = text.match(/\$\s?\d[\d,]*(?:\.\d{2})?[^.\n]{0,40}\b(?:fee|cost|registration|booth)\b|\b(?:fee|cost|registration)\b[^.\n]{0,30}\$\s?\d[\d,]*/i);
  if (fee) bits.push(fee[0].trim());

  const joined = bits.join("\n");
  return joined ? joined.slice(0, 600) : null;
}

/**
 * Best-effort draft from raw email text. `subject` is passed separately because
 * it carries the event's name and is not part of the body.
 */
export function parseEventEmail(rawText: string, subject = ""): ParsedEventDraft {
  const text = (rawText || "").replace(/\r\n/g, "\n");
  const haystack = `${subject}\n${text}`;

  const range = findDateRange(haystack);
  const dates = findDates(haystack);
  const startDay = range?.start ?? dates[0] ?? null;
  // A single email can carry unrelated dates (a registration deadline, a
  // signature). Only a same-month written range is trusted as a multi-day event;
  // otherwise the second date is left for the user rather than guessed as an end.
  const endDay = range && range.end !== range.start ? range.end : null;

  const timeOfDay = findTimeOfDay(text);
  const { city, state } = findCityState(text);
  const contactEmail = findEmail(text);

  return {
    name: nameFromSubject(subject),
    type: detectType(haystack),
    startsAt: startDay ? startOfOfficeDay(startDay)?.toISOString() ?? null : null,
    endsAt: endDay ? startOfOfficeDay(endDay)?.toISOString() ?? null : null,
    timeOfDay,
    venue: findVenue(text),
    city,
    state,
    website: findWebsite(text),
    contactName: findContactName(text, contactEmail),
    contactEmail,
    contactPhone: findPhone(text),
    shipToAddress: findShipTo(text),
    aircraftMentioned: mentionsAircraft(haystack),
    notes: buildNotes(text, timeOfDay)
  };
}

/**
 * Does this email look like an event invitation at all?
 *
 * A cheap prefilter for a mailbox sweep, deliberately generous: it only asks
 * whether the words of an event appear anywhere, and leaves the actual verdict
 * to the model.
 *
 * It used to ALSO require a machine-readable date, on the reasoning that an
 * invitation without a date is not something you can put on a calendar. That
 * was wrong, and it cost a real lead: a UVU invitation to two spring career
 * fairs writes its dates as "January 28" and "February 4" with the year only in
 * the subject line, so the date scanner — which insists on a four-digit year —
 * found nothing and the email was discarded before the model ever read it. The
 * model resolves those dates without difficulty. A prefilter that silently drops
 * genuine invitations is worse than one that passes a few extra emails to a
 * classifier that will reject them anyway.
 */
export function looksLikeEventEmail(subject: string, body: string): boolean {
  const haystack = `${subject}\n${body}`;
  return /\bcareer fair\b|\bjob fair\b|\bhiring (?:fair|event|day)\b|\bcareer (?:day|expo|night)\b|\bcareer (?:and|&) internship fair\b|\bair\s?show\b|\bfly[- ]?in\b|\bconference\b|\bsymposium\b|\bconvention\b|\bexpo\b|\bopen house\b|\bexhibitor\b|\bbooth\b|\brecruiting event\b|\bstatic display\b|\bcome recruit\b|\baviation day\b/i.test(
    haystack
  );
}
