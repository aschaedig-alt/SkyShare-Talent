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

// First confidently-parseable date (optionally with a time) → ISO.
function findDate(text: string): string | null {
  // e.g. "Feb 23, 2026 2:30 PM" or "02/23/2026" or "2026-02-23"
  const patterns = [
    /\b([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/,
    /\b(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/,
    /\b(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)/
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const d = new Date(m[1]);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
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
