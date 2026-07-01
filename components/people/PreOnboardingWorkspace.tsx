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
import { ImportHiresButton } from "@/components/people/ImportHiresButton";
import { Button, Modal, Input } from "@/components/ui";

export type PeopleTab = "dashboard" | "grid" | "post" | "archived";

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
  const [gridView, setGridView] = useState<"grid" | "milestones">("grid");

  const tabs: Array<{ key: PeopleTab; label: string; badge?: number }> = [
    { key: "dashboard", label: "Dashboard" },
    { key: "grid", label: "Grid & milestones", badge: counts.active },
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
      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">People</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Pre-onboarding</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
            Track every new hire from offer to orientation. Fully onboarded hires move to post-onboard, then archive.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportHiresButton />
          <Button onClick={() => setAdding(true)}>+ Add new hire</Button>
        </div>
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
      {tab === "grid" && grid ? (
        <div className="space-y-3">
          <div className="flex w-fit gap-1 rounded bg-white p-1 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            {(["grid", "milestones"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setGridView(v)}
                className={clsx(
                  "rounded px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow",
                  gridView === v ? "bg-brand-lea text-white shadow-sm" : "text-brand-grey hover:text-brand-lea dark:text-slate-400"
                )}
              >
                {v === "grid" ? "Grid" : "Milestones"}
              </button>
            ))}
          </div>
          {gridView === "grid" ? <OnboardingGridTab hires={grid} /> : milestones ? <OnboardingMilestonesTab data={milestones} /> : null}
        </div>
      ) : null}
      {tab === "post" && post ? <PostOnboardTab hires={post} /> : null}
      {tab === "archived" && archived ? <OnboardingArchivedTab rows={archived} /> : null}

      <Modal open={adding} onClose={() => setAdding(false)} busy={saving}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Add new hire</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Creates an active hire with the standard checklist.</p>
        <div className="mt-4 space-y-3">
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name *" />
          <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Position" />
          <div className="flex gap-3">
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Department" className="w-1/2" />
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-1/2" />
          </div>
          {error ? <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAdding(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={createHire} disabled={saving}>
            {saving ? "Adding..." : "Add hire"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
