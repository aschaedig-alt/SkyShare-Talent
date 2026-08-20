"use client";

import { useState } from "react";
import { useDialogClose } from "@/lib/hooks/useDialogClose";
import { CandidateAccessPicker, type PickedCandidate } from "@/components/settings/CandidateAccessPicker";
import { ModuleAccessToggles } from "@/components/settings/ModuleAccessToggles";
import { SCOPING_DEPARTMENTS } from "@/lib/auth/scoping-options";
import type { UserModuleOverrides } from "@/lib/auth/user-module-access";

// One modal for both jobs, because they configure exactly the same thing:
//   "invite"  — somebody with no account yet. Saves a UserInvite, applied on their
//               first sign-in. See lib/auth/invites.ts for why the User row cannot
//               simply be created here.
//   "edit"    — somebody who already signed in. Patches their User row directly.

export type AccessDraft = {
  email: string;
  name: string;
  role: string;
  department: string | null;
  restrictCandidatesToAllowlist: boolean;
  allowlistCanAnnotate: boolean;
  moduleOverrides: UserModuleOverrides | null;
  candidates: PickedCandidate[];
};

type TeamMemberAccessModalProps = {
  mode: "invite" | "edit";
  initial: AccessDraft;
  // Only used in edit mode, to diff the candidate list into add/remove.
  originalCandidateIds?: string[];
  userId?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const INVITABLE_ROLES = [
  { value: "HIRING_MANAGER", label: "Hiring manager" },
  { value: "RECRUITER", label: "Recruiter" },
  { value: "VIEWER", label: "Viewer" }
];

export function TeamMemberAccessModal({
  mode,
  initial,
  originalCandidateIds = [],
  userId,
  onClose,
  onSaved
}: TeamMemberAccessModalProps) {
  const [draft, setDraft] = useState<AccessDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The invite route answers 409 with needsConfirmation when the address already
  // belongs to somebody - saving would replace their role and access. The modal
  // cannot know that until it asks, so the first attempt comes back describing the
  // account and the admin decides whether to go on.
  const [confirmOverwrite, setConfirmOverwrite] = useState<string | null>(null);

  useDialogClose(() => {
    if (!saving) onClose();
  }, true);

  function patch(next: Partial<AccessDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function save(confirmExisting = false) {
    setSaving(true);
    setError(null);
    try {
      if (mode === "invite") {
        const res = await fetch("/api/admin/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: draft.email,
            name: draft.name || null,
            role: draft.role,
            department: draft.department,
            restrictCandidatesToAllowlist: draft.restrictCandidatesToAllowlist,
            allowlistCanAnnotate: draft.allowlistCanAnnotate,
            moduleOverrides: draft.moduleOverrides,
            candidateIds: draft.candidates.map((c) => c.id),
            confirmExisting
          })
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          needsConfirmation?: boolean;
        };
        if (res.status === 409 && data.needsConfirmation) {
          setConfirmOverwrite(data.message ?? "That address already has an account.");
          setSaving(false);
          return;
        }
        if (!res.ok) throw new Error(data.message ?? "Could not save the invite.");
        onSaved(data.message ?? "Invite saved.");
      } else {
        const picked = new Set(draft.candidates.map((c) => c.id));
        const originals = new Set(originalCandidateIds);
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            department: draft.department,
            restrictCandidatesToAllowlist: draft.restrictCandidatesToAllowlist,
            allowlistCanAnnotate: draft.allowlistCanAnnotate,
            moduleOverrides: draft.moduleOverrides,
            // Sent as a diff rather than the whole list, so two admins editing the
            // same person cannot silently revoke each other's grants.
            addCandidateIds: [...picked].filter((id) => !originals.has(id)),
            removeCandidateIds: [...originals].filter((id) => !picked.has(id))
          })
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) throw new Error(data.message ?? "Could not save the changes.");
        onSaved("Access updated.");
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim());
  const canSave = mode === "edit" || emailValid;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded bg-white p-5 shadow-xl dark:bg-brand-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
          {mode === "invite" ? "Add a team member" : "Access"}
        </p>
        <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">
          {mode === "invite" ? "Give somebody access" : draft.email || draft.name}
        </h2>

        {mode === "invite" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
                Work email
              </span>
              <input
                autoFocus
                value={draft.email}
                onChange={(e) => patch({ email: e.target.value })}
                placeholder="name@skyshare.com"
                className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
                Name (optional)
              </span>
              <input
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
                Role
              </span>
              <select
                value={draft.role}
                onChange={(e) => patch({ role: e.target.value })}
                className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
              >
                {INVITABLE_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
                Department (optional)
              </span>
              <select
                value={draft.department ?? ""}
                onChange={(e) => patch({ department: e.target.value || null })}
                className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
              >
                <option value="">No department set</option>
                {SCOPING_DEPARTMENTS.map((dept) => (
                  <option key={dept.value} value={dept.value}>
                    {dept.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {mode === "invite" && (
          <p className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/30 px-3 py-2 text-xs leading-5 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            They sign in with Google themselves — there is no password to set and nothing is emailed from here. Everything
            you choose below is applied automatically the first time they sign in. Their address has to be on an allowed
            sign-in domain; you will be told if it is not.
          </p>
        )}

        <div className="mt-4 space-y-4 border-t border-brand-lea/10 pt-4 dark:border-white/10">
          {/* The candidate allowlist is INERT for a recruiter: resolveViewerScope
              short-circuits ADMIN and RECRUITER to an unrestricted scope before it
              reads any of these fields. Showing the control would promise a
              restriction that silently does nothing. The module toggles below are
              NOT inert for a recruiter, so they stay visible. */}
          {draft.role === "RECRUITER" ? (
            <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 px-3 py-2 text-xs leading-5 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
              A recruiter always sees every candidate — the per-candidate restriction does not apply to that role. Pick
              Hiring manager or Viewer if you need to limit which candidates they can open.
            </p>
          ) : (
            <>
              <label className="flex items-start gap-2 text-xs text-brand-grey dark:text-slate-400">
            <input
              type="checkbox"
              checked={draft.restrictCandidatesToAllowlist}
              onChange={(e) =>
                patch({
                  restrictCandidatesToAllowlist: e.target.checked,
                  allowlistCanAnnotate: e.target.checked ? draft.allowlistCanAnnotate : false
                })
              }
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold text-brand-lea dark:text-slate-100">
                Only let them see specific candidates
              </span>
              <span className="mt-0.5 block">
                They see just the people picked below, along with those people&apos;s history, files and interviews.
                Everything else on the candidate side is hidden — including search, saved views, and opening a profile by
                pasting its link.
              </span>
            </span>
          </label>

          {draft.restrictCandidatesToAllowlist && (
            <div className="space-y-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
              <CandidateAccessPicker
                value={draft.candidates}
                onChange={(candidates) => patch({ candidates })}
                disabled={saving}
              />
              <label className="flex items-start gap-2 text-xs text-brand-grey dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={draft.allowlistCanAnnotate}
                  onChange={(e) => patch({ allowlistCanAnnotate: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold text-brand-lea dark:text-slate-100">
                    Let them add interview notes and scorecards
                  </span>
                  <span className="mt-0.5 block">
                    On these candidates only. They still cannot edit the candidate record, its tags, its stage or its
                    files, and they can only change write-ups they wrote themselves.
                  </span>
                </span>
              </label>
            </div>
              )}
            </>
          )}

          <ModuleAccessToggles
            value={draft.moduleOverrides}
            onChange={(moduleOverrides) => patch({ moduleOverrides })}
            disabled={saving}
          />
        </div>

        {error && (
          <p className="mt-3 rounded border border-red-500/30 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </p>
        )}

        {mode === "invite" && draft.email.trim() && !emailValid && (
          <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">That does not look like an email address.</p>
        )}

        {confirmOverwrite && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
            <p className="font-semibold">This address already has an account</p>
            <p className="mt-1 text-xs leading-5">{confirmOverwrite}</p>
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="mt-2 rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? "Replacing…" : "Replace their access"}
            </button>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            data-dialog-close
            onClick={onClose}
            disabled={saving}
            className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={() => save()}
            disabled={saving || !canSave || Boolean(confirmOverwrite)}
            className="rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-40"
          >
            {saving ? "Saving…" : mode === "invite" ? "Add team member" : "Save access"}
          </button>
        </div>
      </div>
    </div>
  );
}
