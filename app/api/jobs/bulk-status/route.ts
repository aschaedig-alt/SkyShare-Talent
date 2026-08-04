import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { serializeJob } from "@/lib/data/jobs";
import { jobStatusSchema } from "@/lib/validation/job";
import { requireApiPermission } from "@/lib/auth/route-auth";

const bulkStatusSchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1, "Choose at least one job."),
  status: jobStatusSchema
});

const jobInclude = {
  paycom: true,
  blockInstances: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      contentBlock: {
        include: {
          versions: true
        }
      },
      blockVersion: true
    }
  }
};

export async function PATCH(request: Request) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const payload = bulkStatusSchema.parse(await request.json());
    const uniqueJobIds = Array.from(new Set(payload.jobIds));

    await prisma.jobPost.updateMany({
      where: {
        id: { in: uniqueJobIds }
      },
      data: {
        status: payload.status
      }
    });

    const updatedJobs = await prisma.jobPost.findMany({
      where: {
        id: { in: uniqueJobIds }
      },
      include: jobInclude
    });

    return NextResponse.json(updatedJobs.map(serializeJob));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to update selected jobs." }, { status: 500 });
  }
}

