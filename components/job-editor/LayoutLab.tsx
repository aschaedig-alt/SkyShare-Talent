"use client";

import { useEffect, useMemo, useState } from "react";
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
import { Lock, Unlock, Eye, EyeOff, Grid3x3, ArrowRightLeft } from "lucide-react";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type {
  BlockBodyFormat,
  SerializedContentBlock,
  SerializedJobBlockInstance,
  SerializedJobPost
} from "@/lib/types";
import {
  getSectionStatuses,
  getReadinessChecklist,
  getInstanceBody,
  getInstanceTitle,
  getInstanceFormatting
} from "@/lib/blocks/sections";
import { splitCleanLines } from "@/lib/formatting/text";
import { RichText, RichTextParagraphs, RichTextMixed } from "@/components/shared/RichText";
import { FormattedJobPost } from "@/components/job-preview/FormattedJobPost";

const GridLayout = WidthProvider(RGL);
const STORAGE_KEY = "skyshare-layout-lab-v2";
const LOCK_KEY = "skyshare-layout-lab-locks-v2";
const HIDE_KEY = "skyshare-layout-lab-hidden-v2";
const ASSIGN_KEY = "skyshare-layout-lab-assign-v2";
const DENSITY_KEY = "skyshare-layout-lab-density-v2";
const COLS_KEY = "skyshare-layout-lab-cols-v2";

const COL_OPTIONS = [
  { n: 12, label: "Coarse" },
  { n: 24, label: "Medium" },
  { n: 36, label: "Fine" }
];

type Props = {
  job: SerializedJobPost | null;
  blocks: SerializedContentBlock[];
  limitedHtml: string;
};

type Source = "Job Builder" | "Final Review" | "Content Blocks";
type Widget = { id: string; title: string; source: Source; badge?: string };

// A box can stay on its original page or be reassigned to a consolidation target
// ("Page 1" / "Page 2") so you can rehearse merging everything onto one or two pages.
const SOURCE_PAGES: Source[] = ["Job Builder", "Final Review", "Content Blocks"];
const TARGET_PAGES = ["Page 1", "Page 2"];
const ALL_PAGES = [...SOURCE_PAGES, ...TARGET_PAGES];

const PAGE_COLOR: Record<string, string> = {
  "Job Builder": "bg-brand-lea text-white",
  "Final Review": "bg-emerald-600 text-white",
  "Content Blocks": "bg-brand-gold text-brand-lea dark:text-slate-100",
  "Page 1": "bg-indigo-600 text-white",
  "Page 2": "bg-fuchsia-700 text-white"
};

const PAGE_DOT: Record<string, string> = {
  "Job Builder": "bg-brand-lea",
  "Final Review": "bg-emerald-600",
  "Content Blocks": "bg-brand-gold",
  "Page 1": "bg-indigo-600",
  "Page 2": "bg-fuchsia-700"
};

// Every box across all three publishing pages. Duplicates across pages are intentional
// (e.g. the formatted preview / readiness / export appear on both Job Builder and Final
// Review) so you can see what to merge.
const WIDGETS: Widget[] = [
  // ---- Job Builder ----
  { id: "jb-selector", title: "Job selector & tabs", source: "Job Builder" },
  { id: "jb-bulk", title: "Bulk actions", source: "Job Builder", badge: "0 selected" },
  { id: "jb-public", title: "Public posting fields", source: "Job Builder", badge: "11 fields" },
  { id: "jb-internal", title: "Internal role tracking", source: "Job Builder", badge: "10 fields" },
  { id: "jb-offer", title: "Offer letter / HR fields", source: "Job Builder", badge: "16 fields" },
  { id: "jb-paycom", title: "Paycom setup fields", source: "Job Builder", badge: "10 fields" },
  { id: "jb-aviation", title: "Aviation requirement fields", source: "Job Builder", badge: "12 fields" },
  { id: "jb-summary", title: "Job Summary", source: "Job Builder" },
  { id: "jb-responsibilities", title: "Responsibilities", source: "Job Builder" },
  { id: "jb-qualifications", title: "Qualifications", source: "Job Builder" },
  { id: "jb-benefits", title: "Benefits", source: "Job Builder" },
  { id: "jb-blocks", title: "Content blocks attached", source: "Job Builder" },
  { id: "jb-preview", title: "Formatted preview", source: "Job Builder" },
  { id: "jb-readiness", title: "Ready check (inline)", source: "Job Builder", badge: "12/12" },
  { id: "jb-export", title: "Export — copy for job boards", source: "Job Builder" },
  // ---- Final Review (duplicates of Job Builder where colored green) ----
  { id: "fr-selector", title: "Job selector & search", source: "Final Review" },
  { id: "fr-status", title: "Publish status", source: "Final Review" },
  { id: "fr-readiness", title: "Publish readiness checklist", source: "Final Review", badge: "12/12" },
  { id: "fr-preview", title: "Formatted preview", source: "Final Review" },
  { id: "fr-export", title: "Export — copy for job boards", source: "Final Review" },
  // ---- Content Blocks ----
  { id: "cb-list", title: "Block library list", source: "Content Blocks" },
  { id: "cb-template", title: "Template board", source: "Content Blocks" },
  { id: "cb-editor", title: "Block editor (content + format)", source: "Content Blocks" },
  { id: "cb-apply", title: "Apply block to jobs", source: "Content Blocks" },
  { id: "cb-history", title: "Version history", source: "Content Blocks" }
];

