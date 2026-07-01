"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Plane, Plus, Pencil, Trash2, X } from "lucide-react";
import {
  addManagedVariant,
  updateManagedVariant,
  deleteManagedVariant,
  type ManagedVariantInput
} from "@/app/pilot-requirements/scoring-actions";
import type { ManagedVariantView } from "@/lib/data/pilot-requirements";
import { Button } from "@/components/ui";

type Props = {
  requirementId: string;
  variants: ManagedVariantView[];
  canEdit: boolean;
};

const EMPTY: ManagedVariantInput = {
  tailNumber: "",
  name: "",
  baseCity: "",
  baseState: "",
  baseAirport: "",
  payScaleRaw: "",
  scheduleSummary: "",
  notes: ""
};

function baseLine(v: ManagedVariantView): string {
  const loc = [v.baseCity, v.baseState].filter(Boolean).join(", ");
  return [v.baseAirport, loc].filter(Boolean).join(" · ");
}

export function ManagedAircraftPanel({ requirementId, variants, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "add" | string>("none"); // "add" | variantId | "none"
  const [draft, setDraft] = useState<ManagedVariantInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function openAdd() {
    setError(null);
    setDraft(EMPTY);
    setMode("add");
  }

  function openEdit(v: ManagedVariantView) {
    setError(null);
    setDraft({
      tailNumber: v.tailNumber,
      name: v.name ?? "",
      baseCity: v.baseCity ?? "",
      baseState: v.baseState ?? "",
      baseAirport: v.baseAirport ?? "",
      payScaleRaw: v.payScaleRaw ?? "",
      scheduleSummary: v.scheduleSummary ?? "",
      notes: v.notes ?? ""
    });
    setMode(v.id);
  }

  function cancel() {
    setMode("none");
    setError(null);
  }

  function save() {
    if (!draft.tailNumber.trim()) {
      setError("A tail number is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = mode === "add" ? await addManagedVariant(requirementId, draft) : await updateManagedVariant(mode, draft);
      if (res.ok) {
        setMode("none");
        router.refresh();
      } else {
        setError(res.error ?? "Could not save.");
      }
    });
  }

  function remove(variantId: string) {
    startTransition(async () => {
      const res = await deleteManagedVariant(variantId);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Could not remove.");
    });
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Managed aircraft</p>
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">
            Tails flown under this role
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-brand-cloudDancer px-3 py-1 text-xs font-semibold text-brand-eden dark:bg-white/5">
            {variants.length} {variants.length === 1 ? "aircraft" : "aircraft"}
          </span>
          {canEdit && mode === "none" ? (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" /> Add aircraft
            </Button>
          ) : null}
        </div>
      </div>

      <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
        The role&apos;s hiring requirements are shared. Each managed aircraft only carries its own tail number, base,
        pay, and schedule.
      </p>

      {error ? (
        <p className="mt-3 rounded-element bg-value-customerFocus-light px-3 py-2 text-sm text-value-customerFocus-dark">
          {error}
        </p>
      ) : null}

      {mode === "add" ? <VariantForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} pending={pending} /> : null}

      <div className="mt-4 space-y-2">
        {variants.length === 0 && mode !== "add" ? (
          <div className="rounded border border-dashed border-brand-lea/20 bg-brand-cloudDancer/30 p-4 text-center text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            <Plane className="mx-auto mb-1 h-4 w-4 opacity-60" />
            No managed aircraft yet{canEdit ? " — add a tail number to track one." : "."}
          </div>
        ) : null}

        {variants.map((v) =>
          mode === v.id ? (
            <VariantForm key={v.id} draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} pending={pending} />
          ) : (
            <div
              key={v.id}
              className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 transition hover:shadow-glow dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 font-mono text-sm font-bold text-brand-lea dark:text-slate-100">
                      {v.tailNumber}
                    </span>
                    {v.name ? <span className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{v.name}</span> : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-grey dark:text-slate-400">
                    {baseLine(v) ? <span>📍 {baseLine(v)}</span> : null}
                    {v.payScaleRaw ? <span>💵 {v.payScaleRaw}</span> : null}
                    {v.scheduleSummary ? <span>🗓 {v.scheduleSummary}</span> : null}
                  </div>
                  {v.notes ? <p className="mt-1.5 text-xs text-brand-black/70 dark:text-slate-300">{v.notes}</p> : null}
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(v)}
                      className="rounded-element border border-brand-lea/15 p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer hover:shadow-glow dark:border-white/10 dark:text-slate-400"
                      aria-label={`Edit ${v.tailNumber}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(v.id)}
                      disabled={pending}
                      className="rounded-element border border-brand-lea/15 p-1.5 text-value-customerFocus-dark transition hover:bg-value-customerFocus-light disabled:opacity-50 dark:border-white/10"
                      aria-label={`Remove ${v.tailNumber}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-element border-[0.5px] border-brand-lea/20 px-2.5 py-1.5 text-sm outline-none focus:border-brand-gold dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      />
    </label>
  );
}

function VariantForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending
}: {
  draft: ManagedVariantInput;
  setDraft: (d: ManagedVariantInput) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const set = (patch: Partial<ManagedVariantInput>) => setDraft({ ...draft, ...patch });
  return (
    <div className="mt-3 rounded border border-brand-gold/40 bg-brand-gold/5 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tail number *" value={draft.tailNumber} onChange={(v) => set({ tailNumber: v })} placeholder="N450JF" />
        <Field label="Aircraft name / owner" value={draft.name ?? ""} onChange={(v) => set({ name: v })} placeholder="optional" />
        <Field label="Base airport" value={draft.baseAirport ?? ""} onChange={(v) => set({ baseAirport: v })} placeholder="SLC" />
        <div className="grid grid-cols-[1fr_84px] gap-2">
          <Field label="Base city" value={draft.baseCity ?? ""} onChange={(v) => set({ baseCity: v })} />
          <Field label="State" value={draft.baseState ?? ""} onChange={(v) => set({ baseState: v })} />
        </div>
        <Field label="Pay" value={draft.payScaleRaw ?? ""} onChange={(v) => set({ payScaleRaw: v })} placeholder="$150,000 annually" />
        <Field label="Schedule" value={draft.scheduleSummary ?? ""} onChange={(v) => set({ scheduleSummary: v })} placeholder="e.g. 8 on / 6 off" />
        <Field label="Notes" value={draft.notes ?? ""} onChange={(v) => set({ notes: v })} className="sm:col-span-2" />
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-element border border-brand-lea/15 px-3 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer dark:border-white/10 dark:text-slate-400"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded-element bg-brand-lea px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save aircraft"}
        </button>
      </div>
    </div>
  );
}
