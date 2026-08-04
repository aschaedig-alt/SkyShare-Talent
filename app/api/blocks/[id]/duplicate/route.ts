import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContentBlockById } from "@/lib/data/jobs";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const authResult = await requireApiPermission("jobs:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const { id } = await context.params;
    const sourceBlock = await prisma.contentBlock.findUniqueOrThrow({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" }
        }
      }
    });
    const sourceVersion =
  sourceBlock.versions.find((version: { id: string }) => version.id === sourceBlock.currentVersionId) ?? sourceBlock.versions[0];

    if (!sourceVersion) {
      return NextResponse.json({ message: "This block does not have a version to duplicate." }, { status: 400 });
    }

    const duplicatedBlock = await prisma.contentBlock.create({
      data: {
        name: `${sourceBlock.name} Copy`,
        description: sourceBlock.description,
        category: sourceBlock.category,
        scope: sourceBlock.scope,
        placement: sourceBlock.placement
      }
    });

    const duplicatedVersion = await prisma.contentBlockVersion.create({
      data: {
        contentBlockId: duplicatedBlock.id,
        versionNumber: 1,
        title: sourceVersion.title,
        body: sourceVersion.body,
        plainText: sourceVersion.plainText,
        bodyFormat: sourceVersion.bodyFormat,
        textWeight: sourceVersion.textWeight,
        textColor: sourceVersion.textColor,
        changeNote: `Duplicated from ${sourceBlock.name}`
      }
    });

    await prisma.contentBlock.update({
      where: { id: duplicatedBlock.id },
      data: { currentVersionId: duplicatedVersion.id }
    });

    return NextResponse.json(await getContentBlockById(duplicatedBlock.id), { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to duplicate block." }, { status: 500 });
  }
}
