import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isTestEmail } from "@/lib/testdata/markers";

// GET /api/users — admin-only listing of auth login accounts, so a test account
// can be found (by id) and removed via DELETE /api/users/[id]. Flags which rows
// are test accounts (deletable) and which one is you (never deletable).
export async function GET() {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      isTest: isTestEmail(u.email),
      isSelf: auth.user.id != null && u.id === auth.user.id
    }))
  });
}
