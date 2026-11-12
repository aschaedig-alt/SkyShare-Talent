// "Apply this formatting to every question" — feedback cmwcmsbwn (Nov 11 2026):
// "if i change the size of the font or something in one question box, give me
// the option to apply to all questions."
//
// PURE and DOM-free, so the browser can describe the change before it is made and
// the server can make it. Works on the sanitized HTML the editor stores
// (lib/richtext/sanitize.ts): <p>, <li>, <h3> blocks; <strong>/<b>, <em>/<i>, <u>;
// and <span style="color; background-color; font-size">.
//
// WHAT "THIS FORMATTING" MEANS. A box's style is whatever covers ALL of its text:
// a size, a colour, a highlight, and bold / italic / underline only when every
// word has it. Emphasis on a few words is that question's own business and is
// never copied or removed. Applying it to another question:
//   - size, colour, highlight: replaced with this box's (a box at Normal size
//     puts every question back to Normal size);
//   - bold / italic / underline: added everywhere when this box has it on every
//     word; taken off a question that has it on EVERY word when this box has it
//     on none (so a plain box can put an all-bold question back to normal);
//     otherwise left exactly as each question has it.

export type FieldStyle = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** px, or null for Normal. */
  size: number | null;
  color: string | null;
  highlight: string | null;
  /** Whether ANY word in the box is bold / italic / underlined (vs every word, above). */
  someBold: boolean;
  someItalic: boolean;
  someUnderline: boolean;
};

export const QUESTION_FIELDS = ["text", "strongAnswer", "listenFor"] as const;
export type QuestionField = (typeof QUESTION_FIELDS)[number];
export const QUESTION_FIELD_LABEL: Record<QuestionField, string> = {
  text: "Question",
  strongAnswer: "Strong answer",
  listenFor: "Listen for"
};

const SIZE_LABEL: Record<number, string> = { 12: "Small", 18: "Large", 22: "Huge" };

type Inline = { bold: boolean; italic: boolean; underline: boolean; size: number | null; color: string | null; highlight: string | null };

function styleProps(attrs: string): Partial<Pick<Inline, "size" | "color" | "highlight">> {
  const m = /style\s*=\s*"([^"]*)"/i.exec(attrs) ?? /style\s*=\s*'([^']*)'/i.exec(attrs);
  if (!m) return {};
  const out: Partial<Pick<Inline, "size" | "color" | "highlight">> = {};
  for (const decl of m[1].split(";")) {
    const [k, ...rest] = decl.split(":");
    const key = (k ?? "").trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!value) continue;
    if (key === "font-size") {
      const px = parseFloat(value);
      if (Number.isFinite(px)) out.size = px === 14 ? null : px;
    } else if (key === "color") out.color = value.toLowerCase();
    else if (key === "background-color") out.highlight = value.toLowerCase();
  }
  return out;
}

/** The style that covers every visible character of `html`, or null when it has no text. */
export function fieldStyle(html: string): FieldStyle | null {
  const stack: Array<{ tag: string; props: Partial<Inline> }> = [];
  const tokenPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let common: Inline | null = null;
  let mixedSize = false;
  let mixedColor = false;
  let mixedHighlight = false;
  let someBold = false;
  let someItalic = false;
  let someUnderline = false;
  let last = 0;
  let token: RegExpExecArray | null;

  const visit = (text: string) => {
    if (!text.replace(/&nbsp;/g, " ").trim()) return;
    const cur: Inline = { bold: false, italic: false, underline: false, size: null, color: null, highlight: null };
    for (const frame of stack) {
      if (frame.props.bold) cur.bold = true;
      if (frame.props.italic) cur.italic = true;
      if (frame.props.underline) cur.underline = true;
      if (frame.props.size !== undefined) cur.size = frame.props.size;
      if (frame.props.color !== undefined) cur.color = frame.props.color;
      if (frame.props.highlight !== undefined) cur.highlight = frame.props.highlight;
    }
    someBold ||= cur.bold;
    someItalic ||= cur.italic;
    someUnderline ||= cur.underline;
    if (!common) {
      common = { ...cur };
      return;
    }
    common.bold &&= cur.bold;
    common.italic &&= cur.italic;
    common.underline &&= cur.underline;
    if (common.size !== cur.size) mixedSize = true;
    if (common.color !== cur.color) mixedColor = true;
    if (common.highlight !== cur.highlight) mixedHighlight = true;
  };

  while ((token = tokenPattern.exec(html))) {
    visit(html.slice(last, token.index));
    last = tokenPattern.lastIndex;
    const tag = token[1].toLowerCase();
    if (token[0].startsWith("</")) {
      const at = stack.map((f) => f.tag).lastIndexOf(tag);
      if (at !== -1) stack.splice(at);
      continue;
    }
    if (tag === "br") continue;
    const props: Partial<Inline> = {};
    if (tag === "strong" || tag === "b") props.bold = true;
    if (tag === "em" || tag === "i") props.italic = true;
    if (tag === "u") props.underline = true;
    if (tag === "span") Object.assign(props, styleProps(token[2] ?? ""));
    stack.push({ tag, props });
  }
  visit(html.slice(last));

  const c = common as Inline | null;
  if (!c) return null;
  return {
    bold: c.bold,
    italic: c.italic,
    underline: c.underline,
    // A property that varies inside the box is not "the box's" — treat as Normal/none.
    size: mixedSize ? null : c.size,
    color: mixedColor ? null : c.color,
    highlight: mixedHighlight ? null : c.highlight,
    someBold,
    someItalic,
    someUnderline
  };
}

