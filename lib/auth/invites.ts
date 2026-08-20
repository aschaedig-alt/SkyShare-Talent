import { prisma } from "@/lib/prisma";
import { isRoleName } from "@/lib/auth/roles";
import { serializeUserModuleOverrides, type UserModuleOverrides } from "@/lib/auth/user-module-access";
import { logActivity } from "@/lib/activity/logger";

// Pre-configured access for somebody who has not signed in yet.
//
// THE CONSTRAINT THIS EXISTS FOR: an admin cannot simply create a User row and
// fill it in. Sign-in is Google-only and auth.ts sets
// allowDangerousEmailAccountLinking: false, so NextAuth's callback handler
// throws AccountNotLinkedError when it finds a User row with the incoming email
// but no linked Account — the person is bounced to
// /login?error=OAuthAccountNotLinked and cannot get in at all. Pre-creating the
// row would LOCK THEM OUT rather than prepare their access. (Verified against
// node_modules/next-auth/core/lib/callback-handler.js, not from memory.)
//
// So the admin configures an invite against an email address, and it is claimed
// on that person's first successful sign-in, inside the createUser event — which
// fires after the adapter has made the row and before the JWT is minted, so
// their very first page render already has the right role and scoping.

export type InviteAccessConfig = {
  role: string;
  department: string | null;
  isExecutive: boolean;
  restrictCandidatesToDepartment: boolean;
  restrictCandidatesToAllowlist: boolean;
  allowlistCanAnnotate: boolean;
  moduleOverrides: UserModuleOverrides | null;
  candidateIds: string[];
};

/**
 * Apply an access configuration to a User row that already exists, including the
 * candidate grants. Used both when an admin configures somebody who has already
 * signed in, and when an invite is claimed.
 *
 * Candidate ids are validated against the Candidate table first: an id that has
 * since been merged away or deleted is SKIPPED rather than throwing, because the
 * common caller is a sign-in and a stale id must never cost somebody their login.
 * The count of what actually landed is returned so a caller serving an admin can
 * report the difference.
 */
export async function applyAccessConfig(
  userId: string,
  config: InviteAccessConfig,
  grantedByEmail: string | null
): Promise<{ grantedCount: number; skippedIds: string[] }> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      role: isRoleName(config.role) ? config.role : "VIEWER",
      department: config.department,
      isExecutive: config.isExecutive,
      restrictCandidatesToDepartment: config.restrictCandidatesToDepartment,
      restrictCandidatesToAllowlist: config.restrictCandidatesToAllowlist,
      allowlistCanAnnotate: config.allowlistCanAnnotate,
      moduleAccessJson: serializeUserModuleOverrides(config.moduleOverrides)
    }
  });

  const requested = [...new Set(config.candidateIds)].filter(Boolean);
  if (requested.length === 0) {
    return { grantedCount: 0, skippedIds: [] };
  }

  const existing = await prisma.candidate.findMany({
    where: { id: { in: requested } },
    select: { id: true }
  });
  const valid = new Set(existing.map((row) => row.id));
  const skippedIds = requested.filter((id) => !valid.has(id));

  if (valid.size) {
    await prisma.userCandidateAccess.createMany({
      data: [...valid].map((candidateId) => ({ userId, candidateId, grantedByEmail })),
      skipDuplicates: true
    });
  }

  return { grantedCount: valid.size, skippedIds };
}

function parseCandidateIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parseOverrides(json: string | null): UserModuleOverrides | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as UserModuleOverrides;
  } catch {
    return null;
  }
}

/**
 * Claim any pending invite for a freshly-created user.
 *
 * NEVER THROWS. This runs inside NextAuth's createUser event, which is awaited
 * during sign-in — an exception here would fail the login of somebody whose only
 * mistake was being invited. A failure leaves them as the default VIEWER with the
 * invite unclaimed, which an admin can see and re-apply. That is a recoverable
 * bad outcome; a login they cannot complete is not.
 */
export async function claimInviteForUser(userId: string, email: string | null | undefined): Promise<void> {
  const normalized = email?.trim().toLowerCase();
  if (!userId || !normalized) {
    return;
  }

  try {
    const invite = await prisma.userInvite.findUnique({ where: { email: normalized } });
    if (!invite || invite.claimedAt) {
      return;
    }

    const { grantedCount, skippedIds } = await applyAccessConfig(
      userId,
      {
        role: invite.role,
        department: invite.department,
        isExecutive: invite.isExecutive,
        restrictCandidatesToDepartment: invite.restrictCandidatesToDepartment,
        restrictCandidatesToAllowlist: invite.restrictCandidatesToAllowlist,
        allowlistCanAnnotate: invite.allowlistCanAnnotate,
        moduleOverrides: parseOverrides(invite.moduleAccessJson),
        candidateIds: parseCandidateIds(invite.candidateIdsJson)
      },
      invite.invitedByEmail
    );

    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { claimedAt: new Date(), claimedUserId: userId }
    });

    await logActivity({
      userId,
      userEmail: normalized,
      activityType: "PERMISSION_CHANGED",
      description:
        `Applied invited access for ${normalized}: role ${invite.role}` +
        (invite.restrictCandidatesToAllowlist ? `, ${grantedCount} candidate(s) granted` : "") +
        (skippedIds.length ? `, ${skippedIds.length} id(s) skipped (no longer exist)` : ""),
      entityType: "User",
      entityId: userId,
      metadata: { role: invite.role, grantedCount, skippedIds }
    });
  } catch (error) {
    // Deliberately swallowed — see the doc comment above.
    console.error("Failed to claim user invite on sign-in:", error);
  }
}
