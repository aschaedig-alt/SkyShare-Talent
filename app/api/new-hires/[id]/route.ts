import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth/route-auth";
import { canWriteModule } from "@/lib/auth/module-write-access";
import { isCardStatus } from "@/lib/business-cards/card";
import { normalizeTags } from "@/lib/employees/columns";
import { ensureInitialRole } from "@/lib/data/ensure-initial-role";

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
  const auth = await requireApiUser();
  if (!auth.ok) {
    return (auth as { ok: false; response: NextResponse }).response;
  }
  if (!(await canWriteModule(auth.user, "people", "edit"))) {
    return NextResponse.json({ message: "You do not have permission to edit employees." }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    // candidateId links this hire back to its Candidate record (set when moving a
    // candidate into pre-onboarding, or linking to an already-typed hire).
    for (const field of ["name", "legalName", "position", "department", "location", "managedAircraft", "phone", "ssEmail", "personalEmail", "supervisorName", "supervisorEmail", "supervisorHireId", "supervisor2Name", "supervisor2Email", "supervisor2HireId", "birthCountry", "citizenshipCountry", "travelStatus", "notes", "candidateId"]) {
      const v = strOrNull(body[field]);
      if (v !== undefined) data[field] = v;
    }
    if (body.name !== undefined && (!data.name || String(data.name).trim().length === 0)) {
      return NextResponse.json({ message: "Name cannot be empty." }, { status: 400 });
    }

    if (isCardStatus(body.businessCardStatus)) {
      data.businessCardStatus = body.businessCardStatus;
    }
    if ("businessCardTitle" in body) {
      const t = typeof body.businessCardTitle === "string" ? body.businessCardTitle.trim() : "";
      data.businessCardTitle = t.length ? t : null;
    }
    // Seniority NUMBER, typed by hand from the Paycom pilot list. Empty string
    // clears it back to null rather than storing 0 — "not recorded" and
    // "number zero" are different answers.
    if ("seniorityNumber" in body) {
      const raw = body.seniorityNumber;
      if (raw === null || raw === "") {
        data.seniorityNumber = null;
      } else {
        const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
        if (Number.isFinite(n) && n >= 0) data.seniorityNumber = n;
      }
    }
    if (typeof body.orientationNotNeeded === "boolean") {
      data.orientationNotNeeded = body.orientationNotNeeded;
    }
    if (typeof body.managedPilot === "boolean") {
      data.managedPilot = body.managedPilot;
    }
    if (Array.isArray(body.tags)) {
      data.tags = normalizeTags(body.tags);
    }

    for (const field of ["offerSentDate", "offerSignedDate", "startDate", "orientationDate", "aircraftServiceDate", "seniorityDate"]) {
      const d = parseDate(body[field]);
      if (d !== undefined) data[field] = d;
    }

    if (typeof body.stage === "string" && STAGES.includes(body.stage as (typeof STAGES)[number])) {
      data.stage = body.stage;
      if (body.stage === "POST_ONBOARD") {
        data.onboardedAt = new Date();
      }
      if (body.stage === "ACTIVE") {
        data.employmentStatus = "ACTIVE"; // reactivating clears a prior termination
      }
    }
    if (typeof body.canceled === "boolean") {
      data.canceled = body.canceled;
    }
    // Terminating moves an employee to Archived (Past); re-activating returns them
    // to Post-onboard (Current). We also reconcile the role journey so it stays
    // consistent: closing the open role/stint at the last day, or reopening them.
    const empChange =
      body.employmentStatus === "TERMINATED" ? "TERMINATED" : body.employmentStatus === "ACTIVE" ? "ACTIVE" : body.employmentStatus === "CONTRACT" ? "CONTRACT" : null;
    let termDate: Date | null = null;
    if (empChange === "TERMINATED") {
      data.employmentStatus = "TERMINATED";
      data.stage = "ARCHIVED";
      const parsed = parseDate(body.terminationDate);
      termDate = parsed instanceof Date ? parsed : new Date();
      data.terminationDate = termDate;
    } else if (empChange === "ACTIVE") {
      data.employmentStatus = "ACTIVE";
      data.stage = "POST_ONBOARD";
      data.terminationDate = null;
    } else if (empChange === "CONTRACT") {
      // Contract worker: no longer an active employee, but not a hard termination —
      // leave the role journey intact and keep them in the roster (badged "Contract").
      data.employmentStatus = "CONTRACT";
      data.terminationDate = null;
    }

    if (empChange) {
      await prisma.$transaction(async (tx) => {
        await tx.newHire.update({ where: { id }, data });
        if (empChange === "TERMINATED" && termDate) {
          // Close the open role + stint at the last day.
          await tx.roleAssignment.updateMany({ where: { newHireId: id, endDate: null, startDate: { lte: termDate } }, data: { endDate: termDate } });
          await tx.employmentStint.updateMany({ where: { newHireId: id, endDate: null, startDate: { lte: termDate } }, data: { endDate: termDate } });
        } else if (empChange === "ACTIVE") {
          // Reopen the latest stint + role so they have a current role again.
          const latestStint = await tx.employmentStint.findFirst({ where: { newHireId: id }, orderBy: { startDate: "desc" }, select: { id: true, endDate: true } });
          if (latestStint?.endDate) await tx.employmentStint.update({ where: { id: latestStint.id }, data: { endDate: null } });
          const latestRole = await tx.roleAssignment.findFirst({ where: { newHireId: id }, orderBy: { startDate: "desc" }, select: { id: true, endDate: true } });
          if (latestRole?.endDate) await tx.roleAssignment.update({ where: { id: latestRole.id }, data: { endDate: null } });
        }
      });
      return NextResponse.json({ ok: true, id });
    }

    const updated = await prisma.newHire.update({ where: { id }, data });
    // If this update just supplied a position + start date, seed the first
    // role-journey entry (no-op if they already have one).
    await ensureInitialRole(updated.id);
    return NextResponse.json({ ok: true, id: updated.id });
  } catch (error) {
    console.error("New hire update error:", error);
    return NextResponse.json({ message: "Unable to update new hire." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return (auth as { ok: false; response: NextResponse }).response;
  }
  if (!(await canWriteModule(auth.user, "people", "delete"))) {
    return NextResponse.json({ message: "You do not have permission to delete employees." }, { status: 403 });
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
