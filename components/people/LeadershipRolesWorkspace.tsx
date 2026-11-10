"use client";

import Link from "next/link";
import { useState } from "react";
import { SupervisorPicker } from "@/components/people/SupervisorPicker";
import type { LeadershipRoleView } from "@/lib/people/leadership-role-keys";

// Who holds each leadership role. A supervisor slot that follows a role points
// at whoever is here, so changing a holder moves every follower at once.
export function LeadershipRolesWorkspace({ initialRoles, canEdit }: { initialRoles: LeadershipRoleView[]; canEdit: boolean }) {
  const [roles, setRoles] = useState(initialRoles);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function setHolder(role: LeadershipRoleView, holderHireId: string | null, holderName: string | null) {
    const verb = holderName ? `Give ${role.title} to ${holderName}` : `Leave ${role.title} vacant`;
    const who = role.followers === 1 ? "1 supervisor slot follows" : `${role.followers} supervisor slots follow`;
    if (!window.confirm(`${verb}?\n\n${who} this role and will point at ${holderName ?? "nobody"} from now on.`)) return;
    setBusy(role.key);
    setMessage(null);
    try {
      const res = await fetch("/api/leadership-roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: role.key, holderHireId })
      });
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        roles?: LeadershipRoleView[];
        result?: { repointed: number; selfCleared: string[] };
      } | null;
      if (!res.ok || !data?.roles) throw new Error(data?.message ?? "Could not save.");
      setRoles(data.roles);
      const self = data.result?.selfCleared.length
        ? ` ${data.result.selfCleared.join(", ")} no longer follows it — nobody reports to themselves.`
        : "";
      setMessage(`${role.title}: ${data.result?.repointed ?? 0} supervisor slots now point at ${holderName ?? "nobody"}.${self}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <div className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">People</div>
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Leadership roles</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
          Pilots report to the Chief Pilot, dotted-line to the Assistant Chief Pilot — whoever holds those today. When a role
          changes hands, change it here and every pilot who reports to it moves with it, including who the orientation emails
          go to. On a person&apos;s profile, choose <b>Report to a role</b> under Supervisor.
        </p>
      </div>

      {message ? (
        <div className="rounded border border-brand-lea/15 bg-white px-4 py-3 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((role) => (
          <div key={role.key} className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{role.title}</div>
            <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">
              {role.holder ? (
                <Link href={`/people/${role.holder.id}`} className="hover:text-brand-eden dark:hover:text-brand-sweet">
                  {role.holder.name}
                </Link>
              ) : (
                <span className="text-amber-700 dark:text-amber-300">Vacant</span>
              )}
            </div>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              {role.holder?.email ?? (role.holder ? "No email on their record" : "Followers have no supervisor in this slot until it is filled.")}
            </p>
            <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">
              {role.followers === 1 ? "1 person reports to this role." : `${role.followers} people report to this role.`}
            </p>
            {canEdit ? (
              <div className="mt-3">
                {busy === role.key ? (
                  <p className="text-xs text-brand-grey dark:text-slate-400">Saving…</p>
                ) : (
                  <SupervisorPicker
                    hireId=""
                    linkedId={null}
                    linkedName={null}
                    linkedEmail={null}
                    onLink={(p) => void setHolder(role, p.id, p.name)}
                    onUnlink={() => undefined}
                    linkLabel={role.holder ? "Change who holds it" : "Choose who holds it"}
                  />
                )}
                {role.holder && busy !== role.key ? (
                  <button
                    type="button"
                    onClick={() => void setHolder(role, null, null)}
                    className="mt-2 text-[11px] font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400"
                  >
                    Leave vacant
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
