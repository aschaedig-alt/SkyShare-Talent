import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getContentBlockById } from "@/lib/data/jobs";
import { blockApplyToJobsSchema } from "@/lib/validation/blocks";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const { id } = await context.params;
    const payload = blockApplyToJobsSchema.parse(await request.json());
    const block = await prisma.contentBlock.findUniqueOrThrow({
      where: { id }
    });

    if (block.archivedAt) {
      return NextResponse.json({ message: "Archived blocks cannot be applied to jobs." }, { status: 400 });
    }

    if (!block.currentVersionId) {
      return NextResponse.json({ message: "This block needs a current version before it can be applied." }, { status: 400 });
    }

    const requestedJobs = payload.applyToAll
      ? await prisma.jobPost.findMany({ select: { id: true } })
      : await prisma.jobPost.findMany({
          where: { id: { in: payload.jobIds } },
          select: { id: true }
        });

    if (!requestedJobs.length) {
      return NextResponse.json({ message: "Choose at least one job to apply this block to." }, { status: 400 });
    }

    const jobIds = requestedJobs.map((job: { id: string }) => job.id);
    const existingUsages = await prisma.jobBlockInstance.findMany({
      where: {
        jobPostId: { in: jobIds },
        contentBlockId: id
      },
      select: { jobPostId: true }
    });
    const jobsAlreadyUsingBlock = new Set(
  existingUsages.map((usage: { jobPostId: string }) => usage.jobPostId)
);
    const jobsToAttach = jobIds.filter(
  (jobId: string) => !jobsAlreadyUsingBlock.has(jobId)
);

    const lastInstances = await prisma.jobBlockInstance.findMany({
      where: { jobPostId: { in: jobsToAttach } },
      orderBy: [{ jobPostId: "asc" }, { sortOrder: "desc" }],
      select: { jobPostId: true, sortOrder: true }
    });
    const nextSortOrderByJob = new Map<string, number>();
    for (const instance of lastInstances) {
      if (!nextSortOrderByJob.has(instance.jobPostId)) {
        nextSortOrderByJob.set(instance.jobPostId, instance.sortOrder + 1);
      }
    }

    await prisma.$transaction(
  jobsToAttach.map((jobId: string) =>
    prisma.jobBlockInstance.create({
      data: {
        jobPostId: jobId,
        contentBlockId: block.id,
        blockVersionId: block.currentVersionId,
        sortOrder: nextSortOrderByJob.get(jobId) ?? 1,
        sectionKey: block.category.toLowerCase(),
        mode: "LINKED"
      }
    })
  )
);

    return NextResponse.json({
      block: await getContentBlockById(id),
      appliedCount: jobsToAttach.length,
      skippedCount: jobIds.length - jobsToAttach.length
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to apply block to jobs." }, { status: 500 });
  }
}
