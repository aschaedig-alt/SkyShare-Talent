import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { detectSeat, extractAircraftTypes, createPilotRequirementGates } from "@/lib/imports/job-import";
import { parseStringArray } from "@/lib/json";

type RouteContext = { params: Promise<{ id: string }> };


export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("jobs:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      isPilotRole?: boolean;
      pilotSeat?: string | null;
      aircraftTypes?: string[];
      paycomReqId?: string | null;
    };

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ message: "Job not found." }, { status: 404 });
    }

    // Paycom's requisition number (3296) is plain metadata, not classification, so
    // it is handled on its own and returns early. Everything below this point
    // treats the call as a classification change and would set isPilotRole = true
    // as a side effect — which would quietly turn a maintenance job into a pilot
    // one just for recording a req number. Kept separate from jobReqId because
    // that holds the Jazz codes (AMA.1) and will never match a Paycom number.
    if (body.paycomReqId !== undefined) {
      const trimmed = (body.paycomReqId ?? "").trim();
      if (trimmed && !/^\d{1,20}$/.test(trimmed)) {
        return NextResponse.json({ message: "A Paycom requisition is digits only, e.g. 3296." }, { status: 400 });
      }
      await prisma.job.update({ where: { id }, data: { paycomReqId: trimmed || null } });
      const alsoClassifying =
        body.isPilotRole !== undefined || body.pilotSeat !== undefined || body.aircraftTypes !== undefined;
      if (!alsoClassifying) {
        return NextResponse.json({ ok: true, paycomReqId: trimmed || null });
      }
    }

    // --- Support: clear pilot fields and remove the linked pilot requirement(s) ---
    if (body.isPilotRole === false) {
      const supportCategory =
        job.department && job.department.toLowerCase() !== "pilot" ? job.department : "Support";
      await prisma.job.update({
        where: { id },
        data: {
          isPilotRole: false,
          isPilotLeadershipRole: false,
          pilotSeat: null,
          aircraftTypesJson: null,
          roleCategory: supportCategory
        }
      });
      const removed = await prisma.pilotRequirement.deleteMany({ where: { sourceJobRecordId: id } });
      return NextResponse.json({ ok: true, isPilotRole: false, removedRequirements: removed.count });
    }

    // --- Pilot (either flipping to pilot, or editing seat/aircraft on a pilot job) ---
    const seat =
      body.pilotSeat !== undefined ? body.pilotSeat || null : job.pilotSeat ?? detectSeat(job.title);
    const aircraft =
      body.aircraftTypes !== undefined
        ? body.aircraftTypes.map((a) => a.trim()).filter(Boolean)
        : parseStringArray(job.aircraftTypesJson);

    await prisma.job.update({
      where: { id },
      data: {
        isPilotRole: true,
        pilotSeat: seat,
        aircraftTypesJson: aircraft.length ? JSON.stringify(aircraft) : null,
        roleCategory: "Pilot"
      }
    });

    // If we just flipped a support job to pilot and it has no requirement yet, create one.
    if (body.isPilotRole === true) {
      const existing = await prisma.pilotRequirement.findFirst({ where: { sourceJobRecordId: id } });
      if (!existing) {
        const sourceText = job.rawMinimumRequirements || job.jobDescriptionText || "";
        const detectedAircraft = aircraft.length ? aircraft : extractAircraftTypes(`${job.title}\n${sourceText}`);
        const requirement = await prisma.pilotRequirement.create({
          data: {
            sourceJobRecordId: id,
            title: job.title,
            normalizedTitle: job.title.trim().toLowerCase(),
            status: job.status === "FILLED" ? "HISTORICAL" : "ACTIVE",
            reviewStatus: "DRAFT",
            operatorType: "SkyShare",
            roleCategory: "Pilot",
            pilotSeat: seat,
            aircraftTypesJson: detectedAircraft.length ? JSON.stringify(detectedAircraft) : null,
            baseCity: job.city,
            baseState: job.state,
            payScaleRaw: job.rawPayScale,
            rawMinimumRequirements: job.rawMinimumRequirements,
            originalJobDescriptionText: sourceText || null,
            originalJobDescriptionHtml: job.rawJobDescriptionHtml,
            extractionConfidence: 80,
            extractionWarningsJson: JSON.stringify([]),
            sourceHistoryJson: JSON.stringify([{ type: "manual-reclassify", jobId: id }])
          }
        });
        await createPilotRequirementGates(requirement.id, `${job.title}\n${sourceText}`);
      }
    }

    return NextResponse.json({ ok: true, isPilotRole: true, pilotSeat: seat, aircraftTypes: aircraft });
  } catch (error) {
    console.error("Job reclassify error:", error);
    return NextResponse.json({ message: "Unable to update job classification." }, { status: 500 });
  }
}
