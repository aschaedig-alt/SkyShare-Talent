"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ChevronDown, ChevronRight, Archive, Pencil } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";
import { groupLabel } from "@/lib/onboarding/tasks";
import { roundReasonLabel, type ArchivedTask } from "@/lib/onboarding/rounds";
import type { ArchivedRoundView } from "@/lib/data/onboarding-rounds";

// Previous trips through onboarding. A person who changed departments or came
// back after leaving has more than one, and the earlier ones are the record of
// what was actually done the first time — so they are shown in full rather than
// summarised away.
//
// The dates are editable. An archive freezes whatever the checklist said the
// moment a new round started, which includes anything ticked that day to catch
// the record up, so the frozen copy can be honestly wrong about WHEN things
// happened. Reconstructing that is a human job.

function fmtDay(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "—";
}

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

const STATUS_TONE: Record<string, string> = {
  DONE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  TODO: "bg-brand-gold/20 text-brand-lea dark:text-slate-200",
  NA: "bg-brand-grey/15 text-brand-grey dark:text-slate-400"
};

const SELECT_CLASS =
  "rounded border border-brand-lea/20 bg-white px-2 py-1 text-xs font-semibold text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";

type Draft = {
  position: string;
  department: string;
  startDate: string;
  offerSentDate: string;
  offerSignedDate: string;
  orientationDate: string;
  onboardedAt: string;
  tasks: Array<{ key: string; status: string; completedAt: string }>;
};

