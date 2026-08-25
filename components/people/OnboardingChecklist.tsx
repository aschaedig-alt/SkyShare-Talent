"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Plus } from "lucide-react";
import { ONBOARDING_GROUPS, groupLabel, CUSTOM_GROUP } from "@/lib/onboarding/tasks";
import type { TaskView } from "@/lib/data/onboarding";
import { OfferControl } from "@/components/candidates/OfferControl";
import type { OfferApplicationView } from "@/lib/offers/steps";

// The whole checklist on one tab, group by group, with the next outstanding item
// called out above it.
//
// The OFFER group is the offer stepper rather than six plain rows. That is not a
// styling choice: OFFER_STEPS and the six OFFER task keys are the same six keys
// (verbal_offer, draft_offer, supervisor_signs, president_signs,
// offer_letter_sent, candidate_signed), which is why the old page appeared to ask
// for the offer twice. The stepper is the richer of the two — it carries the
// timestamps and the start date — so it is the one that stayed.

const STATUS_BTN: Record<TaskView["status"], { label: string; on: string }> = {
  DONE: { label: "Done", on: "bg-emerald-500 text-white" },
  TODO: { label: "To do", on: "bg-brand-lea text-white" },
  NA: { label: "N/A", on: "bg-brand-grey text-white" }
};

/** The six checklist keys the offer stepper already owns. */
const OFFER_KEYS = new Set(["verbal_offer", "draft_offer", "supervisor_signs", "president_signs", "offer_letter_sent", "candidate_signed"]);

type Props = {
  hireId: string;
  hireName: string;
  tasks: TaskView[];
  offer: OfferApplicationView | null;
  canEdit: boolean;
  onSetStatus: (taskId: string, next: TaskView["status"]) => void;
  onTaskAdded: (task: TaskView) => void;
  /** The two Front send buttons, supplied by the page so this file stays layout-only. */
  renderTaskExtra?: (task: TaskView) => ReactNode;
};