/** "Large, Bold, Navy text" — what applying this style will do, in plain words. */
export function describeStyle(s: FieldStyle): string {
  const parts = [s.size ? SIZE_LABEL[s.size] ?? `${s.size}px` : "Normal size"];
  if (s.bold) parts.push("Bold");
  if (s.italic) parts.push("Italic");
  if (s.underline) parts.push("Underline");
  if (s.color) parts.push("Coloured text");
  if (s.highlight) parts.push("Highlighted");
  return parts.join(", ");
}

/** Drop font-size / color / background-color from every span's style attribute. */
function stripSpanStyles(html: string): string {
  return html.replace(/<span\b([^>]*)>/gi, (_whole, attrs: string) => {
    const kept = attrs.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/i, (_m, quoted: string) => {
      const decls = quoted
        .slice(1, -1)
        .split(";")
        .map((d) => d.trim())
        .filter((d) => d && !/^(font-size|color|background-color)\s*:/i.test(d));
      return decls.length ? ` style="${decls.join("; ")}"` : "";
    });
    return `<span${kept}>`;
  });
}

/**
 * Remove spans left with no attributes (they carry nothing), keeping every other
 * span — an @-mention is <span data-mention>. Paired with a stack, not a regex,
 * so a mention nested inside a bare span keeps its own closing tag.
 */
function dropBareSpans(html: string): string {
  const bare: boolean[] = [];
  return html.replace(/<span\b([^>]*)>|<\/span\s*>/gi, (whole, attrs: string | undefined) => {
    if (whole.startsWith("</")) return bare.pop() ? "" : whole;
    const isBare = !(attrs ?? "").trim();
    bare.push(isBare);
    return isBare ? "" : whole;
  });
}

function wrapInline(inner: string, s: FieldStyle): string {
  if (!inner.replace(/<br\s*\/?>/gi, "").replace(/&nbsp;/g, " ").trim()) return inner;
  let out = inner;
  // Drop the marks being applied to the whole block, so applying twice (or to a
  // question that already had some bold) does not nest duplicates.
  if (s.bold) out = out.replace(/<\/?(strong|b)\b[^>]*>/gi, "");
  if (s.italic) out = out.replace(/<\/?(em|i)\b[^>]*>/gi, "");
  if (s.underline) out = out.replace(/<\/?u\b[^>]*>/gi, "");
  const style: string[] = [];
  if (s.color) style.push(`color: ${s.color}`);
  if (s.highlight) style.push(`background-color: ${s.highlight}`);
  if (s.size) style.push(`font-size: ${s.size}px`);
  if (style.length) out = `<span style="${style.join("; ")}">${out}</span>`;
  if (s.underline) out = `<u>${out}</u>`;
  if (s.italic) out = `<em>${out}</em>`;
  if (s.bold) out = `<strong>${out}</strong>`;
  return out;
}

/**
 * Give `html` the style `s` (see the header for exactly what changes). Each
 * paragraph, heading and list item is wrapped on its own, so blank lines,
 * lists and links survive. Run the result through sanitizeRichText before
 * storing it.
 */
export function applyFieldStyle(html: string, s: FieldStyle): string {
  if (!html.trim()) return html;
  let stripped = dropBareSpans(stripSpanStyles(html));
  const own = fieldStyle(html);
  if (own) {
    if (!s.someBold && own.bold) stripped = stripped.replace(/<\/?(strong|b)\b[^>]*>/gi, "");
    if (!s.someItalic && own.italic) stripped = stripped.replace(/<\/?(em|i)\b[^>]*>/gi, "");
    if (!s.someUnderline && own.underline) stripped = stripped.replace(/<\/?u\b[^>]*>/gi, "");
  }
  // <li> holding a <p> is handled by the <p>; a bare <li> is wrapped directly.
  return stripped
    .replace(/<(p|h3)(\b[^>]*)>([\s\S]*?)<\/\1>/gi, (_m, tag: string, attrs: string, inner: string) => `<${tag}${attrs}>${wrapInline(inner, s)}</${tag}>`)
    .replace(/<li(\b[^>]*)>((?:(?!<\/?(?:p|ul|ol|li)\b)[\s\S])*?)<\/li>/gi, (_m, attrs: string, inner: string) => `<li${attrs}>${wrapInline(inner, s)}</li>`);
}
