import { UsersManagementWorkspace } from "@/components/settings/UsersManagementWorkspace";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getBlockedEmails } from "@/lib/auth/blocklist";
import { parseUserModuleOverrides } from "@/lib/auth/user-module-access";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  // OUTSIDE the try. Both of this helper's refusal paths work by THROWING - redirect()
  // for a revoked session and notFound() for a non-admin - and Next implements those as
  // thrown errors. Catching them cancels the redirect and the 404 outright, so a hiring
  // manager who types this URL would get a red "Failed to load" card (with the redirect
  // target echoed in it) instead of a 404.
  await requireModulePageAccess("settings");

  try {

    const [users, blockedEmails, session, invites] = await Promise.all([
      prisma.user.findMany({
        include: {
          accounts: true,
          permissions: true,
          // Include the candidate NAMES so the allowlist renders as people rather
          // than as a row of opaque cuids. Deliberately not the whole candidate
          // table: the picker searches on demand through GET /api/candidates?q=.
          allowedCandidates: {
            include: { candidate: { select: { id: true, displayName: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      getBlockedEmails(),
      getServerSession(authOptions),
      prisma.userInvite.findMany({ where: { claimedAt: null }, orderBy: { createdAt: "desc" } }),
    ]);

    // Pending invites are people who have been configured but have never signed
    // in, so they have no User row to appear in the list above. Without this the
    // page would show no trace of them and an admin would reasonably invite the
    // same person twice.
    const inviteCandidateIds = [
      ...new Set(
        invites.flatMap((invite) => {
          try {
            const parsed = JSON.parse(invite.candidateIdsJson ?? "[]") as unknown;
            return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
          } catch {
            return [];
          }
        })
      ),
    ];
    const inviteCandidates = inviteCandidateIds.length
      ? await prisma.candidate.findMany({
          where: { id: { in: inviteCandidateIds } },
          select: { id: true, displayName: true },
        })
      : [];
    const inviteCandidateNames = new Map(inviteCandidates.map((c) => [c.id, c.displayName]));

    const pendingInvites = invites.map((invite) => {
      let ids: string[] = [];
      try {
        const parsed = JSON.parse(invite.candidateIdsJson ?? "[]") as unknown;
        ids = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
      } catch {
        ids = [];
      }
      return {
        id: invite.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        department: invite.department,
        restrictCandidatesToAllowlist: invite.restrictCandidatesToAllowlist,
        allowlistCanAnnotate: invite.allowlistCanAnnotate,
        moduleOverrides: parseUserModuleOverrides(invite.moduleAccessJson),
        candidates: ids.map((id) => ({
          id,
          displayName: inviteCandidateNames.get(id) ?? "(no longer in the system)",
        })),
        createdAt: invite.createdAt.toISOString(),
      };
    });

    const usersForClient = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      isExecutive: user.isExecutive,
      restrictCandidatesToDepartment: user.restrictCandidatesToDepartment,
      restrictCandidatesToAllowlist: user.restrictCandidatesToAllowlist,
      allowlistCanAnnotate: user.allowlistCanAnnotate,
      moduleOverrides: parseUserModuleOverrides(user.moduleAccessJson),
      allowedCandidates: user.allowedCandidates.map((row) => ({
        id: row.candidate.id,
        displayName: row.candidate.displayName,
      })),
      permissions: user.permissions,
      accounts: user.accounts.map((a) => ({ id: a.id })),
    }));

    return (
      <div className="space-y-4 px-5 py-5 lg:px-8">
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Team Members</h1>
        </section>

        <UsersManagementWorkspace
          users={usersForClient}
          currentUserId={session?.user?.id ?? null}
          blockedEmails={blockedEmails}
          pendingInvites={pendingInvites}
        />
      </div>
    );
  } catch (error) {
    console.error("Error loading users page:", error);
    return (
      <div className="space-y-4 px-5 py-5 lg:px-8">
        <section className="rounded border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-600 dark:text-red-400">Error</p>
          <h1 className="text-2xl font-semibold text-red-700 dark:text-red-300">Failed to load team members</h1>
          <p className="mt-2 text-sm text-red-600">{error instanceof Error ? error.message : "Unknown error"}</p>
        </section>
      </div>
    );
  }
}
