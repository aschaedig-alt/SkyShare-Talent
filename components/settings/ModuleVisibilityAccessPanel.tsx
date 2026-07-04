"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { clsx } from "clsx";
import type { RoleName } from "@/lib/auth/roles";
import {
  navigationGroups,
  getModuleAccessRule,
  type AccessLevel,
  type ModuleAccessPolicy,
  type ModuleId
} from "@/lib/navigation/modules";

type ModuleVisibilityAccessPanelProps = {
  policy: ModuleAccessPolicy;
};

const roles: RoleName[] = ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"];

const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: "Admin",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring mgr",
  VIEWER: "Viewer"
};

type Access3 = "FULL" | "VIEW" | "HIDDEN";

function ruleToAccess3(accessLevel: AccessLevel): Access3 {
  if (accessLevel === "FULL_ACCESS") return "FULL";
  if (accessLevel === "VIEW_ONLY") return "VIEW";
  return "HIDDEN";
}

const access3Styles: Record<Access3, string> = {
  FULL: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  VIEW: "border-brand-gold/40 bg-brand-gold/15 text-brand-lea dark:text-slate-100",
  HIDDEN: "border-brand-lea/15 bg-brand-cloudDancer text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
};

// One fixed-width control per cell so every pill lines up regardless of label length.
function AccessSelect({
  value,
  disabled,
  onChange
}: {
  value: Access3;
  disabled?: boolean;
  onChange: (value: Access3) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as Access3)}
      className={clsx(
        "w-[92px] rounded border px-2 py-1 text-xs font-semibold outline-none transition",
        access3Styles[value],
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
      )}
    >
      <option value="FULL">Full</option>
      <option value="VIEW">View</option>
      <option value="HIDDEN">Hidden</option>
    </select>
  );
}

function clonePolicy(policy: ModuleAccessPolicy) {
  return JSON.parse(JSON.stringify(policy)) as ModuleAccessPolicy;
}

// A few modules power several nav items (People → Pre-onboarding, Employees, Travel…;
// Settings → all sub-pages). The access table has one row per module, so label that
// row by the module itself rather than whichever nav item happens to come first.
const MODULE_ROW_LABEL: Partial<Record<ModuleId, string>> = {
  settings: "Settings",
  people: "People"
};

export function ModuleVisibilityAccessPanel({ policy: initialPolicy }: ModuleVisibilityAccessPanelProps) {
  const router = useRouter();
  const [policy, setPolicy] = useState<ModuleAccessPolicy>(() => clonePolicy(initialPolicy));
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Several nav items can map to the same module (e.g. the Settings sub-pages all use
  // the "settings" module). The access table is per-module, so show each module once.
  const seenModules = new Set<ModuleId>();
  const rows = navigationGroups.flatMap((group) =>
    group.sections.flatMap((section) =>
      section.items
        .filter((item) => {
          if (seenModules.has(item.id)) {
            return false;
          }
          seenModules.add(item.id);
          return true;
        })
        .map((item) => ({
          group: section.label === group.label ? group.label : `${group.label} › ${section.label}`,
          id: item.id,
          label: MODULE_ROW_LABEL[item.id] ?? item.label
        }))
    )
  );

  // Preserve domain order from the nav registry and group rows under their domain.
  const groupedRows: Array<{ group: string; items: typeof rows }> = [];
  for (const row of rows) {
    const last = groupedRows[groupedRows.length - 1];
    if (last && last.group === row.group) {
      last.items.push(row);
    } else {
      groupedRows.push({ group: row.group, items: [row] });
    }
  }

  function setAccess3(moduleId: ModuleId, role: RoleName, value: Access3) {
    if (value === "HIDDEN") {
      updateRule(moduleId, role, { accessLevel: "HIDDEN", showInSidebar: false });
    } else {
      updateRule(moduleId, role, {
        accessLevel: value === "VIEW" ? "VIEW_ONLY" : "FULL_ACCESS",
        showInSidebar: true
      });
    }
  }

  function updateRule(moduleId: ModuleId, role: RoleName, patch: Partial<{ showInSidebar: boolean; accessLevel: AccessLevel }>) {
    setPolicy((current) => ({
      ...current,
      [moduleId]: {
        ...current[moduleId],
        [role]: {
          ...current[moduleId][role],
          ...patch
        }
      }
    }));
  }

  async function savePolicy() {
    setSaving(true);
    setStatus(null);

    try {
      const response = await fetch("/api/workspace-settings/module-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ policy })
      });

      const payload = (await response.json().catch(() => null)) as { policy?: ModuleAccessPolicy; message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to save module access policy.");
      }

      if (payload?.policy) {
        setPolicy(clonePolicy(payload.policy));
      }

      setStatus("Saved module visibility and access policy.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save module access policy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Access control</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Module Visibility &amp; Access</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-grey dark:text-slate-400">
            One control per role: <span className="font-semibold text-brand-lea dark:text-slate-100">Hidden</span> blocks the page and hides
            it from the sidebar, <span className="font-semibold text-brand-lea dark:text-slate-100">View</span> opens it but mutes write
            controls, and <span className="font-semibold text-brand-lea dark:text-slate-100">Full</span> behaves normally. New pages appear
            here automatically.
          </p>
        </div>

        <button
          type="button"
          onClick={savePolicy}
          disabled={saving}
          className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save policy"}
        </button>
      </div>

      {status ? (
        <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/50 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          {status}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded border border-brand-lea/10 dark:border-white/10">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col style={{ width: "32%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "17%" }} />
          </colgroup>
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
              <th className="px-3 py-2.5">Module</th>
              {roles.map((role) => (
                <th key={role} className="px-2 py-2.5 text-center">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((group) => (
              <Fragment key={group.group}>
                <tr>
                  <td
                    colSpan={5}
                    className="bg-brand-cloudDancer/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-lea dark:bg-white/5 dark:text-slate-100"
                  >
                    {group.group}
                  </td>
                </tr>
                {group.items.map((row) => {
                  const locked = row.id === "settings";
                  return (
                    <tr key={row.id} className="border-t border-brand-lea/8 dark:border-white/10">
                      <td className="px-3 py-2 align-middle">
                        <span className="text-sm font-medium text-brand-lea dark:text-slate-100">{row.label}</span>
                        {locked ? (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-gold">
                            Locked
                          </span>
                        ) : null}
                      </td>
                      {roles.map((role) => {
                        const rule = getModuleAccessRule(policy, row.id, role);
                        return (
                          <td key={role} className="px-2 py-1.5 text-center">
                            <AccessSelect
                              value={ruleToAccess3(rule.accessLevel)}
                              disabled={locked}
                              onChange={(value) => setAccess3(row.id, role, value)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
