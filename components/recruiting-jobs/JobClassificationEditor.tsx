"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

type Props = {
  jobId: string;
  isPilotRole: boolean;
  pilotSeat: string | null;
  aircraftTypes: string[];
  /**
   * True when a requirement is linked straight to this job. Seat and aircraft
   * are then edited in the Role block on the Pilot requirement tab, which saves
   * them to the job and the requirement together. Editing the job's copy here as
   * well is how 9 of 20 pairs came to list different aircraft, so here they are
   * read-only; Pilot / Support is still switched here.
   */
  seatAndAircraftOnRequirementTab?: boolean;
};

const SEATS = ["PIC", "SIC", "Lead PIC", "Chief Pilot", "Mixed"];

export function JobClassificationEditor({
  jobId,
  isPilotRole,
  pilotSeat,
  aircraftTypes,
  seatAndAircraftOnRequirementTab = false
}: Props) {
  const router = useRouter();
  const [pilot, setPilot] = useState(isPilotRole);
  const [seat, setSeat] = useState(pilotSeat ?? "");
  const [aircraft, setAircraft] = useState<string[]>(aircraftTypes);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const locked = seatAndAircraftOnRequirementTab && isPilotRole;
  const dirty =
    pilot !== isPilotRole ||
    (pilot && !locked && (seat !== (pilotSeat ?? "") || JSON.stringify(aircraft) !== JSON.stringify(aircraftTypes)));

  function addAircraft() {
    const v = draft.trim();
    if (v && !aircraft.includes(v)) {
      setAircraft([...aircraft, v]);
    }
    setDraft("");
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const body = pilot ? { isPilotRole: true, pilotSeat: seat || null, aircraftTypes: aircraft } : { isPilotRole: false };
      const res = await fetch(`/api/recruiting-jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(p?.message ?? "Unable to save.");
      }
      setMsg(pilot ? "Saved." : "Marked as support. Pilot seat and aircraft cleared, and its pilot requirement deleted.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Role type</span>
        <div className="inline-flex overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
          <button
            type="button"
            onClick={() => setPilot(true)}
            className={clsx("px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow", pilot ? "bg-brand-lea text-white" : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-brand-panel dark:text-slate-400")}
          >
            Pilot
          </button>
          <button
            type="button"
            onClick={() => setPilot(false)}
            className={clsx("px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow", !pilot ? "bg-brand-lea text-white" : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-brand-panel dark:text-slate-400")}
          >
            Support
          </button>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="ml-auto rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {pilot && locked ? (
        <div className="mt-3 text-sm text-brand-lea dark:text-slate-100">
          <p>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Seat</span>{" "}
            {pilotSeat ?? <span className="text-brand-grey dark:text-slate-400">No seat</span>}
            <span aria-hidden className="mx-2 text-brand-lea/25 dark:text-white/20">
              ·
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Aircraft</span>{" "}
            {aircraftTypes.join(", ") || <span className="text-brand-grey dark:text-slate-400">None</span>}
          </p>
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            Changed in the Role block on the Pilot requirement tab, which saves the job and its requirement together.
          </p>
        </div>
      ) : pilot ? (
        <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Seat</span>
            <select
              value={seat}
              onChange={(e) => setSeat(e.target.value)}
              className="mt-1 w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            >
              <option value="">No seat</option>
              {SEATS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Aircraft</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {aircraft.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded border border-brand-sweet/60 bg-brand-sweet/18 px-2.5 py-1 text-[11px] font-semibold text-brand-lea dark:text-slate-100">
                  {a}
                  <button type="button" onClick={() => setAircraft(aircraft.filter((x) => x !== a))} className="text-brand-grey hover:text-red-600 dark:hover:text-red-300 dark:text-slate-400" aria-label={`Remove ${a}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAircraft();
                  }
                }}
                placeholder="Add aircraft, e.g. Gulfstream G450"
                className="min-w-0 flex-1 rounded border border-brand-lea/15 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-brand-panel"
              />
              <button type="button" onClick={addAircraft} className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
                Add
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">
          Support role — on save the pilot seat and aircraft are cleared and this job&rsquo;s pilot requirement is
          deleted, with its hours, certificates, tail numbers and change history.
        </p>
      )}

      {err ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{err}</p> : null}
      {msg ? <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">{msg}</p> : null}
    </div>
  );
}
