"use client";

import { useEffect, useMemo, useState } from "react";
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
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
const STORAGE_KEY = "skyshare-layout-lab-v1";

type Props = {
  job: SerializedJobPost | null;
  blocks: SerializedContentBlock[];
  limitedHtml: string;
};

type WidgetId =
  | "jb-selector" | "jb-public" | "jb-internal" | "jb-offer" | "jb-paycom" | "jb-aviation"
  | "jb-summary" | "jb-responsibilities" | "jb-qualifications" | "jb-benefits"
  | "jb-blocks" | "jb-preview" | "jb-readiness" | "jb-bulk"
  | "fr-readiness" | "fr-export"
  | "cb-list" | "cb-template" | "cb-editor" | "cb-apply" | "cb-history";

type Widget = { id: WidgetId; title: string; source: "Job Builder" | "Final Review" | "Content Blocks"; badge?: string };

const SOURCE_COLOR: Record<Widget["source"], string> = {
  "Job Builder": "bg-brand-lea text-white",
  "Final Review": "bg-emerald-600 text-white",
  "Content Blocks": "bg-brand-gold text-brand-lea"
};

const WIDGETS: Widget[] = [
  { id: "jb-selector", title: "Job selector & tabs", source: "Job Builder" },
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
  { id: "jb-preview", title: "Formatted job post preview", source: "Job Builder" },
  { id: "jb-readiness", title: "Ready check (inline)", source: "Job Builder" },
  { id: "jb-bulk", title: "Bulk actions", source: "Job Builder", badge: "0 selected" },
  { id: "fr-readiness", title: "Publish readiness checklist", source: "Final Review" },
  { id: "fr-export", title: "Export — copy for job boards", source: "Final Review" },
  { id: "cb-list", title: "Block library list", source: "Content Blocks" },
  { id: "cb-template", title: "Template board", source: "Content Blocks" },
  { id: "cb-editor", title: "Block editor (content + format)", source: "Content Blocks" },
  { id: "cb-apply", title: "Apply block to jobs", source: "Content Blocks" },
  { id: "cb-history", title: "Version history", source: "Content Blocks" }
];

const DEFAULT_LAYOUT: Layout[] = [
  { i: "jb-selector", x: 0, y: 0, w: 4, h: 4 },
  { i: "jb-public", x: 0, y: 4, w: 4, h: 7 },
  { i: "jb-internal", x: 0, y: 11, w: 4, h: 6 },
  { i: "jb-offer", x: 0, y: 17, w: 4, h: 6 },
  { i: "jb-paycom", x: 0, y: 23, w: 4, h: 6 },
  { i: "jb-aviation", x: 0, y: 29, w: 4, h: 6 },
  { i: "jb-bulk", x: 0, y: 35, w: 4, h: 3 },

  { i: "jb-summary", x: 4, y: 0, w: 4, h: 5 },
  { i: "jb-responsibilities", x: 4, y: 5, w: 4, h: 7 },
  { i: "jb-qualifications", x: 4, y: 12, w: 4, h: 7 },
  { i: "jb-benefits", x: 4, y: 19, w: 4, h: 6 },
  { i: "jb-blocks", x: 4, y: 25, w: 4, h: 6 },

  { i: "jb-preview", x: 8, y: 0, w: 4, h: 16 },
  { i: "jb-readiness", x: 8, y: 16, w: 4, h: 6 },
  { i: "fr-readiness", x: 8, y: 22, w: 4, h: 6 },
  { i: "fr-export", x: 8, y: 28, w: 4, h: 7 },

  { i: "cb-list", x: 0, y: 38, w: 4, h: 6 },
  { i: "cb-template", x: 4, y: 31, w: 4, h: 8 },
  { i: "cb-editor", x: 8, y: 35, w: 4, h: 6 },
  { i: "cb-apply", x: 0, y: 44, w: 4, h: 3 },
  { i: "cb-history", x: 4, y: 39, w: 4, h: 5 }
];

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

