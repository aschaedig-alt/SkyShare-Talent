import { ROADMAP_MARKDOWN } from "@/lib/roadmap/roadmap";

export type ItemStatus = "completed" | "in-progress" | "upcoming";

export type ChecklistItem = {
  id: string;
  label: string;
  note?: string;
  date?: string;
  status: ItemStatus;
};

export type ChecklistSection = {
  id: string;
  title: string;
  description?: string;
  status: ItemStatus;
  items: ChecklistItem[];
};

export type Roadmap = {
  sections: ChecklistSection[];
  totalItems: number;
  completedItems: number;
  progressPercent: number;
};

const ITEM_RE = /^-\s*\[(.)\]\s*(.*)$/;

function itemStatusFromMark(mark: string): ItemStatus {
  const m = mark.trim().toLowerCase();
  if (m === "x") return "completed";
  if (m === "~" || m === "/") return "in-progress";
  return "upcoming";
}

function parseItemText(raw: string): { label: string; note?: string; date?: string } {
  let text = raw.trim();
  let date: string | undefined;
  let note: string | undefined;

  // Trailing parenthetical → date, e.g. "Did the thing (Jun 10)"
  const dateMatch = text.match(/\(([^)]*)\)\s*$/);
  if (dateMatch) {
    date = dateMatch[1].trim();
    text = text.slice(0, dateMatch.index).trim();
  }

  // Note after an em dash or pipe → "Item — note" / "Item | note"
  const noteSplit = text.split(/\s+(?:—|\|)\s+/);
  if (noteSplit.length > 1) {
    text = noteSplit[0].trim();
    note = noteSplit.slice(1).join(" — ").trim();
  }

  return { label: text, note, date };
}

function sectionStatus(items: ChecklistItem[]): ItemStatus {
  if (items.length === 0) return "upcoming";
  const completed = items.filter((i) => i.status === "completed").length;
  if (completed === items.length) return "completed";
  if (completed > 0 || items.some((i) => i.status === "in-progress")) return "in-progress";
  return "upcoming";
}

export function parseRoadmap(markdown: string = ROADMAP_MARKDOWN): Roadmap {
  const lines = markdown.split("\n");
  const sections: ChecklistSection[] = [];
  let current: ChecklistSection | null = null;
  let sectionIndex = 0;
  let itemIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      sectionIndex += 1;
      current = {
        id: `section-${sectionIndex}`,
        title: line.slice(3).trim(),
        description: undefined,
        status: "upcoming",
        items: []
      };
      continue;
    }

    // Ignore a top-level "# Title" document heading
    if (line.startsWith("# ")) continue;

    const itemMatch = line.match(ITEM_RE);
    if (itemMatch && current) {
      const status = itemStatusFromMark(itemMatch[1]);
      const { label, note, date } = parseItemText(itemMatch[2]);
      itemIndex += 1;
      current.items.push({ id: `item-${itemIndex}`, label, note, date, status });
      continue;
    }

    // First non-list line under a heading → section description
    if (current && current.items.length === 0 && !current.description) {
      current.description = line;
    }
  }

  if (current) sections.push(current);

  for (const section of sections) {
    section.status = sectionStatus(section.items);
  }

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const completedItems = sections.reduce(
    (sum, s) => sum + s.items.filter((i) => i.status === "completed").length,
    0
  );
  const progressPercent = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  return { sections, totalItems, completedItems, progressPercent };
}
