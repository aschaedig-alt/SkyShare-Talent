"use client";

import { useState } from "react";
import { VALID_ROLES, ROLE_PERMISSIONS } from "@/lib/auth/permissions";

interface UserWithPermissions {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  permissions: Array<{ id: string; userId: string; permission: string }>;
  accounts: Array<{ id: string }>;
}

interface UsersManagementWorkspaceProps {
  users: UserWithPermissions[];
}

export function UsersManagementWorkspace({ users: initialUsers }: UsersManagementWorkspaceProps) {
  const [users, setUsers] = useState(initialUsers);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
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

  return (
    <div className="space-y-6 px-5 py-5 lg:px-8">
      {message && (
        <div
          className={`rounded p-3 text-sm ${
            message.type === "success"
              ? "border border-green-500/30 bg-green-50 text-green-700"
              : "border border-red-500/30 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
          User Management
        </p>
        <h1 className="text-2xl font-semibold text-brand-lea">Team Members</h1>
        <p className="mt-1 text-sm text-brand-grey">Manage user roles and permissions</p>
      </section>

      <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-lea/10 bg-brand-cloudDancer/30">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-brand-lea">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-brand-lea">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-brand-lea">Current Role</th>
                <th className="px-4 py-3 text-left font-semibold text-brand-lea">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-brand-lea/10 hover:bg-brand-cloudDancer/20">
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand-lea">{user.name || "Unknown"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-brand-grey">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-brand-gold/20 px-2 py-1 text-xs font-semibold text-brand-lea">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {editingUserId === user.id ? (
                      <div className="flex gap-2">
                        <select
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value)}
                          className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-sm text-brand-lea"
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
                          className="rounded border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-lea hover:bg-brand-cloudDancer/30"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingUserId(user.id);
                          setSelectedRole(user.role);
                        }}
                        className="rounded bg-brand-sweet/20 px-3 py-1 text-xs font-semibold text-brand-lea hover:bg-brand-sweet/30"
                      >
                        Change Role
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="flex items-center justify-center p-8">
            <p className="text-brand-grey">No users found</p>
          </div>
        )}
      </section>

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <h2 className="text-lg font-semibold text-brand-lea">Role Permissions</h2>
        <div className="mt-4 space-y-4">
          {VALID_ROLES.map((role) => (
            <div key={role} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3">
              <h3 className="font-semibold text-brand-lea">{role}</h3>
              <div className="mt-2 flex flex-wrap gap-1">
                {ROLE_PERMISSIONS[role].map((perm) => (
                  <span key={perm} className="inline-block rounded bg-brand-gold/20 px-2 py-1 text-xs text-brand-lea">
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
