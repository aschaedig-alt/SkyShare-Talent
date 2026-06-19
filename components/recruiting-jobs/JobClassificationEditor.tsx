"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

type Props = {
  jobId: string;
  isPilotRole: boolean;
  pilotSeat: string | null;
  aircraftTypes: string[];
};

const SEATS = ["PIC", "SIC", "Lead PIC", "Chief Pilot", "Mixed"];

export function JobClassificationEditor({ jobId, isPilotRole, pilotSeat, aircraftTypes }: Props) {
  const router = useRouter();
  const [pilot, setPilot] = useState(isPilotRole);
  const [seat, setSeat] = useState(pilotSeat ?? "");
  const [aircraft, setAircraft] = useState<string[]>(aircraftTypes);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    pilot !== isPilotRole ||
    (pilot && (seat !== (pilotSeat ?? "") || JSON.stringify(aircraft) !== JSON.stringify(aircraftTypes)));

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
      setMsg(pilot ? "Saved." : "Marked as support — pilot tags cleared and removed from Pilot Requirements.");
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
            className={clsx("px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow", pilot ? "bg-brand-lea text-white" : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-[#10243a] dark:text-slate-400 dark:bg-white/5")}
          >
            Pilot
          </button>
          <button
            type="button"
            onClick={() => setPilot(false)}
            className={clsx("px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow", !pilot ? "bg-brand-lea text-white" : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-[#10243a] dark:text-slate-400 dark:bg-white/5")}
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

      {pilot ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Seat</span>
            <select
              value={seat}
              onChange={(e) => setSeat(e.target.value)}
              className="mt-1 w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100"
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
                  <button type="button" onClick={() => setAircraft(aircraft.filter((x) => x !== a))} className="text-brand-grey hover:text-red-600 dark:text-slate-400" aria-label={`Remove ${a}`}>
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
                className="min-w-0 flex-1 rounded border border-brand-lea/15 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#10243a]"
              />
              <button type="button" onClick={addAircraft} className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
                Add
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">
          Support role — pilot seat and aircraft tags are cleared, and it&rsquo;s removed from Pilot Requirements on save.
        </p>
      )}

      {err ? <p className="mt-2 text-sm font-medium text-red-700">{err}</p> : null}
      {msg ? <p className="mt-2 text-sm font-medium text-emerald-700">{msg}</p> : null}
    </div>
  );
}
