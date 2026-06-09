import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getContentBlockById } from "@/lib/data/jobs";
import { blockPlacementUpdateSchema } from "@/lib/validation/blocks";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = blockPlacementUpdateSchema.parse(await request.json());

    await prisma.contentBlock.update({
      where: { id },
      data: { placement: payload.placement }
    });

    return NextResponse.json(await getContentBlockById(id));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to update block placement." }, { status: 500 });
  }
}
