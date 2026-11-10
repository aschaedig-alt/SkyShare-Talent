import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, requireApiUser } from "@/lib/auth/route-auth";
import { canWriteModule } from "@/lib/auth/module-write-access";
import { isLeadershipRoleKey, listLeadershipRoles, setLeadershipRoleHolder } from "@/lib/people/leadership-roles";

export const dynamic = "force-dynamic";

// The leadership roles people can report to by role (Chief Pilot, Assistant
// Chief Pilot) and who holds each. See lib/people/leadership-roles.ts.
export async function GET() {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return NextResponse.json({ roles: [] }, { status: 401 });
  return NextResponse.json({ roles: await listLeadershipRoles() });
}

// Hand a role to somebody else. Every supervisor slot following the role is
// re-pointed in the same transaction — that is the whole point of the feature.
export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return (auth as { ok: false; response: NextResponse }).response;
  if (!(await canWriteModule(auth.user, "people", "edit"))) {
    return NextResponse.json({ message: "You do not have permission to edit employees." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { key?: unknown; holderHireId?: unknown };
  if (!isLeadershipRoleKey(body.key)) {
    return NextResponse.json({ message: "Unknown role." }, { status: 400 });
  }
  const holderHireId = typeof body.holderHireId === "string" && body.holderHireId.trim() ? body.holderHireId.trim() : null;
  if (holderHireId) {
    const person = await prisma.newHire.findUnique({ where: { id: holderHireId }, select: { id: true } });
    if (!person) return NextResponse.json({ message: "That person was not found." }, { status: 404 });
  }

  const result = await setLeadershipRoleHolder(body.key, holderHireId);
  return NextResponse.json({ ok: true, result, roles: await listLeadershipRoles() });
}
