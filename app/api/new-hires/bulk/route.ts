import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

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

// Apply one change to many new hires at once. The patch mirrors the single-hire
// PATCH so stage transitions behave identically (onboardedAt on POST_ONBOARD,
// employmentStatus reset on reactivate).
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { ids?: unknown; patch?: Record<string, unknown> };
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
    const patch = body.patch ?? {};

    if (ids.length === 0) {
      return NextResponse.json({ message: "Select at least one person." }, { status: 400 });
    }
    if (ids.length > 500) {
      return NextResponse.json({ message: "Too many at once — select 500 or fewer." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if (typeof patch.stage === "string" && STAGES.includes(patch.stage as (typeof STAGES)[number])) {
      data.stage = patch.stage;
      if (patch.stage === "POST_ONBOARD") data.onboardedAt = new Date();
      if (patch.stage === "ACTIVE") data.employmentStatus = "ACTIVE";
    }
    if ("orientationDate" in patch) {
      const d = parseDate(patch.orientationDate);
      if (d !== undefined) data.orientationDate = d;
    }
    if ("department" in patch) {
      const dept = strOrNull(patch.department);
      if (dept !== undefined) data.department = dept;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ message: "Nothing to change." }, { status: 400 });
    }

    const result = await prisma.newHire.updateMany({ where: { id: { in: ids } }, data });
    return NextResponse.json({ ok: true, count: result.count });
  } catch (error) {
    console.error("New hire bulk update error:", error);
    return NextResponse.json({ message: "Unable to apply the bulk change." }, { status: 500 });
  }
}
