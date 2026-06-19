"use client";

import { useState } from "react";
import { Lightbulb, Bug, HelpCircle, Trash2 } from "lucide-react";
import { clsx } from "clsx";

type FeedbackItem = {
  id: string;
  type: string;
  message: string;
  page: string | null;
  status: string;
  userEmail: string | null;
  userName: string | null;
  createdAt: string;
};

const TYPE_META: Record<string, { label: string; icon: typeof Lightbulb; chip: string }> = {
  IDEA: { label: "Idea", icon: Lightbulb, chip: "bg-blue-100 text-blue-800" },
  BUG: { label: "Bug", icon: Bug, chip: "bg-red-100 text-red-800" },
  QUESTION: { label: "Question", icon: HelpCircle, chip: "bg-amber-100 text-amber-800" }
};

const STATUSES = ["NEW", "REVIEWING", "DONE"];
const STATUS_CHIP: Record<string, string> = {
  NEW: "bg-brand-gold/20 text-brand-lea",
  REVIEWING: "bg-blue-100 text-blue-800",
  DONE: "bg-emerald-100 text-emerald-700"
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

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
          <div key={label} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-brand-lea">{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-brand-grey">Type</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-sm"
          >
            <option value="ALL">All</option>
            <option value="IDEA">Ideas</option>
            <option value="BUG">Bugs</option>
            <option value="QUESTION">Questions</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-brand-grey">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-sm"
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
        <div className="rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10">
          <p className="font-medium text-brand-lea">No feedback yet</p>
          <p className="mt-1 text-sm text-brand-grey">
            Submissions from the Feedback button will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.IDEA;
            const Icon = meta.icon;
            return (
              <div key={item.id} className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
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
                  <span className="text-xs text-brand-grey">{formatDate(item.createdAt)}</span>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-brand-black/85">{item.message}</p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-brand-lea/10 pt-3">
                  <div className="text-xs text-brand-grey">
                    {item.userName || item.userEmail || "Unknown"}
                    {item.page && <span className="ml-2 rounded bg-brand-cloudDancer/60 px-1.5 py-0.5">{item.page}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={item.status}
                      onChange={(e) => updateStatus(item.id, e.target.value)}
                      className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => remove(item.id)}
                      className="rounded border border-red-200 p-1.5 text-red-600 transition hover:bg-red-50"
                      aria-label="Delete feedback"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
