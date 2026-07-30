"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ChevronDown, ChevronRight, Archive } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { groupLabel } from "@/lib/onboarding/tasks";
import { roundReasonLabel } from "@/lib/onboarding/rounds";
import type { ArchivedRoundView } from "@/lib/data/onboarding-rounds";

// Previous trips through onboarding, kept read-only. A person who changed
// departments or came back after leaving has more than one, and the earlier ones
// are the record of what was actually done the first time — so they are shown in
// full rather than summarised away.

function fmtDay(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "—";
}

const STATUS_TONE: Record<string, string> = {
  DONE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  TODO: "bg-brand-gold/20 text-brand-lea dark:text-slate-200",
  NA: "bg-brand-grey/15 text-brand-grey dark:text-slate-400"
};

export function OnboardingHistoryPanel({
  hireId,
  hireName,
  archives,
  canEdit
}: {
  hireId: string;
  hireName: string;
  archives: ArchivedRoundView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<ArchivedRoundView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (archives.length === 0) return null;

  async function undo(archive: ArchivedRoundView) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/new-hires/${hireId}/onboarding-rounds/${archive.id}/restore`, { method: "POST" });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Could not undo that.");
      setUndoTarget(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center gap-2">
        <Archive className="h-4 w-4 text-brand-grey dark:text-slate-400" />
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Onboarding history</h2>
        <span className="text-xs text-brand-grey dark:text-slate-400">
          {archives.length} previous round{archives.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {archives.map((a) => {
          const open = expanded === a.id;
          return (
            <div key={a.id} className="rounded border border-brand-lea/10 dark:border-white/10">
              <div className="flex items-center gap-1 pr-3">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : a.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded px-3 py-2.5 text-left transition hover:bg-brand-cloudDancer/50 dark:hover:bg-white/5"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-brand-grey dark:text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-brand-grey dark:text-slate-400" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-brand-lea dark:text-slate-100">
                      Round {a.sequence}
                      {a.position ? ` — ${a.position}` : ""}
                      {a.department ? ` (${a.department})` : ""}
                    </span>
                    <span className="block text-xs text-brand-grey dark:text-slate-400">
                      {a.doneCount} of {a.totalCount} complete · started {fmtDay(a.startDate)} · archived {fmtDay(a.archivedAt)} when a
                      new onboarding began ({roundReasonLabel(a.reason).toLowerCase()})
                      {a.archivedBy ? ` by ${a.archivedBy}` : ""}
                    </span>
                  </span>
                </button>
                {a.restorable && canEdit ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setUndoTarget(a);
                    }}
                    className="shrink-0"
                  >
                    Undo
                  </Button>
                ) : null}
              </div>

              {open ? (
                <div className="border-t border-brand-lea/10 px-3 py-3 dark:border-white/10">
                  {a.note ? <p className="mb-2 text-xs italic text-brand-grey dark:text-slate-400">{a.note}</p> : null}
                  <div className="grid gap-x-6 gap-y-1 text-xs text-brand-grey dark:text-slate-400 sm:grid-cols-4">
                    <span>Offer sent: {fmtDay(a.offerSentDate)}</span>
                    <span>Offer signed: {fmtDay(a.offerSignedDate)}</span>
                    <span>Orientation: {fmtDay(a.orientationDate)}</span>
                    <span>Onboarded: {fmtDay(a.onboardedAt)}</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {[...new Set(a.tasks.map((t) => t.group))].map((group) => (
                      <div key={group}>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{groupLabel(group)}</div>
                        <div className="mt-1.5 space-y-1">
                          {a.tasks
                            .filter((t) => t.group === group)
                            .map((t) => (
                              <div key={t.key} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-brand-lea dark:text-slate-200">{t.label}</span>
                                <span className="flex shrink-0 items-center gap-2">
                                  {t.completedAt ? (
                                    <span className="text-brand-grey dark:text-slate-500">{fmtDay(t.completedAt)}</span>
                                  ) : null}
                                  <span className={clsx("rounded px-2 py-0.5 font-semibold", STATUS_TONE[t.status] ?? STATUS_TONE.TODO)}>
                                    {t.status === "NA" ? "N/A" : t.status === "DONE" ? "Done" : "To do"}
                                  </span>
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Modal open={Boolean(undoTarget)} onClose={() => setUndoTarget(null)} busy={busy}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Undo the new onboarding</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Puts round {undoTarget?.sequence} back as {hireName}&rsquo;s live checklist, along with the position, dates and stage it was
          archived with. The checklist started afterwards is <strong>discarded</strong>, and any role or employment period this created
          is removed.
        </p>
        {error ? <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setUndoTarget(null)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => undoTarget && undo(undoTarget)} disabled={busy}>
            {busy ? "Undoing…" : "Undo"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
