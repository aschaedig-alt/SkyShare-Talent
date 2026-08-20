"use client";

import { MODULE_LABELS, TOGGLEABLE_MODULES } from "@/lib/auth/scoping-options";
import type { ModuleId } from "@/lib/navigation/modules";
import { candidatesOnlyOverrides, type UserModuleOverrides } from "@/lib/auth/user-module-access";

type ModuleAccessTogglesProps = {
  // null means "follow the role policy" — the state every existing account is in.
  value: UserModuleOverrides | null;
  onChange: (next: UserModuleOverrides | null) => void;
  disabled?: boolean;
};

// Per-user module switches, layered over the workspace Module Visibility policy.
//
// The workspace policy is per-ROLE, so narrowing it to contain one person
// narrows it for everyone sharing that role. These switches apply to ONE account.
//
// Two states matter and the UI has to keep them distinct: OFF the whole panel
// (value === null) means the account simply follows its role, which is what every
// existing user does. ON means the listed modules are decided here instead.
export function ModuleAccessToggles({ value, onChange, disabled = false }: ModuleAccessTogglesProps) {
  const custom = value !== null;

  function enableCustom() {
    // Start from "everything off except Candidates" rather than from the role policy.
    // That is the shape this feature exists for, and starting from a copy of the role
    // policy would look identical to doing nothing while quietly freezing the account
    // against future policy changes. Shared with the server rather than rebuilt here.
    onChange(candidatesOnlyOverrides());
  }

  function toggle(moduleId: ModuleId, on: boolean) {
    if (!value) return;
    const existing = value[moduleId];
    onChange({
      ...value,
      [moduleId]: on
        ? // Preserve a higher level if one was already stored, so turning a module
          // off and back on does not silently demote an EDIT grant to view-only.
          {
            accessLevel: existing && existing.accessLevel !== "HIDDEN" ? existing.accessLevel : "VIEW_ONLY",
            showInSidebar: true
          }
        : { accessLevel: "HIDDEN", showInSidebar: false }
    });
  }

  const onCount = value ? TOGGLEABLE_MODULES.filter((m) => value[m] && value[m]!.accessLevel !== "HIDDEN").length : 0;

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-xs text-brand-grey dark:text-slate-400">
        <input
          type="checkbox"
          checked={custom}
          disabled={disabled}
          onChange={(e) => (e.target.checked ? enableCustom() : onChange(null))}
          className="mt-0.5"
        />
        <span>
          <span className="font-semibold text-brand-lea dark:text-slate-100">
            Choose which areas this person can open
          </span>
          <span className="mt-0.5 block">
            Off, they see whatever their role sees. On, only the areas ticked below — for this account only, without
            changing anybody else with the same role.
          </span>
        </span>
      </label>

      {custom && (
        <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
              {onCount} of {TOGGLEABLE_MODULES.length} areas on
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next: UserModuleOverrides = {};
                  for (const moduleId of TOGGLEABLE_MODULES) {
                    next[moduleId] = { accessLevel: "HIDDEN", showInSidebar: false };
                  }
                  onChange(next);
                }}
                className="rounded border border-brand-lea/20 px-2 py-0.5 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-gold/10 disabled:opacity-50 dark:border-white/10 dark:text-slate-100"
              >
                Turn all off
              </button>
            </div>
          </div>

          <div className="grid gap-1 sm:grid-cols-2">
            {TOGGLEABLE_MODULES.map((moduleId) => {
              const rule = value?.[moduleId];
              const on = Boolean(rule && rule.accessLevel !== "HIDDEN");
              return (
                <label key={moduleId} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-brand-lea transition hover:bg-brand-gold/10 dark:text-slate-200">
                  <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => toggle(moduleId, e.target.checked)} />
                  {MODULE_LABELS[moduleId]}
                </label>
              );
            })}
          </div>

          <p className="mt-2 text-[11px] leading-4 text-brand-grey dark:text-slate-400">
            Settings is not listed — it stays admin-only and cannot be granted here. Turning an area off hides its pages
            AND refuses its API routes for this account, so a saved link will not get round it.
          </p>
        </div>
      )}
    </div>
  );
}
