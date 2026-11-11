import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { interviewQuestionUpdateSchema } from "@/lib/validation/interview-question";
import { sanitizeRichText } from "@/lib/richtext/sanitize";
import { joinCoreValues, parseGuidance, questionPlain, serializeGuidance } from "@/lib/interview-questions/rich";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    const data = interviewQuestionUpdateSchema.parse(await request.json());
    let text: string | undefined;
    if (data.text !== undefined) {
      text = sanitizeRichText(data.text);
      if (questionPlain(text).length < 5) {
        return NextResponse.json({ message: "Question text is required." }, { status: 400 });
      }
    }
    let guidance: string | null | undefined;
    const strongIn = data.strongAnswer !== undefined ? data.strongAnswer : data.guidance;
    if (strongIn !== undefined || data.listenFor !== undefined) {
      // A caller may send just one block; the other keeps what is stored.
      let current = { strongAnswer: "", listenFor: "" };
      if (strongIn === undefined || data.listenFor === undefined) {
        const row = await prisma.interviewQuestion.findUnique({ where: { id }, select: { guidance: true } });
        current = parseGuidance(row?.guidance);
      }
      guidance = serializeGuidance({
        strongAnswer: strongIn === undefined ? current.strongAnswer : sanitizeRichText(strongIn ?? ""),
        listenFor: data.listenFor === undefined ? current.listenFor : sanitizeRichText(data.listenFor ?? "")
      });
    }
    const coreValues = data.coreValues ?? (data.coreValue !== undefined ? (data.coreValue ? [data.coreValue] : []) : undefined);
    const question = await prisma.interviewQuestion.update({
      where: { id },
      data: {
        ...(text !== undefined && { text }),
        ...(data.category !== undefined && { category: data.category }),
        ...(coreValues !== undefined && { coreValue: joinCoreValues(coreValues) }),
        ...(data.departments !== undefined && { departmentsJson: JSON.stringify(data.departments) }),
        ...(guidance !== undefined && { guidance }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder })
      }
    });
    return NextResponse.json({ ok: true, question });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Update interview question failed:", error);
    return NextResponse.json({ message: "Unable to update question." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    await prisma.interviewQuestion.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: "Question removed." });
  } catch (error) {
    console.error("Delete interview question failed:", error);
    return NextResponse.json({ message: "Unable to delete question." }, { status: 500 });
  }
}
