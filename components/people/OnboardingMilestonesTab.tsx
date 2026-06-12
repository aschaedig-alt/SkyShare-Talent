"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type { GridTaskStatus, MilestoneData } from "@/lib/data/onboarding";

function Glyph({ status }: { status: GridTaskStatus }) {
  if (status === "DONE")
    return (
      <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg width="11" height="11" viewBox="0 0 12 12">
          <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (status === "TODO") return <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-brand-grey/40" />;
  return <span className="text-brand-grey/50">–</span>;
}

export function OnboardingMilestonesTab({ data }: { data: MilestoneData }) {
  const router = useRouter();
  const { milestones, hires } = data;
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addMilestone() {
    if (!label.trim()) {
      setError("Enter a milestone name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding-milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label })
      });
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(payload?.message ?? "Unable to add milestone.");
      setLabel("");
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add milestone.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMilestone(key: string) {
    setBusy(true);
    try {
      await fetch(`/api/onboarding-milestones?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-grey">All onboarding milestones. Click a name to open the hire and tick items off.</p>
        {adding ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMilestone()}
              placeholder="New milestone name"
              className="w-56 rounded border border-brand-lea/15 px-3 py-1.5 text-sm"
            />
            <button onClick={addMilestone} disabled={busy} className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
              {busy ? "Adding..." : "Add"}
            </button>
            <button onClick={() => { setAdding(false); setError(null); setLabel(""); }} className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60">
            + Add milestone
          </button>
        )}
      </div>
      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

      {hires.length === 0 ? (
        <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10">No active hires.</p>
      ) : (
        <div className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 border-b border-r border-brand-lea/10 bg-white px-3 py-2 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-brand-grey">
                    New hire
                  </th>
                  {milestones.map((m) => (
                    <th key={m.key} className="border-b border-brand-lea/10 px-2 py-2 align-bottom" style={{ width: 78, minWidth: 78 }}>
                      <div className="mx-auto flex min-h-[48px] w-[68px] flex-col items-center justify-end gap-1 text-center font-medium leading-tight text-brand-grey">
                        <span className="whitespace-normal break-words">{m.label}</span>
                        {m.custom ? (
                          <button onClick={() => removeMilestone(m.key)} disabled={busy} title="Remove custom milestone" className="text-[9px] font-semibold text-red-600 hover:underline">
                            remove
                          </button>
                        ) : null}
                      </div>
                    </th>
                  ))}
                  <th className="border-b border-brand-lea/10 px-3 py-2 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-brand-grey" style={{ minWidth: 130 }}>
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody>
                {hires.map((h) => {
                  const pct = h.total > 0 ? Math.round((h.done / h.total) * 100) : 0;
                  return (
                    <tr key={h.id} className="hover:bg-brand-cloudDancer/30">
                      <td className="sticky left-0 z-10 border-b border-r border-brand-lea/10 bg-white px-3 py-2">
                        <Link href={`/people/${h.id}`} className="font-medium text-brand-lea hover:underline">{h.name}</Link>
                        <div className="text-[10px] text-brand-grey">
                          {h.position ?? "—"}
                          {h.department ? ` · ${h.department}` : ""}
                        </div>
                      </td>
                      {h.statuses.map((s, i) => (
                        <td key={milestones[i].key} className="border-b border-brand-lea/5 text-center">
                          <Glyph status={s} />
                        </td>
                      ))}
                      <td className="border-b border-brand-lea/5 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-20 overflow-hidden rounded-full bg-brand-cloudDancer">
                            <span className={clsx("block h-full rounded-full", h.done === h.total ? "bg-emerald-500" : "bg-brand-gold")} style={{ width: `${pct}%` }} />
                          </span>
                          <span className="text-[11px] text-brand-grey">{h.done}/{h.total}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
