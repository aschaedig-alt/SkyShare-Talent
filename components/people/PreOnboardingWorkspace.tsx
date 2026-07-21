"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type {
  GridHire,
  NewHireRow,
  OnboardingDashboard,
  PostOnboardHire
} from "@/lib/data/onboarding";
import type { GridChecklistGroup } from "@/lib/data/onboarding-grid-config";
import { OnboardingDashboardTab } from "@/components/people/OnboardingDashboardTab";
import { OnboardingGridTab } from "@/components/people/OnboardingGridTab";
import { PostOnboardTab } from "@/components/people/PostOnboardTab";
import { OnboardingArchivedTab } from "@/components/people/OnboardingArchivedTab";
import { ImportHiresButton } from "@/components/people/ImportHiresButton";
import { PaycomScanButton } from "@/components/people/PaycomScanButton";
import { Button, Modal, Input } from "@/components/ui";

export type PeopleTab = "dashboard" | "grid" | "post" | "archived";

type Props = {
  tab: PeopleTab;
  counts: { active: number; postOnboard: number; archived: number };
  canManage?: boolean;
  dashboard?: OnboardingDashboard;
  grid?: GridHire[];
  checklist?: GridChecklistGroup[];
  post?: PostOnboardHire[];
  archived?: NewHireRow[];
};

export function PreOnboardingWorkspace({ tab, counts, canManage = false, dashboard, grid, checklist, post, archived }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", position: "", department: "", startDate: "" });
  // A hire with no start date drops off nearly every dashboard panel (no
  // "starting soon", no reminders), so this shortcut path makes the choice
  // explicit rather than letting a blank date slip through silently.
  const [noDateAck, setNoDateAck] = useState(false);
  // A same-name hire already exists. Same name can be two real people, so this
  // isn't a hard stop — offer to open the existing one or add anyway.
  const [dupe, setDupe] = useState<{ id: string; name: string; position: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tabs: Array<{ key: PeopleTab; label: string; badge?: number }> = [
    { key: "dashboard", label: "Dashboard" },
    { key: "grid", label: "Checklist", badge: counts.active },
    { key: "post", label: "Post-onboard", badge: counts.postOnboard },
    { key: "archived", label: "Archived", badge: counts.archived }
  ];

  async function createHire(force = false) {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setDupe(null);
    try {
      const res = await fetch("/api/new-hires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, force })
      });
      const payload = (await res.json().catch(() => null)) as
        | { id?: string; message?: string; duplicate?: boolean; existing?: { id: string; name: string; position: string | null } }
        | null;
      // Soft duplicate: a hire with this name already exists. Let them choose.
      if (res.status === 409 && payload?.duplicate && payload.existing) {
        setDupe(payload.existing);
        setSaving(false);
        return;
      }
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
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">New hires</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
            Track every new hire from offer to orientation. Fully onboarded hires move to post-onboard, then archive.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The right door, made the obvious one: a real Link (ctrl/right-click
              to a new tab) so someone starts from the candidate — keeping the
              resume, offer, and history attached. */}
          <Link
            href="/candidates?from=onboarding"
            className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow dark:bg-brand-sweet dark:text-brand-lea"
          >
            Start from a candidate →
          </Link>
          {/* Reads Paycom's background-check notices out of Front on demand. The
              nightly cron already does this; the button is for checking now. */}
          {canManage && <PaycomScanButton />}
          {/* Escape hatches for admins only: both create a hire with NO candidate
              link — right for a true walk-in or a back-catalog import, wrong for a
              live pipeline hire. Demoted to secondary so they don't out-shout the
              correct path. */}
          {canManage && (
            <>
              <ImportHiresButton />
              <Button variant="secondary" onClick={() => { setNoDateAck(false); setError(null); setDupe(null); setAdding(true); }}>+ Add new hire</Button>
            </>
          )}
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
                tab === t.key ? "border-brand-lea text-brand-lea dark:border-slate-100 dark:text-slate-100" : "border-transparent text-brand-grey hover:text-brand-lea dark:text-slate-400"
              )}
            >
              {t.label}
              {t.badge !== undefined ? <span className="ml-1.5 text-brand-grey dark:text-slate-400">· {t.badge}</span> : null}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "dashboard" && dashboard ? <OnboardingDashboardTab dashboard={dashboard} /> : null}
      {tab === "grid" && grid ? <OnboardingGridTab hires={grid} checklist={checklist ?? []} /> : null}
      {tab === "post" && post ? <PostOnboardTab hires={post} /> : null}
      {tab === "archived" && archived ? <OnboardingArchivedTab rows={archived} /> : null}

      <Modal open={adding} onClose={() => setAdding(false)} busy={saving}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Add new hire</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Creates an active hire with the standard checklist.</p>
        {/* Nudge back to the linked path — this modal makes a hire with no
            candidate record behind it, which is only right for a true walk-in. */}
        <p className="mt-2 rounded bg-brand-cloudDancer/50 px-3 py-2 text-xs text-brand-grey dark:bg-white/5 dark:text-slate-400">
          Most hires should <Link href="/candidates" className="font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-sweet">start from the candidate</Link> so their resume, offer, and history stay attached. Use this only for someone with no candidate record.
        </p>
        <div className="mt-4 space-y-3">
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name *" />
          <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Position" />
          <div className="flex gap-3">
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Department" className="w-1/2" />
            <Input type="date" value={form.startDate} onChange={(e) => { setForm({ ...form, startDate: e.target.value }); if (e.target.value) setNoDateAck(false); }} className="w-1/2" />
          </div>
          {!form.startDate && (
            <label className="flex items-start gap-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <input type="checkbox" checked={noDateAck} onChange={(e) => setNoDateAck(e.target.checked)} className="mt-0.5" />
              <span>No start date yet. They will sit in a “No start date” bucket — off the “starting soon” views until a date is set. I understand.</span>
            </label>
          )}
          {dupe ? (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              A hire named <span className="font-semibold">{dupe.name}</span>{dupe.position ? ` (${dupe.position})` : ""} already exists.{" "}
              <Link href={`/people/${dupe.id}`} className="font-semibold underline underline-offset-2">Open that record</Link>, or add anyway if this is a different person.
            </div>
          ) : null}
          {error ? <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAdding(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => createHire(Boolean(dupe))} disabled={saving || (!form.startDate && !noDateAck)}>
            {saving ? "Adding..." : dupe ? "Add anyway" : "Add hire"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
