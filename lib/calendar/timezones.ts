export type USTimezone = {
  value: string;
  label: string;
  abbr: string;
};

/** Standard US timezones for the interview scheduler. */
export const US_TIMEZONES: USTimezone[] = [
  { value: "America/New_York", label: "Eastern Time (ET)", abbr: "ET" },
  { value: "America/Chicago", label: "Central Time (CT)", abbr: "CT" },
  { value: "America/Denver", label: "Mountain Time (MT)", abbr: "MT" },
  { value: "America/Phoenix", label: "Arizona (MST, no DST)", abbr: "MST" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", abbr: "PT" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)", abbr: "AKT" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)", abbr: "HST" }
];

const TZ_ABBR_BY_VALUE = new Map(US_TIMEZONES.map((tz) => [tz.value, tz.abbr]));

export function timezoneAbbr(value: string | null | undefined): string {
  if (!value) return "";
  return TZ_ABBR_BY_VALUE.get(value) ?? value;
}

export const DEFAULT_TIMEZONE = "America/Denver";

// Legacy / friendly labels that may be sitting in older records (e.g. "Mountain",
// "Mountain Time", "MT") mapped to their IANA zone so they still resolve.
const LABEL_TO_IANA: Record<string, string> = {
  eastern: "America/New_York",
  central: "America/Chicago",
  mountain: "America/Denver",
  arizona: "America/Phoenix",
  pacific: "America/Los_Angeles",
  alaska: "America/Anchorage",
  hawaii: "Pacific/Honolulu"
};

function isValidIana(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve any stored timezone value to a usable IANA zone. Accepts a real IANA
 * zone, a friendly label ("Mountain", "Pacific Time"), or an abbreviation ("MT").
 * Anything unrecognized falls back to the default — so a bad value can never
 * crash a formatter via Intl.DateTimeFormat.
 */
export function resolveTimezone(value: string | null | undefined): string {
  if (!value) return DEFAULT_TIMEZONE;
  const trimmed = value.trim();
  if (isValidIana(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();
  for (const [key, iana] of Object.entries(LABEL_TO_IANA)) {
    if (lower.includes(key)) return iana;
  }
  const byAbbr = US_TIMEZONES.find((zone) => zone.abbr.toLowerCase() === lower);
  if (byAbbr) return byAbbr.value;

  return DEFAULT_TIMEZONE;
}
