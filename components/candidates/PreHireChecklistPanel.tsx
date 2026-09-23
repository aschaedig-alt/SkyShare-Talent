"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SendTaskEmailButton } from "@/components/people/SendTaskEmailButton";
import { useCollapsedSections } from "@/lib/hooks/useCollapsedSections";
import type { PreHireChecklistView, PreHireTaskView } from "@/lib/data/prehire";
import type { PreHireStatus } from "@/lib/onboarding/prehire";

/**
 * The onboarding-checklist sections that start BEFORE the offer, worked on the
 * candidate — today, the PRD section.
 *
 * Her words, 2026-09-22: "this part of the checklist should start when they are a
 * candidate and then carry over to new hires with the accurate status. we only use
 * it for pilots but i need to be able to pull a PRD on all pilots before we
 * officially offer them."
 *
 * Drawn the way the hire's own checklist draws it — the gold section label, the
 * bordered rows, the To do / Done / N/A control and the Send email button — so a
 * step looks the same on both pages, because it IS the same step. Before the move
 * into onboarding a click is stored on the candidate; after it, a click writes the
 * hire's own task row (hireTaskId), so the two pages can never disagree.
 *
 * NOT A PILOT: the section is folded rather than hidden. The pilot test reads job
 * titles (lib/onboarding/prehire.ts looksLikePilot), and a title is only evidence;
 * a folded bar costs one line and a wrong guess costs nothing.
 */

const STATUS_BTN: Record<PreHireStatus, { label: string; on: string }> = {
  DONE: { label: "Done", on: "bg-emerald-500 text-white" },
  TODO: { label: "To do", on: "bg-brand-lea text-white" },
  NA: { label: "N/A", on: "bg-brand-grey text-white" }
};

type Props = {
  candidateId: string;
  view: PreHireChecklistView;
  canEdit: boolean;
  /** Keeps the tab badge honest after a click, without a reload. */
  onOutstandingChange?: (outstanding: number) => void;
};

