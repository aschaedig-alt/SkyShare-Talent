import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isRoleName } from "@/lib/auth/roles";
import { isEmailAllowedForAuth } from "@/auth";
import { isEmailBlocked } from "@/lib/auth/blocklist";
import { isScopingDepartment, MAX_ALLOWED_CANDIDATES } from "@/lib/auth/scoping-options";
import { parseUserModuleOverrides, serializeUserModuleOverrides } from "@/lib/auth/user-module-access";
import { applyAccessConfig, type InviteAccessConfig } from "@/lib/auth/invites";
import { logActivity } from "@/lib/activity/logger";

// "Add a team member" — configure somebody's access before they have ever signed in.
//
// See lib/auth/invites.ts for why this cannot simply create the User row.

type InviteBody = {
  email?: unknown;
  name?: unknown;
  role?: unknown;
  department?: unknown;
  isExecutive?: unknown;
  restrictCandidatesToDepartment?: unknown;
  restrictCandidatesToAllowlist?: unknown;
  allowlistCanAnnotate?: unknown;
  moduleOverrides?: unknown;
  candidateIds?: unknown;
  // Set by the UI only after the admin has been shown what they are about to
  // overwrite. See the existing-account branch in POST.
  confirmExisting?: unknown;
};

function bool(value: unknown): boolean {
  return value === true;
}

// GET /api/admin/invites — invites that have not been claimed yet.
export async function GET() {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  const invites = await prisma.userInvite.findMany({
    where: { claimedAt: null },
    orderBy: { createdAt: "desc" }
  });

  // Resolve the granted candidates to names so the settings page can show who was
  // picked rather than a row of opaque cuids.
  const allIds = [
    ...new Set(
      invites.flatMap((invite) => {
        try {
          const parsed = JSON.parse(invite.candidateIdsJson ?? "[]") as unknown;
          return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
        } catch {
          return [];
        }
      })
    )
  ];
  const candidates = allIds.length
    ? await prisma.candidate.findMany({ where: { id: { in: allIds } }, select: { id: true, displayName: true } })
    : [];
  const nameById = new Map(candidates.map((c) => [c.id, c.displayName]));

  return NextResponse.json({
    invites: invites.map((invite) => {
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
        isExecutive: invite.isExecutive,
        restrictCandidatesToDepartment: invite.restrictCandidatesToDepartment,
        restrictCandidatesToAllowlist: invite.restrictCandidatesToAllowlist,
        allowlistCanAnnotate: invite.allowlistCanAnnotate,
        moduleOverrides: parseUserModuleOverrides(invite.moduleAccessJson),
        candidates: ids.map((id) => ({ id, displayName: nameById.get(id) ?? "(no longer in the system)" })),
        createdAt: invite.createdAt.toISOString(),
        invitedByEmail: invite.invitedByEmail
      };
    })
  });
}

