"use client";

import type { ReactNode } from "react";
import {
  Gauge,
  BadgeCheck,
  ShieldCheck,
  CalendarClock,
  Filter,
  MapPin,
  Zap,
  ClipboardCheck,
  Trophy,
  Plane,
  StickyNote,
  ShieldAlert,
  type LucideIcon
} from "lucide-react";
import type { DocumentCurrency } from "@/lib/data/document-currency";

// Optional live data passed into a widget's render (only data-bound widgets use it).
export type WidgetData = { documentCurrency?: DocumentCurrency };

// A widget is a config-driven block an admin can add from the palette and fill in.
// Each definition declares a config form (fields) and a renderer. Everything renders
// from config, so widgets work on any page; data-binding can be layered on later.

export type WidgetField = {
  key: string;
  label: string;
  type: "text" | "number" | "textarea";
  placeholder?: string;
};

export type WidgetConfig = Record<string, unknown>;

export type WidgetDef = {
  type: string;
  name: string;
  category: string;
  icon: LucideIcon;
  size: { w: number; h: number };
  defaultConfig: WidgetConfig;
  fields: WidgetField[];
  render: (config: WidgetConfig, data?: WidgetData) => ReactNode;
  dataBound?: boolean;
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Parse "Label | value" lines from a textarea into pairs.
function parseLines(value: unknown): Array<{ a: string; b: string }> {
  return str(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [a, ...rest] = line.split("|");
      return { a: a.trim(), b: rest.join("|").trim() };
    });
}

type Status = "ok" | "warn" | "bad" | "neutral";
function statusOf(token: string): Status {
  const t = token.toLowerCase();
  if (["ok", "yes", "y", "green", "done", "pass", "active", "current"].includes(t)) return "ok";
  if (["soon", "warn", "amber", "due", "exp", "expiring", "review"].includes(t)) return "warn";
  if (["no", "x", "red", "missing", "fail", "expired"].includes(t)) return "bad";
  return "neutral";
}
const STATUS_TEXT: Record<Status, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-red-600",
  neutral: "text-brand-grey"
};
const STATUS_CHIP: Record<Status, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-600",
  neutral: "bg-brand-cloudDancer/70 text-brand-grey"
};

