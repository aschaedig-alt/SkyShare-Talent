import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { interviewQuestionReorderSchema } from "@/lib/validation/interview-question";

export const dynamic = "force-dynamic";

/**
 * Put the question bank in the order given (feedback cmwcjtm5k: "i need to be
 * able to reorder the questions"). The body is the full list of ids, top first;
 * each gets sortOrder = its position. Ids that no longer exist are skipped, and
 * any question the list leaves out keeps its sortOrder.
 */
export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const { ids } = interviewQuestionReorderSchema.parse(await request.json());
    const unique = [...new Set(ids)];
    const existing = new Set((await prisma.interviewQuestion.findMany({ where: { id: { in: unique } }, select: { id: true } })).map((q) => q.id));
    const ordered = unique.filter((id) => existing.has(id));
    await prisma.$transaction(ordered.map((id, index) => prisma.interviewQuestion.update({ where: { id }, data: { sortOrder: index } })));
    return NextResponse.json({ ok: true, count: ordered.length });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Reorder interview questions failed:", error);
    return NextResponse.json({ message: "Unable to save the new order." }, { status: 500 });
  }
}
