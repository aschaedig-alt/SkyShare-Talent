import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { interviewQuestionSchema } from "@/lib/validation/interview-question";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiPermission("calendar:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const questions = await prisma.interviewQuestion.findMany({
    orderBy: [{ isActive: "desc" }, { category: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }]
  });
  return NextResponse.json({ questions });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const data = interviewQuestionSchema.parse(await request.json());
    const question = await prisma.interviewQuestion.create({
      data: {
        text: data.text,
        category: data.category,
        coreValue: data.coreValue ?? null,
        departmentsJson: JSON.stringify(data.departments ?? []),
        guidance: data.guidance ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder ?? 0
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
