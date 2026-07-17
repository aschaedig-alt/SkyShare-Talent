import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ id: string }> };

// Given a candidate id, return the CURRENT employee (NewHire) it is linked to, if
// any — used by the org charts to offer a role change when a linked person is
// moved to a different seat. Only a currently-employed hire counts (active or
// post-onboard, not terminated); an archived/terminated record is not "current".
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const hire = await prisma.newHire.findFirst({
    where: {
      candidateId: id,
      stage: { in: ["ACTIVE", "POST_ONBOARD"] },
      NOT: { employmentStatus: "TERMINATED" }
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, position: true }
  });

  if (!hire) return NextResponse.json({ employee: null });
  return NextResponse.json({
    employee: { hireId: hire.id, name: hire.name, currentTitle: hire.position }
  });
}
