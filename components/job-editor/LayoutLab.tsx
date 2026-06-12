"use client";

import { useEffect, useState } from "react";
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const GridLayout = WidthProvider(RGL);

const STORAGE_KEY = "skyshare-layout-lab-v1";

type WidgetKind = "fields" | "checklist" | "preview" | "export" | "list" | "editor" | "tabs" | "note";

type Widget = {
  id: string;
  title: string;
  source: "Job Builder" | "Final Review" | "Content Blocks";
  kind: WidgetKind;
  badge?: string;
  items?: string[];
};

const SOURCE_COLOR: Record<Widget["source"], string> = {
  "Job Builder": "bg-brand-lea text-white",
  "Final Review": "bg-emerald-600 text-white",
  "Content Blocks": "bg-brand-gold text-brand-lea"
};

const WIDGETS: Widget[] = [
  // ---- Job Builder ----
  { id: "jb-selector", title: "Job selector & tabs", source: "Job Builder", kind: "tabs", items: ["Active (19)", "Archived (60)", "All (79)"] },
  { id: "jb-bulk", title: "Bulk actions", source: "Job Builder", kind: "note", badge: "0 selected" },
  { id: "jb-public", title: "Public posting fields", source: "Job Builder", kind: "fields", badge: "11 fields", items: ["Title", "Location", "Position type", "Salary range", "Work schedule", "Posted date"] },
  { id: "jb-internal", title: "Internal role tracking", source: "Job Builder", kind: "fields", badge: "10 fields", items: ["Internal name", "Department", "Reports to", "Position code", "Seat code"] },
  { id: "jb-offer", title: "Offer letter / HR fields", source: "Job Builder", kind: "fields", badge: "16 fields", items: ["Pay rate", "Start bonus", "Relocation", "PTO", "Benefits class"] },
  { id: "jb-paycom", title: "Paycom setup fields", source: "Job Builder", kind: "fields", badge: "10 fields", items: ["Workflow", "External application", "Knockout", "Job level", "Follow-ups"] },
  { id: "jb-aviation", title: "Aviation requirement fields", source: "Job Builder", kind: "fields", badge: "12 fields", items: ["Aircraft types", "Seat (PIC/SIC)", "Total time", "PIC time", "Type rating", "Base airport"] },
  { id: "jb-summary", title: "Summary", source: "Job Builder", kind: "editor", badge: "From job field" },
  { id: "jb-responsibilities", title: "Responsibilities", source: "Job Builder", kind: "editor", badge: "Hidden by block" },
  { id: "jb-qualifications", title: "Qualifications", source: "Job Builder", kind: "editor", badge: "Hidden by block" },
  { id: "jb-benefits", title: "Benefits", source: "Job Builder", kind: "editor", badge: "Hidden by block" },
  { id: "jb-blocks", title: "Content blocks attached", source: "Job Builder", kind: "list", items: ["About SkyShare · v5", "Core Values · v4", "Pilot Responsibilities · v2", "Requirements · v4"] },
  { id: "jb-preview", title: "Formatted job post preview", source: "Job Builder", kind: "preview" },
  { id: "jb-readiness", title: "Ready check (inline)", source: "Job Builder", kind: "checklist", badge: "12/12", items: ["Salary present", "Location present", "About attached", "Qualifications attached", "Benefits attached"] },

  // ---- Final Review ----
  { id: "fr-readiness", title: "Publish readiness checklist", source: "Final Review", kind: "checklist", badge: "12/12", items: ["Ready check clean", "Responsibilities section", "Closing CTA section", "Outdated blocks reviewed", "Custom/forked reviewed"] },
  { id: "fr-export", title: "Export — copy for job boards", source: "Final Review", kind: "export" },

  // ---- Content Blocks ----
  { id: "cb-list", title: "Block library list", source: "Content Blocks", kind: "list", items: ["Pilot Qualifications", "About SkyShare", "Core Values", "Benefits"] },
  { id: "cb-editor", title: "Block editor (content + format)", source: "Content Blocks", kind: "editor", badge: "Mixed" },
  { id: "cb-apply", title: "Apply block to jobs", source: "Content Blocks", kind: "note", badge: "All / selected" },
  { id: "cb-history", title: "Version history", source: "Content Blocks", kind: "list", items: ["v3 — current", "v2 — turbine req", "v1 — initial"] }
];