// Default tidy height (in grid rows) per box, used by presets when re-flowing.
const BOX_H: Record<string, number> = {
  "jb-selector": 4, "jb-bulk": 3, "jb-public": 7, "jb-internal": 6, "jb-offer": 6,
  "jb-paycom": 6, "jb-aviation": 6, "jb-summary": 5, "jb-responsibilities": 7,
  "jb-qualifications": 7, "jb-benefits": 6, "jb-blocks": 6, "jb-preview": 16,
  "jb-readiness": 6, "jb-export": 7, "fr-selector": 4, "fr-status": 3,
  "fr-readiness": 6, "fr-preview": 14, "fr-export": 7, "cb-list": 6,
  "cb-template": 8, "cb-editor": 6, "cb-apply": 3, "cb-history": 5
};

const DEFAULT_LAYOUT: Layout[] = [
  { i: "jb-selector", x: 0, y: 0, w: 4, h: 4 },
  { i: "jb-public", x: 0, y: 4, w: 4, h: 7 },
  { i: "jb-internal", x: 0, y: 11, w: 4, h: 6 },
  { i: "jb-offer", x: 0, y: 17, w: 4, h: 6 },
  { i: "jb-paycom", x: 0, y: 23, w: 4, h: 6 },
  { i: "jb-aviation", x: 0, y: 29, w: 4, h: 6 },
  { i: "jb-bulk", x: 0, y: 35, w: 4, h: 3 },
  { i: "cb-list", x: 0, y: 38, w: 4, h: 6 },
  { i: "cb-apply", x: 0, y: 44, w: 4, h: 3 },

  { i: "jb-summary", x: 4, y: 0, w: 4, h: 5 },
  { i: "jb-responsibilities", x: 4, y: 5, w: 4, h: 7 },
  { i: "jb-qualifications", x: 4, y: 12, w: 4, h: 7 },
  { i: "jb-benefits", x: 4, y: 19, w: 4, h: 6 },
  { i: "jb-blocks", x: 4, y: 25, w: 4, h: 6 },
  { i: "cb-template", x: 4, y: 31, w: 4, h: 8 },
  { i: "cb-editor", x: 4, y: 39, w: 4, h: 6 },
  { i: "cb-history", x: 4, y: 45, w: 4, h: 5 },

  { i: "jb-preview", x: 8, y: 0, w: 4, h: 16 },
  { i: "jb-readiness", x: 8, y: 16, w: 4, h: 6 },
  { i: "jb-export", x: 8, y: 22, w: 4, h: 7 },
  { i: "fr-status", x: 8, y: 29, w: 4, h: 3 },
  { i: "fr-readiness", x: 8, y: 32, w: 4, h: 6 },
  { i: "fr-preview", x: 8, y: 38, w: 4, h: 14 },
  { i: "fr-export", x: 8, y: 52, w: 4, h: 7 },
  { i: "fr-selector", x: 8, y: 59, w: 4, h: 4 }
];

// Lay a list of boxes into N visual columns, shortest-column-first (masonry). Used by
// presets. totalCols is the active grid resolution so widths scale with the snap grid.
function flow(ids: string[], visualCols = 3, startY = 0, totalCols = 12): Layout[] {
  const colW = Math.max(1, Math.round(totalCols / visualCols));
  const colY = new Array(visualCols).fill(startY);
  return ids.map((id) => {
    let c = 0;
    for (let i = 1; i < visualCols; i++) if (colY[i] < colY[c]) c = i;
    const h = BOX_H[id] ?? 5;
    const y = colY[c];
    colY[c] += h;
    const x = Math.min(c * colW, totalCols - colW);
    return { i: id, x, y, w: colW, h };
  });
}

