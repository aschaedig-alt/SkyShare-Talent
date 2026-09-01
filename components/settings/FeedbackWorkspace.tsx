"use client";

import { useState } from "react";
import { Lightbulb, Bug, HelpCircle, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { formatMomentDateTime } from "@/lib/dates/display";

type FeedbackItem = {
  id: string;
  type: string;
  message: string;
  page: string | null;
  contextJson: string | null;
  imageKey: string | null;
  imageName: string | null;
  images: Array<{ id: string; filename: string }>;
  status: string;
  userEmail: string | null;
  userName: string | null;
  createdAt: string;
};

// Auto-captured at submit time (see components/feedback/FeedbackButton.tsx).
type FeedbackContext = {
  url?: string;
  viewport?: string;
  screen?: string;
  dpr?: number;
  theme?: string;
  userAgent?: string;
  errors?: string[];
};

function parseContext(raw: string | null): FeedbackContext | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FeedbackContext;
  } catch {
    return null;
  }
}

// Boil a user-agent string down to something scannable.
function browserLabel(ua?: string): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : null;
  return [browser, os].filter(Boolean).join(" · ") || null;
}

// Show path + query (the query is the part the old pathname-only capture lost).
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const s = u.pathname + u.search;
    return s.length > 64 ? `${s.slice(0, 64)}…` : s;
  } catch {
    return url.slice(0, 64);
  }
}