const DEFAULT_LAYOUT: Layout[] = [
  { i: "jb-selector", x: 0, y: 0, w: 4, h: 4 },
  { i: "jb-public", x: 0, y: 4, w: 4, h: 5 },
  { i: "jb-internal", x: 0, y: 9, w: 4, h: 5 },
  { i: "jb-offer", x: 0, y: 14, w: 4, h: 5 },
  { i: "jb-paycom", x: 0, y: 19, w: 4, h: 5 },
  { i: "jb-aviation", x: 0, y: 24, w: 4, h: 5 },
  { i: "jb-bulk", x: 0, y: 29, w: 4, h: 3 },

  { i: "jb-summary", x: 4, y: 0, w: 4, h: 4 },
  { i: "jb-responsibilities", x: 4, y: 4, w: 4, h: 4 },
  { i: "jb-qualifications", x: 4, y: 8, w: 4, h: 4 },
  { i: "jb-benefits", x: 4, y: 12, w: 4, h: 4 },
  { i: "jb-blocks", x: 4, y: 16, w: 4, h: 5 },
  { i: "jb-preview", x: 4, y: 21, w: 4, h: 9 },

  { i: "jb-readiness", x: 8, y: 0, w: 4, h: 6 },
  { i: "fr-readiness", x: 8, y: 6, w: 4, h: 6 },
  { i: "fr-export", x: 8, y: 12, w: 4, h: 7 },
  { i: "cb-list", x: 8, y: 19, w: 4, h: 5 },
  { i: "cb-editor", x: 8, y: 24, w: 4, h: 5 },
  { i: "cb-apply", x: 8, y: 29, w: 4, h: 3 },
  { i: "cb-history", x: 8, y: 32, w: 4, h: 4 }
];

function WidgetBody({ widget }: { widget: Widget }) {
  if (widget.kind === "tabs") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {widget.items?.map((t, i) => (
          <span key={t} className={`rounded px-2 py-1 text-[11px] font-semibold ${i === 0 ? "bg-brand-lea text-white" : "bg-brand-cloudDancer text-brand-grey"}`}>{t}</span>
        ))}
      </div>
    );
  }
  if (widget.kind === "fields") {
    return (
      <div className="space-y-1.5">
        {widget.items?.map((f) => (
          <div key={f} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand-grey">{f}</span>
            <span className="h-5 flex-1 rounded border border-brand-lea/10 bg-brand-cloudDancer/40" />
          </div>
        ))}
      </div>
    );
  }
  if (widget.kind === "checklist") {
    return (
      <div className="space-y-1">
        {widget.items?.map((c) => (
          <div key={c} className="flex items-center gap-1.5 text-xs text-brand-black/80">
            <span className="text-emerald-600">✓</span> {c}
          </div>
        ))}
      </div>
    );
  }
  if (widget.kind === "editor") {
    return (
      <div>
        <div className="mb-1.5 flex gap-1">
          <span className="rounded border border-brand-lea/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-lea">B</span>
          <span className="rounded border border-brand-lea/15 px-1.5 py-0.5 text-[10px] text-brand-grey">Color</span>
          <span className="rounded border border-brand-lea/15 px-1.5 py-0.5 text-[10px] text-brand-grey">• Bullet</span>
        </div>
        <div className="h-full min-h-[40px] rounded border border-brand-lea/10 bg-white p-2 text-xs text-brand-grey">Editable content…</div>
      </div>
    );
  }
  if (widget.kind === "list") {
    return (
      <div className="space-y-1">
        {widget.items?.map((r) => (
          <div key={r} className="rounded border border-brand-lea/10 bg-white px-2 py-1 text-xs text-brand-black/80">{r}</div>
        ))}
      </div>
    );
  }
  if (widget.kind === "export") {
    return (
      <div>
        <div className="mb-2 flex gap-1.5">
          <span className="rounded bg-brand-lea px-2 py-1 text-[11px] font-semibold text-white">Limited HTML</span>
          <span className="rounded border border-brand-lea/15 px-2 py-1 text-[11px] text-brand-lea">Plain Text</span>
        </div>
        <div className="rounded bg-brand-gold/20 px-2 py-1 text-[11px] font-semibold text-brand-lea">Copy Limited HTML</div>
        <div className="mt-2 h-12 rounded border border-brand-lea/10 bg-white p-1.5 font-mono text-[9px] text-brand-grey">&lt;b&gt;Location:&lt;/b&gt; SLC…</div>
      </div>
    );
  }
  if (widget.kind === "preview") {
    return (
      <div className="rounded border border-brand-lea/10 bg-white p-2">
        <div className="rounded bg-brand-lea px-2 py-1.5 text-xs font-bold text-white">Gulfstream G450 &amp; GV Captain</div>
        <div className="mt-2 text-[11px] font-bold text-brand-gold">Job Summary</div>
        <div className="mt-1 h-2 w-full rounded bg-brand-cloudDancer/60" />
        <div className="mt-1 h-2 w-4/5 rounded bg-brand-cloudDancer/60" />
        <div className="mt-2 text-[11px] font-bold text-brand-gold">Requirements</div>
        <div className="mt-1 h-2 w-full rounded bg-brand-cloudDancer/60" />
      </div>
    );
  }
  return <div className="text-xs text-brand-grey">{widget.badge ?? "—"}</div>;
}

