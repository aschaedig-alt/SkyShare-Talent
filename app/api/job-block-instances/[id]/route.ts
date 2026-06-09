import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getJobPostById } from "@/lib/data/jobs";
import { jobBlockInstanceUpdateSchema } from "@/lib/validation/blocks";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = jobBlockInstanceUpdateSchema.parse(await request.json());
    const instance = await prisma.jobBlockInstance.findUniqueOrThrow({
      where: { id },
      include: { contentBlock: true }
    });

    const blockVersionId =
      payload.blockVersionId !== undefined
        ? payload.blockVersionId
        : payload.mode === "LINKED"
          ? instance.contentBlock?.currentVersionId
          : undefined;

    await prisma.jobBlockInstance.update({
      where: { id },
      data: {
        mode: payload.mode,
        blockVersionId,
        customTitle: payload.customTitle,
        customBody: payload.customBody
      }
    });

    return NextResponse.json(await getJobPostById(instance.jobPostId));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to update block instance." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const instance = await prisma.jobBlockInstance.findUniqueOrThrow({
      where: { id },
      select: { jobPostId: true }
    });

    await prisma.jobBlockInstance.delete({ where: { id } });

    const remaining = await prisma.jobBlockInstance.findMany({
      where: { jobPostId: instance.jobPostId },
      orderBy: { sortOrder: "asc" },
      select: { id: true }
    });

    await prisma.$transaction(
      remaining.map((item, index) =>
        prisma.jobBlockInstance.update({
          where: { id: item.id },
          data: { sortOrder: index + 1 }
        })
      )
    );

    return NextResponse.json(await getJobPostById(instance.jobPostId));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to remove block instance." }, { status: 500 });
  }
}
