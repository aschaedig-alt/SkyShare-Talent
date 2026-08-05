// The rich-text design tokens, in ONE place, plus the snapping that maps
// arbitrary pasted colour and size onto them.
//
// WHY SNAPPING EXISTS. The sanitizer's style allowlist is a set of EXACT strings
// (that is what makes it safe without a CSS parser). Anything not matching
// character-for-character used to be dropped, so every colour, highlight and
// size pasted from Gmail, Word or Paycom silently vanished on save — which is
// what "I formatted it in Gmail, pasted it back, and it lost most formatting"
// actually was. Snapping keeps the allowlist closed (output is still only ever
// one of these fixed strings, so CSS injection is still impossible) while
// letting real input through: a pasted red becomes OUR red rather than nothing.
//
// Kept free of any DOM or Prisma import — both the browser-side normalizer and
// the server-side sanitizer read from here, and they must agree.

export const TEXT_COLORS = ["#0d2c43", "#ba0c2f", "#1d9e75", "#9a7100", "#466481"] as const;
export const HIGHLIGHT_COLORS = ["#fdf6e6", "#fdf2f4", "#e7f5ef"] as const;
export const FONT_SIZES = [12, 14, 18, 22] as const;

/** The size body text already is. Emitting a span for it is pure noise. */
export const DEFAULT_FONT_SIZE = 14;

/** Every style string the editor is allowed to store, built from the tokens. */
export const ALLOWED_STYLES = new Set<string>([
  ...TEXT_COLORS.map((c) => `color: ${c}`),
  ...HIGHLIGHT_COLORS.map((c) => `background-color: ${c}`),
  ...FONT_SIZES.map((s) => `font-size: ${s}px`)
]);

type Rgb = { r: number; g: number; b: number };

// Only the handful a real clipboard produces. Browsers serialise computed
// colours as rgb(), so named colours turn up mainly in hand-written HTML and in
// legacy <font color="red"> attributes.
const NAMED_COLORS: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  yellow: "#ffff00", orange: "#ffa500", purple: "#800080", gray: "#808080", grey: "#808080",
  navy: "#000080", maroon: "#800000", teal: "#008080", silver: "#c0c0c0", lime: "#00ff00"
};

/**
 * Parse a CSS colour to RGB. Returns null for anything unparseable AND for
 * fully transparent, which is not a colour anybody meant to apply.
 */
export function parseCssColor(raw: string): Rgb | null {
  const value = raw.trim().toLowerCase();
  if (!value || value === "transparent" || value === "inherit" || value === "initial" || value === "currentcolor") {
    return null;
  }
  const resolved = NAMED_COLORS[value] ?? value;

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(resolved);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16)
    };
  }

  const long = /^#([0-9a-f]{6})$/.exec(resolved);
  if (long) {
    return {
      r: parseInt(resolved.slice(1, 3), 16),
      g: parseInt(resolved.slice(3, 5), 16),
      b: parseInt(resolved.slice(5, 7), 16)
    };
  }

  const fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([0-9.]+%?))?\s*\)$/.exec(resolved);
  if (fn) {
    if (fn[4] !== undefined) {
      const alpha = fn[4].endsWith("%") ? Number.parseFloat(fn[4]) / 100 : Number.parseFloat(fn[4]);
      // A transparent span is a layout artifact, not formatting.
      if (!Number.isNaN(alpha) && alpha < 0.15) return null;
    }
    const clamp = (n: string) => Math.max(0, Math.min(255, Number.parseInt(n, 10)));
    return { r: clamp(fn[1]), g: clamp(fn[2]), b: clamp(fn[3]) };
  }

  return null;
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Saturation and lightness on 0..1, the HSL definitions. */
function saturationLightness(c: Rgb): { s: number; l: number } {
  const max = Math.max(c.r, c.g, c.b) / 255;
  const min = Math.min(c.r, c.g, c.b) / 255;
  const l = (max + min) / 2;
  if (max === min) return { s: 0, l };
  const d = max - min;
  return { s: l > 0.5 ? d / (2 - max - min) : d / (max + min), l };
}

function nearest(c: Rgb, palette: readonly string[]): string {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const p = parseCssColor(candidate);
    if (!p) continue;
    // Squared distance is enough to rank; no need for the square root.
    const d = (c.r - p.r) ** 2 + (c.g - p.g) ** 2 + (c.b - p.b) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}

