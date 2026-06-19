import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { interviewQuestionUpdateSchema } from "@/lib/validation/interview-question";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    const data = interviewQuestionUpdateSchema.parse(await request.json());
    const question = await prisma.interviewQuestion.update({
      where: { id },
      data: {
        ...(data.text !== undefined && { text: data.text }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.coreValue !== undefined && { coreValue: data.coreValue ?? null }),
        ...(data.departments !== undefined && { departmentsJson: JSON.stringify(data.departments) }),
        ...(data.guidance !== undefined && { guidance: data.guidance ?? null }),
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
