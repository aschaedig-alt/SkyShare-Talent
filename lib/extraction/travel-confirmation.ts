/**
 * Travel confirmation extraction from pasted email / itinerary text.
 *
 * DEV NOTE: like pilot-metrics.ts this is intentionally simple pattern-matching.
 * It is source-agnostic (works on any airline / hotel / rental confirmation, not
 * just FlightBridge) and everything it returns is a SUGGESTION the user reviews
 * before it is written — nothing is auto-saved. Planned upgrade: swap
 * parseTravelConfirmation() for a Claude LLM call once we have real FlightBridge
 * samples to tune against (see memory: extraction-llm-upgrade, travel-module-plan).
 */

import { zonedWallClockToUtc } from "@/lib/booking/timezone";
import { DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";

export type ParsedTravelItem = {
  type: "FLIGHT" | "CAR" | "HOTEL" | "TRANSPORT" | "OTHER";
  vendor: string | null;
  confirmation: string | null;
  detail: string | null;
  startsAt: string | null; // ISO, or null if not confidently parsed
  amount: number | null;
};

export type ParsedTravel = {
  items: ParsedTravelItem[];
  originAirport: string | null;
  destinationAirport: string | null;
  preferredAirline: string | null;
};

// Brand lists drive both item-type detection and the vendor name.
const AIRLINES = [
  "Delta",
  "American Airlines",
  "American",
  "United",
  "Southwest",
  "Alaska",
  "JetBlue",
  "Spirit",
  "Frontier",
  "Hawaiian",
  "Allegiant",
  "Sun Country"
];

const HOTELS = [
  "Marriott",
  "Courtyard",
  "Residence Inn",
  "Fairfield",
  "SpringHill Suites",
  "Hilton",
  "Hilton Garden Inn",
  "Hampton",
  "Embassy Suites",
  "DoubleTree",
  "Hyatt",
  "Hyatt Place",
  "Holiday Inn",
  "Holiday Inn Express",
  "Sheraton",
  "Westin",
  "Best Western",
  "La Quinta",
  "Comfort Inn",
  "Marriott Bonvoy"
];

const RENTALS = [
  "Hertz",
  "Avis",
  "Enterprise",
  "National",
  "Budget",
  "Alamo",
  "Dollar",
  "Thrifty",
  "Sixt"
];

const GROUND = ["Uber", "Lyft", "shuttle", "limo", "car service", "taxi"];

function findBrand(text: string, brands: string[]): string | null {
  // Longest brand first so "Hilton Garden Inn" wins over "Hilton".
  for (const brand of [...brands].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) return brand;
  }
  return null;
}