// Re-map a layout from one grid resolution to another, preserving visual proportions.
function scaleLayout(src: Layout[], from: number, to: number): Layout[] {
  if (from === to) return src.map((l) => ({ ...l }));
  const f = to / from;
  return src.map((l) => {
    const w = Math.max(1, Math.round(l.w * f));
    let x = Math.round(l.x * f);
    if (x + w > to) x = Math.max(0, to - w);
    return { ...l, x, w };
  });
}

const DENSITY_MAP = {
  compact: { rh: 22, m: 6 },
  cozy: { rh: 28, m: 10 },
  roomy: { rh: 36, m: 14 }
} as const;
type Density = keyof typeof DENSITY_MAP;

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

function BodyView({ body, format }: { body: string; format: BlockBodyFormat }) {
  if (!body?.trim()) return <p className="text-xs italic text-brand-grey dark:text-slate-400">No content.</p>;
  if (format === "MIXED") return <div className="text-xs leading-5 text-brand-black/80"><RichTextMixed value={body} /></div>;
  if (format === "PARAGRAPH") return <RichTextParagraphs value={body} paragraphClassName="text-xs leading-5 text-brand-black/80" />;
  return (
    <ul className="space-y-1 text-xs leading-5 text-brand-black/80">
      {splitCleanLines(body).map((line, i) => (
        <li key={i} className="flex gap-1.5">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-eden" />
          <span><RichText value={line} /></span>
        </li>
      ))}
    </ul>
  );
}

function FieldRows({ rows }: { rows: Array<[string, string | null]> }) {
  return (
    <div className="space-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">{label}</span>
          {value ? (
            <span className="flex-1 truncate rounded border border-brand-lea/10 bg-brand-cloudDancer/30 px-2 py-1 text-xs text-brand-black/80 dark:border-white/10 dark:bg-white/5">{value}</span>
          ) : (
            <span className="h-6 flex-1 rounded border border-dashed border-brand-lea/15 bg-white dark:border-white/10 dark:bg-[#10243a]" />
          )}
        </div>
      ))}
    </div>
  );
}

const PLACEMENTS: Array<{ key: string; label: string }> = [
  { key: "REQUIRED", label: "Required" },
  { key: "DEPARTMENT_SPECIFIC", label: "Department specific" },
  { key: "ROLE_SPECIFIC", label: "Role specific" },
  { key: "OPTIONAL", label: "Optional" }
];

