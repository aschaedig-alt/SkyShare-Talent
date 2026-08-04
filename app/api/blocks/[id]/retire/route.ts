import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getContentBlockById } from "@/lib/data/jobs";
import { blockRetireSchema } from "@/lib/validation/blocks";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function migrateUsages(blockId: string, replacementBlockId: string | null | undefined, migrateJobs: boolean) {
  if (!replacementBlockId || !migrateJobs) {
    return;
  }

  if (replacementBlockId === blockId) {
    throw new Error("Choose a different replacement block.");
  }

  const replacementBlock = await prisma.contentBlock.findUnique({
    where: { id: replacementBlockId }
  });

  if (!replacementBlock || replacementBlock.archivedAt) {
    throw new Error("Choose an active replacement block.");
  }

  if (!replacementBlock.currentVersionId) {
    throw new Error("The replacement block needs a current version before it can be used.");
  }

  const oldInstances = await prisma.jobBlockInstance.findMany({
    where: { contentBlockId: blockId },
    select: { id: true, jobPostId: true }
  });

  const existingReplacementInstances = await prisma.jobBlockInstance.findMany({
    where: {
      jobPostId: { in: oldInstances.map((instance) => instance.jobPostId) },
      contentBlockId: replacementBlock.id
    },
    select: { jobPostId: true }
  });
  const jobsAlreadyUsingReplacement = new Set(existingReplacementInstances.map((instance) => instance.jobPostId));

  await prisma.$transaction(
    oldInstances.map((instance) => {
      if (jobsAlreadyUsingReplacement.has(instance.jobPostId)) {
        return prisma.jobBlockInstance.delete({
          where: { id: instance.id }
        });
      }

      return prisma.jobBlockInstance.update({
        where: { id: instance.id },
        data: {
          contentBlockId: replacementBlock.id,
          blockVersionId: replacementBlock.currentVersionId,
          sectionKey: replacementBlock.category.toLowerCase(),
          mode: "LINKED",
          customTitle: null,
          customBody: null
        }
      });
    })
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const { id } = await context.params;
    const payload = blockRetireSchema.parse(await request.json());

    await migrateUsages(id, payload.replacementBlockId, payload.migrateJobs);

    await prisma.contentBlock.update({
      where: { id },
      data: { archivedAt: new Date() }
    });

    return NextResponse.json(await getContentBlockById(id));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to archive block." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const { id } = await context.params;
    const payload = blockRetireSchema.parse(await request.json().catch(() => ({})));

    await migrateUsages(id, payload.replacementBlockId, payload.migrateJobs);

    const usageCount = await prisma.jobBlockInstance.count({
      where: { contentBlockId: id }
    });

    if (usageCount > 0) {
      return NextResponse.json(
        {
          message:
            "This block is still used by jobs. Choose a replacement block and update those jobs before deleting."
        },
        { status: 400 }
      );
    }

    await prisma.contentBlock.delete({
      where: { id }
    });

    return NextResponse.json({ deletedId: id });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to delete block." }, { status: 500 });
  }
}