const TYPE_META: Record<string, { label: string; icon: typeof Lightbulb; chip: string }> = {
  IDEA: { label: "Idea", icon: Lightbulb, chip: "bg-blue-100 text-blue-800 dark:bg-sky-500/15 dark:text-sky-300" },
  BUG: { label: "Bug", icon: Bug, chip: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
  QUESTION: { label: "Question", icon: HelpCircle, chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" }
};

const STATUSES = ["NEW", "REVIEWING", "DONE"];
const STATUS_CHIP: Record<string, string> = {
  NEW: "bg-brand-gold/20 text-brand-lea dark:text-slate-100",
  REVIEWING: "bg-blue-100 text-blue-800 dark:bg-sky-500/15 dark:text-sky-300",
  DONE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
};

// Feedback.createdAt is a real instant, so it renders in the office timezone.
// It was formatting with no timeZone at all, which is the React #418 hydration
// mismatch these very reports were filed about: Vercel renders in UTC, the
// browser re-renders in Mountain, and the two strings differ.
const formatDate = formatMomentDateTime;

export function FeedbackWorkspace({ items: initialItems }: { items: FeedbackItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  async function updateStatus(id: string, status: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/feedback/${id}`, { method: "DELETE" });
  }

  const filtered = items.filter(
    (i) => (typeFilter === "ALL" || i.type === typeFilter) && (statusFilter === "ALL" || i.status === statusFilter)
  );

  // Done work sinks to the bottom and fades, so the top of the page is only
  // the things still needing attention. Both halves keep the newest-first
  // order they arrived in.
  const active = filtered.filter((i) => i.status !== "DONE");
  const done = filtered.filter((i) => i.status === "DONE");

  const counts = {
    total: items.length,
    new: items.filter((i) => i.status === "NEW").length,
    ideas: items.filter((i) => i.type === "IDEA").length,
    bugs: items.filter((i) => i.type === "BUG").length
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Total", counts.total],
          ["New", counts.new],
          ["Ideas", counts.ideas],
          ["Bugs", counts.bugs]
        ].map(([label, value]) => (
          <div key={label} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-brand-lea dark:text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-brand-grey dark:text-slate-400">Type</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
          >
            <option value="ALL">All</option>
            <option value="IDEA">Ideas</option>
            <option value="BUG">Bugs</option>
            <option value="QUESTION">Questions</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-brand-grey dark:text-slate-400">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
          >
            <option value="ALL">All</option>
            <option value="NEW">New</option>
            <option value="REVIEWING">Reviewing</option>
            <option value="DONE">Done</option>
          </select>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="font-medium text-brand-lea dark:text-slate-100">No feedback yet</p>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            Submissions from the Feedback button will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((item) => renderItem(item))}

          {done.length > 0 && (
            <>
              {/* Divider only earns its place when there is something above it. */}
              {active.length > 0 && (
                <div className="flex items-center gap-3 pt-4">
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
                    Done · {done.length}
                  </span>
                  <span className="h-px flex-1 bg-brand-lea/10 dark:bg-white/10" />
                </div>
              )}
              {done.map((item) => renderItem(item, true))}
            </>
          )}
        </div>
      )}
    </div>
  );

  function renderItem(item: FeedbackItem, isDone = false) {
    const meta = TYPE_META[item.type] ?? TYPE_META.IDEA;
    const Icon = meta.icon;
    return (
      <div
        key={item.id}
        className={clsx(
          "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10",
          // Faded to read as settled — but restored on hover so it stays legible
          // when you do go back to look at one.
          isDone && "opacity-55 transition-opacity hover:opacity-100"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={clsx("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold", meta.chip)}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </span>
            <span className={clsx("rounded px-2 py-0.5 text-[11px] font-semibold", STATUS_CHIP[item.status])}>
              {item.status}
            </span>
          </div>
          <span className="text-xs text-brand-grey dark:text-slate-400">{formatDate(item.createdAt)}</span>
        </div>

        <p className="mt-2 whitespace-pre-wrap text-sm text-brand-black/85 dark:text-slate-300">{item.message}</p>

        {/* The screenshot, if one was attached. Served through an
            admin-gated route (never a public URL) because these routinely
            contain candidate PII. Click opens it full size. */}
        {(() => {
          // Newer reports store every attachment as its own row; older ones have
          // the single legacy column. Prefer the rows when present so a migrated
          // report never renders its first picture twice.
          const shots = item.images.length
            ? item.images.map((i) => ({ href: `/api/feedback/${item.id}/image/${i.id}`, name: i.filename }))
            : item.imageKey
              ? [{ href: `/api/feedback/${item.id}/image`, name: item.imageName ?? "Screenshot" }]
              : [];
          if (shots.length === 0) return null;
          return (
            <div className="mt-2 flex flex-wrap gap-2">
              {shots.map((shot) => (
                <a
                  key={shot.href}
                  href={shot.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-fit rounded border border-brand-lea/15 p-1 transition hover:shadow-glow dark:border-white/10"
                  title={shot.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route, not an optimizable asset */}
                  <img src={shot.href} alt={shot.name} className="max-h-48 rounded object-contain" />
                </a>
              ))}
            </div>
          );
        })()}

        {/* Auto-captured context — the full URL (with its query string),
            the screen it happened on, and anything that blew up. */}
        {(() => {
          const ctx = parseContext(item.contextJson);
          if (!ctx) return null;
          const chips = [
            ctx.viewport ? `${ctx.viewport}${ctx.dpr && ctx.dpr !== 1 ? ` @${ctx.dpr}x` : ""}` : null,
            ctx.theme ? `${ctx.theme} mode` : null,
            browserLabel(ctx.userAgent)
          ].filter((c): c is string => Boolean(c));
          return (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-brand-grey dark:text-slate-400">
              {ctx.url && (
                <a
                  href={ctx.url}
                  title={ctx.url}
                  className="rounded bg-brand-cloudDancer/60 px-1.5 py-0.5 font-semibold text-brand-eden hover:underline dark:bg-white/5 dark:text-slate-300"
                >
                  {shortUrl(ctx.url)}
                </a>
              )}
              {chips.map((c) => (
                <span key={c} className="rounded bg-brand-cloudDancer/60 px-1.5 py-0.5 dark:bg-white/5">
                  {c}
                </span>
              ))}
              {ctx.errors?.length ? (
                <span
                  title={ctx.errors.join("\n\n")}
                  className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-800 dark:bg-red-500/15 dark:text-red-300"
                >
                  {ctx.errors.length} runtime error{ctx.errors.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          );
        })()}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
          <div className="text-xs text-brand-grey dark:text-slate-400">
            {item.userName || item.userEmail || "Unknown"}
            {item.page && <span className="ml-2 rounded bg-brand-cloudDancer/60 px-1.5 py-0.5 dark:bg-white/5">{item.page}</span>}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={item.status}
              onChange={(e) => updateStatus(item.id, e.target.value)}
              className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              onClick={() => remove(item.id)}
              className="rounded border border-red-200 p-1.5 text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/15"
              aria-label="Delete feedback"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }
}