export function LayoutLab({ job, blocks, limitedHtml }: Props) {
  const [layout, setLayout] = useState<Layout[]>(DEFAULT_LAYOUT);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [pageFilter, setPageFilter] = useState<string>("All");
  const [density, setDensity] = useState<Density>("cozy");
  const [cols, setCols] = useState(12);
  const [showGrid, setShowGrid] = useState(false);
  const [moveMenu, setMoveMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLayout(JSON.parse(raw) as Layout[]);
      const rawLocks = window.localStorage.getItem(LOCK_KEY);
      if (rawLocks) setLocked(new Set(JSON.parse(rawLocks) as string[]));
      const rawHidden = window.localStorage.getItem(HIDE_KEY);
      if (rawHidden) setHidden(new Set(JSON.parse(rawHidden) as string[]));
      const rawAssign = window.localStorage.getItem(ASSIGN_KEY);
      if (rawAssign) setAssign(JSON.parse(rawAssign) as Record<string, string>);
      const rawDensity = window.localStorage.getItem(DENSITY_KEY);
      if (rawDensity === "compact" || rawDensity === "cozy" || rawDensity === "roomy") setDensity(rawDensity);
      const rawCols = window.localStorage.getItem(COLS_KEY);
      if (rawCols) {
        const n = parseInt(rawCols, 10);
        if (COL_OPTIONS.some((o) => o.n === n)) setCols(n);
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  function onLayoutChange(next: Layout[]) {
    const positions = next.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
    // Merge so boxes filtered out of the current view keep their saved coordinates.
    setLayout((cur) => {
      const byId = new Map(cur.map((l) => [l.i, l]));
      for (const p of positions) byId.set(p.i, p);
      const merged = [...byId.values()];
      if (loaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function toggleLock(id: string) {
    setLocked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem(LOCK_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function toggleHide(id: string) {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem(HIDE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function reassign(id: string, page: string) {
    setAssign((cur) => {
      const next = { ...cur };
      const original = WIDGETS.find((w) => w.id === id)?.source;
      if (page === original) delete next[id];
      else next[id] = page;
      window.localStorage.setItem(ASSIGN_KEY, JSON.stringify(next));
      return next;
    });
    setMoveMenu(null);
  }

  function changeDensity(d: Density) {
    setDensity(d);
    window.localStorage.setItem(DENSITY_KEY, d);
  }

  function changeCols(next: number) {
    setLayout((cur) => {
      const scaled = scaleLayout(cur, cols, next);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scaled));
      return scaled;
    });
    setCols(next);
    window.localStorage.setItem(COLS_KEY, String(next));
  }

  function applyState(nextLayout: Layout[], nextAssign: Record<string, string>, nextHidden: Set<string>) {
    setLayout(nextLayout);
    setAssign(nextAssign);
    setHidden(nextHidden);
    setLocked(new Set());
    setPageFilter("All");
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLayout));
    window.localStorage.setItem(ASSIGN_KEY, JSON.stringify(nextAssign));
    window.localStorage.setItem(HIDE_KEY, JSON.stringify([...nextHidden]));
    window.localStorage.setItem(LOCK_KEY, JSON.stringify([]));
  }

  function applyPreset(kind: "source" | "one" | "two") {
    if (kind === "source") {
      applyState(scaleLayout(DEFAULT_LAYOUT, 12, cols), {}, new Set());
      return;
    }
    const frDupes = WIDGETS.filter((w) => w.id.startsWith("fr-")).map((w) => w.id);
    const hide = new Set(frDupes);
    if (kind === "one") {
      const keep = WIDGETS.filter((w) => !w.id.startsWith("fr-")).map((w) => w.id);
      const a: Record<string, string> = {};
      keep.forEach((id) => (a[id] = "Page 1"));
      applyState(flow(keep, 3, 0, cols), a, hide);
      return;
    }
    // two-page split: public/marketing on Page 1, internal/HR on Page 2
    const page1 = ["jb-public", "jb-summary", "jb-responsibilities", "jb-qualifications", "jb-benefits", "jb-blocks", "jb-preview", "jb-readiness", "jb-export", "cb-template", "cb-list"];
    const page2 = ["jb-selector", "jb-internal", "jb-offer", "jb-paycom", "jb-aviation", "jb-bulk", "cb-editor", "cb-apply", "cb-history"];
    const a: Record<string, string> = {};
    page1.forEach((id) => (a[id] = "Page 1"));
    page2.forEach((id) => (a[id] = "Page 2"));
    const l1 = flow(page1, 3, 0, cols);
    const maxY1 = Math.max(0, ...l1.map((l) => l.y + l.h)) + 1;
    const l2 = flow(page2, 3, maxY1, cols);
    applyState([...l1, ...l2], a, hide);
  }

  function reset() {
    applyPreset("source");
  }

  function copyLayout() {
    const boxes = layout
      .filter((l) => !hidden.has(l.i))
      .map((l) => ({ i: l.i, page: assign[l.i] ?? WIDGETS.find((w) => w.id === l.i)?.source, x: l.x, y: l.y, w: l.w, h: l.h, locked: locked.has(l.i) }));
    const payload = { cols, density, boxes };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const pageOf = (w: Widget) => assign[w.id] ?? w.source;

  const visibleWidgets = WIDGETS.filter((w) => !hidden.has(w.id) && (pageFilter === "All" || pageOf(w) === pageFilter));
  const visibleIds = new Set(visibleWidgets.map((w) => w.id));
  const hiddenWidgets = WIDGETS.filter((w) => hidden.has(w.id));

  const displayLayout = useMemo(
    () =>
      layout
        .filter((l) => visibleIds.has(l.i))
        .map((l) => ({
          ...l,
          static: locked.has(l.i),
          isDraggable: !locked.has(l.i),
          isResizable: !locked.has(l.i)
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, locked, hidden, assign, pageFilter]
  );

  // Counts for the page filter chips (ignore the active filter; only respect hidden).
  const pageCounts = useMemo(() => {
    const counts: Record<string, number> = { All: 0 };
    for (const p of ALL_PAGES) counts[p] = 0;
    for (const w of WIDGETS) {
      if (hidden.has(w.id)) continue;
      counts.All += 1;
      counts[pageOf(w)] = (counts[pageOf(w)] ?? 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assign, hidden]);

  const dim = DENSITY_MAP[density];

  const sectionInstance = useMemo(() => {
    const map = new Map<string, SerializedJobBlockInstance>();
    if (job) for (const s of getSectionStatuses(job)) if (s.instances[0]) map.set(s.key, s.instances[0]);
    return map;
  }, [job]);

  const readiness = useMemo(() => (job ? getReadinessChecklist(job) : []), [job]);
  const readyCount = readiness.filter((r) => r.complete).length;

  function renderSection(sectionKey: string) {
    const inst = sectionInstance.get(sectionKey);
    if (!inst) return <p className="text-xs italic text-brand-grey dark:text-slate-400">No block attached for this section.</p>;
    return (
      <div>
        <div className="mb-1 text-xs font-bold text-brand-lea dark:text-slate-100">{getInstanceTitle(inst)}</div>
        <BodyView body={getInstanceBody(inst)} format={getInstanceFormatting(inst).bodyFormat} />
      </div>
    );
  }

  function renderPreview() {
    return job ? (
      <div className="rounded border border-brand-lea/10 dark:border-white/10">
        <FormattedJobPost job={job} />
      </div>
    ) : <p className="text-xs italic text-brand-grey dark:text-slate-400">No job.</p>;
  }

  function renderReadiness() {
    return (
      <div className="space-y-1">
        {readiness.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 text-xs text-brand-black/80">
            <span className={c.complete ? "text-emerald-600" : "text-brand-grey dark:text-slate-400"}>{c.complete ? "✓" : "○"}</span> {c.label}
          </div>
        ))}
      </div>
    );
  }

  function renderExport() {
    return (
      <div>
        <div className="mb-2 flex gap-1.5">
          <span className="rounded bg-brand-lea px-2 py-1 text-[11px] font-semibold text-white">Limited HTML</span>
          <span className="rounded border border-brand-lea/15 px-2 py-1 text-[11px] text-brand-lea dark:border-white/10 dark:text-slate-100">Plain Text</span>
        </div>
        <pre className="max-h-full overflow-auto whitespace-pre-wrap rounded border border-brand-lea/10 bg-white p-2 font-mono text-[9px] leading-4 text-brand-grey dark:border-white/10 dark:bg-[#10243a] dark:text-slate-400">{(limitedHtml || "Nothing to export.").slice(0, 1200)}</pre>
      </div>
    );
  }

  function renderSelector() {
    return (
      <div>
        <div className="mb-2 rounded border border-brand-lea/15 px-2 py-1 text-xs text-brand-grey dark:border-white/10 dark:text-slate-400">Search jobs…</div>
        <div className="flex flex-wrap gap-1.5">
          {["Active (19)", "Archived (60)", "All (79)"].map((t, i) => (
            <span key={t} className={`rounded px-2 py-1 text-[11px] font-semibold ${i === 0 ? "bg-brand-lea text-white" : "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"}`}>{t}</span>
          ))}
        </div>
        <div className="mt-2 truncate rounded border border-brand-gold/40 bg-brand-sweet/20 px-2 py-1.5 text-xs font-semibold text-brand-lea dark:text-slate-100">{job?.title ?? "No job"}</div>
      </div>
    );
  }

  function widgetBody(id: string) {
    switch (id) {
      case "jb-selector":
      case "fr-selector":
        return renderSelector();
      case "jb-public":
        return <FieldRows rows={[["Title", job?.title ?? null], ["Location", job?.location ?? null], ["Job type", job?.positionType ?? null], ["Pay range", job?.salaryRange ?? null], ["Schedule", job?.workSchedule ?? null], ["Posted", fmtDate(job?.postedDate ?? null) ?? "Not posted"]]} />;
      case "jb-internal":
        return <FieldRows rows={[["Internal", job?.internalName ?? null], ["Department", job?.department ?? null], ["Category", job?.category ?? null], ["Reports to", job?.reportsTo ?? null], ["Position", job?.positionCode ?? null], ["Seat code", job?.seatCode ?? null]]} />;
      case "jb-offer":
        return <FieldRows rows={[["Pay range", job?.salaryRange ?? null], ["Start bonus", null], ["Relocation", null], ["PTO", null], ["Benefits class", null], ["Education", job?.educationLevel ?? null]]} />;
      case "jb-paycom":
        return <FieldRows rows={[["Workflow", job?.paycom?.workflow ?? null], ["Ext. app", job?.paycom?.externalApplication ?? null], ["Knockout", job?.paycom?.externalKnockout ?? null], ["Job level", job?.paycom?.externalJobLevel ?? null], ["Follow-ups", job?.paycom?.externalFollowUps ?? null]]} />;
      case "jb-aviation":
        return <FieldRows rows={[["Seat code", job?.seatCode ?? null], ["Position", job?.positionCode ?? null], ["Travel %", job?.travelPercentage ?? null], ["Aircraft", null], ["Total time", null], ["Type rating", null]]} />;
      case "jb-summary":
        return job?.summary ? <p className="text-xs leading-5 text-brand-black/80">{job.summary}</p> : <p className="text-xs italic text-brand-grey dark:text-slate-400">No summary.</p>;
      case "jb-responsibilities":
        return renderSection("responsibilities");
      case "jb-qualifications":
        return renderSection("qualifications");
      case "jb-benefits":
        return renderSection("benefits");
      case "jb-blocks":
        return (
          <div className="space-y-1">
            {job?.blockInstances.length ? job.blockInstances.map((inst) => (
              <div key={inst.id} className="flex items-center justify-between gap-2 rounded border border-brand-lea/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-[#10243a]">
                <span className="truncate font-semibold text-brand-lea dark:text-slate-100">{getInstanceTitle(inst)}</span>
                <span className="shrink-0 rounded bg-brand-lea/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-eden">{inst.contentBlock?.category ?? "—"}</span>
              </div>
            )) : <p className="text-xs italic text-brand-grey dark:text-slate-400">No blocks attached.</p>}
          </div>
        );
      case "jb-preview":
      case "fr-preview":
        return renderPreview();
      case "jb-readiness":
      case "fr-readiness":
        return renderReadiness();
      case "jb-export":
      case "fr-export":
        return renderExport();
      case "fr-status":
        return (
          <div className={`rounded px-2 py-1.5 text-center text-xs font-bold ${readyCount === readiness.length ? "bg-emerald-50 text-emerald-800" : "bg-brand-gold/20 text-brand-lea dark:text-slate-100"}`}>
            {readyCount === readiness.length ? "Ready to publish" : `${readiness.length - readyCount} item(s) to review`}
          </div>
        );
      case "cb-list":
        return (
          <div className="space-y-1">
            {blocks.slice(0, 10).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded border border-brand-lea/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-[#10243a]">
                <span className="truncate font-semibold text-brand-lea dark:text-slate-100">{b.name}</span>
                <span className="shrink-0 rounded bg-brand-gold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-lea dark:text-slate-100">{b.category}</span>
              </div>
            ))}
          </div>
        );
      case "cb-template":
        return (
          <div className="space-y-2">
            {PLACEMENTS.map((p) => {
              const inP = blocks.filter((b) => b.placement === p.key);
              if (!inP.length) return null;
              return (
                <div key={p.key}>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">{p.label}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {inP.slice(0, 6).map((b) => (
                      <span key={b.id} className="rounded border border-brand-lea/15 bg-brand-cloudDancer/40 px-2 py-1 text-[10px] font-semibold text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-100" title={b.category}>{b.name}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      case "cb-editor": {
        const sample = blocks[0];
        return sample?.currentVersion ? (
          <div>
            <div className="mb-1 flex gap-1">
              <span className="rounded border border-brand-lea/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-lea dark:border-white/10 dark:text-slate-100">B</span>
              <span className="rounded border border-brand-lea/15 px-1.5 py-0.5 text-[10px] text-brand-grey dark:border-white/10 dark:text-slate-400">{sample.currentVersion.bodyFormat === "PARAGRAPH" ? "Paragraphs" : sample.currentVersion.bodyFormat === "MIXED" ? "Mixed" : "Bullets"}</span>
            </div>
            <div className="mb-1 text-xs font-bold text-brand-lea dark:text-slate-100">{sample.name}</div>
            <BodyView body={sample.currentVersion.body} format={sample.currentVersion.bodyFormat} />
          </div>
        ) : <p className="text-xs italic text-brand-grey dark:text-slate-400">No blocks.</p>;
      }
      case "cb-apply":
        return (
          <div className="space-y-1.5 text-xs text-brand-black/80">
            <div className="flex items-center gap-1.5"><span className="text-brand-lea dark:text-slate-100">◉</span> Apply to all jobs (79)</div>
            <div className="flex items-center gap-1.5"><span className="text-brand-grey dark:text-slate-400">○</span> Apply to selected jobs</div>
            <div className="mt-1 rounded bg-brand-lea px-2 py-1 text-center text-[11px] font-semibold text-white">Apply to all jobs</div>
          </div>
        );
      case "cb-history": {
        const sample = blocks[0];
        return (
          <div className="space-y-1">
            {sample?.versions?.length ? sample.versions.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded border border-brand-lea/10 px-2 py-1 text-xs dark:border-white/10">
                <span className="truncate text-brand-black/80">v{v.versionNumber} — {v.title}</span>
                {v.id === sample.currentVersionId ? <span className="shrink-0 rounded bg-brand-gold/22 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-lea dark:text-slate-100">Current</span> : null}
              </div>
            )) : <p className="text-xs italic text-brand-grey dark:text-slate-400">No versions.</p>}
          </div>
        );
      }
      case "jb-bulk":
        return <p className="text-xs text-brand-grey dark:text-slate-400">Archive inactive roles or restore archived roles.</p>;
      default:
        return null;
    }
  }

  return (
    <div className="px-5 py-5 lg:px-8">
      <section className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Experimental</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Layout Lab</h1>
          <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
            Every box from all three publishing pages, with real <span className="font-semibold text-brand-lea dark:text-slate-100">{job?.title ?? "sample"}</span>{" "}
            content. Drag by the header, resize from the corner, <Lock className="inline h-3 w-3" /> lock a box so nothing
            pushes it, <EyeOff className="inline h-3 w-3" /> hide a duplicate, and{" "}
            <ArrowRightLeft className="inline h-3 w-3" /> move a box onto a consolidated <span className="font-semibold text-indigo-600">Page 1</span> /{" "}
            <span className="font-semibold text-fuchsia-700">Page 2</span> to rehearse merging. Try a{" "}
            <span className="font-semibold text-brand-lea dark:text-slate-100">preset</span>, then <span className="font-semibold text-brand-lea dark:text-slate-100">Copy layout</span> when ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowGrid((v) => !v)} className={`inline-flex items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition ${showGrid ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-lea hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"}`}>
            <Grid3x3 className="h-4 w-4" /> Grid
          </button>
          <button onClick={copyLayout} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden">{copied ? "Copied!" : "Copy layout"}</button>
          <button onClick={reset} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">Reset</button>
        </div>
      </section>

      {/* Controls: presets + density */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded border border-brand-lea/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#10243a]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Presets:</span>
          <button onClick={() => applyPreset("source")} className="rounded border border-brand-lea/20 px-3 py-1 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">Source (3 cols)</button>
          <button onClick={() => applyPreset("one")} className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100">One-page draft</button>
          <button onClick={() => applyPreset("two")} className="rounded border border-fuchsia-300 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold text-fuchsia-700 transition hover:bg-fuchsia-100">Two-page split</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Density:</span>
          <div className="inline-flex overflow-hidden rounded border border-brand-lea/20 dark:border-white/10">
            {(["compact", "cozy", "roomy"] as Density[]).map((d) => (
              <button
                key={d}
                onClick={() => changeDensity(d)}
                className={`px-3 py-1 text-[11px] font-semibold capitalize transition ${density === d ? "bg-brand-lea text-white" : "text-brand-lea hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:bg-white/5"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Grid:</span>
          <div className="inline-flex overflow-hidden rounded border border-brand-lea/20 dark:border-white/10">
            {COL_OPTIONS.map((o) => (
              <button
                key={o.n}
                onClick={() => changeCols(o.n)}
                title={`${o.n} columns`}
                className={`px-3 py-1 text-[11px] font-semibold transition ${cols === o.n ? "bg-brand-lea text-white" : "text-brand-lea hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:bg-white/5"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-brand-grey dark:text-slate-400">finer = smaller snap steps</span>
        </div>
      </div>

      {/* Page filter chips (also the color legend) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Pages:</span>
        {["All", ...ALL_PAGES].map((p) => {
          const active = pageFilter === p;
          const count = pageCounts[p] ?? 0;
          return (
            <button
              key={p}
              onClick={() => setPageFilter(p)}
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-[11px] font-semibold transition ${active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/15 bg-white text-brand-lea hover:bg-brand-cloudDancer/50 dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100 dark:bg-white/5"}`}
            >
              {p !== "All" && <span className={`h-2.5 w-2.5 rounded-full ${PAGE_DOT[p]}`} />}
              {p}
              <span className={`rounded px-1.5 text-[10px] ${active ? "bg-white/25" : "bg-brand-lea/10 text-brand-grey dark:text-slate-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {hiddenWidgets.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-brand-lea/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#10243a]">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Hidden ({hiddenWidgets.length}):</span>
          {hiddenWidgets.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => toggleHide(w.id)}
              className="inline-flex items-center gap-1 rounded border border-brand-lea/15 bg-brand-cloudDancer/50 px-2.5 py-1 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              title="Show again"
            >
              <Eye className="h-3 w-3" /> {w.title}
            </button>
          ))}
        </div>
      )}

      {visibleWidgets.length === 0 && (
        <div className="rounded-lg border border-dashed border-brand-lea/20 bg-white px-4 py-10 text-center text-sm text-brand-grey dark:border-white/10 dark:bg-[#10243a] dark:text-slate-400">
          No boxes on <span className="font-semibold text-brand-lea dark:text-slate-100">{pageFilter}</span> yet. Use a box&apos;s{" "}
          <ArrowRightLeft className="inline h-3 w-3" /> move menu to assign boxes here.
        </div>
      )}

      <div
        className="rounded-lg bg-brand-cloudDancer/30 p-1 dark:bg-white/5"
        style={
          showGrid
            ? {
                backgroundImage:
                  "linear-gradient(to right, rgba(21,50,62,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(21,50,62,0.10) 1px, transparent 1px)",
                backgroundSize: `${100 / cols}% ${dim.rh + dim.m}px`,
                backgroundPosition: `${dim.m + 1}px ${dim.m + 1}px`
              }
            : undefined
        }
      >
        <GridLayout
          className="layout"
          layout={displayLayout}
          cols={cols}
          rowHeight={dim.rh}
          margin={[dim.m, dim.m]}
          draggableHandle=".lab-drag"
          draggableCancel=".lab-nodrag"
          onLayoutChange={onLayoutChange}
          compactType={null}
          preventCollision
        >
          {visibleWidgets.map((w) => {
            const isLocked = locked.has(w.id);
            const page = pageOf(w);
            const moved = page !== w.source;
            return (
              <div key={w.id} className={`flex flex-col overflow-hidden rounded-lg border bg-white shadow-panel dark:bg-[#10243a] ${isLocked ? "border-brand-gold ring-2 ring-brand-gold/40" : "border-brand-lea/15 dark:border-white/10"}`}>
                <div className={`lab-drag flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 ${isLocked ? "cursor-default" : "cursor-move"} ${PAGE_COLOR[page]}`}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[11px] font-bold uppercase tracking-wide">{w.title}</span>
                    {moved && <span className="shrink-0 rounded bg-white/25 px-1 text-[8px] font-bold uppercase">{w.source.split(" ")[0]}</span>}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {w.badge ? <span className="rounded bg-white/25 px-1.5 py-0.5 text-[9px] font-bold">{w.badge}</span> : null}
                    <button
                      type="button"
                      onClick={(e) => setMoveMenu(moveMenu?.id === w.id ? null : { id: w.id, x: e.clientX, y: e.clientY })}
                      className="lab-nodrag rounded p-0.5 opacity-80 hover:opacity-100"
                      title="Move to another page"
                      aria-label="Move to another page"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleHide(w.id)}
                      className="lab-nodrag rounded p-0.5 opacity-80 hover:opacity-100"
                      title="Hide box"
                      aria-label="Hide box"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLock(w.id)}
                      className="lab-nodrag rounded p-0.5 opacity-80 hover:opacity-100"
                      title={isLocked ? "Unlock" : "Lock in place"}
                      aria-label={isLocked ? "Unlock" : "Lock in place"}
                    >
                      {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-3">{widgetBody(w.id)}</div>
              </div>
            );
          })}
        </GridLayout>
      </div>

      {/* Move-to-page popover (fixed so the card's overflow doesn't clip it) */}
      {moveMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMoveMenu(null)} />
          <div
            className="fixed z-50 w-56 rounded-lg border border-brand-lea/20 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#10243a]"
            style={{ left: Math.min(moveMenu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 240), top: moveMenu.y + 6 }}
          >
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Move this box to →</div>
            {ALL_PAGES.map((p) => {
              const current = (assign[moveMenu.id] ?? WIDGETS.find((w) => w.id === moveMenu.id)?.source) === p;
              const isOrigin = WIDGETS.find((w) => w.id === moveMenu.id)?.source === p;
              return (
                <button
                  key={p}
                  onClick={() => reassign(moveMenu.id, p)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition ${current ? "bg-brand-cloudDancer/60 font-semibold text-brand-lea dark:bg-white/5 dark:text-slate-100" : "text-brand-black/80 hover:bg-brand-cloudDancer/40 dark:bg-white/5"}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${PAGE_DOT[p]}`} />
                    {p}
                    {isOrigin && <span className="text-[9px] uppercase text-brand-grey dark:text-slate-400">(origin)</span>}
                  </span>
                  {current && <span className="text-brand-eden">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
