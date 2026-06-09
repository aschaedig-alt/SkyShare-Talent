"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RoleName } from "@/lib/auth/roles";
import {
  accessLevels,
  navigationGroups,
  getModuleAccessRule,
  type AccessLevel,
  type ModuleAccessPolicy,
  type ModuleId
} from "@/lib/navigation/modules";

type ModuleVisibilityAccessPanelProps = {
  policy: ModuleAccessPolicy;
};

const roles: RoleName[] = ["ADMIN", "RECRUITER", "VIEWER", "PUBLISHER"];

function clonePolicy(policy: ModuleAccessPolicy) {
  return JSON.parse(JSON.stringify(policy)) as ModuleAccessPolicy;
}

export function ModuleVisibilityAccessPanel({ policy: initialPolicy }: ModuleVisibilityAccessPanelProps) {
  const router = useRouter();
  const [policy, setPolicy] = useState<ModuleAccessPolicy>(() => clonePolicy(initialPolicy));
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = navigationGroups.flatMap((group) =>
    group.items.map((item) => ({
      group: group.label,
      id: item.id,
      label: item.label
    }))
  );

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
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Access control</p>
          <h2 className="text-base font-semibold text-brand-lea">Module Visibility &amp; Access</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-brand-grey">
            Use the existing sidebar modules as the registry. Hidden blocks direct access, view-only keeps the page
            open but mutes obvious write controls, and full access behaves normally.
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
        <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/50 px-3 py-2 text-sm text-brand-grey">
          {status}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">
              <th className="sticky left-0 z-10 bg-white px-3 py-2">Module</th>
              {roles.flatMap((role) => [
                <th key={`${role}-sidebar`} className="whitespace-nowrap px-3 py-2">
                  {role} Sidebar
                </th>,
                <th key={`${role}-access`} className="whitespace-nowrap px-3 py-2">
                  {role} Access
                </th>
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-brand-lea/10">
                <td className="sticky left-0 z-10 bg-white px-3 py-3 align-top">
                  <div className="font-semibold text-brand-lea">{row.label}</div>
                  <div className="text-xs text-brand-grey">{row.group}</div>
                  {row.id === "settings" ? (
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold">
                      Fixed access for Settings
                    </div>
                  ) : null}
                </td>

                {roles.flatMap((role) => {
                  const rule = getModuleAccessRule(policy, row.id, role);
                  const locked = row.id === "settings";

                  return [
                    <td key={`${row.id}-${role}-sidebar`} className="px-3 py-3 align-top">
                      <label className="inline-flex items-center gap-2 text-sm text-brand-lea">
                        <input
                          type="checkbox"
                          checked={rule.showInSidebar}
                          disabled={locked}
                          onChange={(event) =>
                            updateRule(row.id, role, {
                              showInSidebar: event.target.checked
                            })
                          }
                        />
                        <span>{rule.showInSidebar ? "Shown" : "Hidden"}</span>
                      </label>
                    </td>,
                    <td key={`${row.id}-${role}-access`} className="px-3 py-3 align-top">
                      <select
                        value={rule.accessLevel}
                        disabled={locked}
                        onChange={(event) =>
                          updateRule(row.id, role, {
                            accessLevel: event.target.value as (typeof accessLevels)[number],
                            showInSidebar: event.target.value === "HIDDEN" ? false : rule.showInSidebar
                          })
                        }
                        className="min-w-36 rounded border border-brand-lea/15 bg-white px-2 py-2 text-sm text-brand-lea"
                      >
                        {accessLevels.map((option) => (
                          <option key={option} value={option}>
                            {option === "HIDDEN" ? "Hidden" : option === "VIEW_ONLY" ? "View Only" : "Full Access"}
                          </option>
                        ))}
                      </select>
                    </td>
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
