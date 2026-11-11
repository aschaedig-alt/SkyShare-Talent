import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { interviewQuestionSchema } from "@/lib/validation/interview-question";
import { sanitizeRichText } from "@/lib/richtext/sanitize";
import { joinCoreValues, questionPlain, serializeGuidance } from "@/lib/interview-questions/rich";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiPermission("calendar:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const questions = await prisma.interviewQuestion.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }]
  });
  return NextResponse.json({ questions });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const data = interviewQuestionSchema.parse(await request.json());
    const text = sanitizeRichText(data.text);
    if (questionPlain(text).length < 5) {
      return NextResponse.json({ message: "Question text is required." }, { status: 400 });
    }
    const guidance = serializeGuidance({
      strongAnswer: sanitizeRichText(data.strongAnswer ?? data.guidance ?? ""),
      listenFor: sanitizeRichText(data.listenFor ?? "")
    });
    // A new question goes to the TOP of the bank, where its author is looking,
    // unless the caller placed it.
    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const first = await prisma.interviewQuestion.aggregate({ _min: { sortOrder: true } });
      sortOrder = (first._min.sortOrder ?? 1) - 1;
    }
    const question = await prisma.interviewQuestion.create({
      data: {
        text,
        category: data.category,
        coreValue: joinCoreValues(data.coreValues ?? (data.coreValue ? [data.coreValue] : [])),
        departmentsJson: JSON.stringify(data.departments ?? []),
        guidance,
        isActive: data.isActive,
        sortOrder
      }
    });
    return NextResponse.json({ ok: true, question });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Create interview question failed:", error);
    return NextResponse.json({ message: "Unable to create question." }, { status: 500 });
  }
}
