import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { pilotRequirementUpdateSchema } from "@/lib/validation/pilot-requirement";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeTitle(title: string) {
  return title.trim().toLowerCase();
}

function summarizeGateChanges(
  before: Array<{ id: string; enabled: boolean; numericValue: number | null; textValue: string | null; evidenceText: string | null }>,
  after: Array<{ id: string; enabled: boolean; numericValue: number | null; textValue: string | null; evidenceText: string | null }>
) {
  const beforeById = new Map(before.map((gate) => [gate.id, gate]));
  return after
    .map((gate) => {
      const previous = beforeById.get(gate.id);
      if (!previous) {
        return null;
      }

      const changedFields = {
        enabled: previous.enabled !== gate.enabled,
        numericValue: previous.numericValue !== gate.numericValue,
        textValue: previous.textValue !== gate.textValue,
        evidenceText: previous.evidenceText !== gate.evidenceText
      };

      if (!Object.values(changedFields).some(Boolean)) {
        return null;
      }

      return {
        gateId: gate.id,
        changedFields,
        previous,
        next: gate
      };
    })
    .filter(Boolean);
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("requirements:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const payload = pilotRequirementUpdateSchema.parse(await request.json());

    const before = await prisma.pilotRequirement.findUniqueOrThrow({
      where: { id },
      include: {
        gates: true
      }
    });
    const normalizedGates = payload.gates.map((gate) => ({
      id: gate.id,
      enabled: gate.enabled,
      numericValue: gate.numericValue ?? null,
      textValue: gate.textValue ?? null,
      evidenceText: gate.evidenceText ?? null
    }));

    // Operator, seat, base and pay moved to the Role block on the job's Pilot
    // requirement tab (saveRequirementRole), which writes the job and this row
    // together so they cannot drift. The editor no longer sends them, so a field
    // that is ABSENT means "leave it alone". This used to be `?? null`, which
    // would now wipe all six on every gate edit. A field that is sent still saves,
    // including an explicit null to clear it.
    const role = (value: string | null | undefined) => (value === undefined ? undefined : value ?? null);
    const roleChanged = (before: string | null, value: string | null | undefined) =>
      value !== undefined && before !== (value ?? null);

    await prisma.$transaction(async (tx) => {
      await tx.pilotRequirement.update({
        where: { id },
        data: {
          title: payload.title,
          normalizedTitle: normalizeTitle(payload.title),
          status: payload.status,
          reviewStatus: payload.reviewStatus,
          operatorType: role(payload.operatorType),
          pilotSeat: role(payload.pilotSeat),
          baseCity: role(payload.baseCity),
          baseState: role(payload.baseState),
          baseAirport: role(payload.baseAirport),
          payScaleRaw: role(payload.payScaleRaw),
          manualOverrideNotes: payload.manualOverrideNotes ?? null,
          requirementVersion: { increment: 1 },
          lastReviewedAt: payload.reviewStatus === "APPROVED" ? new Date() : undefined
        }
      });

      for (const gate of normalizedGates) {
        await tx.pilotRequirementGate.update({
          where: { id: gate.id },
          data: {
            enabled: gate.enabled,
            numericValue: gate.numericValue,
            textValue: gate.textValue,
            evidenceText: gate.evidenceText
          }
        });
      }

      const changedGates = summarizeGateChanges(before.gates, normalizedGates);

      await tx.pilotRequirementChange.create({
        data: {
          pilotRequirementId: id,
          changeNote: payload.manualOverrideNotes ?? "Updated pilot requirement profile.",
          changedFieldsJson: JSON.stringify({
            title: before.title !== payload.title,
            status: before.status !== payload.status,
            reviewStatus: before.reviewStatus !== payload.reviewStatus,
            operatorType: roleChanged(before.operatorType, payload.operatorType),
            pilotSeat: roleChanged(before.pilotSeat, payload.pilotSeat),
            baseCity: roleChanged(before.baseCity, payload.baseCity),
            baseState: roleChanged(before.baseState, payload.baseState),
            baseAirport: roleChanged(before.baseAirport, payload.baseAirport),
            payScaleRaw: roleChanged(before.payScaleRaw, payload.payScaleRaw),
            gates: changedGates.length
          }),
          previousValuesJson: JSON.stringify({
            title: before.title,
            status: before.status,
            reviewStatus: before.reviewStatus,
            operatorType: before.operatorType,
            pilotSeat: before.pilotSeat,
            baseCity: before.baseCity,
            baseState: before.baseState,
            baseAirport: before.baseAirport,
            payScaleRaw: before.payScaleRaw,
            gates: before.gates
          }),
          newValuesJson: JSON.stringify({ ...payload, gates: normalizedGates }),
          // Who, now that the history is shown on the tab. Every earlier row says
          // "local-user" because this was a constant; the tab reads that as "not
          // recorded". It still is under the local-dev bypass, which has no user.
          changedBy: auth.user.email ?? "local-user"
        }
      });
    });

    return NextResponse.json({ ok: true, message: "Pilot requirement saved." });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Validation failed.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to save pilot requirement." }, { status: 500 });
  }
}
