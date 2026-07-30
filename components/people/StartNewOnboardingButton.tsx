"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { RotateCcw } from "lucide-react";
import { Button, Input, Modal, Textarea } from "@/components/ui";
import { ONBOARDING_TASKS, groupLabel } from "@/lib/onboarding/tasks";
import { CARRY_OVER_DEFAULTS, ROUND_REASONS, type RoundReason } from "@/lib/onboarding/rounds";

// Put someone who has already been onboarded through it again — a rehire, or an
// internal move big enough to need the paperwork done properly (see
// lib/onboarding/rounds.ts). Everything the operator is about to change is spelled
// out in the dialog, because this rewrites a real employee's live record.

type Props = {
  hireId: string;
  hireName: string;
  position: string | null;
  department: string | null;
  employmentStatus: string;
  doneCount: number;
  totalCount: number;
  roleTitleOptions: string[];
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function StartNewOnboardingButton({
  hireId,
  hireName,
  position,
  department,
  employmentStatus,
  doneCount,
  totalCount,
  roleTitleOptions
}: Props) {
  const router = useRouter();
  const former = employmentStatus === "TERMINATED";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<RoundReason>(former ? "REHIRE" : "DEPARTMENT_CHANGE");
  const [newPosition, setNewPosition] = useState(position ?? "");
  const [newDepartment, setNewDepartment] = useState(department ?? "");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [note, setNote] = useState("");
  const [recordRoleChange, setRecordRoleChange] = useState(true);
  const [carryOver, setCarryOver] = useState<string[]>(CARRY_OVER_DEFAULTS[former ? "REHIRE" : "DEPARTMENT_CHANGE"]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof ONBOARDING_TASKS>();
    for (const t of ONBOARDING_TASKS) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
    return [...groups.entries()];
  }, []);

  function pickReason(next: RoundReason) {
    setReason(next);
    // The carry-over defaults are the whole point of choosing a reason, so
    // switching reason re-applies them rather than keeping the old ticks.
    setCarryOver(CARRY_OVER_DEFAULTS[next]);
  }

  function toggle(key: string) {
    setCarryOver((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function openDialog() {
    setError(null);
    setReason(former ? "REHIRE" : "DEPARTMENT_CHANGE");
    setCarryOver(CARRY_OVER_DEFAULTS[former ? "REHIRE" : "DEPARTMENT_CHANGE"]);
    setNewPosition(position ?? "");
    setNewDepartment(department ?? "");
    setEffectiveDate(today());
    setNote("");
    setRecordRoleChange(true);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/new-hires/${hireId}/onboarding-rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          position: newPosition,
          department: newDepartment,
          effectiveDate,
          note,
          carryOver,
          recordRoleChange
        })
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Could not start the new onboarding.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the new onboarding.");
    } finally {
      setBusy(false);
    }
  }

  const isRehire = reason === "REHIRE";

  return (
    <>
      <Button variant="gold" onClick={openDialog}>
        <RotateCcw className="h-4 w-4" />
        {former ? "Rehire — start new onboarding" : "Start new onboarding"}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} busy={busy} maxWidth="max-w-3xl" className="max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Start a new onboarding for {hireName}</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Their current checklist ({doneCount} of {totalCount} complete) is filed away as a read-only record on this profile, and a
          fresh one takes its place. Nothing is deleted — you can undo this from Onboarding history.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Why</span>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {ROUND_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => pickReason(r.key)}
                  aria-pressed={reason === r.key}
                  className={clsx(
                    "rounded border p-3 text-left transition hover:shadow-glow",
                    reason === r.key
                      ? "border-brand-gold bg-brand-lea text-white dark:bg-brand-eden"
                      : "border-brand-lea/15 text-brand-lea hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <span className="block text-sm font-semibold">{r.label}</span>
                  <span className={clsx("mt-0.5 block text-xs", reason === r.key ? "text-white/70" : "text-brand-grey dark:text-slate-400")}>
                    {r.blurb}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">New position</span>
              <Input
                list="new-onboarding-roles"
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                placeholder="e.g. PC-12 First Officer"
                className="mt-1"
              />
              <datalist id="new-onboarding-roles">
                {roleTitleOptions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">New department</span>
              <Input value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="e.g. FlightOps" className="mt-1" />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                {isRehire ? "Return-to-work date" : "Effective date"}
              </span>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="mt-1" />
            </label>
          </div>

          <label className="flex items-start gap-2 text-xs text-brand-grey dark:text-slate-400">
            <input type="checkbox" className="mt-0.5" checked={recordRoleChange} onChange={(e) => setRecordRoleChange(e.target.checked)} />
            <span>
              Also record this on their role journey. Skipped automatically if the move is already recorded, or if the effective date
              falls before their current role started.
            </span>
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Note (optional)</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" placeholder="Why this move needs a full onboarding" />
          </label>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
              Carries over as already done
            </span>
            <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
              Everything else starts open. These defaults are deliberately cautious — a background check or drug screen only carries
              over for a move inside the same department, never for a rehire. Tick anything you know does not need doing again.
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {grouped.map(([group, items]) => (
                <div key={group} className="rounded border border-brand-lea/10 p-2.5 dark:border-white/10">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">{groupLabel(group)}</div>
                  <div className="mt-1.5 space-y-1">
                    {items.map((t) => (
                      <label key={t.key} className="flex items-start gap-2 text-xs text-brand-lea dark:text-slate-200">
                        <input type="checkbox" className="mt-0.5" checked={carryOver.includes(t.key)} onChange={() => toggle(t.key)} />
                        <span>{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-brand-gold/40 bg-brand-gold/10 p-3 text-xs text-brand-lea dark:text-slate-200">
            <p className="font-semibold">What this changes</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Moves {hireName} back into New hires so they show up on the onboarding board again.</li>
              <li>Clears the offer sent / offer signed / orientation dates for the new round (the old ones stay on the archived copy).</li>
              <li>Sets their business card back to Needed, since the title on it changes.</li>
              {isRehire ? (
                <li>Reopens employment: closes the old period, opens a new one from the return date, and moves their hire date.</li>
              ) : (
                <li>Leaves their hire date and tenure alone — this is the same period of employment.</li>
              )}
              <li>
                Does <strong>not</strong> touch the offer stepper on their linked candidate record, which still shows the previous
                offer. Track the new offer on the checklist.
              </li>
            </ul>
          </div>

          {error ? <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !effectiveDate}>
            {busy ? "Working…" : "Archive current & start fresh"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
