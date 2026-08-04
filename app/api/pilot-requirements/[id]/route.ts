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

    await prisma.$transaction(async (tx) => {
      await tx.pilotRequirement.update({
        where: { id },
        data: {
          title: payload.title,
          normalizedTitle: normalizeTitle(payload.title),
          status: payload.status,
          reviewStatus: payload.reviewStatus,
          operatorType: payload.operatorType ?? null,
          pilotSeat: payload.pilotSeat ?? null,
          baseCity: payload.baseCity ?? null,
          baseState: payload.baseState ?? null,
          baseAirport: payload.baseAirport ?? null,
          payScaleRaw: payload.payScaleRaw ?? null,
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
            operatorType: before.operatorType !== (payload.operatorType ?? null),
            pilotSeat: before.pilotSeat !== (payload.pilotSeat ?? null),
            baseCity: before.baseCity !== (payload.baseCity ?? null),
            baseState: before.baseState !== (payload.baseState ?? null),
            baseAirport: before.baseAirport !== (payload.baseAirport ?? null),
            payScaleRaw: before.payScaleRaw !== (payload.payScaleRaw ?? null),
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
          changedBy: "local-user"
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
