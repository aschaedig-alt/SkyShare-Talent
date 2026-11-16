import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

// DELETE /api/interview-guides/corrections/<id> — make the evaluator forget one
// lesson. A soft remove (active = false), so a mistaken click can be put back
// in the database; the evaluator only ever reads active rows.
export async function DELETE(_request: Request, { params }: { params: Promise<{ cid: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { cid } = await params;
  const row = await prisma.interviewEvalCorrection.findUnique({ where: { id: cid }, select: { id: true } });
  if (!row) return NextResponse.json({ message: "Not found." }, { status: 404 });
  await prisma.interviewEvalCorrection.update({ where: { id: cid }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
