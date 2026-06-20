/** Parse a JSON string-array column (our convention for list fields stored as
 *  JSON text) into a string[]. Returns [] for null/invalid input. */
export function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
