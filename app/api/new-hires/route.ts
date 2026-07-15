import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { defaultTaskCreateData } from "@/lib/data/onboarding";
import { ensureCustomMilestoneTasks } from "@/lib/data/onboarding-milestones";
import { ensureInitialRole } from "@/lib/data/ensure-initial-role";

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = strOrNull(body.name);
    if (!name) {
      return NextResponse.json({ message: "Name is required." }, { status: 400 });
    }

    const hire = await prisma.newHire.create({
      data: {
        name,
        position: strOrNull(body.position),
        department: strOrNull(body.department),
        phone: strOrNull(body.phone),
        ssEmail: strOrNull(body.ssEmail),
        personalEmail: strOrNull(body.personalEmail),
        offerSentDate: parseDate(body.offerSentDate),
        offerSignedDate: parseDate(body.offerSignedDate),
        startDate: parseDate(body.startDate),
        orientationDate: parseDate(body.orientationDate),
        stage: "ACTIVE",
        candidateId: strOrNull(body.candidateId),
        tasks: { create: defaultTaskCreateData() }
      }
    });

    await ensureCustomMilestoneTasks(hire.id);
    // Seed the first role-journey entry from position + start date (if both set).
    await ensureInitialRole(hire.id);

    return NextResponse.json({ ok: true, id: hire.id });
  } catch (error) {
    console.error("New hire create error:", error);
    return NextResponse.json({ message: "Unable to create new hire." }, { status: 500 });
  }
}
