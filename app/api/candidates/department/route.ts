import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isCandidateDepartmentKey } from "@/lib/candidates/departments";

/**
 * PATCH /api/candidates/department
 *   { assignments: [{ candidateId, department }] }   set / change
 *   { candidateIds: [...], department: null }        clear, back to derived
 *
 * Writes Candidate.departmentOverride and nothing else. Every write is
 * reversible by sending null, which is why there is no separate undo path: the
 * column was empty before this screen existed, so "wrong" is always one clear
 * away rather than a restore.
 */
export async function PATCH(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const body = (await request.json()) as {
      assignments?: unknown;
      candidateIds?: unknown;
      department?: unknown;
    };

    // Form 2: clear (or bulk-set) a list of ids to one value.
    if (Array.isArray(body.candidateIds)) {
      const ids = body.candidateIds.filter((v): v is string => typeof v === "string");
      if (ids.length === 0) {
        return NextResponse.json({ message: "No candidates given." }, { status: 400 });
      }
      const department = body.department;
      if (department !== null && (typeof department !== "string" || !isCandidateDepartmentKey(department))) {
        return NextResponse.json({ message: "Unknown department." }, { status: 400 });
      }
      const result = await prisma.candidate.updateMany({
        where: { id: { in: ids } },
        data: { departmentOverride: department }
      });
      return NextResponse.json({ ok: true, updated: result.count });
    }

    // Form 1: per-candidate assignments, which is what the review screen sends
    // (each row can be a different department).
    if (!Array.isArray(body.assignments)) {
      return NextResponse.json({ message: "Nothing to apply." }, { status: 400 });
    }

    const assignments = body.assignments.filter(
      (a): a is { candidateId: string; department: string } =>
        typeof a === "object" &&
        a !== null &&
        typeof (a as { candidateId?: unknown }).candidateId === "string" &&
        typeof (a as { department?: unknown }).department === "string"
    );
    if (assignments.length === 0) {
      return NextResponse.json({ message: "Nothing to apply." }, { status: 400 });
    }
    const bad = assignments.find((a) => !isCandidateDepartmentKey(a.department));
    if (bad) {
      return NextResponse.json({ message: `Unknown department "${bad.department}".` }, { status: 400 });
    }

    // Grouped by department so this is a handful of updateMany calls rather than
    // one round trip per candidate — 300 sequential updates against a remote
    // database is a slow request, and a slow request here is one somebody
    // reloads halfway through.
    const byDepartment = new Map<string, string[]>();
    for (const a of assignments) {
      byDepartment.set(a.department, [...(byDepartment.get(a.department) ?? []), a.candidateId]);
    }

    let updated = 0;
    for (const [department, ids] of byDepartment) {
      const result = await prisma.candidate.updateMany({
        where: { id: { in: ids } },
        data: { departmentOverride: department }
      });
      updated += result.count;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to save departments." }, { status: 500 });
  }
}
