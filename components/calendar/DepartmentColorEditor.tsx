"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Check } from "lucide-react";
import {
  COLOR_PALETTE,
  PALETTE_ORDER,
  COLORABLE_DEPARTMENTS,
  DEFAULT_DEPARTMENT_COLORS,
  DEPARTMENT_LABELS,
  type ColorMeta,
  type ColorName,
  type DeptKey
} from "@/lib/calendar/departments";

/** Reverse-map a department's current classes back to a palette name for preselection. */
function colorNameFromMeta(meta: ColorMeta | undefined, fallback: ColorName): ColorName {
  if (!meta) return fallback;
  return PALETTE_ORDER.find((name) => COLOR_PALETTE[name].dot === meta.dot) ?? fallback;
}

export function DepartmentColorEditor({
  colors,
  onClose
}: {
  colors: Record<DeptKey, ColorMeta>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, ColorName>>(() => {
    const initial: Record<string, ColorName> = {};
    for (const dept of COLORABLE_DEPARTMENTS) {
      initial[dept] = colorNameFromMeta(colors[dept], DEFAULT_DEPARTMENT_COLORS[dept]);
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace-settings/department-colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Could not save colors.");
      }
      router.refresh();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save colors.");
      setSaving(false);
    }
  }

  function reset() {
    const defaults: Record<string, ColorName> = {};
    for (const dept of COLORABLE_DEPARTMENTS) defaults[dept] = DEFAULT_DEPARTMENT_COLORS[dept];
    setSelection(defaults);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Calendar</p>
            <h2 className="text-lg font-semibold text-brand-lea">Department colors</h2>
            <p className="mt-1 text-xs text-brand-grey">Pick a color for each department. Used to color interviews across every calendar view.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {COLORABLE_DEPARTMENTS.map((dept) => (
            <div key={dept}>
              <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-brand-lea">
                <span className={`h-3.5 w-3.5 rounded ${COLOR_PALETTE[selection[dept]].dot}`} />
                {DEPARTMENT_LABELS[dept]}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PALETTE_ORDER.map((name) => {
                  const active = selection[dept] === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      title={COLOR_PALETTE[name].label}
                      onClick={() => setSelection((current) => ({ ...current, [dept]: name }))}
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${COLOR_PALETTE[name].swatch} transition ${
                        active ? "ring-2 ring-brand-lea ring-offset-2" : "hover:scale-110"
                      }`}
                    >
                      {active ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={reset} className="text-xs font-semibold text-brand-eden hover:text-brand-lea">
            Reset to defaults
          </button>
          <div className="flex items-center gap-3">
            {error ? <span className="text-xs font-medium text-red-700">{error}</span> : null}
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save colors"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