// Confirmation / record-locator / booking reference token. A separator (": " or
// "#") is required so a bare "confirmation" in a sentence can't match, and the
// label is gated so we only grab the value that follows a real label.
function findConfirmation(text: string): string | null {
  const re =
    /(?:confirmation|record\s*locator|booking\s*(?:reference|number|id|code)|reservation|\bPNR\b|conf\.?)\s*(?:number|code|no\.?|#|reference|id)?\s*[:#]\s*([A-Z0-9]{5,12})\b/i;
  const m = text.match(re);
  return m ? m[1].toUpperCase() : null;
}

// Largest dollar amount near a "total"-style label, else the largest amount seen.
function findAmount(text: string): number | null {
  const labeled = [
    ...text.matchAll(
      /(?:grand\s*total|total\s*(?:charged|cost|price|due|amount)?|amount\s*(?:charged|due)?|fare|price)\D{0,20}\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/gi
    )
  ].map((m) => Number(m[1].replace(/,/g, "")));
  if (labeled.length) return Math.max(...labeled.filter((n) => Number.isFinite(n)));

  const any = [...text.matchAll(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  const valid = any.filter((n) => Number.isFinite(n) && n > 0);
  return valid.length ? Math.max(...valid) : null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

// First confidently-parseable date (optionally with a time) → ISO.
function findDate(text: string): string | null {
  // Airlines write the date compactly — "Thu 16Jul2026" is what Delta and
  // FlightBridge actually send. Date cannot parse that and none of the patterns
  // below match it, so every real flight we imported landed with startsAt null
  // and its date stranded in the detail text. Tried first: on a flight line it
  // is the date, and the generic patterns can misread the surrounding tokens.
  //
  // A 4-digit year is required, so a bare "16Jul" can never look like a date.
  // Deliberately no time: a trailing number on these lines ("| 859") is as
  // often the flight number as a departure time, so we only claim the day.
  const compact = text.match(/\b(\d{1,2})[\s-]?([A-Za-z]{3})[a-z]*[\s-]?(\d{4})\b/);
  if (compact) {
    const month = MONTHS[compact[2].toLowerCase()];
    const day = Number(compact[1]);
    if (month !== undefined) {
      // Midnight in the OFFICE timezone, not UTC. Midnight-UTC reads back as 6pm
      // the previous day in Mountain, which put the flight on the wrong date.
      const iso = officeInstant(Number(compact[3]), month, day);
      if (iso) return iso;
    }
  }

  // e.g. "Feb 23, 2026 2:30 PM" or "02/23/2026" or "2026-02-23"
  //
  // Parsed into COMPONENTS and re-anchored to the office timezone rather than
  // handed to new Date(). A bare wall-clock string has no zone, so new Date()
  // reads it in whatever zone the code happens to be running in — which is UTC
  // on the server. That is how a 9:37am departure got stored as 09:37Z (3:37am
  // Mountain) and reported as "every flight is six hours off".
  const named = text.match(
    /\b([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    if (month !== undefined) {
      const iso = officeInstant(Number(named[3]), month, Number(named[2]), named[4], named[5], named[6]);
      if (iso) return iso;
    }
  }

  const slashed = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);
  if (slashed) {
    const iso = officeInstant(Number(slashed[3]), Number(slashed[1]) - 1, Number(slashed[2]), slashed[4], slashed[5], slashed[6]);
    if (iso) return iso;
  }

  const dashed = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (dashed) {
    const iso = officeInstant(Number(dashed[1]), Number(dashed[2]) - 1, Number(dashed[3]), dashed[4], dashed[5]);
    if (iso) return iso;
  }

  return null;
}

/**
 * Build an instant from wall-clock components read out of a confirmation,
 * interpreted in the OFFICE timezone — a departure time printed on a booking is
 * local to the trip, never UTC and never the server's zone.
 *
 * With no hour, this returns midnight in the office timezone, which everything
 * downstream treats as "day known, time unknown" (see lib/dates/display).
 */
function officeInstant(
  year: number,
  month: number,
  day: number,
  hourRaw?: string,
  minuteRaw?: string,
  meridiem?: string
): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  let hour = hourRaw ? Number(hourRaw) : 0;
  const minute = minuteRaw ? Number(minuteRaw) : 0;
  if (meridiem) {
    const pm = /pm/i.test(meridiem);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  const d = zonedWallClockToUtc(year, month, day, hour, minute, DEFAULT_TIMEZONE);
  if (Number.isNaN(d.getTime())) return null;
  // Guard against a rolled-over date (e.g. Feb 30 in a malformed confirmation).
  const back = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE }).format(d);
  const expected = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return back === expected ? d.toISOString() : null;
}

// A short, human "detail" line: the most informative non-empty line.
function findDetail(text: string, hint: RegExp): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hit = lines.find((l) => hint.test(l));
  if (hit) return hit.slice(0, 160);
  return null;
}

// Origin/destination 3-letter airport codes — from a direct route like
// "MCO → SLC", or from parenthesized codes like "Orlando (MCO) ... (SLC)".
function findRoute(text: string): { origin: string | null; destination: string | null } {
  const direct = text.match(/\b([A-Z]{3})\b\s*(?:-|–|—|to|→|>)\s*\b([A-Z]{3})\b/);
  if (direct) return { origin: direct[1], destination: direct[2] };

  const paren = [...text.matchAll(/\(([A-Z]{3})\)/g)].map((m) => m[1]);
  if (paren.length >= 2) return { origin: paren[0], destination: paren[paren.length - 1] };
  if (paren.length === 1) return { origin: null, destination: paren[0] };
  return { origin: null, destination: null };
}

export function parseTravelConfirmation(rawText: string): ParsedTravel {
  const text = rawText || "";
  const confirmation = findConfirmation(text);
  const amount = findAmount(text);
  const startsAt = findDate(text);

  const airline = findBrand(text, AIRLINES);
  const hotel = findBrand(text, HOTELS);
  const rental = findBrand(text, RENTALS);
  const ground = findBrand(text, GROUND);
  const { origin, destination } = findRoute(text);

  const hasFlightWords = /\bflight\b|\bdeparture\b|\bboarding\b|\bgate\b|\bnonstop\b|\bairlines?\b/i.test(text);
  const hasHotelWords = /\bhotel\b|\bcheck[\s-]?in\b|\bcheck[\s-]?out\b|\bnights?\b|\broom\b/i.test(text);
  const hasCarWords = /\brental\b|\bpick[\s-]?up\b|\bdrop[\s-]?off\b|\bvehicle\b|\bcar\b/i.test(text);

  const items: ParsedTravelItem[] = [];

  if (airline || hasFlightWords || origin) {
    items.push({
      type: "FLIGHT",
      vendor: airline,
      confirmation,
      detail: findDetail(text, /flight|depart|arriv|nonstop|gate/i),
      startsAt,
      amount: items.length === 0 ? amount : null
    });
  }
  if (hotel || hasHotelWords) {
    items.push({
      type: "HOTEL",
      vendor: hotel,
      confirmation: items.length === 0 ? confirmation : null,
      detail: findDetail(text, /hotel|check[\s-]?in|night|room/i),
      startsAt: items.length === 0 ? startsAt : null,
      amount: items.length === 0 ? amount : null
    });
  }
  if (rental || (hasCarWords && !airline && !hotel)) {
    items.push({
      type: "CAR",
      vendor: rental,
      confirmation: items.length === 0 ? confirmation : null,
      detail: findDetail(text, /rental|pick[\s-]?up|drop[\s-]?off|vehicle|car/i),
      startsAt: items.length === 0 ? startsAt : null,
      amount: items.length === 0 ? amount : null
    });
  }
  if (ground && items.length === 0) {
    items.push({ type: "TRANSPORT", vendor: ground, confirmation, detail: findDetail(text, /shuttle|ride|pickup/i), startsAt, amount });
  }

  // Nothing recognizable — still offer one generic item so the paste isn't lost.
  if (items.length === 0 && text.trim()) {
    items.push({ type: "OTHER", vendor: null, confirmation, detail: text.trim().split(/\r?\n/)[0]?.slice(0, 160) ?? null, startsAt, amount });
  }

  return {
    items,
    originAirport: origin,
    destinationAirport: destination,
    preferredAirline: airline
  };
}
