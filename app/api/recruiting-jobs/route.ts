import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { detectSeat, extractAircraftTypes, isPilotTitle } from "@/lib/imports/job-import";

type CreateJobBody = {
  title?: string;
  department?: string;
  city?: string;
  state?: string;
  status?: string;
  jobReqId?: string;
  paycomReqId?: string;
  /** Create even though a job with this title already exists. */
  force?: boolean;
};

const STATUSES = ["OPEN", "FILLED", "RETIRED"];

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

// Same normalization the importer uses, so a job added here and the same job
// arriving by import collide on purpose rather than becoming two rows.
const normalizeTitle = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Create a role by hand.
 *
 * Until now jobs could only arrive through a CSV/PDF import or a seed script, so
 * a role that exists in real life but was never imported simply could not be
 * offered against — an offer lives on an application, and an application needs a
 * job. That is a dead end for exactly the case this is for: a new requisition you
 * are hiring on right now.
 *
 * Classification (pilot vs support, seat, aircraft) is derived by the SAME
 * functions the importer uses, so a hand-made job behaves identically to an
 * imported one everywhere downstream — matcher, filters, requirements.
 */
export async function POST(request: Request) {
  // jobs:write, matching the sibling PATCH — this is a job, not a candidate.
  const auth = await requireApiPermission("jobs:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateJobBody;
    const title = strOrNull(body.title);
    if (!title) {
      return NextResponse.json({ message: "A job title is required." }, { status: 400 });
    }

    const status = STATUSES.includes(body.status ?? "") ? body.status! : "OPEN";
    const normalizedTitle = normalizeTitle(title);

    // This repo already carries the scars of duplicate jobs — there are four
    // "Gulfstream G200 First Officer" rows, and picking the wrong one puts an
    // offer on a requisition that was filled in 2025. So say so, and let the
    // person decide, rather than quietly adding a fifth.
    if (!body.force) {
      const existing = await prisma.job.findFirst({
        where: { normalizedTitle, status: { not: "MERGED" } },
        select: { id: true, title: true, status: true, department: true },
        orderBy: { createdAt: "desc" }
      });
      if (existing) {
        return NextResponse.json(
          {
            message: `A job called "${existing.title}" already exists (${existing.status.toLowerCase()}). Use that one, or create this anyway.`,
            existing
          },
          { status: 409 }
        );
      }
    }

    const pilot = isPilotTitle(title);
    const city = strOrNull(body.city);
    const state = strOrNull(body.state);
    const department = strOrNull(body.department);
    const aircraft = extractAircraftTypes(title);

    const job = await prisma.job.create({
      data: {
        title,
        normalizedTitle,
        department,
        city,
        state,
        status,
        jobReqId: strOrNull(body.jobReqId),
        paycomReqId: strOrNull(body.paycomReqId),
        // Says where this row came from, the way source does for imported rows.
        source: "Created in app",
        openedDate: new Date(),
        // Derived exactly as the importer would, so nothing downstream can tell
        // the difference between this and an imported role.
        isPilotRole: pilot,
        isPilotLeadershipRole: /\b(chief pilot|assistant chief pilot)\b/i.test(title),
        pilotSeat: pilot ? detectSeat(title) : null,
        aircraftTypesJson: aircraft.length ? JSON.stringify(aircraft) : null,
        roleCategory: pilot ? "Pilot" : department,
        baseLocation: [city, state].filter(Boolean).join(", ") || null
      },
      select: { id: true, title: true, status: true, isPilotRole: true, roleCategory: true }
    });

    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error("Job create error:", error);
    return NextResponse.json({ message: "Unable to create the job." }, { status: 500 });
  }
}
