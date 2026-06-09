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
