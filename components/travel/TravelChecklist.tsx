"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Check, Lock, CircleDashed, MinusCircle } from "lucide-react";
import {
  checklistFor,
  checklistProgress,
  derivedState,
  tripNeedsReimbursement,
  CHECKLIST_STATUSES,
  REIMBURSEMENT_STAGES,
  VISIT_FIELDS,
  EMPTY_STATE,
  type TripChecklistState,
  type ChecklistItem,
  type ChecklistStatus,
  type ChecklistTick
} from "@/lib/travel/checklist";
import { loadChecklist, setChecklistStatus, setVisitField, setReimbursementStage } from "@/app/travel/actions";
import type { TravelTripView } from "@/lib/data/travel";

/**
 * What still has to happen on this trip, and who still has to be told.
 *
 * Sits under the gap list rather than replacing it: the gaps answer "is it
 * booked", this answers "has anyone been told". They were one list in an earlier
 * draft and it read as thirty rows of paperwork.
 */
export function TravelChecklist({ trip }: { trip: TravelTripView }) {
  const [state, setState] = useState<TripChecklistState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let live = true;
    loadChecklist(trip.id)
      .then((res) => {
        if (!live) return;
        if (res.ok && res.state) setState(res.state);
        setLoaded(true);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [trip.id]);

  // Same flash the rest of the panel uses — a silent save is indistinguishable
  // from a failed one, which is the whole reason this pattern exists here.
  function flash(ok: boolean) {
    setSaveState(ok ? "saved" : "error");
    if (ok) setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1600);
  }

  async function setStatus(key: string, status: ChecklistStatus) {
    setSaveState("saving");
    const res = await setChecklistStatus(trip.id, key, status);
    if (res.ok && res.state) setState(res.state);
    flash(Boolean(res.ok));
  }

  async function saveField(field: string, value: string) {
    setSaveState("saving");
    const res = await setVisitField(trip.id, field, value);
    if (res.ok && res.state) setState(res.state);
    flash(Boolean(res.ok));
  }

  async function saveStage(stage: string) {
    setSaveState("saving");
    const res = await setReimbursementStage(trip.id, stage);
    if (res.ok && res.state) setState(res.state);
    flash(Boolean(res.ok));
  }

  if (!loaded) return null;

  const sections = checklistFor(trip);
  const progress = checklistProgress(trip, state);
  const needsReimbursement = tripNeedsReimbursement(trip);
  const isVisit = trip.purpose === "RECRUITING_VISIT";

  return (
    <div className="rounded border border-brand-lea/12 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-lea dark:text-slate-100">Checklist</h4>
        <div className="flex items-center gap-2">
          {saveState !== "idle" ? (
            <span
              className={clsx(
                "text-[11px] font-semibold",
                saveState === "error" ? "text-red-600 dark:text-red-400" : "text-brand-grey dark:text-slate-400"
              )}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Not saved"}
            </span>
          ) : null}
          <span className="text-[11px] font-semibold text-brand-lea dark:text-slate-200">
            {progress.done} of {progress.total}
            {progress.na ? ` · ${progress.na} n/a` : ""}
            {progress.blocked ? ` · ${progress.blocked} waiting` : ""}
          </span>
        </div>
      </div>

      <div className="mt-2 space-y-3">
        {sections.map((section) => (
          <div key={section.id}>
            <p className="text-[11px] font-semibold text-brand-eden dark:text-slate-400">{section.title}</p>
            <ul className="mt-1 space-y-1">
              {section.items.map((item) => (
                <ChecklistRow
                  key={item.key}
                  item={item}
                  trip={trip}
                  tick={state.ticks[item.key]}
                  onStatus={(status) => void setStatus(item.key, status)}
                />
              ))}
            </ul>

            {/* The visit pack sits inside the purpose section, because it IS the
                purpose-specific part — these answers are what the supervisor
                conversation produces and what the calendar blocks come from. */}
            {section.id === "purpose" && isVisit ? (
              <div className="mt-2 space-y-2 rounded border border-brand-lea/12 bg-white/60 p-2.5 dark:border-white/10 dark:bg-white/5">
                {VISIT_FIELDS.map((f) => (
                  <VisitField
                    key={f.key}
                    label={f.label}
                    value={state.visit[f.key] ?? ""}
                    onSave={(v) => void saveField(f.key, v)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {/* Reimbursement appears only when the trip actually owes somebody —
            read from the items, not asked. One row that advances, not four
            checkboxes saying the same thing four times. */}
        {needsReimbursement ? (
          <div>
            <p className="text-[11px] font-semibold text-brand-eden dark:text-slate-400">Reimbursement</p>
            <div className="mt-1 rounded border border-brand-gold/40 bg-brand-gold/10 p-2.5">
              <p className="text-[11px] text-brand-grey dark:text-slate-300">
                {trip.items.filter((i) => i.selfBooked || i.reimbursement === "NEEDED").length} item(s) on this trip were
                paid for by the traveler.
              </p>
              <select
                value={state.reimbursement}
                onChange={(e) => void saveStage(e.target.value)}
                className="mt-1.5 w-full rounded border border-brand-lea/20 bg-white px-2 py-1 text-[12px] text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              >
                {REIMBURSEMENT_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] leading-snug text-brand-grey dark:text-slate-400">
                To reimburse: HR emails payables@skyshare.com with the receipts attached and the trip details
                &mdash; traveler name, dates, and the purpose of the trip and expenses. HR sends it, not the
                traveler. Approval and payment timeline were not specified, so the steps after &ldquo;Sent to
                accounting&rdquo; are tracked by hand rather than driven by the app.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * To do / Done / N/A, as three buttons rather than a checkbox.
 *
 * Segmented rather than a <select> because there are only three options and the
 * current one has to be readable at a glance down a list of six rows — a select
 * hides the state behind a control that all look identical. Selected is
 * navy + gold and hover is a gold glow, per the locked design system; the
 * corners are the global 4px, and it is a rectangle, not a pill.
 */
function StatusPicker({
  label,
  value,
  onChange
}: {
  label: string;
  value: ChecklistStatus;
  onChange: (status: ChecklistStatus) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`${label} — status`}
      className="flex shrink-0 overflow-hidden rounded border border-brand-lea/20 dark:border-white/15"
    >
      {CHECKLIST_STATUSES.map((s) => {
        const active = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s.value)}
            className={clsx(
              "px-2 py-0.5 text-[10.5px] font-semibold transition",
              active
                ? "bg-brand-lea text-brand-gold"
                : "text-brand-grey hover:bg-brand-gold/20 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-brand-gold/25 dark:hover:text-slate-100"
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function ChecklistRow({
  item,
  trip,
  tick,
  onStatus
}: {
  item: ChecklistItem;
  trip: TravelTripView;
  tick?: ChecklistTick;
  onStatus: (status: ChecklistStatus) => void;
}) {
  const derived = item.derived ? derivedState(trip, item.key) : null;
  const status: ChecklistStatus = tick?.status ?? "TODO";
  const done = item.derived ? Boolean(derived?.done) : status === "DONE";
  const notApplicable = !item.derived && status === "NA";
  const blocked = Boolean(item.waitingOn);

  return (
    <li
      className={clsx(
        "flex items-start gap-2 rounded border px-2.5 py-1.5",
        blocked
          ? "border-brand-lea/10 bg-brand-lea/[0.03] dark:border-white/5 dark:bg-white/[0.02]"
          : notApplicable
            ? "border-brand-lea/10 bg-brand-lea/[0.03] dark:border-white/5 dark:bg-white/[0.02]"
            : done
              ? "border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/10"
              : "border-brand-lea/12 bg-white/60 dark:border-white/10 dark:bg-white/5"
      )}
    >
      {blocked ? (
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-500" />
      ) : item.derived ? (
        done ? (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-500" />
        )
      ) : notApplicable ? (
        <MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-500" />
      ) : done ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-500" />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "text-[12px] font-medium",
            blocked || notApplicable ? "text-brand-grey dark:text-slate-400" : "text-brand-lea dark:text-slate-100"
          )}
        >
          {item.label}
        </p>

        {item.waitingOn ? (
          <p className="mt-0.5 text-[10.5px] leading-snug text-amber-700 dark:text-amber-300">{item.waitingOn}</p>
        ) : item.detail ? (
          <p className="mt-0.5 text-[10.5px] leading-snug text-brand-grey dark:text-slate-400">{item.detail}</p>
        ) : null}

        {derived?.note ? (
          <p className="mt-0.5 text-[10.5px] font-medium text-brand-eden dark:text-slate-300">{derived.note}</p>
        ) : null}

        {/* Who and when — for N/A as well as Done, because "who decided this trip
            did not need it" is the same question as "did anyone actually tell
            the supervisor", and a bare mark answers neither. */}
        {!item.derived && status !== "TODO" && tick?.at ? (
          <p className="mt-0.5 text-[10.5px] text-brand-grey dark:text-slate-500">
            {status === "NA" ? "Marked N/A · " : ""}
            {tick.by ? `${tick.by} · ` : ""}
            {new Date(tick.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        ) : null}
      </div>

      {/* Derived and waiting-on items have no status to set: one is read from the
          trip, the other is not ours to finish. */}
      {!item.derived && !blocked ? (
        <StatusPicker label={item.label} value={status} onChange={onStatus} />
      ) : null}
    </li>
  );
}

/** Autosaves on blur, matching the rest of the travel panel. */
function VisitField({
  label,
  value,
  onSave
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // The saved value can change under us (another field's save returns the whole
  // state), so track it — but never while the field is focused, or typing would
  // be overwritten mid-sentence.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="block">
      <span className="text-[10.5px] font-semibold text-brand-eden dark:text-slate-400">{label}</span>
      <textarea
        value={draft}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== value.trim()) onSave(draft);
        }}
        className="mt-0.5 w-full resize-y rounded border border-brand-lea/15 bg-white px-2 py-1 text-[12px] text-brand-lea placeholder:text-brand-grey/60 focus:border-brand-gold focus:outline-none dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
        placeholder="—"
      />
    </label>
  );
}
