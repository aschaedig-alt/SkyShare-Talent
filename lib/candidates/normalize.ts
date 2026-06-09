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

  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts[parts.length - 1] : null;
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || cleaned;

  return { firstName, lastName, displayName };
}
