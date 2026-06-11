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

export type BodySegment = { type: "bullets"; items: string[] } | { type: "paragraph"; lines: string[] };

// Parses a body into ordered segments so one block can mix bullet lists and paragraphs.
// A line starting with -, * or • is a bullet; consecutive non-bullet lines form a paragraph;
// a blank line ends the current paragraph.
export function parseBodySegments(value?: string | null): BodySegment[] {
  if (!value) {
    return [];
  }

  const segments: BodySegment[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      segments.push({ type: "paragraph", lines: paragraph });
      paragraph = [];
    }
  };

  for (const raw of value.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flush();
      const last = segments[segments.length - 1];
      if (last && last.type === "bullets") {
        last.items.push(bullet[1].trim());
      } else {
        segments.push({ type: "bullets", items: [bullet[1].trim()] });
      }
    } else {
      paragraph.push(line);
    }
  }

  flush();
  return segments;
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
