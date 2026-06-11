"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type { HireStage, HireStatus, NewHireRow, OnboardingWorkspaceData } from "@/lib/data/onboarding";

type Props = {
  data: OnboardingWorkspaceData;
  stage: HireStage;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(iso));
}

const STATUS_STYLE: Record<HireStatus, string> = {
  Ready: "bg-emerald-50 text-emerald-800",
  "In process": "bg-brand-gold/15 text-brand-lea",
  Urgent: "bg-red-50 text-red-700",
  Blocked: "bg-red-50 text-red-700",
  Onboarded: "bg-sky-50 text-sky-800",
  Archived: "bg-brand-cloudDancer text-brand-grey",
  Canceled: "bg-brand-cloudDancer text-brand-grey"
};

const ALERT_STYLE: Record<string, { row: string; tag: string; label: string }> = {
  blocked: { row: "bg-red-50", tag: "text-red-700", label: "Blocked" },
  urgent: { row: "bg-red-50", tag: "text-red-700", label: "Urgent" },
  missing: { row: "bg-brand-gold/10", tag: "text-brand-lea", label: "Missing" }
};

const TABS: Array<{ key: HireStage; label: string; param: string }> = [
  { key: "ACTIVE", label: "Active", param: "active" },
  { key: "POST_ONBOARD", label: "Post-onboard", param: "post" },
  { key: "ARCHIVED", label: "Archived", param: "archived" }
];

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">{label}</div>
      <div className={clsx("mt-1 text-3xl font-semibold", tone)}>{value}</div>
    </div>
  );
}

export function PreOnboardingWorkspace({ data, stage }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", position: "", department: "", startDate: "" });
  const [error, setError] = useState<string | null>(null);

  const counts = data.counts;
  const tabCount = (k: HireStage) => (k === "ACTIVE" ? counts.active : k === "POST_ONBOARD" ? counts.postOnboard : counts.archived);

  async function createHire() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/new-hires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!res.ok || !payload?.id) {
        throw new Error(payload?.message ?? "Unable to add new hire.");
      }
      router.push(`/people/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add new hire.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">People</p>
          <h1 className="text-2xl font-semibold text-brand-lea">Pre-onboarding</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey">
            Track every new hire from offer to orientation. Fully onboarded hires move to post-onboard, then archive.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden"
        >
          + Add new hire
        </button>
      </section>

      {/* Lifecycle tabs */}
      <div className="border-b border-brand-lea/10">
        <nav className="flex gap-8">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/people?stage=${tab.param}`}
              className={clsx(
                "border-b-2 px-1 py-3 text-sm font-semibold transition",
                stage === tab.key ? "border-brand-lea text-brand-lea" : "border-transparent text-brand-grey hover:text-brand-lea"
              )}
            >
              {tab.label} · {tabCount(tab.key)}
            </Link>
          ))}
        </nav>
      </div>

      {/* Dashboard (active only) */}
      {data.dashboard && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Starting in 7 days" value={data.dashboard.startingSoon} tone="text-sky-700" />
            <MetricCard label="Hires with missing items" value={data.dashboard.missingItems} tone="text-brand-gold" />
            <MetricCard label="Urgent / blocked" value={data.dashboard.urgent} tone="text-red-700" />
            <MetricCard label="In process" value={data.dashboard.inProcess} tone="text-brand-lea" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
              <h2 className="text-base font-semibold text-brand-lea">Needs attention</h2>
              <div className="mt-3 divide-y divide-brand-lea/5 overflow-hidden rounded border border-brand-lea/10">
                {data.dashboard.alerts.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-brand-grey">Nothing flagged — every active hire is on track.</p>
                ) : (
                  data.dashboard.alerts.map((a, i) => {
                    const s = ALERT_STYLE[a.level];
                    return (
                      <Link
                        key={`${a.id}-${i}`}
                        href={`/people/${a.id}`}
                        className={clsx("flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition hover:opacity-90", s.row)}
                      >
                        <span className="text-brand-black">
                          <span className="font-semibold">{a.name}</span> — {a.text}
                        </span>
                        <span className={clsx("shrink-0 text-xs font-bold uppercase tracking-wide", s.tag)}>{s.label}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
              <h2 className="text-base font-semibold text-brand-lea">Upcoming start dates</h2>
              <div className="mt-3 space-y-2">
                {data.dashboard.upcomingStarts.length === 0 ? (
                  <p className="text-sm text-brand-grey">No upcoming starts.</p>
                ) : (
                  data.dashboard.upcomingStarts.map((u) => (
                    <Link key={u.id} href={`/people/${u.id}`} className="flex items-center gap-3 text-sm hover:underline">
                      <span className="w-14 shrink-0 font-semibold text-sky-700">{fmtDate(u.startDate)}</span>
                      <span className="truncate text-brand-black">
                        {u.name}
                        {u.position ? <span className="text-brand-grey"> · {u.position}</span> : null}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Table */}
      <section className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Dept</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Next action</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-brand-grey">No hires in this list.</td>
                </tr>
              ) : (
                data.rows.map((row) => <HireTableRow key={row.id} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !saving && setAdding(false)} />
          <div className="relative w-full max-w-md rounded bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-brand-lea">Add new hire</h2>
            <p className="mt-1 text-sm text-brand-grey">Creates an active hire with the standard checklist. You can fill in the rest on their page.</p>
            <div className="mt-4 space-y-3">
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name *"
                className="w-full rounded border border-brand-lea/15 px-3 py-2 text-sm"
              />
              <input
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="Position"
                className="w-full rounded border border-brand-lea/15 px-3 py-2 text-sm"
              />
              <div className="flex gap-3">
                <input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="Department"
                  className="w-1/2 rounded border border-brand-lea/15 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-1/2 rounded border border-brand-lea/15 px-3 py-2 text-sm text-brand-grey"
                />
              </div>
              {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                disabled={saving}
                className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createHire}
                disabled={saving}
                className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
              >
                {saving ? "Adding..." : "Add hire"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HireTableRow({ row }: { row: NewHireRow }) {
  const pct = row.applicableCount > 0 ? Math.round((row.doneCount / row.applicableCount) * 100) : 0;
  return (
    <tr className="border-b border-brand-lea/5 transition hover:bg-brand-cloudDancer/40">
      <td className="px-4 py-3">
        <Link href={`/people/${row.id}`} className="font-semibold text-brand-lea hover:underline">
          {row.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-brand-grey">{row.position ?? "—"}</td>
      <td className="px-4 py-3 text-brand-grey">{row.department ?? "—"}</td>
      <td className="px-4 py-3 text-brand-grey">{fmtDate(row.startDate)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-24 overflow-hidden rounded-full bg-brand-cloudDancer">
            <span
              className={clsx("block h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-brand-gold")}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="text-xs text-brand-grey">
            {row.doneCount}/{row.applicableCount}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[row.status])}>{row.status}</span>
      </td>
      <td className="px-4 py-3 text-brand-grey">{row.nextAction ?? "—"}</td>
    </tr>
  );
}
