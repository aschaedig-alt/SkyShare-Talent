import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getJobPostById } from "@/lib/data/jobs";
import { jobBlockAttachSchema, jobBlockReorderSchema } from "@/lib/validation/blocks";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = jobBlockAttachSchema.parse(await request.json());

    const existing = await prisma.jobBlockInstance.findFirst({
      where: {
        jobPostId: id,
        contentBlockId: payload.contentBlockId
      }
    });

    if (existing) {
      return NextResponse.json({ message: "This block is already attached to the selected job." }, { status: 409 });
    }

    const block = await prisma.contentBlock.findUniqueOrThrow({
      where: { id: payload.contentBlockId }
    });

    if (block.archivedAt) {
      return NextResponse.json({ message: "Archived blocks cannot be attached to jobs." }, { status: 400 });
    }

    const lastInstance = await prisma.jobBlockInstance.findFirst({
      where: { jobPostId: id },
      orderBy: { sortOrder: "desc" }
    });

    const createdInstance = await prisma.jobBlockInstance.create({
      data: {
        jobPostId: id,
        contentBlockId: block.id,
        blockVersionId: block.currentVersionId,
        sortOrder: (lastInstance?.sortOrder ?? 0) + 1,
        sectionKey: payload.sectionKey ?? block.category.toLowerCase(),
        mode: payload.mode
      }
    });

    if (payload.insertBeforeInstanceId) {
      const orderedInstances = await prisma.jobBlockInstance.findMany({
        where: { jobPostId: id },
        orderBy: { sortOrder: "asc" },
        select: { id: true }
      });
      const withoutCreated = orderedInstances.filter((instance) => instance.id !== createdInstance.id);
      const insertIndex = withoutCreated.findIndex((instance) => instance.id === payload.insertBeforeInstanceId);
      const nextOrder =
        insertIndex >= 0
          ? [
              ...withoutCreated.slice(0, insertIndex),
              { id: createdInstance.id },
              ...withoutCreated.slice(insertIndex)
            ]
          : [...withoutCreated, { id: createdInstance.id }];

      await prisma.$transaction(
        nextOrder.map((instance, index) =>
          prisma.jobBlockInstance.update({
            where: { id: instance.id },
            data: { sortOrder: index + 1 }
          })
        )
      );
    }

    return NextResponse.json(await getJobPostById(id), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to attach block." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = jobBlockReorderSchema.parse(await request.json());

    const instances = await prisma.jobBlockInstance.findMany({
      where: {
        id: { in: payload.instanceIds },
        jobPostId: id
      },
      select: { id: true }
    });

    if (instances.length !== payload.instanceIds.length) {
      return NextResponse.json({ message: "One or more block instances do not belong to this job." }, { status: 400 });
    }

    await prisma.$transaction(
      payload.instanceIds.map((instanceId, index) =>
        prisma.jobBlockInstance.update({
          where: { id: instanceId },
          data: { sortOrder: index + 1 }
        })
      )
    );

    return NextResponse.json(await getJobPostById(id));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to reorder blocks." }, { status: 500 });
  }
}
