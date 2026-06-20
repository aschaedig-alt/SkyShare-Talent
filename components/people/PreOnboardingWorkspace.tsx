"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type {
  GridHire,
  MilestoneData,
  NewHireRow,
  OnboardingDashboard,
  PostOnboardHire
} from "@/lib/data/onboarding";
import { OnboardingDashboardTab } from "@/components/people/OnboardingDashboardTab";
import { OnboardingGridTab } from "@/components/people/OnboardingGridTab";
import { OnboardingMilestonesTab } from "@/components/people/OnboardingMilestonesTab";
import { PostOnboardTab } from "@/components/people/PostOnboardTab";
import { OnboardingArchivedTab } from "@/components/people/OnboardingArchivedTab";

export type PeopleTab = "dashboard" | "grid" | "milestones" | "post" | "archived";

type Props = {
  tab: PeopleTab;
  counts: { active: number; postOnboard: number; archived: number };
  dashboard?: OnboardingDashboard;
  grid?: GridHire[];
  milestones?: MilestoneData;
  post?: PostOnboardHire[];
  archived?: NewHireRow[];
};

export function PreOnboardingWorkspace({ tab, counts, dashboard, grid, milestones, post, archived }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", position: "", department: "", startDate: "" });
  const [error, setError] = useState<string | null>(null);

  const tabs: Array<{ key: PeopleTab; label: string; badge?: number }> = [
    { key: "dashboard", label: "Dashboard" },
    { key: "grid", label: "Grid", badge: counts.active },
    { key: "milestones", label: "Milestones", badge: counts.active },
    { key: "post", label: "Post-onboard", badge: counts.postOnboard },
    { key: "archived", label: "Archived", badge: counts.archived }
  ];

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
      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">People</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Pre-onboarding</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
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

      <div className="border-b border-brand-lea/10 dark:border-white/10">
        <nav className="flex flex-wrap gap-6">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/people?tab=${t.key}`}
              className={clsx(
                "border-b-2 px-1 py-3 text-sm font-semibold transition hover:shadow-glow",
                tab === t.key ? "border-brand-lea text-brand-lea" : "border-transparent text-brand-grey hover:text-brand-lea dark:text-slate-400"
              )}
            >
              {t.label}
              {t.badge !== undefined ? <span className="ml-1.5 text-brand-grey dark:text-slate-400">· {t.badge}</span> : null}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "dashboard" && dashboard ? <OnboardingDashboardTab dashboard={dashboard} /> : null}
      {tab === "grid" && grid ? <OnboardingGridTab hires={grid} /> : null}
      {tab === "milestones" && milestones ? <OnboardingMilestonesTab data={milestones} /> : null}
      {tab === "post" && post ? <PostOnboardTab hires={post} /> : null}
      {tab === "archived" && archived ? <OnboardingArchivedTab rows={archived} /> : null}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !saving && setAdding(false)} />
          <div className="relative w-full max-w-md rounded bg-white p-5 shadow-2xl dark:bg-[#10243a]">
            <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Add new hire</h2>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Creates an active hire with the standard checklist.</p>
            <div className="mt-4 space-y-3">
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name *"
                className="w-full rounded border border-brand-lea/15 px-3 py-2 text-sm dark:border-white/10"
              />
              <input
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="Position"
                className="w-full rounded border border-brand-lea/15 px-3 py-2 text-sm dark:border-white/10"
              />
              <div className="flex gap-3">
                <input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="Department"
                  className="w-1/2 rounded border border-brand-lea/15 px-3 py-2 text-sm dark:border-white/10"
                />
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-1/2 rounded border border-brand-lea/15 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:text-slate-400"
                />
              </div>
              {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                disabled={saving}
                className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
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
