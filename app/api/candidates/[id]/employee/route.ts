import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { CURRENT_EMPLOYEE_WHERE } from "@/lib/data/current-employee";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";

type RouteContext = { params: Promise<{ id: string }> };

// Given a candidate id, return the CURRENT employee (NewHire) it is linked to, if
// any — used by the org charts to offer a role change when a linked person is
// moved to a different seat.
//
// This asked for stage IN (ACTIVE, POST_ONBOARD) as well as not-terminated,
// which is the onboarding-stage-versus-employment confusion again: `stage` goes
// to ARCHIVED once onboarding is filed away, so anyone who joined more than a
// few months ago failed the test. Measured on the live database it matched 21
// of 114 linked employees, meaning the role-change prompt silently never
// appeared for most of the fleet. Now the one shared definition of employed.
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  // { employee: null } is what an unlinked candidate AND an unknown id both get
  // back, so it is also the right answer for one this viewer may not see — a 404
  // here would single out real people on the other side of the allowlist. The
  // linked employee's name and seat are exactly the detail being withheld.
  if (!isCandidateVisible(auth.user.viewer, id)) {
    return NextResponse.json({ employee: null });
  }

  const hire = await prisma.newHire.findFirst({
    where: {
      candidateId: id,
      ...CURRENT_EMPLOYEE_WHERE
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, position: true }
  });

  if (!hire) return NextResponse.json({ employee: null });
  return NextResponse.json({
    employee: { hireId: hire.id, name: hire.name, currentTitle: hire.position }
  });
}
