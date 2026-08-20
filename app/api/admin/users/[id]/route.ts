import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { VALID_ROLES, UserRole } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/activity/logger";
import { blockEmail } from "@/lib/auth/blocklist";
import { isScopingDepartment, MAX_ALLOWED_CANDIDATES, SCOPING_DEPARTMENT_VALUES } from "@/lib/auth/scoping-options";
import { parseUserModuleOverrides, serializeUserModuleOverrides } from "@/lib/auth/user-module-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // NOTE: this body type and the data object below are hand-maintained whitelists.
  // A field added to one but not the other is accepted by the route and silently
  // dropped before it reaches the database, with no error anywhere. Add to BOTH.
  const body = await request.json() as {
    role?: string;
    department?: string | null;
    isExecutive?: boolean;
    restrictCandidatesToDepartment?: boolean;
    restrictCandidatesToAllowlist?: boolean;
    allowlistCanAnnotate?: boolean;
    moduleOverrides?: unknown;
    addCandidateIds?: unknown;
    removeCandidateIds?: unknown;
  };

  const data: {
    role?: string;
    department?: string | null;
    isExecutive?: boolean;
    restrictCandidatesToDepartment?: boolean;
    restrictCandidatesToAllowlist?: boolean;
    allowlistCanAnnotate?: boolean;
    moduleAccessJson?: string | null;
  } = {};

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role as UserRole)) {
      return NextResponse.json({ message: "Invalid role" }, { status: 400 });
    }
    data.role = body.role;
  }

  // Departments come from lib/auth/scoping-options.ts, shared with the picker in
  // the settings UI. They used to be hardcoded separately in both places.
  if (body.department !== undefined) {
    if (body.department !== null && !isScopingDepartment(body.department)) {
      return NextResponse.json(
        { message: `Invalid department. Expected one of: ${SCOPING_DEPARTMENT_VALUES.join(", ")}.` },
        { status: 400 }
      );
    }
    data.department = body.department;
  }
  if (typeof body.isExecutive === "boolean") {
    data.isExecutive = body.isExecutive;
  }
  if (typeof body.restrictCandidatesToDepartment === "boolean") {
    data.restrictCandidatesToDepartment = body.restrictCandidatesToDepartment;
  }
  if (typeof body.restrictCandidatesToAllowlist === "boolean") {
    data.restrictCandidatesToAllowlist = body.restrictCandidatesToAllowlist;
    if (body.restrictCandidatesToAllowlist) {
      // The allowlist wins over the department restriction (see
      // lib/auth/candidate-scope.ts), so turning it ON clears the other rather
      // than leaving a stored setting that reads as active and does nothing.
      data.restrictCandidatesToDepartment = false;
    } else {
      // Turning it off also drops the annotate grant: it is meaningless without
      // the allowlist, and leaving it set would silently re-arm the write path if
      // the allowlist were ever switched back on.
      data.allowlistCanAnnotate = false;
    }
  }
  // Guarded: the block above clears the annotate grant when the allowlist is turned
  // OFF, and an unguarded assignment here would immediately undo that. A body of
  // { restrictCandidatesToAllowlist: false, allowlistCanAnnotate: true } would then
  // store a live write grant on an account with no allowlist - exactly the silent
  // re-arming the comment above says it prevents.
  if (typeof body.allowlistCanAnnotate === "boolean" && body.restrictCandidatesToAllowlist !== false) {
    data.allowlistCanAnnotate = body.allowlistCanAnnotate;
  }
  if (body.moduleOverrides !== undefined) {
    // null clears the override and returns the account to its role policy.
    data.moduleAccessJson =
      body.moduleOverrides === null
        ? null
        : serializeUserModuleOverrides(parseUserModuleOverrides(JSON.stringify(body.moduleOverrides)));
  }

  // Candidate grants are an explicit ADD/REMOVE pair rather than a whole-array
  // replace. Two admins editing the same person against this shared live database
  // would otherwise clobber each other: the second save would write a list built
  // before the first one landed, silently revoking it.
  const addIds = Array.isArray(body.addCandidateIds)
    ? [...new Set(body.addCandidateIds.filter((v): v is string => typeof v === "string" && Boolean(v)))]
    : [];
  const removeIds = Array.isArray(body.removeCandidateIds)
    ? [...new Set(body.removeCandidateIds.filter((v): v is string => typeof v === "string" && Boolean(v)))]
    : [];

  if (Object.keys(data).length === 0 && addIds.length === 0 && removeIds.length === 0) {
    return NextResponse.json({ message: "Nothing to update" }, { status: 400 });
  }

  try {
    // Get current user to log activity
    const currentUser = auth.user;

    if (addIds.length) {
      const currentCount = await prisma.userCandidateAccess.count({ where: { userId: id } });
      // Net of the removals in this same request. Counting the grants we are about to
      // delete would reject a straight swap at the ceiling with a message about a
      // limit the save would never have crossed.
      if (currentCount - removeIds.length + addIds.length > MAX_ALLOWED_CANDIDATES) {
        return NextResponse.json(
          { message: `A person can be granted at most ${MAX_ALLOWED_CANDIDATES} candidates.` },
          { status: 400 }
        );
      }
      // Validate every id exists, so a bad id is rejected loudly rather than
      // granting nothing and looking like it worked.
      const found = await prisma.candidate.findMany({ where: { id: { in: addIds } }, select: { id: true } });
      if (found.length !== addIds.length) {
        return NextResponse.json({ message: "One or more selected candidates no longer exist." }, { status: 400 });
      }
      await prisma.userCandidateAccess.createMany({
        data: addIds.map((candidateId) => ({ userId: id, candidateId, grantedByEmail: auth.user.email })),
        skipDuplicates: true
      });
    }

    if (removeIds.length) {
      await prisma.userCandidateAccess.deleteMany({
        where: { userId: id, candidateId: { in: removeIds } }
      });
    }

    const user =
      Object.keys(data).length > 0
        ? await prisma.user.update({ where: { id }, data })
        : await prisma.user.findUniqueOrThrow({ where: { id } });

    // Log the activity
    await logActivity({
      userId: currentUser?.id,
      userEmail: currentUser?.email || undefined,
      activityType: "PERMISSION_CHANGED",
      description:
        `Updated access settings for ${user.name || user.email}` +
        (addIds.length ? `; granted ${addIds.length} candidate(s)` : "") +
        (removeIds.length ? `; revoked ${removeIds.length} candidate(s)` : ""),
      entityType: "User",
      entityId: id,
      // The granted/revoked ids go into the audit trail so a widened allowlist is
      // answerable after the fact: who was added, by whom, and when.
      metadata: { ...data, userId: id, addedCandidateIds: addIds, removedCandidateIds: removeIds },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ message: "Failed to update user" }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] — fully remove a person's access (offboarding).
// Because sessions are JWT and sign-in is domain-gated, deleting the row alone
// wouldn't hold: their token would stay valid and they could sign back in. So
// this ADDS their email to the blocklist (which sign-in and every access gate
// now honor) AND deletes the account. Fenced: admin only, cannot remove yourself
// or the last admin, and the exact email must be typed to confirm. Reversible via
// "Restore access" (removes the block; they can sign in again as a new viewer).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true }
  });
  if (!target) {
    return NextResponse.json({ message: "User not found." }, { status: 404 });
  }

  if (auth.user.id != null && target.id === auth.user.id) {
    return NextResponse.json({ message: "You cannot remove your own access." }, { status: 400 });
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ message: "Cannot remove the last remaining admin." }, { status: 400 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as { confirmEmail?: unknown };
  if (typeof body.confirmEmail !== "string" || body.confirmEmail.trim().toLowerCase() !== (target.email ?? "").toLowerCase()) {
    return NextResponse.json({ message: "Type the account's exact email to confirm." }, { status: 400 });
  }

  try {
    if (target.email) {
      await blockEmail(target.email);
    }
    await prisma.user.delete({ where: { id } });

    await logActivity({
      userId: auth.user?.id,
      userEmail: auth.user?.email || undefined,
      activityType: "USER_DELETED",
      description: `Removed access for ${target.email ?? target.name ?? id} (blocked + account deleted)`,
      entityType: "User",
      entityId: id
    });

    return NextResponse.json({ ok: true, message: "Access removed." });
  } catch (error) {
    console.error("Error removing user access:", error);
    return NextResponse.json({ message: "Failed to remove access." }, { status: 500 });
  }
}
