"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Plane, TrendingUp, MapPin, Award, Trash2, Plus, Sparkles, Repeat } from "lucide-react";
import type { EmployeeJourney as Journey, JourneyRole } from "@/lib/data/employee-journey";
import { Button, Badge, Modal, Input, EmptyState, type BadgeTone } from "@/components/ui";

type Props = {
  hireId: string;
  journey: Journey;
  roleTitleOptions: string[];
};

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(iso)) : "—";
}

// "2 yr 3 mo" / "7 mo" / "24 days"
function duration(days: number | null): string {
  if (days === null) return "";
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} mo`;
  const yr = Math.floor(months / 12);
  const mo = months % 12;
  return mo ? `${yr} yr ${mo} mo` : `${yr} yr`;
}

const TRANSITION_META: Record<string, { label: string; tone: BadgeTone }> = {
  HIRE: { label: "Hired", tone: "info" },
  PROMOTION: { label: "Promotion", tone: "brand" },
  UPGRADE: { label: "Upgrade", tone: "warning" },
  LATERAL: { label: "Lateral move", tone: "neutral" },
  TRANSFER: { label: "Transfer", tone: "neutral" }
};

const TRANSITION_OPTIONS = [
  { value: "", label: "Auto-detect" },
  { value: "PROMOTION", label: "Promotion" },
  { value: "UPGRADE", label: "Upgrade (→ Captain)" },
  { value: "LATERAL", label: "Lateral move" },
  { value: "TRANSFER", label: "Transfer" }
];

function seatLabel(seat: string | null): string | null {
  if (seat === "PIC") return "Captain";
  if (seat === "SIC") return "First Officer";
  return null;
}

export function EmployeeJourney({ hireId, journey, roleTitleOptions }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", startDate: "", transitionType: "", department: "", notes: "" });

  const tenure = useMemo(() => duration(journey.totalTenureDays), [journey.totalTenureDays]);

  async function addRole() {
    if (!form.title.trim() || !form.startDate) {
      setError("A role and a start date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/new-hires/${hireId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Could not record the role change.");
      setAdding(false);
      setForm({ title: "", startDate: "", transitionType: "", department: "", notes: "" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the role change.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRole(roleId: string) {
    if (!window.confirm("Remove this role from the journey? The timeline will re-close around it.")) return;
    setBusyDelete(roleId);
    try {
      const res = await fetch(`/api/new-hires/roles/${roleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.refresh();
    } finally {
      setBusyDelete(null);
    }
  }

  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Journey at SkyShare</p>
          <h2 className="mt-0.5 text-lg font-semibold text-brand-lea dark:text-slate-100">Role journey</h2>
          {journey.roleCount > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand-grey dark:text-slate-400">
              {tenure ? <span><span className="font-semibold text-brand-lea dark:text-slate-100">{tenure}</span> tenure</span> : null}
              <span>· {journey.roleCount} role{journey.roleCount === 1 ? "" : "s"}</span>
              {journey.upgradeCount > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-brand-gold">
                  <TrendingUp className="h-3.5 w-3.5" /> {journey.upgradeCount} upgrade{journey.upgradeCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </p>
          ) : null}
          {journey.stints.length > 1 ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-brand-grey dark:text-slate-400">
              <span className="inline-flex items-center gap-1 font-semibold text-brand-eden dark:text-slate-300">
                <Repeat className="h-3.5 w-3.5" /> Rehired — {journey.stints.length} stints
              </span>
              <span>· {journey.stints.map((s) => `${fmtDate(s.start)}–${s.end ? fmtDate(s.end) : "present"}`).join(", ")}</span>
            </p>
          ) : null}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Record role change
        </Button>
      </div>

      {journey.roles.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            bare
            icon={<Sparkles className="h-6 w-6" />}
            title="No roles recorded yet"
            description="Record this employee's first role to start their journey."
          />
        </div>
      ) : (
        <ol className="mt-5 space-y-0">
          {journey.roles.map((role, i) => (
            <JourneyStep
              key={role.id}
              role={role}
              isLast={i === journey.roles.length - 1}
              busyDelete={busyDelete === role.id}
              onDelete={() => removeRole(role.id)}
            />
          ))}
        </ol>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} busy={saving}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Record a role change</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Adds a step to the journey. The current role is closed on the new start date; a pilot seat (Captain/First Officer) is detected from the role name.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">New role</span>
            <Input
              list="fleet-role-options"
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. CJ2 Captain — or type any title"
              className="mt-1"
            />
            <datalist id="fleet-role-options">
              {roleTitleOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <div className="flex gap-3">
            <label className="block w-1/2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Start date</span>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-1" />
            </label>
            <label className="block w-1/2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Type</span>
              <select
                value={form.transitionType}
                onChange={(e) => setForm({ ...form, transitionType: e.target.value })}
                className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              >
                {TRANSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Department (optional)</span>
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Leave blank to keep current" className="mt-1" />
          </label>
          {error ? <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
          <Button onClick={addRole} disabled={saving}>{saving ? "Saving…" : "Add to journey"}</Button>
        </div>
      </Modal>
    </section>
  );
}

function JourneyStep({ role, isLast, busyDelete, onDelete }: { role: JourneyRole; isLast: boolean; busyDelete: boolean; onDelete: () => void }) {
  const meta = TRANSITION_META[role.transitionType] ?? TRANSITION_META.PROMOTION;
  const seat = seatLabel(role.seat);
  const upgrade = role.isUpgrade;
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* Rail: node + connecting line */}
      <div className="relative flex flex-col items-center">
        <span
          className={clsx(
            "z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-brand-panel",
            upgrade ? "bg-brand-gold text-brand-lea shadow-glow" : role.current ? "bg-brand-lea text-white" : "bg-brand-cloudDancer text-brand-eden dark:bg-white/10 dark:text-slate-300"
          )}
        >
          {upgrade ? <TrendingUp className="h-4 w-4" /> : role.seat ? <Plane className="h-4 w-4" /> : <Award className="h-4 w-4" />}
        </span>
        {!isLast && <span className="absolute top-9 h-[calc(100%-1.25rem)] w-0.5 bg-brand-lea/10 dark:bg-white/10" />}
      </div>

      {/* Card */}
      <div className={clsx("min-w-0 flex-1 rounded border p-3 transition", role.current ? "border-brand-gold/40 bg-brand-gold/[0.06] dark:bg-brand-gold/10" : "border-brand-lea/10 dark:border-white/10")}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-brand-lea dark:text-slate-100">{role.title}</span>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {role.current ? <Badge tone="success">Current</Badge> : null}
            </div>
            <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
              {[seat, role.aircraft && role.aircraft !== role.title ? role.aircraft : null, role.department].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <button
            onClick={onDelete}
            disabled={busyDelete}
            aria-label="Remove role"
            className="shrink-0 rounded p-1 text-brand-grey/60 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-red-500/15 dark:hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-brand-grey dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {fmtDate(role.startDate)} – {role.current ? "Present" : fmtDate(role.endDate)}</span>
          {role.durationDays !== null ? <span className="font-medium text-brand-eden dark:text-slate-300">{duration(role.durationDays)}</span> : null}
        </div>
      </div>
    </li>
  );
}