/**
 * A pasted text colour, snapped to the nearest brand colour — or null to let it
 * inherit.
 *
 * NEAR-GREY IS DELIBERATELY DROPPED. Body text arrives as #000, #333 or #444
 * far more often than as anything intentional, and snapping every one of those
 * to navy would stamp an explicit colour span on essentially every paragraph of
 * every pasted write-up. Low saturation means "this is just text", so it
 * inherits; a saturated colour was a choice somebody made, so it is kept.
 */
export function snapTextColor(raw: string): string | null {
  const c = parseCssColor(raw);
  if (!c) return null;
  const { s, l } = saturationLightness(c);
  if (s < 0.2) return null;
  // Near-white text would be invisible on our light surfaces.
  if (l > 0.9) return null;
  return nearest(c, TEXT_COLORS);
}

/** A pasted highlight, snapped to one of the three. White/none inherits. */
export function snapHighlightColor(raw: string): string | null {
  const c = parseCssColor(raw);
  if (!c) return null;
  const { l } = saturationLightness(c);
  // Our own highlights sit at ~0.95 lightness, so the cut has to be above them.
  if (l > 0.98) return null;
  return nearest(c, HIGHLIGHT_COLORS);
}

/**
 * A pasted font size in px, snapped to one of the four — or null for anything
 * that lands on the default, since that is what it would render as anyway.
 */
export function snapFontSize(raw: string): number | null {
  const value = raw.trim().toLowerCase();
  const m = /^(-?[0-9.]+)(px|pt|em|rem)?$/.exec(value);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  if (Number.isNaN(n) || n <= 0) return null;

  const unit = m[2] ?? "px";
  const px = unit === "pt" ? n * (4 / 3) : unit === "em" || unit === "rem" ? n * DEFAULT_FONT_SIZE : n;
  // Wild values are a broken source, not a formatting choice.
  if (px < 6 || px > 96) return null;

  // Widened deliberately: FONT_SIZES is `as const`, so without this the
  // inferred type is the literal 12 and every other size fails to assign.
  let best: number = FONT_SIZES[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const size of FONT_SIZES) {
    const d = Math.abs(px - size);
    if (d < bestDistance) {
      bestDistance = d;
      best = size;
    }
  }
  return best === DEFAULT_FONT_SIZE ? null : best;
}

/** Legacy <font size="1".."7">, which Word and older Gmail still emit. */
const FONT_ATTR_SIZES: Record<string, number> = {
  "1": 12, "2": 12, "3": 14, "4": 18, "5": 22, "6": 22, "7": 22
};

export function snapFontAttrSize(raw: string): number | null {
  const size = FONT_ATTR_SIZES[raw.trim()];
  return size && size !== DEFAULT_FONT_SIZE ? size : null;
}

/** Build the canonical style attribute value from snapped tokens, in a fixed order. */
export function styleAttr(parts: { color?: string | null; highlight?: string | null; size?: number | null }): string {
  const out: string[] = [];
  if (parts.color) out.push(`color: ${parts.color}`);
  if (parts.highlight) out.push(`background-color: ${parts.highlight}`);
  if (parts.size) out.push(`font-size: ${parts.size}px`);
  return out.join("; ");
}

/**
 * Strip invisible characters that still carry formatting weight.
 *
 * One live write-up (Robert Patrick's recruiter screen) holds six of these,
 * FOUR of them inside a <b> with nothing else in it. An empty bold tag is
 * unreachable: there is no visible text to select, so no amount of selecting
 * and clicking Bold can switch it off, and the caret entering it silently turns
 * on bold for whatever gets typed next. That is the "boldness was weird and I
 * could not correct it" report, exactly.
 *
 * Matched by CODE POINT rather than a regex literal, because a zero-width
 * character typed straight into this source is invisible to whoever edits the
 * line next.
 *   200B zero-width space | 200C non-joiner | 200D joiner | FEFF BOM
 */
const ZERO_WIDTH_CODES = new Set([0x200b, 0x200c, 0x200d, 0xfeff]);

export function stripZeroWidth(text: string): string {
  if (!text) return text;
  let out = "";
  for (const ch of text) {
    if (!ZERO_WIDTH_CODES.has(ch.codePointAt(0) ?? 0)) out += ch;
  }
  return out;
}

export { toHex };
