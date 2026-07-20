import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { ensureCandidateForHire } from "@/lib/candidates/ensure-candidate-for-hire";

// Resolve a current employee (picked in the org-chart link search) to a candidate
// id the chart can link to — creating a minimal linked candidate if they don't
// have one yet. Writes, so candidates:write.
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { hireId?: unknown };
  const hireId = typeof body.hireId === "string" ? body.hireId : null;
  if (!hireId) {
    return NextResponse.json({ message: "hireId required" }, { status: 400 });
  }

  const result = await ensureCandidateForHire(hireId);
  if (!result) {
    return NextResponse.json({ message: "Employee not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, candidateId: result.candidateId, displayName: result.displayName });
}
