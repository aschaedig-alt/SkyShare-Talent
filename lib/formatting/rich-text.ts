import { brandColors } from "@/lib/formatting/brand";

export const inlineTextColorOptions = [
  { key: "BLACK", label: "Black", tag: "black", value: brandColors.black },
  { key: "LEA", label: "Lea", tag: "lea", value: brandColors.lea },
  { key: "EDEN", label: "Eden", tag: "eden", value: brandColors.eden },
  { key: "GREY", label: "Grey", tag: "grey", value: brandColors.grey },
  { key: "GOLD", label: "Gold", tag: "gold", value: brandColors.gold },
  { key: "RED", label: "Red", tag: "red", value: brandColors.red },
  { key: "SWEET", label: "Sweet", tag: "sweet", value: brandColors.sweet },
  { key: "CLOUD_DANCER", label: "Cloud", tag: "cloud", value: brandColors.cloudDancer }
] as const;

export type InlineTextColor = (typeof inlineTextColorOptions)[number]["key"];

export type RichTextNode =
  | { type: "text"; text: string }
  | { type: "bold"; children: RichTextNode[] }
  | { type: "color"; color: InlineTextColor; children: RichTextNode[] };

export const inlineTextColorMap: Record<InlineTextColor, { label: string; tag: string; value: string }> =
  inlineTextColorOptions.reduce(
    (colors, color) => ({
      ...colors,
      [color.key]: { label: color.label, tag: color.tag, value: color.value }
    }),
    {} as Record<InlineTextColor, { label: string; tag: string; value: string }>
  );

function normalizeColor(value: string): InlineTextColor | null {
  const normalized = value.trim().replace(/[-\s]/g, "_").toUpperCase();
  const byKey = inlineTextColorOptions.find((color) => color.key === normalized);
  const byTag = inlineTextColorOptions.find((color) => color.tag.toUpperCase() === normalized);
  return byKey?.key ?? byTag?.key ?? null;
}

function parseUntil(value: string, startIndex: number, stopTag?: string): { nodes: RichTextNode[]; index: number } {
  const nodes: RichTextNode[] = [];
  let buffer = "";
  let index = startIndex;

  function flushBuffer() {
    if (buffer) {
      nodes.push({ type: "text", text: buffer });
      buffer = "";
    }
  }

  while (index < value.length) {
    if (stopTag && value.startsWith(stopTag, index)) {
      flushBuffer();
      return { nodes, index: index + stopTag.length };
    }

    if (value.startsWith("[b]", index)) {
      flushBuffer();
      const parsed = parseUntil(value, index + 3, "[/b]");
      nodes.push({ type: "bold", children: parsed.nodes });
      index = parsed.index;
      continue;
    }

    const colorMatch = value.slice(index).match(/^\[color=([a-zA-Z_\-\s]+)\]/);
    if (colorMatch) {
      const color = normalizeColor(colorMatch[1]);
      if (color) {
        flushBuffer();
        const parsed = parseUntil(value, index + colorMatch[0].length, "[/color]");
        nodes.push({ type: "color", color, children: parsed.nodes });
        index = parsed.index;
        continue;
      }
    }

    buffer += value[index];
    index += 1;
  }

  flushBuffer();
  return { nodes, index };
}

export function parseRichText(value?: string | null) {
  return parseUntil(value ?? "", 0).nodes;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nodesToHtml(nodes: RichTextNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return escapeHtml(node.text);
      }

      if (node.type === "bold") {
        return `<strong>${nodesToHtml(node.children)}</strong>`;
      }

      return `<span style="color: ${inlineTextColorMap[node.color].value};">${nodesToHtml(node.children)}</span>`;
    })
    .join("");
}

export function richTextToHtml(value?: string | null) {
  return nodesToHtml(parseRichText(value));
}

function nodesToLimitedHtml(nodes: RichTextNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return escapeHtml(node.text);
      }

      if (node.type === "bold") {
        return `<b>${nodesToLimitedHtml(node.children)}</b>`;
      }

      return nodesToLimitedHtml(node.children);
    })
    .join("");
}

export function richTextToLimitedHtml(value?: string | null) {
  return nodesToLimitedHtml(parseRichText(value));
}

function nodesToPlainText(nodes: RichTextNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return node.text;
      }

      return nodesToPlainText(node.children);
    })
    .join("");
}

export function richTextToPlainText(value?: string | null) {
  return nodesToPlainText(parseRichText(value));
}