export function PreHireChecklistPanel({ candidateId, view, canEdit, onOutstandingChange }: Props) {
  const [sections, setSections] = useState(view.sections);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const touched = sections.some((s) => s.tasks.some((t) => t.status !== "TODO"));
  const [shownAnyway, setShownAnyway] = useState(false);
  const { collapsed, setSections: setFolded } = useCollapsedSections();

  // A server refresh (router.refresh after some other edit) brings a new view.
  useEffect(() => setSections(view.sections), [view.sections]);

  const outstanding = sections.reduce((n, s) => n + s.tasks.filter((t) => t.status === "TODO").length, 0);
  const opensByItself = view.pilot || touched;
  useEffect(() => {
    onOutstandingChange?.(opensByItself ? outstanding : 0);
  }, [outstanding, opensByItself, onOutstandingChange]);

  function patchTask(key: string, next: Partial<PreHireTaskView>) {
    setSections((cur) => cur.map((s) => ({ ...s, tasks: s.tasks.map((t) => (t.key === key ? { ...t, ...next } : t)) })));
  }

  async function setStatus(task: PreHireTaskView, status: PreHireStatus) {
    if (!canEdit || status === task.status) return;
    const before = task.status;
    patchTask(task.key, { status });
    setSavingKey(task.key);
    setError(null);
    try {
      const res = task.hireTaskId
        ? await fetch(`/api/onboarding-tasks/${task.hireTaskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
          })
        : await fetch(`/api/candidates/${candidateId}/prehire-tasks`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: task.key, status })
          });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(p?.message ?? "Could not save that step.");
      }
    } catch (e) {
      // Put it back. A control that shows Done when the save failed is the one
      // thing a checklist must never do.
      patchTask(task.key, { status: before });
      setError(e instanceof Error ? e.message : "Could not save that step.");
    } finally {
      setSavingKey(null);
    }
  }

  const folded = !opensByItself && !shownAnyway;
  const sectionNames = sections.map((s) => s.label).join(" · ");

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Before the offer</h2>
        <p className="text-xs text-brand-grey dark:text-slate-400">
          {view.hireId ? (
            <>
              They have moved to onboarding — these are the same steps as on{" "}
              <Link href={`/people/${view.hireId}`} className="font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-edenOnDark">
                their onboarding checklist
              </Link>
              .
            </>
          ) : (
            "Carries onto their onboarding checklist, as you leave it, when they move to onboarding."
          )}
        </p>
      </div>

      {folded ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-dashed border-brand-lea/15 px-3 py-2 dark:border-white/10">
          <p className="text-sm text-brand-grey dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{sectionNames}</span>
            <span className="ml-2">Pilots only — nothing on this candidate looks like a pilot role.</span>
          </p>
          <button
            type="button"
            onClick={() => setShownAnyway(true)}
            className="rounded border border-brand-lea/15 px-2.5 py-1 text-xs font-semibold text-brand-eden transition hover:shadow-glow dark:border-white/10 dark:text-slate-200"
          >
            Show anyway
          </button>
        </div>
      ) : (
        sections.map((s) => {
          const na = s.tasks.filter((t) => t.status === "NA").length;
          const done = s.tasks.filter((t) => t.status === "DONE").length;
          const applicable = s.tasks.length - na;
          const complete = s.tasks.every((t) => t.status !== "TODO");
          // The same fold as the hire's checklist, remembered under the same
          // section key: fold PRD away on one page and it is folded on both.
          const isFolded = complete && collapsed.has(s.key);
          const count = applicable === 0 && na > 0 ? "n/a" : `${done} of ${applicable}${na ? ` · ${na} n/a` : ""}`;
          const heading = (
            <>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{s.label}</span>
              <span className="flex items-center gap-1.5">
                <span className={clsx("text-sm", complete ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-brand-grey dark:text-slate-400")}>
                  {count}
                </span>
                {complete ? (
                  isFolded ? (
                    <ChevronRight className="h-4 w-4 text-brand-grey dark:text-slate-400" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-brand-grey dark:text-slate-400" aria-hidden="true" />
                  )
                ) : null}
              </span>
            </>
          );
          return (
            <div key={s.key}>
              {complete ? (
                <button
                  type="button"
                  onClick={() => setFolded([s.key], !isFolded)}
                  aria-expanded={!isFolded}
                  title={isFolded ? `Show ${s.label}` : `Fold ${s.label} away — everything in it is done or not needed`}
                  className={clsx(
                    "-mx-1.5 flex w-[calc(100%+0.75rem)] items-baseline justify-between gap-3 rounded px-1.5 py-0.5 text-left transition hover:shadow-glow",
                    isFolded ? "mt-3" : "mb-1.5 mt-4"
                  )}
                >
                  {heading}
                </button>
              ) : (
                <div className="mb-2 mt-4 flex items-baseline justify-between gap-3">{heading}</div>
              )}

              {isFolded ? null : (
                <div className="space-y-1.5">
                  {s.tasks.map((t) => (
                    <div
                      key={t.key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-lea/10 px-3 py-2 dark:border-white/10"
                    >
                      <span
                        className={clsx(
                          "min-w-0 flex-1 text-sm",
                          t.status === "DONE"
                            ? "text-brand-grey line-through dark:text-slate-400"
                            : t.status === "NA"
                              ? "text-brand-grey/70 dark:text-slate-500"
                              : "text-brand-black dark:text-slate-100"
                        )}
                      >
                        {t.label}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {t.sendsEmail ? (
                          <SendTaskEmailButton
                            hireId={view.hireId ?? undefined}
                            candidateId={view.hireId ? undefined : candidateId}
                            taskKey={t.key}
                            taskLabel={t.label}
                            taskStatus={t.status}
                            canEdit={canEdit}
                            sentAt={t.sentAt}
                            onSent={() => patchTask(t.key, { status: "DONE", sentAt: new Date().toISOString() })}
                          />
                        ) : null}
                        <div
                          role="group"
                          aria-label={`${t.label} — status`}
                          className="flex shrink-0 overflow-hidden rounded border border-brand-lea/15 dark:border-white/10"
                        >
                          {(["TODO", "DONE", "NA"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              aria-pressed={t.status === status}
                              disabled={!canEdit || savingKey === t.key}
                              onClick={() => void setStatus(t, status)}
                              className={clsx(
                                "px-2.5 py-1 text-xs font-semibold transition hover:shadow-glow disabled:cursor-default",
                                t.status === status
                                  ? STATUS_BTN[status].on
                                  : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-brand-panel dark:text-slate-400"
                              )}
                            >
                              {STATUS_BTN[status].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {error ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
    </section>
  );
}
