"use client";

import Link from "next/link";
import { useState } from "react";
import { clsx } from "clsx";
import type { Checkin, GridTaskStatus, PostOnboardHire } from "@/lib/data/onboarding";

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(iso)) : "—";
}

export function PostOnboardTab({ hires: initial }: { hires: PostOnboardHire[] }) {
  const [hires, setHires] = useState(initial);

  async function toggle(hireId: string, c: Checkin) {
    if (!c.id) return;
    const next: GridTaskStatus = c.status === "DONE" ? "TODO" : "DONE";
    const prev = hires;
    setHires((cur) =>
      cur.map((h) =>
        h.id === hireId
          ? { ...h, checkins: h.checkins.map((x) => (x.id === c.id ? { ...x, status: next, dueSoon: next === "DONE" ? false : x.dueSoon } : x)) }
          : h
      )
    );
    try {
      const res = await fetch(`/api/onboarding-tasks/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      if (!res.ok) throw new Error();
    } catch {
      setHires(prev);
    }
  }

  if (hires.length === 0) {
    return <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10">No post-onboard employees yet. Mark an active hire as onboarded and they will appear here.</p>;
  }

  const heads = hires[0].checkins.map((c) => c.short);

  return (
    <div className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey">
              <th className="px-4 py-3 text-left">Employee</th>
              <th className="px-4 py-3 text-left">Department</th>
              <th className="px-4 py-3 text-left">Started</th>
              <th className="px-4 py-3 text-left">Onboarded</th>
              {heads.map((h) => (
                <th key={h} className="px-3 py-3 text-center">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hires.map((h) => (
              <tr key={h.id} className="border-b border-brand-lea/5 hover:bg-brand-cloudDancer/30">
                <td className="px-4 py-3">
                  <Link href={`/people/${h.id}`} className="font-semibold text-brand-lea hover:underline">{h.name}</Link>
                  <div className="text-xs text-brand-grey">{h.position ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-brand-grey">{h.department ?? "—"}</td>
                <td className="px-4 py-3 text-brand-grey">{fmtDate(h.startDate)}</td>
                <td className="px-4 py-3 text-brand-grey">{fmtDate(h.onboardedAt)}</td>
                {h.checkins.map((c) => (
                  <td key={c.key} className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => toggle(h.id, c)}
                      title={c.status === "DONE" ? "Done — click to undo" : c.dueSoon ? "Due — click when complete" : "Click when complete"}
                      className="inline-flex items-center justify-center"
                    >
                      {c.status === "DONE" ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                      ) : c.dueSoon ? (
                        <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-semibold text-brand-lea">due</span>
                      ) : (
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/30" />
                      )}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-brand-lea/10 px-4 py-3 text-xs text-brand-grey">
        Check-ins are 30 / 60 / 90-day + benefits for now — tell me the ones you actually run and I will swap them in.
      </p>
    </div>
  );
}