function BodyView({ body, format }: { body: string; format: BlockBodyFormat }) {
  if (!body?.trim()) {
    return <p className="text-xs italic text-brand-grey">No content.</p>;
  }
  if (format === "MIXED") {
    return <div className="text-xs leading-5 text-brand-black/80"><RichTextMixed value={body} /></div>;
  }
  if (format === "PARAGRAPH") {
    return <RichTextParagraphs value={body} paragraphClassName="text-xs leading-5 text-brand-black/80" />;
  }
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
          <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-grey">{label}</span>
          {value ? (
            <span className="flex-1 truncate rounded border border-brand-lea/10 bg-brand-cloudDancer/30 px-2 py-1 text-xs text-brand-black/80">{value}</span>
          ) : (
            <span className="h-6 flex-1 rounded border border-dashed border-brand-lea/15 bg-white" />
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
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLayout(JSON.parse(raw) as Layout[]);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  function onLayoutChange(next: Layout[]) {
    setLayout(next);
    if (loaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

  const sectionInstance = useMemo(() => {
    const map = new Map<string, SerializedJobBlockInstance>();
    if (job) {
      for (const s of getSectionStatuses(job)) {
        if (s.instances[0]) map.set(s.key, s.instances[0]);
      }
    }
    return map;
  }, [job]);

  const readiness = useMemo(() => (job ? getReadinessChecklist(job) : []), [job]);

  function renderSection(sectionKey: string) {
    const inst = sectionInstance.get(sectionKey);
    if (!inst) return <p className="text-xs italic text-brand-grey">No block attached for this section.</p>;
    return (
      <div>
        <div className="mb-1 text-xs font-bold text-brand-lea">{getInstanceTitle(inst)}</div>
        <BodyView body={getInstanceBody(inst)} format={getInstanceFormatting(inst).bodyFormat} />
      </div>
    );
  }

  function widgetBody(id: WidgetId) {
    switch (id) {
      case "jb-selector":
        return (
          <div>
            <div className="flex flex-wrap gap-1.5">
              {["Active (19)", "Archived (60)", "All (79)"].map((t, i) => (
                <span key={t} className={`rounded px-2 py-1 text-[11px] font-semibold ${i === 0 ? "bg-brand-lea text-white" : "bg-brand-cloudDancer text-brand-grey"}`}>{t}</span>
              ))}
            </div>
            <div className="mt-2 truncate rounded border border-brand-gold/40 bg-brand-sweet/20 px-2 py-1.5 text-xs font-semibold text-brand-lea">{job?.title ?? "No job"}</div>
          </div>
        );
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
        return job?.summary ? <p className="text-xs leading-5 text-brand-black/80">{job.summary}</p> : <p className="text-xs italic text-brand-grey">No summary.</p>;
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
              <div key={inst.id} className="flex items-center justify-between gap-2 rounded border border-brand-lea/10 bg-white px-2 py-1 text-xs">
                <span className="truncate font-semibold text-brand-lea">{getInstanceTitle(inst)}</span>
                <span className="shrink-0 rounded bg-brand-lea/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-eden">{inst.contentBlock?.category ?? "—"}</span>
              </div>
            )) : <p className="text-xs italic text-brand-grey">No blocks attached.</p>}
          </div>
        );
      case "jb-preview":
        return job ? (
          <div className="rounded border border-brand-lea/10">
            <FormattedJobPost job={job} />
          </div>
        ) : <p className="text-xs italic text-brand-grey">No job.</p>;
      case "jb-readiness":
      case "fr-readiness":
        return (
          <div className="space-y-1">
            {readiness.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 text-xs text-brand-black/80">
                <span className={c.complete ? "text-emerald-600" : "text-brand-grey"}>{c.complete ? "✓" : "○"}</span> {c.label}
              </div>
            ))}
          </div>
        );
      case "fr-export":
        return (
          <div>
            <div className="mb-2 flex gap-1.5">
              <span className="rounded bg-brand-lea px-2 py-1 text-[11px] font-semibold text-white">Limited HTML</span>
              <span className="rounded border border-brand-lea/15 px-2 py-1 text-[11px] text-brand-lea">Plain Text</span>
            </div>
            <pre className="max-h-full overflow-auto whitespace-pre-wrap rounded border border-brand-lea/10 bg-white p-2 font-mono text-[9px] leading-4 text-brand-grey">{(limitedHtml || "Nothing to export.").slice(0, 1200)}</pre>
          </div>
        );
      case "cb-list":
        return (
          <div className="space-y-1">
            {blocks.slice(0, 10).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded border border-brand-lea/10 bg-white px-2 py-1 text-xs">
                <span className="truncate font-semibold text-brand-lea">{b.name}</span>
                <span className="shrink-0 rounded bg-brand-gold/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-lea">{b.category}</span>
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
                  <div className="text-[10px] font-bold uppercase tracking-wide text-brand-grey">{p.label}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {inP.slice(0, 6).map((b) => (
                      <span key={b.id} className="rounded border border-brand-lea/15 bg-brand-cloudDancer/40 px-2 py-1 text-[10px] font-semibold text-brand-lea" title={b.category}>{b.name}</span>
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
              <span className="rounded border border-brand-lea/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-lea">B</span>
              <span className="rounded border border-brand-lea/15 px-1.5 py-0.5 text-[10px] text-brand-grey">{sample.currentVersion.bodyFormat === "PARAGRAPH" ? "Paragraphs" : sample.currentVersion.bodyFormat === "MIXED" ? "Mixed" : "Bullets"}</span>
            </div>
            <div className="mb-1 text-xs font-bold text-brand-lea">{sample.name}</div>
            <BodyView body={sample.currentVersion.body} format={sample.currentVersion.bodyFormat} />
          </div>
        ) : <p className="text-xs italic text-brand-grey">No blocks.</p>;
      }
      case "cb-apply":
        return (
          <div className="space-y-1.5 text-xs text-brand-black/80">
            <div className="flex items-center gap-1.5"><span className="text-brand-lea">◉</span> Apply to all jobs (79)</div>
            <div className="flex items-center gap-1.5"><span className="text-brand-grey">○</span> Apply to selected jobs</div>
            <div className="mt-1 rounded bg-brand-lea px-2 py-1 text-center text-[11px] font-semibold text-white">Apply to all jobs</div>
          </div>
        );
      case "cb-history": {
        const sample = blocks[0];
        return (
          <div className="space-y-1">
            {sample?.versions?.length ? sample.versions.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded border border-brand-lea/10 px-2 py-1 text-xs">
                <span className="truncate text-brand-black/80">v{v.versionNumber} — {v.title}</span>
                {v.id === sample.currentVersionId ? <span className="shrink-0 rounded bg-brand-gold/22 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-lea">Current</span> : null}
              </div>
            )) : <p className="text-xs italic text-brand-grey">No versions.</p>}
          </div>
        );
      }
      case "jb-bulk":
        return <p className="text-xs text-brand-grey">Archive inactive roles or restore archived roles.</p>;
      default:
        return null;
    }
  }

  return (
    <div className="px-5 py-5 lg:px-8">
      <section className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Experimental</p>
          <h1 className="text-2xl font-semibold text-brand-lea">Layout Lab</h1>
          <p className="mt-1 max-w-3xl text-sm text-brand-grey">
            Drag any box by its header, resize from the bottom-right corner. The boxes show real content from{" "}
            <span className="font-semibold text-brand-lea">{job?.title ?? "a sample job"}</span> so you can see what a
            real post looks like as you rearrange. Your layout is saved automatically — hit{" "}
            <span className="font-semibold text-brand-lea">Copy layout</span> when you like it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyLayout} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden">{copied ? "Copied!" : "Copy layout"}</button>
          <button onClick={reset} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60">Reset</button>
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
            <div key={w.id} className="flex flex-col overflow-hidden rounded-lg border border-brand-lea/15 bg-white shadow-panel">
              <div className={`lab-drag flex shrink-0 cursor-move items-center justify-between gap-2 px-3 py-1.5 ${SOURCE_COLOR[w.source]}`}>
                <span className="truncate text-[11px] font-bold uppercase tracking-wide">{w.title}</span>
                {w.badge ? <span className="shrink-0 rounded bg-white/25 px-1.5 py-0.5 text-[9px] font-bold">{w.badge}</span> : null}
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">{widgetBody(w.id)}</div>
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}
