import { JobDuplicatesWorkspace } from "@/components/jobs/JobDuplicatesWorkspace";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function JobDuplicatesPage() {
  await requireModulePageAccess("recruiting-jobs");

  const jobs = await prisma.job.findMany({
    where: {
      mergedIntoJobId: null, // Only show unmerged jobs
    },
    select: {
      id: true,
      title: true,
      city: true,
      state: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          applications: true,
          interviews: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return <JobDuplicatesWorkspace jobs={jobs} />;
}
