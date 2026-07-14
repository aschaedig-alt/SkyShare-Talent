"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Plane, TrendingUp, Award, Trash2, Plus, Pencil, Sparkles, Repeat, Star, Check, RotateCcw } from "lucide-react";
import type { EmployeeJourney as Journey, JourneyRole } from "@/lib/data/employee-journey";
import { Button, Modal, Input, EmptyState } from "@/components/ui";

type Props = {
  hireId: string;
  journey: Journey;
  roleTitleOptions: string[];
};

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "—";
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

// Full marketing name for the aircraft, shown under the role title (e.g. "Pilatus PC-12").
const AIRCRAFT_FULL: Record<string, string> = {
  "PC-12": "Pilatus PC-12",
  CJ2: "Citation CJ2",
  M2: "Citation M2",
  "560XL": "Citation 560XL",
  "560XLS+": "Citation 560XLS+",
  G200: "Gulfstream G200",
  G450: "Gulfstream G450/GV",
  GV: "Gulfstream GV",
  "Phenom 300": "Embraer Phenom 300",
  "Phenom 100": "Embraer Phenom 100",
  "Legacy 650": "Embraer Legacy 650",
  "Legacy 600": "Embraer Legacy 600"
};

function subtitleFor(role: JourneyRole): string {
  if (role.aircraft && AIRCRAFT_FULL[role.aircraft]) return AIRCRAFT_FULL[role.aircraft];
  if (role.aircraft && role.aircraft !== role.title) return role.aircraft;
  if (role.seat === null) return role.department ?? "Management";
  return "";
}

// Short uppercase step label shown as an outline pill under each node.
const STEP_LABEL: Record<string, string> = {
  HIRE: "Hired",
  PROMOTION: "Promoted",
  UPGRADE: "Upgrade",
  LATERAL: "Lateral",
  TRANSFER: "Transfer"
};

const TRANSITION_OPTIONS = [
  { value: "", label: "Auto-detect" },
  { value: "PROMOTION", label: "Promotion" },
  { value: "UPGRADE", label: "Upgrade (→ Captain)" },
  { value: "LATERAL", label: "Lateral move" },
  { value: "TRANSFER", label: "Transfer" }
];

// Editing an existing step allows setting the first role explicitly as a Hire.
const EDIT_TRANSITION_OPTIONS = [{ value: "HIRE", label: "Hired" }, ...TRANSITION_OPTIONS.slice(1)];

