"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VALID_ROLES, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { useDialogClose } from "@/lib/hooks/useDialogClose";
import { TeamMemberAccessModal, type AccessDraft } from "@/components/settings/TeamMemberAccessModal";
import { SCOPING_DEPARTMENTS } from "@/lib/auth/scoping-options";
import type { UserModuleOverrides } from "@/lib/auth/user-module-access";

type AllowedCandidate = { id: string; displayName: string };

interface UserWithPermissions {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  department: string | null;
  isExecutive: boolean;
  restrictCandidatesToDepartment: boolean;
  restrictCandidatesToAllowlist: boolean;
  allowlistCanAnnotate: boolean;
  moduleOverrides: UserModuleOverrides | null;
  allowedCandidates: AllowedCandidate[];
  permissions: Array<{ id: string; userId: string; permission: string }>;
  accounts: Array<{ id: string }>;
}

interface PendingInvite {
  id: string;
  email: string;
  name: string | null;
  role: string;
  department: string | null;
  restrictCandidatesToAllowlist: boolean;
  allowlistCanAnnotate: boolean;
  moduleOverrides: UserModuleOverrides | null;
  candidates: AllowedCandidate[];
  createdAt: string;
}

// Only these two roles are actually narrowed. resolveViewerScope short-circuits
// ADMIN and RECRUITER to an unrestricted scope before it reads any of these
// fields, so offering the controls for them would be a switch that does nothing.
const SCOPABLE_ROLES = ["HIRING_MANAGER", "VIEWER"];

interface UsersManagementWorkspaceProps {
  users: UserWithPermissions[];
  currentUserId?: string | null;
  blockedEmails?: string[];
  pendingInvites?: PendingInvite[];
}

