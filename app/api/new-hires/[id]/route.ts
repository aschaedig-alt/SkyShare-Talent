import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ id: string }> };

const STAGES = ["ACTIVE", "POST_ONBOARD", "ARCHIVED"] as const;

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function strOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    for (const field of ["name", "position", "department", "phone", "ssEmail", "personalEmail", "travelStatus", "notes"]) {
      const v = strOrNull(body[field]);
      if (v !== undefined) data[field] = v;
    }
    if (body.name !== undefined && (!data.name || String(data.name).trim().length === 0)) {
      return NextResponse.json({ message: "Name cannot be empty." }, { status: 400 });
    }

    for (const field of ["offerSentDate", "offerSignedDate", "startDate", "orientationDate"]) {
      const d = parseDate(body[field]);
      if (d !== undefined) data[field] = d;
    }

    if (typeof body.stage === "string" && STAGES.includes(body.stage as (typeof STAGES)[number])) {
      data.stage = body.stage;
      if (body.stage === "POST_ONBOARD") {
        data.onboardedAt = new Date();
      }
    }
    if (typeof body.canceled === "boolean") {
      data.canceled = body.canceled;
    }
    if (body.employmentStatus === "ACTIVE" || body.employmentStatus === "TERMINATED") {
      data.employmentStatus = body.employmentStatus;
    }

    const updated = await prisma.newHire.update({ where: { id }, data });
    return NextResponse.json({ ok: true, id: updated.id });
  } catch (error) {
    console.error("New hire update error:", error);
    return NextResponse.json({ message: "Unable to update new hire." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    await prisma.newHire.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("New hire delete error:", error);
    return NextResponse.json({ message: "Unable to delete new hire." }, { status: 500 });
  }
}
