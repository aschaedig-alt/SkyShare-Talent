import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getContentBlockById } from "@/lib/data/jobs";
import { blockVersionCreateSchema } from "@/lib/validation/blocks";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = blockVersionCreateSchema.parse(await request.json());

    const updatedBlock = await prisma.contentBlock.update({
      where: { id },
      data: {
        name: payload.name,
        description: payload.description === undefined ? undefined : clean(payload.description),
        category: payload.category,
        scope: payload.scope,
        placement: payload.placement
      }
    });

    const currentVersion = updatedBlock.currentVersionId
      ? await prisma.contentBlockVersion.findUnique({
          where: { id: updatedBlock.currentVersionId }
        })
      : null;
    const versionChanged =
      !currentVersion ||
      currentVersion.title !== payload.title ||
      currentVersion.body !== payload.body ||
      currentVersion.bodyFormat !== payload.bodyFormat ||
      currentVersion.textWeight !== payload.textWeight ||
      currentVersion.textColor !== payload.textColor;
    let adoptionVersionId = currentVersion?.id ?? null;

    if (!versionChanged) {
      if (payload.adoption === "ALL_LINKED_JOBS" && adoptionVersionId) {
        await prisma.jobBlockInstance.updateMany({
          where: {
            contentBlockId: id,
            mode: { in: ["LINKED", "PINNED_VERSION"] }
          },
          data: {
            blockVersionId: adoptionVersionId,
            mode: "LINKED"
          }
        });
      }

      if (payload.adoption === "SELECTED_JOBS" && payload.selectedJobIds.length && adoptionVersionId) {
        await prisma.jobBlockInstance.updateMany({
          where: {
            contentBlockId: id,
            jobPostId: { in: payload.selectedJobIds },
            mode: { in: ["LINKED", "PINNED_VERSION"] }
          },
          data: {
            blockVersionId: adoptionVersionId,
            mode: "LINKED"
          }
        });
      }

      return NextResponse.json(await getContentBlockById(id));
    }

    const latestVersion = await prisma.contentBlockVersion.findFirst({
      where: { contentBlockId: id },
      orderBy: { versionNumber: "desc" }
    });

    const nextVersion = await prisma.contentBlockVersion.create({
      data: {
        contentBlockId: id,
        versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
        title: payload.title,
        body: payload.body,
        plainText: payload.body,
        bodyFormat: payload.bodyFormat,
        textWeight: payload.textWeight,
        textColor: payload.textColor,
        changeNote: clean(payload.changeNote) ?? "Saved as a new block version"
      }
    });
    adoptionVersionId = nextVersion.id;

    await prisma.contentBlock.update({
      where: { id },
      data: { currentVersionId: adoptionVersionId }
    });

    if (payload.adoption === "ALL_LINKED_JOBS") {
      await prisma.jobBlockInstance.updateMany({
        where: {
          contentBlockId: id,
          mode: { in: ["LINKED", "PINNED_VERSION"] }
        },
        data: {
          blockVersionId: adoptionVersionId,
          mode: "LINKED"
        }
      });
    }

    if (payload.adoption === "SELECTED_JOBS" && payload.selectedJobIds.length) {
      await prisma.jobBlockInstance.updateMany({
        where: {
          contentBlockId: id,
          jobPostId: { in: payload.selectedJobIds },
          mode: { in: ["LINKED", "PINNED_VERSION"] }
        },
        data: {
          blockVersionId: adoptionVersionId,
          mode: "LINKED"
        }
      });
    }

    if (payload.adoption === "ONLY_CURRENT_JOB" && payload.currentJobId) {
      await prisma.jobBlockInstance.updateMany({
        where: {
          contentBlockId: id,
          jobPostId: payload.currentJobId,
          mode: { in: ["LINKED", "PINNED_VERSION"] }
        },
        data: {
          blockVersionId: adoptionVersionId,
          mode: "LINKED"
        }
      });
    }

    return NextResponse.json(await getContentBlockById(id));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to update block." }, { status: 500 });
  }
}
