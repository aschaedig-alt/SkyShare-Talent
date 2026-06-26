import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { defaultTaskCreateData } from "@/lib/data/onboarding";
import { ensureCustomMilestoneTasks } from "@/lib/data/onboarding-milestones";
import type { ParsedHireRow } from "@/lib/onboarding/import-hires";

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

const normName = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const normEmail = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();

type RowResult = { name: string; status: "created" | "skipped"; reason?: string };

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { rows?: ParsedHireRow[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ message: "No rows to import." }, { status: 400 });
    }
    if (rows.length > 1000) {
      return NextResponse.json({ message: "That is more than 1000 rows — split the import." }, { status: 400 });
    }

    // Existing hires (any stage) to dedupe against, by normalized name + emails.
    const existing = await prisma.newHire.findMany({ select: { name: true, ssEmail: true, personalEmail: true } });
    const seenNames = new Set(existing.map((h) => normName(h.name)));
    const seenEmails = new Set(
      existing.flatMap((h) => [normEmail(h.ssEmail), normEmail(h.personalEmail)]).filter(Boolean)
    );

    const results: RowResult[] = [];
    const createdIds: string[] = [];

    for (const row of rows) {
      const name = strOrNull(row.name);
      if (!name) {
        results.push({ name: "(no name)", status: "skipped", reason: "missing name" });
        continue;
      }
      const nName = normName(name);
      const ss = normEmail(row.ssEmail);
      const personal = normEmail(row.personalEmail);

      const dupByName = seenNames.has(nName);
      const dupByEmail = (ss && seenEmails.has(ss)) || (personal && seenEmails.has(personal));
      if (dupByName || dupByEmail) {
        results.push({ name, status: "skipped", reason: dupByName ? "already in system (name)" : "already in system (email)" });
        continue;
      }

      const hire = await prisma.newHire.create({
        data: {
          name,
          position: strOrNull(row.position),
          department: strOrNull(row.department),
          phone: strOrNull(row.phone),
          ssEmail: strOrNull(row.ssEmail),
          personalEmail: strOrNull(row.personalEmail),
          offerSentDate: parseDate(row.offerSentDate),
          offerSignedDate: parseDate(row.offerSignedDate),
          startDate: parseDate(row.startDate),
          orientationDate: parseDate(row.orientationDate),
          stage: "ACTIVE",
          tasks: { create: defaultTaskCreateData() }
        },
        select: { id: true }
      });
      await ensureCustomMilestoneTasks(hire.id);

      createdIds.push(hire.id);
      // Mark as seen so duplicate rows within the same file aren't created twice.
      seenNames.add(nName);
      if (ss) seenEmails.add(ss);
      if (personal) seenEmails.add(personal);
      results.push({ name, status: "created" });
    }

    const created = results.filter((r) => r.status === "created").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    return NextResponse.json({ ok: true, created, skipped, results });
  } catch (error) {
    console.error("New hire import error:", error);
    return NextResponse.json({ message: "Unable to import hires." }, { status: 500 });
  }
}
