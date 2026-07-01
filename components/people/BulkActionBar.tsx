"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

export type BulkPatch = { stage?: "ACTIVE" | "POST_ONBOARD" | "ARCHIVED"; orientationDate?: string | null; department?: string };

export async function bulkUpdateHires(ids: string[], patch: BulkPatch): Promise<{ ok: boolean; count?: number; message?: string }> {
  const res = await fetch("/api/new-hires/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, patch })
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; count?: number; message?: string } | null;
  if (!res.ok || !data?.ok) return { ok: false, message: data?.message ?? "Could not apply the change." };
  return { ok: true, count: data.count };
}

export async function bulkDeleteHires(ids: string[]): Promise<{ ok: boolean; count?: number; message?: string }> {
  const res = await fetch("/api/new-hires/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids })
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; count?: number; message?: string } | null;
  if (!res.ok || !data?.ok) return { ok: false, message: data?.message ?? "Could not delete." };
  return { ok: true, count: data.count };
}

export type BulkAction =
  | { kind: "patch"; key: string; label: string; icon: LucideIcon; patch: BulkPatch; confirm?: boolean; tone?: "primary" | "default" | "danger" }
  | { kind: "date"; key: string; label: string; icon: LucideIcon } // sets orientationDate
  | { kind: "text"; key: string; label: string; icon: LucideIcon; placeholder: string } // sets department
  | { kind: "delete"; key: string; label: string; icon: LucideIcon }; // permanent delete

type Props = {
  count: number;
  actions: BulkAction[];
  onApply: (patch: BulkPatch) => Promise<void> | void;
  onClear: () => void;
  onDelete?: () => Promise<void> | void;
  busy?: boolean;
};

export function BulkActionBar({ count, actions, onApply, onClear, onDelete, busy }: Props) {
  const [openInput, setOpenInput] = useState<BulkAction | null>(null);
  const [value, setValue] = useState("");

  if (count === 0) return null;

  async function runPatch(action: Extract<BulkAction, { kind: "patch" }>) {
    if (action.confirm && !window.confirm(`${action.label} ${count} ${count === 1 ? "person" : "people"}?`)) return;
    await onApply(action.patch);
  }

  async function runDelete() {
    const noun = count === 1 ? "person" : "people";
    const ok = window.confirm(
      `Permanently delete ${count} ${noun} from onboarding?\n\nThis erases their record and all their onboarding data. It cannot be undone.`
    );
    if (!ok) return;
    await onDelete?.();
  }

  async function applyInput() {
    if (!openInput) return;
    if (openInput.kind === "date") await onApply({ orientationDate: value || null });
    if (openInput.kind === "text") {
      if (!value.trim()) return;
      await onApply({ department: value.trim() });
    }
    setOpenInput(null);
    setValue("");
  }

  return (
    <div className="sticky top-0 z-40 mb-3 flex flex-wrap items-center gap-2 rounded border border-brand-eden/30 bg-brand-eden/10 px-3 py-2 dark:border-white/15 dark:bg-white/10">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-lea dark:text-slate-100">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-lea px-1.5 text-[11px] font-bold text-white">{count}</span>
        selected
      </span>

      {openInput ? (
        <div className="flex flex-wrap items-center gap-2">
          {openInput.kind === "date" ? (
            <input
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="rounded border border-brand-lea/20 px-2 py-1 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={openInput.kind === "text" ? openInput.placeholder : ""}
              autoFocus
              className="rounded border border-brand-lea/20 px-2 py-1 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            />
          )}
          <button onClick={applyInput} disabled={busy} className="rounded bg-brand-lea px-3 py-1 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
            {busy ? "Applying…" : "Apply"}
          </button>
          <button onClick={() => { setOpenInput(null); setValue(""); }} className="rounded px-2 py-1 text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.key}
                disabled={busy}
                onClick={() => {
                  if (a.kind === "patch") runPatch(a);
                  else if (a.kind === "delete") runDelete();
                  else {
                    setOpenInput(a);
                    setValue("");
                  }
                }}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60",
                  a.kind === "patch" && a.tone === "primary"
                    ? "bg-brand-lea text-white hover:bg-brand-eden"
                    : (a.kind === "patch" && a.tone === "danger") || a.kind === "delete"
                      ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      : "border border-brand-lea/20 text-brand-lea hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
                )}
              >
                <Icon className="h-4 w-4" />
                {a.label}
              </button>
            );
          })}
          <button onClick={onClear} className="rounded px-2 py-1.5 text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