export function OnboardingChecklist({
  hireId,
  hireName,
  tasks,
  offer,
  canEdit,
  onSetStatus,
  onTaskAdded,
  renderTaskExtra
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"one" | "all">("one");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const of = (key: string) => tasks.filter((t) => t.group === key).sort((a, b) => a.order - b.order);
    const base = ONBOARDING_GROUPS.map((g) => ({ key: g.key, label: groupLabel(g.key), items: of(g.key) }));
    const custom = of(CUSTOM_GROUP);
    return custom.length ? [...base, { key: CUSTOM_GROUP, label: "Additional milestones", items: custom }] : base;
  }, [tasks]);

  const applicable = tasks.filter((t) => t.status !== "NA");
  const doneCount = applicable.filter((t) => t.status === "DONE").length;
  const naCount = tasks.length - applicable.length;
  const pct = applicable.length > 0 ? Math.round((doneCount / applicable.length) * 100) : 0;

  // The next thing to do, in checklist order. The offer group is skipped — its
  // steps are ticked on the stepper, not here.
  const next = useMemo(() => {
    for (const g of groups) {
      if (g.key === "OFFER") continue;
      const t = g.items.find((x) => x.status === "TODO");
      if (t) return { task: t, group: g };
    }
    return null;
  }, [groups]);

  async function addItem() {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Give the item a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (scope === "all") {
        // Already existed: the workspace milestone catalog, which writes the task
        // onto every hire.
        const res = await fetch("/api/onboarding-milestones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: trimmed })
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? "Could not add that item.");
        // It landed on this person too, but as one of 457 writes — reload rather
        // than guess at the row it created here.
        router.refresh();
      } else {
        const res = await fetch(`/api/new-hires/${hireId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: trimmed })
        });
        const data = (await res.json().catch(() => null)) as { task?: TaskView; message?: string } | null;
        if (!res.ok || !data?.task) throw new Error(data?.message ?? "Could not add that item.");
        onTaskAdded(data.task);
      }
      setLabel("");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {next ? (
        <div className="flex flex-wrap items-center gap-3 rounded bg-gradient-to-r from-[#fdf6e3] to-[#fffdf7] px-3.5 py-2.5 ring-1 ring-brand-gold/45 dark:from-brand-gold/10 dark:to-transparent dark:ring-brand-gold/30">
          <span className="shrink-0 rounded bg-brand-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-brand-lea">Next</span>
          <span className="min-w-0 flex-1 font-semibold text-brand-lea dark:text-slate-100">{next.task.label}</span>
          <span className="shrink-0 text-sm text-brand-grey dark:text-slate-400">{next.group.label}</span>
          {canEdit ? (
            <button
              type="button"
              onClick={() => onSetStatus(next.task.id, "DONE")}
              className="shrink-0 rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow"
            >
              Mark done
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded bg-emerald-50 px-3.5 py-2.5 ring-1 ring-emerald-500/40 dark:bg-emerald-500/10 dark:ring-emerald-400/30">
          <span className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-white">Clear</span>
          <span className="min-w-0 flex-1 font-semibold text-brand-lea dark:text-slate-100">Every applicable item is done.</span>
        </div>
      )}

      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Checklist</h2>
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-36 overflow-hidden rounded bg-brand-cloudDancer dark:bg-white/10">
              <span className={clsx("block h-full rounded", pct === 100 ? "bg-emerald-500" : "bg-gradient-to-r from-brand-eden to-[#5f88ad]")} style={{ width: `${pct}%` }} />
            </span>
            <span className="text-sm text-brand-grey dark:text-slate-400">
              {doneCount} of {applicable.length}
              {naCount ? ` · ${naCount} n/a` : ""}
            </span>
          </div>
        </div>

        {groups.map((g) => {
          const isOffer = g.key === "OFFER";
          // Never render the six offer rows: the stepper below is the same six.
          const items = isOffer ? [] : g.items;
          if (!isOffer && items.length === 0) return null;

          const done = isOffer
            ? [...OFFER_KEYS].filter((k) => tasks.find((t) => t.key === k)?.status === "DONE").length
            : items.filter((t) => t.status === "DONE").length;
          const total = isOffer ? OFFER_KEYS.size : items.length;

          return (
            <div key={g.key}>
              <div className="mb-2 mt-5 flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{g.label}</span>
                <span className={clsx("text-sm", done === total ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-brand-grey dark:text-slate-400")}>
                  {done} of {total}
                </span>
              </div>

              {isOffer ? (
                offer ? (
                  <div className="rounded border border-brand-lea/10 bg-[#fafcfe] p-3 dark:border-white/10 dark:bg-white/5">
                    <OfferControl application={offer} canEdit={canEdit} />
                  </div>
                ) : (
                  <p className="rounded border border-dashed border-brand-lea/15 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:text-slate-400">
                    No linked offer, so these six steps have nowhere to be ticked. Link this hire to their candidate record to get the stepper.
                  </p>
                )
              ) : (
                <div className="space-y-1.5">
                  {items.map((t) => {
                    const isNext = next?.task.id === t.id;
                    return (
                      <div
                        key={t.id}
                        className={clsx(
                          "flex flex-wrap items-center justify-between gap-3 rounded px-3 py-2",
                          isNext ? "bg-gradient-to-r from-brand-gold/15 to-brand-gold/[0.03] ring-1 ring-brand-gold/40" : "border border-brand-lea/10 dark:border-white/10"
                        )}
                      >
                        <span className={clsx("min-w-0 flex-1 text-sm", t.status === "DONE" ? "text-brand-grey line-through dark:text-slate-400" : t.status === "NA" ? "text-brand-grey/70 dark:text-slate-500" : clsx("text-brand-black dark:text-slate-100", isNext && "font-semibold text-brand-lea"))}>
                          {t.label}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          {renderTaskExtra?.(t)}
                          <div className="flex shrink-0 overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
                            {(["TODO", "DONE", "NA"] as const).map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => onSetStatus(t.id, s)}
                                className={clsx(
                                  "px-2.5 py-1 text-xs font-semibold transition hover:shadow-glow",
                                  t.status === s ? STATUS_BTN[s].on : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-brand-panel dark:text-slate-400"
                                )}
                              >
                                {STATUS_BTN[s].label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {canEdit ? (
          <div className="mt-5 border-t border-dashed border-brand-lea/15 pt-3 dark:border-white/10">
            {!adding ? (
              <button
                type="button"
                onClick={() => { setAdding(true); setError(null); }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-eden transition hover:text-brand-lea dark:text-brand-edenOnDark"
              >
                <Plus className="h-3.5 w-3.5" /> Add checklist item
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">Item</span>
                    <input
                      autoFocus
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void addItem(); if (e.key === "Escape") setAdding(false); }}
                      placeholder="e.g. Order iPad"
                      className="mt-1 block w-64 rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:shadow-glow dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
                    />
                  </label>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">Add it to</span>
                    <div className="mt-1 flex overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
                      {([["one", `Just ${hireName.split(" ")[0]}`], ["all", "Everyone onboarding"]] as const).map(([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={scope === v}
                          onClick={() => setScope(v)}
                          className={clsx("px-3 py-2 text-sm transition", scope === v ? "bg-brand-lea font-semibold text-white" : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-brand-panel dark:text-slate-400")}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void addItem()}
                    disabled={busy}
                    className="rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow disabled:opacity-60"
                  >
                    {busy ? "Adding…" : "Add"}
                  </button>
                  <button type="button" onClick={() => setAdding(false)} className="py-2 text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-brand-grey dark:text-slate-500">
                  {scope === "all"
                    ? "Adds it to the workspace milestone list, puts it on everyone still onboarding, and gives it to each new hire from here on. People who already finished onboarding are left alone."
                    : `Adds one item to ${hireName} only. It will not appear on anybody else, or on the next person onboarded.`}
                </p>
                {error ? <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