function draftFrom(a: ArchivedRoundView): Draft {
  return {
    position: a.position ?? "",
    department: a.department ?? "",
    startDate: toDateInput(a.startDate),
    offerSentDate: toDateInput(a.offerSentDate),
    offerSignedDate: toDateInput(a.offerSignedDate),
    orientationDate: toDateInput(a.orientationDate),
    onboardedAt: toDateInput(a.onboardedAt),
    tasks: a.tasks.map((t) => ({ key: t.key, status: t.status, completedAt: toDateInput(t.completedAt) }))
  };
}

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
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fillDate, setFillDate] = useState("");
  const [undoTarget, setUndoTarget] = useState<ArchivedRoundView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (archives.length === 0) return null;

  function startEditing(a: ArchivedRoundView) {
    setError(null);
    setSaved(null);
    setFillDate("");
    setExpanded(a.id);
    setEditing(a.id);
    setDraft(draftFrom(a));
  }

  function setTask(key: string, patch: { status?: string; completedAt?: string }) {
    setDraft((d) =>
      d ? { ...d, tasks: d.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)) } : d
    );
  }

  // Reconstructing a round by hand means typing the same best-guess date over and
  // over. This fills every DONE item that has no date yet, and leaves the ones
  // already dated alone.
  function fillBlanks() {
    if (!fillDate) return;
    setDraft((d) =>
      d
        ? { ...d, tasks: d.tasks.map((t) => (t.status === "DONE" && !t.completedAt ? { ...t, completedAt: fillDate } : t)) }
        : d
    );
  }

  async function save(archiveId: string) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/new-hires/${hireId}/onboarding-rounds/${archiveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position: draft.position || null,
          department: draft.department || null,
          startDate: draft.startDate || null,
          offerSentDate: draft.offerSentDate || null,
          offerSignedDate: draft.offerSignedDate || null,
          orientationDate: draft.orientationDate || null,
          onboardedAt: draft.onboardedAt || null,
          tasks: draft.tasks.map((t) => ({ key: t.key, status: t.status, completedAt: t.completedAt || null }))
        })
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Could not save those dates.");
      setEditing(null);
      setDraft(null);
      setSaved(archiveId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save those dates.");
    } finally {
      setBusy(false);
    }
  }

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

  function roundField(label: string, key: keyof Omit<Draft, "tasks">, type: "date" | "text" = "date", placeholder?: string) {
    return (
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{label}</span>
        <Input
          type={type}
          value={draft?.[key] ?? ""}
          placeholder={placeholder}
          onChange={(e) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))}
          className="mt-1"
        />
      </label>
    );
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
          const isEditing = editing === a.id && draft !== null;
          const byKey = new Map((draft?.tasks ?? []).map((t) => [t.key, t] as const));
          return (
            <div key={a.id} className="rounded border border-brand-lea/10 dark:border-white/10">
              <div className="flex items-center gap-1 pr-3">
                <button
                  type="button"
                  onClick={() => {
                    if (isEditing) return; // don't collapse a form with unsaved edits in it
                    setExpanded(open ? null : a.id);
                  }}
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
                {saved === a.id && !isEditing ? (
                  <span className="shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Saved</span>
                ) : null}
                {canEdit && !isEditing ? (
                  <Button variant="secondary" size="sm" onClick={() => startEditing(a)} className="shrink-0">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit dates
                  </Button>
                ) : null}
                {a.restorable && canEdit && !isEditing ? (
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

                  {isEditing ? (
                    <>
                      <p className="mb-3 rounded border border-brand-gold/40 bg-brand-gold/10 px-3 py-2 text-xs text-brand-lea dark:text-slate-200">
                        Correcting this round&rsquo;s record. The role, the dates and the statuses change — which items the round
                        contained, and when it was archived, stay as they are. The role and department are the ones they held{" "}
                        <strong>during</strong> this round, so if the new title was already on their profile before you started the new
                        onboarding, this is where you put the old one back.
                        {a.restorable ? " These are also the values an Undo would put back." : ""}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {roundField("Role during this round", "position", "text", "e.g. OGD Base Support")}
                        {roundField("Department during this round", "department", "text", "e.g. MX")}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-5">
                        {roundField("Start date", "startDate")}
                        {roundField("Offer sent", "offerSentDate")}
                        {roundField("Offer signed", "offerSignedDate")}
                        {roundField("Orientation", "orientationDate")}
                        {roundField("Onboarded", "onboardedAt")}
                      </div>
                      <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-brand-lea/10 px-3 py-2 dark:border-white/10">
                        <label className="block">
                          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                            Fill every done item that has no date
                          </span>
                          <Input type="date" value={fillDate} onChange={(e) => setFillDate(e.target.value)} className="mt-1 w-44" />
                        </label>
                        <Button variant="secondary" size="sm" onClick={fillBlanks} disabled={!fillDate}>
                          Apply to blanks
                        </Button>
                        <span className="text-xs text-brand-grey dark:text-slate-400">Dates already filled in are left alone.</span>
                      </div>
                    </>
                  ) : (
                    <div className="grid gap-x-6 gap-y-1 text-xs text-brand-grey dark:text-slate-400 sm:grid-cols-4">
                      <span>Offer sent: {fmtDay(a.offerSentDate)}</span>
                      <span>Offer signed: {fmtDay(a.offerSignedDate)}</span>
                      <span>Orientation: {fmtDay(a.orientationDate)}</span>
                      <span>Onboarded: {fmtDay(a.onboardedAt)}</span>
                    </div>
                  )}

                  <div className="mt-3 space-y-3">
                    {[...new Set(a.tasks.map((t) => t.group))].map((group) => (
                      <div key={group}>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{groupLabel(group)}</div>
                        <div className="mt-1.5 space-y-1">
                          {a.tasks
                            .filter((t: ArchivedTask) => t.group === group)
                            .map((t: ArchivedTask) => {
                              const d = byKey.get(t.key);
                              return (
                                <div key={t.key} className="flex items-center justify-between gap-3 text-xs">
                                  <span className="min-w-0 text-brand-lea dark:text-slate-200">{t.label}</span>
                                  {isEditing && d ? (
                                    <span className="flex shrink-0 items-center gap-2">
                                      <Input
                                        type="date"
                                        value={d.completedAt}
                                        disabled={d.status !== "DONE"}
                                        onChange={(e) => setTask(t.key, { completedAt: e.target.value })}
                                        className="w-40 px-2 py-1 text-xs"
                                        aria-label={`Date ${t.label} was completed`}
                                      />
                                      <select
                                        value={d.status}
                                        onChange={(e) => setTask(t.key, { status: e.target.value })}
                                        className={SELECT_CLASS}
                                        aria-label={`Status of ${t.label}`}
                                      >
                                        <option value="DONE">Done</option>
                                        <option value="TODO">To do</option>
                                        <option value="NA">N/A</option>
                                      </select>
                                    </span>
                                  ) : (
                                    <span className="flex shrink-0 items-center gap-2">
                                      {t.completedAt ? (
                                        <span className="text-brand-grey dark:text-slate-500">{fmtDay(t.completedAt)}</span>
                                      ) : null}
                                      <span className={clsx("rounded px-2 py-0.5 font-semibold", STATUS_TONE[t.status] ?? STATUS_TONE.TODO)}>
                                        {t.status === "NA" ? "N/A" : t.status === "DONE" ? "Done" : "To do"}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {isEditing ? (
                    <>
                      {error ? (
                        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                          {error}
                        </p>
                      ) : null}
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditing(null);
                            setDraft(null);
                            setError(null);
                          }}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                        <Button onClick={() => save(a.id)} disabled={busy}>
                          {busy ? "Saving…" : "Save dates"}
                        </Button>
                      </div>
                    </>
                  ) : null}
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