// POST /api/admin/invites — create the invite, or apply it immediately if the
// person already has an account.
export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as InviteBody;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: "A valid email address is required." }, { status: 400 });
  }

  const role = typeof body.role === "string" ? body.role : "HIRING_MANAGER";
  if (!isRoleName(role)) {
    return NextResponse.json({ message: "Invalid role." }, { status: 400 });
  }
  // An invite that promotes somebody to ADMIN would let an admin quietly mint
  // another one against an address nobody has checked. Role changes to ADMIN stay
  // on the existing per-user control, where the account is visible first.
  if (role === "ADMIN") {
    return NextResponse.json(
      { message: "Invite as a hiring manager, recruiter or viewer, then promote to admin from the list." },
      { status: 400 }
    );
  }

  const department = typeof body.department === "string" && body.department ? body.department : null;
  if (department !== null && !isScopingDepartment(department)) {
    return NextResponse.json({ message: "Invalid department." }, { status: 400 });
  }

  const rawIds = Array.isArray(body.candidateIds)
    ? [...new Set(body.candidateIds.filter((v): v is string => typeof v === "string" && Boolean(v)))]
    : [];
  if (rawIds.length > MAX_ALLOWED_CANDIDATES) {
    return NextResponse.json(
      { message: `A person can be granted at most ${MAX_ALLOWED_CANDIDATES} candidates.` },
      { status: 400 }
    );
  }

  // Validate the ids NOW rather than at claim time, so a typo surfaces to the
  // admin who made it instead of silently granting nothing weeks later.
  const found = rawIds.length
    ? await prisma.candidate.findMany({ where: { id: { in: rawIds } }, select: { id: true } })
    : [];
  if (found.length !== rawIds.length) {
    return NextResponse.json({ message: "One or more selected candidates no longer exist." }, { status: 400 });
  }

  const restrictToAllowlist = bool(body.restrictCandidatesToAllowlist);
  const moduleOverrides = parseUserModuleOverrides(
    typeof body.moduleOverrides === "string" ? body.moduleOverrides : JSON.stringify(body.moduleOverrides ?? null)
  );

  const config: InviteAccessConfig = {
    role,
    department,
    isExecutive: bool(body.isExecutive),
    // The allowlist wins over the department restriction, so never store both.
    restrictCandidatesToDepartment: restrictToAllowlist ? false : bool(body.restrictCandidatesToDepartment),
    restrictCandidatesToAllowlist: restrictToAllowlist,
    allowlistCanAnnotate: restrictToAllowlist && bool(body.allowlistCanAnnotate),
    moduleOverrides,
    candidateIds: rawIds
  };

  // Whether they can sign in AT ALL is decided by env vars this app cannot edit
  // (AUTH_ALLOWED_DOMAINS / AUTH_ALLOWED_EMAILS, read in auth.ts). Report it
  // rather than refusing: the invite is still correct and will apply the moment
  // the address is permitted, and an admin who cannot see WHY sign-in is refused
  // has no way to work it out from the login screen.
  const signInAllowed = isEmailAllowedForAuth(email);

  // REVOKED ADDRESSES. "Remove access" both blocks the email AND deletes the User row,
  // so a removed person leaves no account behind - which means the existing-account branch
  // below would not catch them, an invite would be stored, and the admin would be told they
  // can sign in now. They cannot: the signIn callback in auth.ts refuses a blocked email
  // outright, so createUser never fires and the invite waits forever while the same settings
  // page lists that address under "Revoked access".
  if (await isEmailBlocked(email)) {
    return NextResponse.json(
      {
        message:
          "That address was revoked and is blocked from signing in. Restore it under Revoked access first, then add them here."
      },
      { status: 409 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, role: true }
  });

  // OVERWRITE GUARDS. applyAccessConfig writes role, department, the scoping flags and the
  // module overrides unconditionally, and auth.ts re-reads the role on every session read -
  // so demoting somebody here takes effect on their next request, not at their next sign-in.
  // These two cases are refused outright rather than confirmed, mirroring the guards the
  // DELETE handler on /api/admin/users/[id] already has.
  if (existing && auth.user.id != null && existing.id === auth.user.id) {
    return NextResponse.json(
      { message: "That is your own account. Change your own access from the list rather than here." },
      { status: 400 }
    );
  }
  if (existing?.role === "ADMIN") {
    return NextResponse.json(
      {
        message:
          email + " is an admin. Change their role in the list first if you really mean to restrict them."
      },
      { status: 400 }
    );
  }

  // Any OTHER existing account is overwritten, but only once the admin has seen whose it is.
  // The modal cannot know an address is taken until it asks, so the first attempt comes back
  // describing the account and the second carries confirmExisting.
  if (existing && body.confirmExisting !== true) {
    return NextResponse.json(
      {
        needsConfirmation: true,
        existingRole: existing.role,
        message:
          email +
          " already has an account (" +
          existing.role +
          (existing.name ? ", " + existing.name : "") +
          "). Saving will replace their role and access with what you have set here."
      },
      { status: 409 }
    );
  }

  if (existing) {
    // They already have an account, so there is nothing to wait for — apply it now
    // and store no invite. This is also what makes the flow forgiving: an admin who
    // invites somebody who signed in yesterday gets the obvious outcome.
    const { grantedCount } = await applyAccessConfig(existing.id, config, auth.user.email);

    await logActivity({
      userId: auth.user.id ?? undefined,
      userEmail: auth.user.email ?? undefined,
      activityType: "PERMISSION_CHANGED",
      description: `Applied access for existing account ${email} (role ${role}, ${grantedCount} candidate(s))`,
      entityType: "User",
      entityId: existing.id,
      metadata: { role, grantedCount, restrictToAllowlist }
    });

    return NextResponse.json({
      applied: "existing-user",
      userId: existing.id,
      grantedCount,
      signInAllowed,
      message: `${email} already has an account — the access was applied to it directly.`
    });
  }

  const invite = await prisma.userInvite.upsert({
    where: { email },
    create: {
      email,
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : null,
      role,
      department,
      isExecutive: config.isExecutive,
      restrictCandidatesToDepartment: config.restrictCandidatesToDepartment,
      restrictCandidatesToAllowlist: config.restrictCandidatesToAllowlist,
      allowlistCanAnnotate: config.allowlistCanAnnotate,
      moduleAccessJson: serializeUserModuleOverrides(moduleOverrides),
      candidateIdsJson: rawIds.length ? JSON.stringify(rawIds) : null,
      invitedByEmail: auth.user.email
    },
    update: {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : null,
      role,
      department,
      isExecutive: config.isExecutive,
      restrictCandidatesToDepartment: config.restrictCandidatesToDepartment,
      restrictCandidatesToAllowlist: config.restrictCandidatesToAllowlist,
      allowlistCanAnnotate: config.allowlistCanAnnotate,
      moduleAccessJson: serializeUserModuleOverrides(moduleOverrides),
      candidateIdsJson: rawIds.length ? JSON.stringify(rawIds) : null,
      invitedByEmail: auth.user.email,
      // Re-inviting a claimed address re-arms it, which is the sane reading of
      // "invite them again" after an account was removed and restored.
      claimedAt: null,
      claimedUserId: null
    }
  });

  await logActivity({
    userId: auth.user.id ?? undefined,
    userEmail: auth.user.email ?? undefined,
    activityType: "PERMISSION_CHANGED",
    description: `Invited ${email} as ${role}${rawIds.length ? ` with ${rawIds.length} candidate(s)` : ""}`,
    entityType: "UserInvite",
    entityId: invite.id,
    metadata: { role, candidateCount: rawIds.length, restrictToAllowlist, signInAllowed }
  });

  return NextResponse.json({
    applied: "invite-created",
    inviteId: invite.id,
    signInAllowed,
    message: signInAllowed
      ? `${email} can sign in with Google now, and their access is applied automatically the first time they do.`
      : `Saved. ${email} is NOT on an allowed sign-in domain yet, so they will be turned away at the login screen until the address is added to AUTH_ALLOWED_EMAILS in Vercel.`
  });
}

// DELETE /api/admin/invites — cancel a pending invite.
export async function DELETE(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ message: "An invite id is required." }, { status: 400 });
  }

  const invite = await prisma.userInvite.findUnique({ where: { id: body.id }, select: { email: true } });
  if (!invite) {
    return NextResponse.json({ message: "Invite not found." }, { status: 404 });
  }

  await prisma.userInvite.delete({ where: { id: body.id } });

  await logActivity({
    userId: auth.user.id ?? undefined,
    userEmail: auth.user.email ?? undefined,
    activityType: "PERMISSION_CHANGED",
    description: `Cancelled the pending invite for ${invite.email}`,
    entityType: "UserInvite",
    entityId: body.id
  });

  return NextResponse.json({ ok: true });
}