export function UsersManagementWorkspace({
  users: initialUsers,
  currentUserId = null,
  blockedEmails = [],
  pendingInvites = []
}: UsersManagementWorkspaceProps) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [blocked, setBlocked] = useState<string[]>(blockedEmails);
  const [invites, setInvites] = useState<PendingInvite[]>(pendingInvites);
  // Which modal is open: the invite form, or one existing person's access.
  const [inviting, setInviting] = useState(false);
  const [editingAccess, setEditingAccess] = useState<UserWithPermissions | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  // Remove-access confirm flow: the user being removed + the typed-email guard.
  const [removing, setRemoving] = useState<UserWithPermissions | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  // Escape closes the remove-access modal (unless mid-save), matching its
  // click-outside behavior below.
  useDialogClose(() => { if (!saving) setRemoving(null); }, Boolean(removing));

  const flash = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    // Long enough to read a two-line explanation, not just to notice a tick. The
    // invite route returns real instructions here (an address that cannot sign in
    // yet, an account that was replaced) and three seconds is not enough for them.
    setTimeout(() => setMessage(null), text.length > 80 ? 12000 : 3000);
  };

  const removeAccess = async () => {
    if (!removing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${removing.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to remove access");
      setUsers(users.filter((u) => u.id !== removing.id));
      if (removing.email) setBlocked((b) => [...new Set([...b, removing.email!.toLowerCase()])]);
      flash("success", "Access removed.");
      setRemoving(null);
      setConfirmEmail("");
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "Failed to remove access");
    } finally {
      setSaving(false);
    }
  };

  // The modal writes straight to the API, so the page is refreshed from the
  // server afterwards rather than trying to reconstruct the new state by hand -
  // an invite can land as EITHER a stored invite or an immediate change to an
  // existing account, and guessing which locally would eventually be wrong.
  const afterAccessSaved = (text: string) => {
    // router.refresh(), NOT window.location.reload(): a full reload throws away the
    // component state before React paints it, and the messages this discards are the
    // ones that matter most - that the address is not on an allowed sign-in domain
    // and will be turned away, or that an existing account was just replaced.
    // refresh() re-runs the server component and keeps the flash on screen.
    flash("success", text);
    router.refresh();
  };

  const cancelInvite = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error("Failed to cancel the invite");
      setInvites((current) => current.filter((invite) => invite.id !== id));
      flash("success", "Invite cancelled.");
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "Failed to cancel the invite");
    } finally {
      setSaving(false);
    }
  };

  const draftForUser = (user: UserWithPermissions): AccessDraft => ({
    email: user.email ?? "",
    name: user.name ?? "",
    role: user.role,
    department: user.department,
    restrictCandidatesToAllowlist: user.restrictCandidatesToAllowlist,
    allowlistCanAnnotate: user.allowlistCanAnnotate,
    moduleOverrides: user.moduleOverrides,
    candidates: user.allowedCandidates
  });

  const restoreAccess = async (email: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/access", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (!res.ok) throw new Error("Failed to restore access");
      setBlocked((b) => b.filter((e) => e !== email.toLowerCase()));
      flash("success", "Access restored.");
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "Failed to restore access");
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        await response.json();
        setUsers(users.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
        setMessage({ type: "success", text: "Role updated successfully" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: "error", text: "Failed to update role" });
      }
    } catch {
      setMessage({ type: "error", text: "Error updating role" });
    } finally {
      setSaving(false);
      setEditingUserId(null);
    }
  };

  // Department / executive / candidate-scope controls only matter for hiring
  // managers — ADMIN and RECRUITER are never narrowed by them (see
  // lib/auth/module-write-access.ts and lib/data/employees.ts). Auto-saves on
  // change, same pattern as the role select.
  const updateScoping = async (
    userId: string,
    patch: Partial<Pick<UserWithPermissions, "department" | "isExecutive" | "restrictCandidatesToDepartment">>
  ) => {
    const previous = users;
    setUsers(users.map((u) => (u.id === userId ? { ...u, ...patch } : u)));
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!response.ok) throw new Error("Failed to update");
      flash("success", "Access settings updated.");
    } catch {
      setUsers(previous);
      flash("error", "Failed to update access settings.");
    }
  };

  return (
    <div className="space-y-6 px-5 py-5 lg:px-8">
      {message && (
        <div
          className={`rounded p-3 text-sm ${
            message.type === "success"
              ? "border border-green-500/30 bg-green-50 text-green-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "border border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
              User Management
            </p>
            <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Team Members</h1>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Manage user roles and permissions</p>
          </div>
          <button
            onClick={() => setInviting(true)}
            className="rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90"
          >
            Add a team member
          </button>
        </div>
      </section>

      <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-lea/10 bg-brand-cloudDancer/30 dark:border-white/10 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-brand-lea dark:text-slate-100">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-brand-lea dark:text-slate-100">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-brand-lea dark:text-slate-100">Current Role</th>
                <th className="px-4 py-3 text-left font-semibold text-brand-lea dark:text-slate-100">Department scoping</th>
                <th className="px-4 py-3 text-left font-semibold text-brand-lea dark:text-slate-100">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="row-wash border-b border-brand-lea/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand-lea dark:text-slate-100">{user.name || "Unknown"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-brand-grey dark:text-slate-400">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-brand-gold/20 px-2 py-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {SCOPABLE_ROLES.includes(user.role) ? (
                      <div className="flex flex-col gap-1.5">
                        <select
                          value={user.department ?? ""}
                          onChange={(e) => updateScoping(user.id, { department: e.target.value || null })}
                          /* The allowlist wins over the department restriction, so
                             the department control is disabled while it is on -
                             leaving it live would let an admin set two rules that
                             contradict each other and see no sign of it. */
                          disabled={saving || user.restrictCandidatesToAllowlist}
                          className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-xs text-brand-lea disabled:opacity-50 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                        >
                          <option value="">No department set</option>
                          {SCOPING_DEPARTMENTS.map((dept) => (
                            <option key={dept.value} value={dept.value}>
                              {dept.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-brand-grey dark:text-slate-400">
                          <input
                            type="checkbox"
                            checked={user.isExecutive}
                            disabled={saving}
                            onChange={(e) => updateScoping(user.id, { isExecutive: e.target.checked })}
                          />
                          Executive — sees all employees + interview notes company-wide
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-brand-grey dark:text-slate-400">
                          <input
                            type="checkbox"
                            checked={user.restrictCandidatesToDepartment}
                            disabled={saving || user.restrictCandidatesToAllowlist}
                            onChange={(e) => updateScoping(user.id, { restrictCandidatesToDepartment: e.target.checked })}
                          />
                          Restrict candidate list to own department
                        </label>

                        {user.restrictCandidatesToAllowlist && (
                          <div className="mt-0.5 rounded border border-brand-gold/40 bg-brand-gold/10 px-2 py-1.5">
                            <p className="text-xs font-semibold text-brand-lea dark:text-slate-100">
                              {user.allowedCandidates.length === 0
                                ? "Specific candidates only — none picked, so they see nobody"
                                : `Specific candidates only — ${user.allowedCandidates.length} granted`}
                            </p>
                            {user.allowedCandidates.length > 0 && (
                              <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                                {user.allowedCandidates.slice(0, 3).map((c) => c.displayName).join(", ")}
                                {user.allowedCandidates.length > 3 ? ` +${user.allowedCandidates.length - 3} more` : ""}
                              </p>
                            )}
                            {user.allowlistCanAnnotate && (
                              <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">Can add notes and scorecards.</p>
                            )}
                          </div>
                        )}
                        {user.moduleOverrides && (
                          <p className="text-xs text-brand-eden dark:text-brand-sweet">
                            Custom area access set for this account.
                          </p>
                        )}

                        <button
                          onClick={() => setEditingAccess(user)}
                          className="mt-0.5 self-start rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-100"
                        >
                          Candidate &amp; area access…
                        </button>
                      </div>
                    ) : user.moduleOverrides ? (
                      // A stored override on a role the scoping controls do not cover
                      // (a recruiter, say) would otherwise be invisible AND unreachable:
                      // module overrides DO apply to a recruiter even though the
                      // candidate allowlist does not, so it has to stay editable.
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs text-brand-eden dark:text-brand-sweet">Custom area access set for this account.</p>
                        <button
                          onClick={() => setEditingAccess(user)}
                          className="self-start rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-100"
                        >
                          Candidate &amp; area access…
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-brand-grey dark:text-slate-400">Not narrowed — sees everything</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingUserId === user.id ? (
                      <div className="flex gap-2">
                        <select
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value)}
                          className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                        >
                          <option value="">Select role...</option>
                          {VALID_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleRoleChange(user.id, selectedRole)}
                          disabled={!selectedRole || saving}
                          className="rounded bg-brand-gold px-3 py-1 text-xs font-semibold text-brand-black hover:bg-brand-gold/90 disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="rounded border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-lea hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingUserId(user.id);
                            setSelectedRole(user.role);
                          }}
                          className="rounded bg-brand-sweet/20 px-3 py-1 text-xs font-semibold text-brand-lea hover:bg-brand-sweet/30 dark:text-slate-100"
                        >
                          Change Role
                        </button>
                        {/* Full offboarding — blocks + deletes. Hidden for yourself. */}
                        {user.id !== currentUserId && (
                          <button
                            onClick={() => { setRemoving(user); setConfirmEmail(""); }}
                            className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                          >
                            Remove access
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="flex items-center justify-center p-8">
            <p className="text-brand-grey dark:text-slate-400">No users found</p>
          </div>
        )}
      </section>

      {invites.length > 0 && (
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Waiting for first sign-in</h2>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            Their access is configured and applies automatically the first time they sign in with Google. They do not
            appear in the list above until then, because the account does not exist yet.
          </p>
          <div className="mt-3 divide-y divide-brand-lea/10 dark:divide-white/10">
            {invites.map((invite) => (
              <div key={invite.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-brand-lea dark:text-slate-100">
                    {invite.name ? `${invite.name} — ` : ""}
                    {invite.email}
                  </p>
                  <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                    {invite.role}
                    {invite.restrictCandidatesToAllowlist
                      ? ` · ${invite.candidates.length} candidate${invite.candidates.length === 1 ? "" : "s"}`
                      : " · all candidates"}
                    {invite.moduleOverrides ? " · custom area access" : ""}
                  </p>
                  {invite.candidates.length > 0 && (
                    <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                      {invite.candidates.map((c) => c.displayName).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => cancelInvite(invite.id)}
                  disabled={saving}
                  className="rounded border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-200"
                >
                  Cancel invite
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {blocked.length > 0 && (
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Revoked access</h2>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            These emails are blocked — they cannot sign in, and any live session is rejected on its next request. Restore to let them back in as a viewer.
          </p>
          <div className="mt-3 divide-y divide-brand-lea/10 dark:divide-white/10">
            {blocked.map((email) => (
              <div key={email} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium text-brand-lea dark:text-slate-100">{email}</span>
                <button
                  onClick={() => restoreAccess(email)}
                  disabled={saving}
                  className="rounded border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-200"
                >
                  Restore access
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Role Permissions</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Reference only. This table comes from lib/auth/permissions.ts, which is not the list the app enforces — the
          live one is lib/auth/roles.ts. Per-person access is set with the buttons above, not here.
        </p>
        <div className="mt-4 space-y-4">
          {VALID_ROLES.map((role) => (
            <div key={role} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
              <h3 className="font-semibold text-brand-lea dark:text-slate-100">{role}</h3>
              <div className="mt-2 flex flex-wrap gap-1">
                {ROLE_PERMISSIONS[role].map((perm) => (
                  <span key={perm} className="inline-block rounded bg-brand-gold/20 px-2 py-1 text-xs text-brand-lea dark:text-slate-100">
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {inviting && (
        <TeamMemberAccessModal
          mode="invite"
          initial={{
            email: "",
            name: "",
            role: "HIRING_MANAGER",
            department: null,
            restrictCandidatesToAllowlist: true,
            allowlistCanAnnotate: true,
            moduleOverrides: null,
            candidates: []
          }}
          onClose={() => setInviting(false)}
          onSaved={afterAccessSaved}
        />
      )}

      {editingAccess && (
        <TeamMemberAccessModal
          mode="edit"
          userId={editingAccess.id}
          initial={draftForUser(editingAccess)}
          originalCandidateIds={editingAccess.allowedCandidates.map((c) => c.id)}
          onClose={() => setEditingAccess(null)}
          onSaved={afterAccessSaved}
        />
      )}

      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4" onClick={() => !saving && setRemoving(null)}>
          <div className="w-full max-w-md rounded bg-white p-5 shadow-xl dark:bg-brand-panel" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">Remove access</h2>
            <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
              This blocks <span className="font-semibold text-brand-lea dark:text-slate-100">{removing.email}</span> from signing in and deletes their account.
              Any active session is rejected on its next request. You can restore access later.
            </p>
            <label className="mt-3 block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Type the email to confirm</span>
              <input
                autoFocus
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={removing.email ?? ""}
                className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-400/20 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button data-dialog-close onClick={() => setRemoving(null)} disabled={saving} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-100">
                Cancel
              </button>
              <button
                onClick={removeAccess}
                disabled={saving || confirmEmail.trim().toLowerCase() !== (removing.email ?? "").toLowerCase()}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
              >
                {saving ? "Removing…" : "Remove access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
