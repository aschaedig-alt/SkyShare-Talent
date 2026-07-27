export function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized.length === 10 ? normalized : null;
}

export function normalizeName(value: string | null | undefined) {
  return value
    ?.trim()
    .replace(/\s+/g, " ")
    .toLowerCase() || null;
}

/**
 * Generational suffixes. Taking the LAST token as the surname turned "Dwayne L.
 * Gill II" into "Dwayne II" and dropped Gill entirely — four people came out of
 * the Adobe Sign pilot-application backfill that way, unfindable by surname,
 * which matters because candidate matching leans on the surname.
 */
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v", "vi"]);

const isSuffix = (token: string) => NAME_SUFFIXES.has(token.replace(/\./g, "").toLowerCase());

export function splitCandidateName(fullName: string | null | undefined) {
  const cleaned = fullName?.trim().replace(/\s+/g, " ") ?? "";
  if (!cleaned) {
    return { firstName: null, lastName: null, displayName: "Unnamed candidate" };
  }

  const parts = cleaned.includes(",")
    ? cleaned
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .reverse()
        .join(" ")
        .split(/\s+/)
    : cleaned.split(/\s+/);

  // Peel trailing suffixes off before choosing the surname, but never so far
  // that fewer than two real name tokens remain — otherwise a genuine one-word
  // surname like "V" would be eaten and the person would lose their name.
  const nameParts = [...parts];
  const suffixes: string[] = [];
  while (nameParts.length > 2 && isSuffix(nameParts[nameParts.length - 1])) {
    suffixes.unshift(nameParts.pop() as string);
  }

  const firstName = nameParts[0] ?? null;
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;
  // The suffix stays on the DISPLAY name (it is part of how someone is
  // addressed) but never on lastName, which is what search and matching use.
  const displayName = [firstName, lastName, ...suffixes].filter(Boolean).join(" ") || cleaned;

  return { firstName, lastName, displayName };
}
