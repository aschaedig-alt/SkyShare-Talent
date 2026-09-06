import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import {
  getDispositionOverrides,
  saveDispositionOverrides
} from "@/lib/data/disposition-groups";

export const dynamic = "force-dynamic";

/**
 * Disposition reasons — the wordings on applications, and how they are grouped.
 *
 * TWO DIFFERENT OPERATIONS, deliberately on different verbs, because one is
 * reversible and the other is not.
 *
 * PUT  — recategorise. Stores "this wording means that group", overriding the
 *        pattern matcher. Touches NO application; drop the override and the
 *        pattern's answer comes straight back.
 *
 * POST — merge or reword. Rewrites CandidateApplication.status across every row
 *        carrying a wording. That is real data, imported from Paycom, and there
 *        is no undo — so the response and the activity log both carry the old
 *        wording and the exact count, and a dryRun is offered to see the count
 *        before committing.
 */
export async function GET() {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ overrides: await getDispositionOverrides() });
}

export async function PUT(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { overrides?: unknown };
  if (!body.overrides || typeof body.overrides !== "object") {
    return NextResponse.json({ message: "overrides must be an object." }, { status: 400 });
  }

  const before = await getDispositionOverrides();
  const overrides = await saveDispositionOverrides(body.overrides);

  // Only the CHANGES go in the log — the whole map every time would bury them.
  const changed: string[] = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(overrides)])) {
    if (before[k] !== overrides[k]) {
      changed.push(`"${k}": ${before[k] ?? "(pattern)"} -> ${overrides[k] ?? "(pattern)"}`);
    }
  }
  if (changed.length) {
    await logActivity({
      userId: auth.user?.id,
      userEmail: auth.user?.email || undefined,
      activityType: "CANDIDATE_EDITED",
      description: `Recategorised ${changed.length} disposition wording${changed.length === 1 ? "" : "s"} — ${changed.join("; ")}`,
      entityType: "Workspace",
      entityId: "disposition-groups"
    });
  }

  return NextResponse.json({ ok: true, overrides, changed: changed.length });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    from?: unknown;
    into?: unknown;
    dryRun?: unknown;
  };
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const into = typeof body.into === "string" ? body.into.trim() : "";
  if (!from) return NextResponse.json({ message: "Which wording?" }, { status: 400 });
  if (!into) return NextResponse.json({ message: "Reword it to what?" }, { status: 400 });
  if (into.length > 200) {
    return NextResponse.json({ message: "That wording is too long." }, { status: 400 });
  }
  if (from === into) return NextResponse.json({ message: "That is the same wording." }, { status: 400 });

  // Matched EXACTLY, including the "xx - " prefix if the stored row has one.
  // A loose match here would sweep up wordings nobody asked to change.
  const affected = await prisma.candidateApplication.count({ where: { status: from } });
  if (affected === 0) {
    return NextResponse.json(
      { message: `No applications carry exactly "${from}".` },
      { status: 404 }
    );
  }

  if (body.dryRun) return NextResponse.json({ ok: true, dryRun: true, affected, from, into });

  await prisma.candidateApplication.updateMany({
    where: { status: from },
    data: { status: into }
  });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    // The OLD wording and the count are the only route back — this overwrites
    // text imported from Paycom on rows we do not otherwise track.
    description:
      `Reworded a disposition on ${affected} application${affected === 1 ? "" : "s"}: ` +
      `"${from}" -> "${into}"`,
    entityType: "Workspace",
    entityId: "disposition-reasons"
  });

  return NextResponse.json({ ok: true, affected, from, into });
}