function Shell({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <Icon className="h-4 w-4 text-brand-eden" />
        <span className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">{title}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

export const WIDGETS: WidgetDef[] = [
  // ---- Aviation status ----
  {
    type: "flight-hours",
    name: "Flight hours gauge",
    category: "Aviation status",
    icon: Gauge,
    size: { w: 3, h: 5 },
    defaultConfig: { label: "Total time", current: 7250, target: 5000 },
    fields: [
      { key: "label", label: "Label", type: "text" },
      { key: "current", label: "Current hours", type: "number" },
      { key: "target", label: "Minimum / target", type: "number" }
    ],
    render: (c) => {
      const cur = num(c.current);
      const tgt = Math.max(1, num(c.target, 1));
      const pct = Math.min(100, Math.round((cur / tgt) * 100));
      const ok = cur >= tgt;
      return (
        <Shell icon={Gauge} title={str(c.label, "Total time")}>
          <div className="mb-1 flex justify-between text-xs text-brand-grey">
            <span>{cur.toLocaleString()} hrs</span>
            <span>min {tgt.toLocaleString()}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-cloudDancer">
            <div className={`h-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className={`mt-2 text-xs font-semibold ${ok ? "text-emerald-600" : "text-amber-600"}`}>
            {ok ? "Meets minimum" : `${(tgt - cur).toLocaleString()} hrs short`}
          </div>
        </Shell>
      );
    }
  },
  {
    type: "type-ratings",
    name: "Type ratings",
    category: "Aviation status",
    icon: BadgeCheck,
    size: { w: 3, h: 4 },
    defaultConfig: { items: "G450 | ok\nGV | ok\nGVII | ok\nCE-560 | expired" },
    fields: [{ key: "items", label: "Ratings (one per line: name | ok/expired)", type: "textarea", placeholder: "G450 | ok" }],
    render: (c) => (
      <Shell icon={BadgeCheck} title="Type ratings">
        <div className="flex flex-wrap gap-1.5">
          {parseLines(c.items).map((it, i) => {
            const s = statusOf(it.b || "ok");
            return (
              <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[s]}`}>
                {it.a}
                {s === "bad" ? " exp" : ""}
              </span>
            );
          })}
        </div>
      </Shell>
    )
  },
  {
    type: "compliance-gates",
    name: "Compliance gates",
    category: "Aviation status",
    icon: ShieldCheck,
    size: { w: 3, h: 5 },
    defaultConfig: { title: "Compliance gates", items: "ATP certificate | ok\nFirst-class medical | ok\nUS work authorization | ok\nDriver's license | no" },
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "items", label: "Gates (one per line: name | ok/no)", type: "textarea", placeholder: "ATP certificate | ok" }
    ],
    render: (c) => (
      <Shell icon={ShieldCheck} title={str(c.title, "Compliance gates")}>
        <div className="flex flex-col gap-1 text-xs text-brand-black/80">
          {parseLines(c.items).map((it, i) => {
            const bad = statusOf(it.b) === "bad";
            return (
              <span key={i} className="flex items-center gap-1.5">
                <span className={bad ? "text-red-600" : "text-emerald-600"}>{bad ? "✗" : "✓"}</span> {it.a}
              </span>
            );
          })}
        </div>
      </Shell>
    )
  },
  {
    type: "currency-countdown",
    name: "Currency countdown",
    category: "Aviation status",
    icon: CalendarClock,
    size: { w: 3, h: 5 },
    defaultConfig: { title: "Currency", items: "Medical | 41\nRecurrent | 12\nPassport | 320" },
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "items", label: "Items (one per line: name | days)", type: "textarea", placeholder: "Medical | 41" }
    ],
    render: (c) => (
      <Shell icon={CalendarClock} title={str(c.title, "Currency")}>
        <div className="flex flex-col gap-1.5 text-xs">
          {parseLines(c.items).map((it, i) => {
            const days = num(it.b);
            const tone = days <= 14 ? "text-amber-600" : days <= 0 ? "text-red-600" : "text-emerald-600";
            return (
              <div key={i} className="flex justify-between">
                <span className="text-brand-grey">{it.a}</span>
                <span className={tone}>{days} days</span>
              </div>
            );
          })}
        </div>
      </Shell>
    )
  },
  {
    type: "readiness-score",
    name: "Readiness score",
    category: "Aviation status",
    icon: Trophy,
    size: { w: 3, h: 5 },
    defaultConfig: { label: "Readiness", score: 82, items: "Hours | ok\nCerts | ok\nCurrency | warn" },
    fields: [
      { key: "label", label: "Label", type: "text" },
      { key: "score", label: "Score (0-100)", type: "number" },
      { key: "items", label: "Sub-bars (one per line: name | ok/warn/bad)", type: "textarea", placeholder: "Hours | ok" }
    ],
    render: (c) => {
      const score = Math.max(0, Math.min(100, num(c.score)));
      const tone = score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600";
      return (
        <Shell icon={Trophy} title={str(c.label, "Readiness")}>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-semibold ${tone}`}>{score}</span>
            <span className="text-xs text-brand-grey">/ 100</span>
          </div>
          <div className="mt-2 flex gap-1">
            {parseLines(c.items).map((it, i) => {
              const s = statusOf(it.b);
              const bar = s === "ok" ? "bg-emerald-500" : s === "warn" ? "bg-amber-500" : s === "bad" ? "bg-red-500" : "bg-brand-grey/40";
              return <div key={i} className={`h-1.5 flex-1 rounded-full ${bar}`} title={it.a} />;
            })}
          </div>
        </Shell>
      );
    }
  },
  {
    type: "doc-currency",
    name: "Document currency (live)",
    category: "Aviation status",
    icon: ShieldAlert,
    size: { w: 3, h: 6 },
    defaultConfig: {},
    fields: [],
    dataBound: true,
    render: (_config, data) => {
      const dc = data?.documentCurrency;
      if (!dc) {
        return (
          <Shell icon={ShieldAlert} title="Document currency">
            <p className="text-xs italic text-brand-grey">Live workspace data — available on pages wired with document currency.</p>
          </Shell>
        );
      }
      return (
        <Shell icon={ShieldAlert} title="Document currency">
          <div className="mb-2 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded bg-red-50 py-1"><div className="text-base font-semibold text-red-600">{dc.counts.expired}</div><div className="text-[9px] uppercase text-brand-grey">expired</div></div>
            <div className="rounded bg-amber-50 py-1"><div className="text-base font-semibold text-amber-600">{dc.counts.due30}</div><div className="text-[9px] uppercase text-brand-grey">≤30d</div></div>
            <div className="rounded bg-brand-cloudDancer/60 py-1"><div className="text-base font-semibold text-brand-lea">{dc.counts.due90}</div><div className="text-[9px] uppercase text-brand-grey">≤90d</div></div>
          </div>
          <div className="space-y-1">
            {dc.upcoming.slice(0, 6).map((it, i) => {
              const tone = it.days < 0 ? "text-red-600" : it.days <= 30 ? "text-amber-600" : "text-brand-grey";
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-brand-black/80">{it.candidateName} · {it.documentType ?? "Doc"}</span>
                  <span className={`shrink-0 font-semibold ${tone}`}>{it.days < 0 ? `exp ${Math.abs(it.days)}d` : `${it.days}d`}</span>
                </div>
              );
            })}
            {dc.upcoming.length === 0 && <p className="text-xs italic text-brand-grey">All tracked documents current.</p>}
          </div>
        </Shell>
      );
    }
  },
  // ---- Metrics ----
  {
    type: "stat-tile",
    name: "Stat tile",
    category: "Metrics",
    icon: Trophy,
    size: { w: 3, h: 4 },
    defaultConfig: { label: "Metric", value: "28d", sublabel: "Avg time to hire" },
    fields: [
      { key: "value", label: "Value", type: "text" },
      { key: "label", label: "Label", type: "text" },
      { key: "sublabel", label: "Sub-label", type: "text" }
    ],
    render: (c) => (
      <Shell icon={Trophy} title={str(c.label, "Metric")}>
        <div className="text-3xl font-semibold text-brand-lea">{str(c.value, "—")}</div>
        <div className="mt-1 text-xs text-brand-grey">{str(c.sublabel)}</div>
      </Shell>
    )
  },
  {
    type: "pipeline-funnel",
    name: "Pipeline funnel",
    category: "Metrics",
    icon: Filter,
    size: { w: 3, h: 5 },
    defaultConfig: { title: "Pipeline", items: "Applied | 120\nScreen | 64\nInterview | 22\nOffer | 6\nHired | 3" },
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "items", label: "Stages (one per line: name | count)", type: "textarea", placeholder: "Applied | 120" }
    ],
    render: (c) => {
      const rows = parseLines(c.items);
      const max = Math.max(1, ...rows.map((r) => num(r.b)));
      return (
        <Shell icon={Filter} title={str(c.title, "Pipeline")}>
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-16 shrink-0 text-brand-grey">{r.a}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-brand-cloudDancer">
                  <div className="h-full bg-brand-eden" style={{ width: `${Math.round((num(r.b) / max) * 100)}%` }} />
                </div>
                <span className="w-7 shrink-0 text-right font-semibold text-brand-lea">{num(r.b)}</span>
              </div>
            ))}
          </div>
        </Shell>
      );
    }
  },
  // ---- Lists & coverage ----
  {
    type: "coverage-bars",
    name: "Coverage bars",
    category: "Lists & coverage",
    icon: MapPin,
    size: { w: 3, h: 5 },
    defaultConfig: { title: "Base coverage", items: "SLC | 14\nLAS | 6\nTEB | 4" },
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "items", label: "Rows (one per line: name | count)", type: "textarea", placeholder: "SLC | 14" }
    ],
    render: (c) => {
      const rows = parseLines(c.items);
      const max = Math.max(1, ...rows.map((r) => num(r.b)));
      return (
        <Shell icon={MapPin} title={str(c.title, "Coverage")}>
          <div className="flex flex-col gap-1.5 text-xs">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-brand-grey">{r.a}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-cloudDancer">
                  <div className="h-full bg-brand-eden" style={{ width: `${Math.round((num(r.b) / max) * 100)}%` }} />
                </div>
                <span className="w-6 shrink-0 text-right">{num(r.b)}</span>
              </div>
            ))}
          </div>
        </Shell>
      );
    }
  },
  {
    type: "doc-checklist",
    name: "Document checklist",
    category: "Lists & coverage",
    icon: ClipboardCheck,
    size: { w: 3, h: 5 },
    defaultConfig: { title: "Documents", items: "Resume | ok\nPilot app | ok\nLogbook | no\nMedical | ok\nLicenses | no" },
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "items", label: "Docs (one per line: name | ok/no)", type: "textarea", placeholder: "Resume | ok" }
    ],
    render: (c) => (
      <Shell icon={ClipboardCheck} title={str(c.title, "Documents")}>
        <div className="grid grid-cols-2 gap-1 text-[11px] text-brand-black/80">
          {parseLines(c.items).map((it, i) => {
            const bad = statusOf(it.b) === "bad";
            return (
              <span key={i} className="flex items-center gap-1">
                <span className={bad ? "text-red-600" : "text-emerald-600"}>{bad ? "✗" : "✓"}</span> {it.a}
              </span>
            );
          })}
        </div>
      </Shell>
    )
  },
  // ---- Actions & content ----
  {
    type: "quick-actions",
    name: "Quick actions",
    category: "Actions & content",
    icon: Zap,
    size: { w: 3, h: 3 },
    defaultConfig: { title: "Quick actions", items: "Schedule | #\nEmail | #\nAdd note | #" },
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "items", label: "Buttons (one per line: label | url)", type: "textarea", placeholder: "Schedule | https://…" }
    ],
    render: (c) => (
      <Shell icon={Zap} title={str(c.title, "Quick actions")}>
        <div className="flex flex-wrap gap-1.5">
          {parseLines(c.items).map((it, i) => (
            <a
              key={i}
              href={it.b || "#"}
              className="rounded-md border border-brand-lea/20 px-2.5 py-1 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60"
            >
              {it.a}
            </a>
          ))}
        </div>
      </Shell>
    )
  },
  {
    type: "aircraft-spotlight",
    name: "Aircraft spotlight",
    category: "Actions & content",
    icon: Plane,
    size: { w: 3, h: 4 },
    defaultConfig: { name: "Gulfstream G450", range: "4,350 nm", seat: "PIC / SIC", base: "SLC" },
    fields: [
      { key: "name", label: "Aircraft", type: "text" },
      { key: "range", label: "Range", type: "text" },
      { key: "seat", label: "Crew seat", type: "text" },
      { key: "base", label: "Base", type: "text" }
    ],
    render: (c) => (
      <Shell icon={Plane} title="Aircraft spotlight">
        <div className="mb-1 text-sm font-semibold text-brand-lea">{str(c.name, "Aircraft")}</div>
        <div className="flex flex-col gap-1 text-[11px] text-brand-grey">
          <div className="flex justify-between"><span>Range</span><span>{str(c.range, "—")}</span></div>
          <div className="flex justify-between"><span>Crew seat</span><span>{str(c.seat, "—")}</span></div>
          <div className="flex justify-between"><span>Base</span><span>{str(c.base, "—")}</span></div>
        </div>
      </Shell>
    )
  },
  {
    type: "note",
    name: "Note / announcement",
    category: "Actions & content",
    icon: StickyNote,
    size: { w: 4, h: 3 },
    defaultConfig: { title: "Note", body: "Write instructions, a callout, or a hiring-goal banner here." },
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "body", label: "Body", type: "textarea" }
    ],
    render: (c) => (
      <Shell icon={StickyNote} title={str(c.title, "Note")}>
        <p className="border-l-2 border-brand-gold/50 pl-2 text-xs leading-5 text-brand-black/80">{str(c.body)}</p>
      </Shell>
    )
  }
];

export const WIDGETS_BY_TYPE: Record<string, WidgetDef> = Object.fromEntries(WIDGETS.map((w) => [w.type, w]));

export const WIDGET_CATEGORIES: string[] = [...new Set(WIDGETS.map((w) => w.category))];
