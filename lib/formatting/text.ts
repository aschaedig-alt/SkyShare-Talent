export function splitCleanLines(value?: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean);
}

export function splitCleanParagraphs(value?: string | null) {
  if (!value) {
    return [];
  }

  return value
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
        .filter(Boolean)
        .join("\n")
    )
    .filter(Boolean);
}

export function joinPreviewParts(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" | ");
}

export function formatDateForInput(value?: string | Date | null) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function formatDateForDisplay(value?: string | Date | null) {
  if (!value) {
    return "Not posted";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not posted";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
