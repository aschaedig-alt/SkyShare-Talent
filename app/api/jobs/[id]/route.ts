import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { serializeJob } from "@/lib/data/jobs";
import { jobUpdateSchema } from "@/lib/validation/job";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function cleanDate(value: string | null | undefined) {
  const cleaned = clean(value);
  if (!cleaned) {
    return null;
  }

  const date = new Date(`${cleaned}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const { id } = await context.params;
    const payload = jobUpdateSchema.parse(await request.json());

    const paycom = payload.paycom;

    await prisma.jobPost.update({
      where: { id },
      data: {
        title: payload.title,
        internalName: clean(payload.internalName),
        department: clean(payload.department),
        category: clean(payload.category),
        location: clean(payload.location),
        secondaryLocation: clean(payload.secondaryLocation),
        positionType: clean(payload.positionType),
        salaryRange: clean(payload.salaryRange),
        reportsTo: clean(payload.reportsTo),
        positionCode: clean(payload.positionCode),
        seatCode: clean(payload.seatCode),
        travelPercentage: clean(payload.travelPercentage),
        educationLevel: clean(payload.educationLevel),
        workSchedule: clean(payload.workSchedule),
        summary: clean(payload.summary),
        keyResponsibilities: clean(payload.keyResponsibilities),
        qualificationsText: clean(payload.qualificationsText),
        benefitsText: clean(payload.benefitsText),
        postedDate: cleanDate(payload.postedDate),
        status: payload.status
      }
    });

    if (paycom !== undefined) {
      await prisma.paycomConfig.upsert({
        where: { jobPostId: id },
        create: {
          jobPostId: id,
          workflow: clean(paycom?.workflow),
          externalApplication: clean(paycom?.externalApplication),
          externalKnockout: clean(paycom?.externalKnockout),
          externalGlobal: clean(paycom?.externalGlobal),
          externalJobLevel: clean(paycom?.externalJobLevel),
          externalFollowUps: clean(paycom?.externalFollowUps),
          internalApplication: clean(paycom?.internalApplication),
          internalKnockout: clean(paycom?.internalKnockout),
          internalGlobal: clean(paycom?.internalGlobal),
          internalJobLevel: clean(paycom?.internalJobLevel)
        },
        update: {
          workflow: clean(paycom?.workflow),
          externalApplication: clean(paycom?.externalApplication),
          externalKnockout: clean(paycom?.externalKnockout),
          externalGlobal: clean(paycom?.externalGlobal),
          externalJobLevel: clean(paycom?.externalJobLevel),
          externalFollowUps: clean(paycom?.externalFollowUps),
          internalApplication: clean(paycom?.internalApplication),
          internalKnockout: clean(paycom?.internalKnockout),
          internalGlobal: clean(paycom?.internalGlobal),
          internalJobLevel: clean(paycom?.internalJobLevel)
        }
      });
    }

    const updatedJob = await prisma.jobPost.findUniqueOrThrow({
      where: { id },
      include: {
        paycom: true,
        blockInstances: {
          orderBy: { sortOrder: "asc" },
          include: {
            contentBlock: {
              include: {
                versions: true
              }
            },
            blockVersion: true
          }
        }
      }
    });

    return NextResponse.json(serializeJob(updatedJob));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Validation failed.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to save job." }, { status: 500 });
  }
}