// ISO string -> yyyy-mm-dd for a <input type="date">.
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function EmployeeJourney({ hireId, journey, roleTitleOptions }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", startDate: "", transitionType: "", department: "", notes: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", startDate: "", endDate: "", transitionType: "", department: "" });

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

  function openEdit(role: JourneyRole) {
    setEditForm({
      title: role.title,
      startDate: dateInput(role.startDate),
      endDate: dateInput(role.endDate),
      transitionType: role.transitionType,
      department: role.department ?? ""
    });
    setError(null);
    setEditing(role.id);
  }

  async function saveEdit() {
    if (!editForm.title.trim() || !editForm.startDate) {
      setError("A role and a start date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/new-hires/roles/${editing}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm)
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Could not update the role.");
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the role.");
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
    <section className="overflow-hidden rounded shadow-panel ring-1 ring-brand-lea/10 dark:ring-white/10">
      {/* Navy header band */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-lea px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Journey at SkyShare</p>
          {journey.roleCount > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-white/80">
              {tenure ? (
                <span>
                  <span className="font-semibold text-white">{tenure}</span> tenure
                </span>
              ) : null}
              <span>· {journey.roleCount} role{journey.roleCount === 1 ? "" : "s"}</span>
              {journey.upgradeCount > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-brand-gold">
                  <TrendingUp className="h-3.5 w-3.5" /> {journey.upgradeCount} upgrade{journey.upgradeCount === 1 ? "" : "s"}
                </span>
              ) : null}
              {journey.tenure.stintCount > 1 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-white/90">
                  <Repeat className="h-3.5 w-3.5" /> {journey.tenure.stintCount} stints
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-1 text-sm text-white/70">No roles recorded yet</p>
          )}

          {/* Employment dates + rehire-tenure flag */}
          {journey.tenure.originalStart ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="text-white/70">
                Started <span className="font-semibold text-white">{fmtDate(journey.tenure.originalStart)}</span>
              </span>
              {journey.tenure.rehireStart ? (
                <span className="text-white/70">
                  · Rehired <span className="font-semibold text-white">{fmtDate(journey.tenure.rehireStart)}</span>
                </span>
              ) : null}
              {journey.tenure.termDate ? (
                <span className="text-white/70">
                  · Left <span className="font-semibold text-white">{fmtDate(journey.tenure.termDate)}</span>
                </span>
              ) : null}
              {journey.tenure.rehired && journey.tenure.lastRehireBridged !== null ? (
                journey.tenure.lastRehireBridged ? (
                  <span
                    title="Returned within 3 months — tenure continues from the original hire date."
                    className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-200"
                  >
                    <Check className="h-3 w-3" /> Tenure continued
                  </span>
                ) : (
                  <span
                    title={`Returned after more than 3 months${journey.tenure.lastGapDays ? ` (${journey.tenure.lastGapDays} days out)` : ""} — tenure reset; counting from ${fmtDate(journey.tenure.serviceStart)}.`}
                    className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-200"
                  >
                    <RotateCcw className="h-3 w-3" /> Tenure reset · from {fmtDate(journey.tenure.serviceStart)}
                  </span>
                )
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded bg-white/95 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-white hover:shadow-glow"
        >
          <Plus className="h-4 w-4" /> Record role change
        </button>
      </div>

      {/* Body */}
      <div className="bg-white p-5 dark:bg-brand-panel">
        {journey.roles.length === 0 ? (
          <EmptyState
            bare
            icon={<Sparkles className="h-6 w-6" />}
            title="No roles recorded yet"
            description="Record this employee's first role to start their journey."
          />
        ) : (
          <div className="overflow-x-auto pb-1">
            <ol className="flex min-w-max pt-1">
              {journey.roles.map((role, i) => (
                <TimelineNode
                  key={role.id}
                  role={role}
                  index={i}
                  total={journey.roles.length}
                  busyDelete={busyDelete === role.id}
                  onEdit={() => openEdit(role)}
                  onDelete={() => removeRole(role.id)}
                />
              ))}
            </ol>
          </div>
        )}
      </div>

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

      <Modal open={editing !== null} onClose={() => setEditing(null)} busy={saving}>
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Edit role</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Correct an approximate date, title, or transition. Leave the end date blank if this is the person&apos;s current role.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Role</span>
            <Input
              list="fleet-role-options"
              autoFocus
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              placeholder="e.g. CJ2 Captain"
              className="mt-1"
            />
          </label>
          <div className="flex gap-3">
            <label className="block w-1/2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Start date</span>
              <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} className="mt-1" />
            </label>
            <label className="block w-1/2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">End date <span className="font-normal normal-case tracking-normal text-brand-grey/70 dark:text-slate-500">(blank = current)</span></span>
              <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} className="mt-1" />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Type</span>
            <select
              value={editForm.transitionType}
              onChange={(e) => setEditForm({ ...editForm, transitionType: e.target.value })}
              className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            >
              {EDIT_TRANSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {error ? <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
          <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </Modal>
    </section>
  );
}

function dateLine(role: JourneyRole): string {
  const s = fmtDate(role.startDate);
  if (role.current) return `${s} – Present`;
  const e = fmtDate(role.endDate);
  return s === e ? s : `${s} – ${e}`;
}

// The colored connector to the RIGHT of a node; darkens toward the current role.
function segClass(ratio: number): string {
  if (ratio < 0.34) return "bg-brand-lea/15 dark:bg-white/10";
  if (ratio < 0.67) return "bg-brand-lea/30 dark:bg-white/20";
  return "bg-brand-lea/60 dark:bg-white/40";
}

function StepBadge({ role }: { role: JourneyRole }) {
  if (role.current) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-300">
        <Star className="h-3 w-3 fill-current" /> Active
      </span>
    );
  }
  const type = role.isUpgrade ? "UPGRADE" : role.transitionType;
  const label = STEP_LABEL[type] ?? STEP_LABEL.PROMOTION;
  const cls =
    type === "HIRE"
      ? "border-brand-lea/35 text-brand-lea dark:border-white/25 dark:text-slate-200"
      : type === "UPGRADE"
        ? "border-brand-gold/60 bg-brand-gold/10 text-amber-700 dark:text-brand-gold"
        : type === "PROMOTION"
          ? "border-brand-gold/50 text-brand-gold"
          : "border-brand-grey/30 text-brand-grey dark:border-white/20 dark:text-slate-400";
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", cls)}>
      {type === "UPGRADE" ? <TrendingUp className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

function TimelineNode({
  role,
  index,
  total,
  busyDelete,
  onEdit,
  onDelete
}: {
  role: JourneyRole;
  index: number;
  total: number;
  busyDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const last = total - 1;
  const isCurrent = role.current;
  const Icon = role.seat === null ? Award : Plane;
  const subtitle = subtitleFor(role);
  // Suppress a "0 days" label on same-day placeholder steps (e.g. a hire that was
  // immediately followed by a promotion).
  const dur = role.durationDays && role.durationDays > 0 ? duration(role.durationDays) : "";

  return (
    <li className="group relative flex w-[168px] shrink-0 flex-col items-center px-1">
      {/* Connector to the next node (behind the node) */}
      {index < last ? (
        <span className={clsx("absolute left-1/2 top-[19px] z-0 h-[3px] w-full -translate-y-1/2 rounded-full", segClass(last === 0 ? 1 : (index + 1) / last))} />
      ) : null}

      {/* Node */}
      <span
        className={clsx(
          "relative z-10 flex h-10 w-10 items-center justify-center rounded-full ring-4 ring-white transition dark:ring-brand-panel",
          isCurrent
            ? "bg-brand-lea text-brand-gold shadow-glow"
            : role.isUpgrade
              ? "bg-brand-gold/20 text-brand-gold ring-brand-gold/10"
              : "bg-brand-cloudDancer text-brand-eden dark:bg-white/10 dark:text-slate-300"
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>

      {/* Card */}
      <div className="mt-3 flex w-full flex-col items-center px-1 text-center">
        <p className="text-sm font-semibold leading-tight text-brand-lea dark:text-slate-100">{role.title}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">{subtitle}</p> : null}
        <div className="mt-2">
          <StepBadge role={role} />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-brand-grey dark:text-slate-400">{dateLine(role)}</p>
        {dur ? <p className="text-[11px] font-semibold text-brand-eden dark:text-slate-300">{dur}</p> : null}

        {/* Edit / delete — revealed on hover so the timeline stays clean */}
        <div className="mt-1.5 flex items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          <button
            onClick={onEdit}
            aria-label="Edit role"
            className="rounded p-1 text-brand-grey/60 transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={busyDelete}
            aria-label="Remove role"
            className="rounded p-1 text-brand-grey/60 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-red-500/15 dark:hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}
