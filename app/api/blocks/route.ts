import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getContentBlockById } from "@/lib/data/jobs";
import { blockCreateSchema } from "@/lib/validation/blocks";

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function POST(request: Request) {
  try {
    const payload = blockCreateSchema.parse(await request.json());

    const block = await prisma.contentBlock.create({
      data: {
        name: payload.name,
        description: clean(payload.description),
        category: payload.category,
        scope: payload.scope,
        placement: payload.placement
      }
    });

    const version = await prisma.contentBlockVersion.create({
      data: {
        contentBlockId: block.id,
        versionNumber: 1,
        title: payload.title,
        body: payload.body,
        plainText: payload.body,
        bodyFormat: payload.bodyFormat,
        textWeight: payload.textWeight,
        textColor: payload.textColor,
        changeNote: clean(payload.changeNote) ?? "Initial version"
      }
    });

    await prisma.contentBlock.update({
      where: { id: block.id },
      data: { currentVersionId: version.id }
    });

    return NextResponse.json(await getContentBlockById(block.id), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to create block." }, { status: 500 });
  }
}
