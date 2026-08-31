"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { GitMerge, X, Loader, ArrowRight } from "lucide-react";
import type { DuplicateReviewData, DuplicateCandidateBrief } from "@/lib/data/duplicate-review";
import { formatMomentDateTime } from "@/lib/dates/display";

type Item = DuplicateReviewData["items"][number];

function fmtDate(value: string) {
  return formatMomentDateTime(value);
}

function CandidateCard({ candidate, keep, onKeep }: { candidate: NonNullable<DuplicateCandidateBrief>; keep: boolean; onKeep: () => void }) {
  const { counts } = candidate;
  return (
    <button
      type="button"
      onClick={onKeep}
      className={clsx(
        "flex-1 rounded border-2 p-3 text-left transition hover:shadow-glow",
        keep ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-500/10" : "border-brand-lea/10 bg-white hover:border-brand-lea/30 dark:border-white/10 dark:bg-brand-panel"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-brand-lea dark:text-slate-100">{candidate.displayName}</span>
        {keep ? (
          <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Keep</span>
        ) : (
          <span className="rounded bg-brand-cloudDancer px-2 py-0.5 text-[10px] font-bold uppercase text-brand-grey dark:bg-white/5 dark:text-slate-400">Merge in</span>
        )}
      </div>
      <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{candidate.email ?? "No email"}</div>
      <div className="text-xs text-brand-grey dark:text-slate-400">{candidate.phone ?? "No phone"}</div>
      <div className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
        {counts.files} files · {counts.applications} apps · {counts.interviews} interviews · {counts.notes} notes
      </div>
      <Link
        href={`/candidates/${candidate.id}`}
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-block text-[11px] font-semibold text-brand-eden transition hover:text-brand-lea dark:text-slate-100"
      >
        Open profile
      </Link>
    </button>
  );
}

export function DuplicateReviewQueue({ items }: { items: Item[] }) {
  const router = useRouter();
  const [keepBy, setKeepBy] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Candidate pairs where both records are present are the mergeable/selectable ones.
  const mergeable = items.filter((i) => i.reviewType === "CANDIDATE" && i.status === "OPEN" && i.primary && i.secondary);
  /**
   * Which record SHOULD survive a merge, unless a person says otherwise.
   *
   * This used to default to whichever row happened to be `primary`, which is
   * arbitrary with respect to which one is real. The cost was not theoretical:
   * eight merges folded a CURRENT Paycom applicant INTO that person's archived
   * Jazz record, so the survivor stayed archived and the applicant dropped out
   * of the live list and the scan pool entirely. They had to be reactivated by
   * hand on 2026-08-31.
   *
   * His rule, same day: always merge old into new — one row per candidate.
   *
   * Ordered, first difference wins:
   *   1. A LIVE record beats an archived one. This is the rule that was being
   *      broken, and on its own it prevents the burial.
   *   2. A current-system record beats the JAZZ legacy import.
   *   3. Otherwise the NEWER record, which is "old into new" literally.
   * Ties keep `primary`, so behaviour is unchanged when nothing distinguishes
   * them. A person can still override with the picker; this only moves the
   * default onto the side that is almost always right.
   */
  const preferredKeepId = (i: Item): string => {
    const a = i.primary;
    const b = i.secondary;
    if (!a || !b) return a?.id ?? b!.id;
    if (a.archived !== b.archived) return a.archived ? b.id : a.id;
    const aLegacy = a.origin === "JAZZ";
    const bLegacy = b.origin === "JAZZ";
    if (aLegacy !== bLegacy) return aLegacy ? b.id : a.id;
    if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? a.id : b.id;
    return a.id;
  };

  const keepIdFor = (i: Item) => keepBy[i.id] ?? preferredKeepId(i);
  const dropIdFor = (i: Item) => (keepIdFor(i) === i.primary!.id ? i.secondary!.id : i.primary!.id);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Returns the server's reason on failure. The API always sends one (e.g. "That
  // candidate is already merged.") — throwing it away is why a failed merge used
  // to be unexplainable.
  async function resolveOne(item: Item, action: "merge" | "dismiss"): Promise<{ ok: boolean; message?: string }> {
    const body =
      action === "merge"
        ? { itemId: item.id, action, keepId: keepIdFor(item), dropId: dropIdFor(item) }
        : { itemId: item.id, action: "dismiss" };
    try {
      const res = await fetch("/api/duplicate-review/candidates/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
      if (res.ok && data?.success !== false) return { ok: true };
      return { ok: false, message: data?.message ?? `Request failed (${res.status}).` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Network error." };
    }
  }

  async function runSingle(item: Item, action: "merge" | "dismiss") {
    setBusy(true);
    setMessage(null);
    const res = await resolveOne(item, action);
    setMessage(
      res.ok
        ? null
        : { type: "error", text: `Could not ${action} ${item.primary?.displayName ?? "this pair"}: ${res.message}` }
    );
    setBusy(false);
    router.refresh();
  }

  // Each selected pair merges its OWN two records (not one global merge). Run
  // sequentially so pairs that happen to share a candidate can't race.
  async function runBulk(action: "merge" | "dismiss") {
    const targets = mergeable.filter((i) => selected.has(i.id));
    if (targets.length === 0) return;
    const verb = action === "merge" ? "Merge" : "Dismiss";
    if (!window.confirm(`${verb} ${targets.length} selected pair${targets.length === 1 ? "" : "s"}? Each pair resolves on its own.`)) return;
    setBusy(true);
    setMessage(null);
    let ok = 0;
    // Keep WHY each one failed, not just how many — a bare "N failed" is
    // unactionable, which was the whole complaint.
    const failures: string[] = [];
    for (const item of targets) {
      const res = await resolveOne(item, action);
      if (res.ok) ok += 1;
      else failures.push(`${item.primary?.displayName ?? "Pair"}: ${res.message}`);
    }
    setSelected(new Set());
    setBusy(false);
    const verbDone = action === "merge" ? "Merged" : "Dismissed";
    setMessage(
      failures.length
        ? {
            type: "error",
            text: `${verbDone} ${ok} pair${ok === 1 ? "" : "s"} · ${failures.length} failed —\n${failures.join("\n")}`
          }
        : { type: "success", text: `${verbDone} ${ok} pair${ok === 1 ? "" : "s"}.` }
    );
    router.refresh();
  }

  const allSelected = mergeable.length > 0 && mergeable.every((i) => selected.has(i.id));

  return (
    <div className="space-y-2">
      {/* Bulk action bar */}
      {mergeable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded border border-brand-lea/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-brand-panel">
          <label className="flex items-center gap-2 text-xs font-semibold text-brand-lea dark:text-slate-100">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(mergeable.map((i) => i.id)))}
              className="h-4 w-4"
            />
            Select all ({mergeable.length})
          </label>
          <span className="text-xs text-brand-grey dark:text-slate-400">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => runBulk("merge")}
              disabled={busy || selected.size === 0}
              className="inline-flex items-center gap-1 rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50"
            >
              {busy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />} Merge selected
            </button>
            <button
              onClick={() => runBulk("dismiss")}
              disabled={busy || selected.size === 0}
              className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
            >
              <X className="h-3.5 w-3.5" /> Dismiss selected
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <div
          className={clsx(
            // whitespace-pre-line so a bulk run can list each failure on its own line.
            "whitespace-pre-line rounded px-3 py-2 text-xs",
            message.type === "success"
              ? "border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "border border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
          )}
        >
          {message.text}
        </div>
      ) : null}

      {items.map((item) => {
        const selectable = item.reviewType === "CANDIDATE" && item.status === "OPEN" && item.primary && item.secondary;
        const isSel = selected.has(item.id);
        return (
          <div
            key={item.id}
            className={clsx(
              "rounded border p-3 transition dark:bg-white/5",
              isSel ? "border-brand-gold/60 bg-brand-gold/[0.06]" : "border-brand-lea/10 bg-brand-cloudDancer/45 dark:border-white/10"
            )}
          >
            <div className="flex items-start gap-3">
              {selectable ? (
                <input type="checkbox" checked={isSel} onChange={() => toggle(item.id)} aria-label="Select for bulk action" className="mt-1 h-4 w-4 shrink-0" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-semibold text-brand-lea dark:text-slate-100">{item.reviewType} review</div>
                    <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                      {[item.primary?.displayName, item.secondary?.displayName].filter(Boolean).join(" vs ") || "No linked entity"}
                    </div>
                  </div>
                  <span className="rounded bg-brand-gold/25 px-2 py-1 text-[11px] font-semibold text-brand-lea dark:text-slate-100">{item.status}</span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-brand-grey sm:grid-cols-3 dark:text-slate-400">
                  <div>Reason: {item.reason ?? "Not recorded"}</div>
                  <div>Confidence: {item.confidence ?? "Not scored"}</div>
                  <div>Created: {fmtDate(item.createdAt)}</div>
                </div>

                {item.reviewType === "CANDIDATE" && item.status === "OPEN" ? (
                  item.primary && item.secondary ? (
                    <div className="mt-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">Pick the record to keep, then merge</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <CandidateCard candidate={item.primary} keep={keepIdFor(item) === item.primary.id} onKeep={() => setKeepBy((k) => ({ ...k, [item.id]: item.primary!.id }))} />
                        <CandidateCard candidate={item.secondary} keep={keepIdFor(item) === item.secondary.id} onKeep={() => setKeepBy((k) => ({ ...k, [item.id]: item.secondary!.id }))} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-brand-grey dark:text-slate-400">
                          {(dropIdFor(item) === item.primary.id ? item.primary : item.secondary).displayName} <ArrowRight className="h-3 w-3" /> {(keepIdFor(item) === item.primary.id ? item.primary : item.secondary).displayName}
                        </span>
                        <button
                          onClick={() => runSingle(item, "merge")}
                          disabled={busy}
                          className="ml-auto inline-flex items-center gap-1 rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50"
                        >
                          <GitMerge className="h-3.5 w-3.5" /> Merge
                        </button>
                        <button
                          onClick={() => runSingle(item, "dismiss")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
                        >
                          <X className="h-3.5 w-3.5" /> Not a duplicate
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <button
                        onClick={() => runSingle(item, "dismiss")}
                        disabled={busy}
                        className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
                      >
                        Dismiss (already merged)
                      </button>
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
