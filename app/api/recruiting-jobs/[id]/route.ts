import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { detectSeat, extractAircraftTypes, isPilotTitle, createPilotRequirementGates } from "@/lib/imports/job-import";
import { logActivity } from "@/lib/activity/logger";
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
      status?: string;
      title?: string;
    };

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ message: "Job not found." }, { status: 404 });
    }

    // RENAMING. Handled on its own and returns early, for the same reason as the
    // status and paycomReqId branches below: everything past them treats the call
    // as a classification change and sets isPilotRole = true, so routing a rename
    // through it would quietly turn a maintenance job into a pilot one.
    //
    // WHY THE APP NEEDED THIS. Job titles came from imports and could not be
    // touched, which forced the mismatch backfill of Sep 8 to exist at all: a
    // NewHire position read "560XL Captain" where the job was "Citation 560XL
    // Captain", and 41 of 47 hired people matched nothing by title. His words:
    // "i need to be able to edit the existing job names and it would fix this
    // issue."
    if (body.title !== undefined) {
      const title = String(body.title ?? "").trim();
      if (!title) {
        return NextResponse.json({ message: "A job needs a title." }, { status: 400 });
      }
      if (title.length > 200) {
        return NextResponse.json({ message: "That title is too long — keep it under 200 characters." }, { status: 400 });
      }
      if (title === job.title) {
        return NextResponse.json({ ok: true, title, unchanged: true });
      }

      // normalizedTitle is what duplicate detection and the importer's
      // find-an-existing-job lookup read, so it moves WITH the title. Same
      // expression the importer and the create route use, deliberately.
      const normalizedTitle = title.toLowerCase().replace(/\s+/g, " ").trim();

      // RENAMING ONTO AN EXISTING NAME IS REFUSED, and the message says what to do
      // instead. Exactly the rule the tag rename already follows: two rows with one
      // normalizedTitle is the duplicate state the merge tooling exists to resolve,
      // and creating it by rename would hide a real job behind another one. Merged
      // rows are excluded because their name is already spoken for by their survivor.
      const clash = await prisma.job.findFirst({
        where: { normalizedTitle, id: { not: id }, mergedIntoJobId: null },
        select: { id: true, title: true, status: true }
      });
      if (clash) {
        return NextResponse.json(
          {
            message:
              `"${clash.title}" already uses that name${clash.status === "MERGED" ? "" : ` (${clash.status.toLowerCase()})`}. ` +
              "Merge the two jobs instead of renaming one onto the other.",
            clashJobId: clash.id
          },
          { status: 409 }
        );
      }

      const previousTitle = job.title;
      await prisma.job.update({ where: { id }, data: { title, normalizedTitle } });

      // The OLD title goes in the log. This overwrites text that came from an
      // import, and without it there is no way back to what the req was called.
      await logActivity({
        userId: auth.user?.id,
        userEmail: auth.user?.email || undefined,
        activityType: "CANDIDATE_EDITED",
        description: `Renamed the job "${previousTitle}" to "${title}"`,
        entityType: "Job",
        entityId: id
      });

      // THE CLASSIFICATION IS NOT RE-DERIVED, and that is deliberate rather than
      // lazy. isPilotRole, pilotSeat and the aircraft list were derived from the
      // ORIGINAL title at import and may have been corrected by hand since — this
      // endpoint's own classification branch exists for that. Re-deriving here
      // would silently throw a person's correction away on an unrelated edit.
      //
      // But a rename CAN make the stored classification wrong, so the response says
      // when what the new title implies differs from what is stored, and the caller
      // decides. Reported, not acted on.
      const wouldBePilot = isPilotTitle(title);
      const wouldBeSeat = wouldBePilot ? detectSeat(title) : null;
      const classificationLooksStale =
        wouldBePilot !== job.isPilotRole || (wouldBePilot && wouldBeSeat !== job.pilotSeat);

      return NextResponse.json({
        ok: true,
        title,
        previousTitle,
        classificationLooksStale,
        ...(classificationLooksStale ? { suggested: { isPilotRole: wouldBePilot, pilotSeat: wouldBeSeat } } : {})
      });
    }

    // Active/inactive is just the status. Handled on its own and returns early for
    // the same reason as paycomReqId below: the rest of this endpoint is
    // classification and sets isPilotRole = true, so routing a status change
    // through it would flip a support job to pilot as a side effect.
    if (body.status !== undefined) {
      const STATUSES = ["OPEN", "FILLED", "RETIRED"];
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ message: "Unknown job status." }, { status: 400 });
      }
      await prisma.job.update({ where: { id }, data: { status: body.status } });

      // Closing a job stops the Matchboard scanning for it — but ONLY for roles we
      // operate ourselves.
      //
      // NOT a blind cascade, and this is the whole subtlety. Most managed
      // owner-aircraft roles sit on a RETIRED job row while the role itself is very
      // much live: the job record was for a posting that closed, the seat belongs to
      // the aircraft. Measured Aug 28, deriving "job retired => requirement inactive"
      // across the board would have switched off most of the managed fleet. A
      // SkyShare role follows its job; a managed role follows its tail, so it is left
      // alone here and is switched off when the aircraft leaves.
      //
      // INACTIVE rather than HISTORICAL: /api/pilot-requirements treats INACTIVE as a
      // current requirement, so the row keeps blocking a duplicate for the same fleet
      // position, and reopening the job below brings this exact row back rather than
      // making a second one.
      const reopening = body.status === "OPEN";
      const requirementSync = await prisma.pilotRequirement.updateMany({
        where: {
          sourceJobRecordId: id,
          operatorType: "SkyShare",
          status: reopening ? "INACTIVE" : "ACTIVE"
        },
        data: { status: reopening ? "ACTIVE" : "INACTIVE" }
      });

      const alsoClassifying =
        body.isPilotRole !== undefined || body.pilotSeat !== undefined || body.aircraftTypes !== undefined;
      if (!alsoClassifying && body.paycomReqId === undefined) {
        return NextResponse.json({ ok: true, status: body.status, requirementsChanged: requirementSync.count });
      }
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