export function LayoutLab() {
  const [layout, setLayout] = useState<Layout[]>(DEFAULT_LAYOUT);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setLayout(JSON.parse(raw) as Layout[]);
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  function onLayoutChange(next: Layout[]) {
    setLayout(next);
    if (loaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }

  function reset() {
    setLayout(DEFAULT_LAYOUT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LAYOUT));
  }

  function copyLayout() {
    const compact = layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
    navigator.clipboard.writeText(JSON.stringify(compact, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="px-5 py-5 lg:px-8">
      <section className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Experimental</p>
          <h1 className="text-2xl font-semibold text-brand-lea">Layout Lab</h1>
          <p className="mt-1 max-w-3xl text-sm text-brand-grey">
            Drag any box by its header and resize from the bottom-right corner. Every field box from the Job Builder,
            Final Review, and Content Blocks pages is here. Your arrangement is saved automatically. When you like a
            layout, hit <span className="font-semibold text-brand-lea">Copy layout</span> and I&rsquo;ll bake it into
            the real page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyLayout} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden">
            {copied ? "Copied!" : "Copy layout"}
          </button>
          <button onClick={reset} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60">
            Reset
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-3 pb-3 text-[11px]">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-lea" /> Job Builder</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-600" /> Final Review</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-gold" /> Content Blocks</span>
      </div>

      <div className="rounded-lg bg-brand-cloudDancer/30 p-1">
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={28}
          margin={[10, 10]}
          draggableHandle=".lab-drag"
          onLayoutChange={onLayoutChange}
          compactType={null}
          preventCollision={false}
        >
          {WIDGETS.map((w) => (
            <div key={w.id} className="overflow-hidden rounded-lg border border-brand-lea/15 bg-white shadow-panel">
              <div className={`lab-drag flex cursor-move items-center justify-between gap-2 px-3 py-1.5 ${SOURCE_COLOR[w.source]}`}>
                <span className="truncate text-[11px] font-bold uppercase tracking-wide">{w.title}</span>
                {w.badge ? <span className="shrink-0 rounded bg-white/25 px-1.5 py-0.5 text-[9px] font-bold">{w.badge}</span> : null}
              </div>
              <div className="h-[calc(100%-30px)] overflow-auto p-3">
                <WidgetBody widget={w} />
              </div>
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}
