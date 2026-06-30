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

const STRING_FIELDS = ["position", "department", "phone", "ssEmail", "personalEmail"] as const;
const DATE_FIELDS = ["offerSentDate", "offerSignedDate", "startDate", "orientationDate"] as const;

type ExistingHire = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  phone: string | null;
  ssEmail: string | null;
  personalEmail: string | null;
  offerSentDate: Date | null;
  offerSignedDate: Date | null;
  startDate: Date | null;
  orientationDate: Date | null;
};

type RowResult = { name: string; status: "created" | "updated" | "unchanged"; changed?: string[] };

const sameDay = (a: Date | null, b: Date | null) => (a ? a.getTime() : null) === (b ? b.getTime() : null);

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

    // Existing hires (any stage) keyed by normalized name + emails so we can
    // match a person already in the system and update only what changed.
    const existing = (await prisma.newHire.findMany({
      select: {
        id: true,
        name: true,
        position: true,
        department: true,
        phone: true,
        ssEmail: true,
        personalEmail: true,
        offerSentDate: true,
        offerSignedDate: true,
        startDate: true,
        orientationDate: true
      }
    })) as ExistingHire[];

    const byName = new Map<string, ExistingHire>();
    const byEmail = new Map<string, ExistingHire>();
    for (const h of existing) {
      if (normName(h.name)) byName.set(normName(h.name), h);
      for (const e of [normEmail(h.ssEmail), normEmail(h.personalEmail)]) if (e) byEmail.set(e, h);
    }

    const results: RowResult[] = [];

    for (const row of rows) {
      const name = strOrNull(row.name);
      if (!name) continue;
      const ss = normEmail(row.ssEmail);
      const personal = normEmail(row.personalEmail);

      const match = byName.get(normName(name)) ?? (ss ? byEmail.get(ss) : undefined) ?? (personal ? byEmail.get(personal) : undefined);

      if (match) {
        // Update only fields the sheet provides AND that differ — never wipe.
        const data: Record<string, unknown> = {};
        const changed: string[] = [];
        for (const f of STRING_FIELDS) {
          const incoming = strOrNull(row[f]);
          if (incoming !== null && incoming !== match[f]) {
            data[f] = incoming;
            changed.push(f);
          }
        }
        for (const f of DATE_FIELDS) {
          const incoming = parseDate(row[f]);
          if (incoming !== null && !sameDay(incoming, match[f])) {
            data[f] = incoming;
            changed.push(f);
          }
        }
        if (changed.length > 0) {
          await prisma.newHire.update({ where: { id: match.id }, data });
          // Reflect the update in our in-memory copy for later rows in the batch.
          Object.assign(match, data);
          results.push({ name, status: "updated", changed });
        } else {
          results.push({ name, status: "unchanged" });
        }
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
        select: {
          id: true,
          name: true,
          position: true,
          department: true,
          phone: true,
          ssEmail: true,
          personalEmail: true,
          offerSentDate: true,
          offerSignedDate: true,
          startDate: true,
          orientationDate: true
        }
      });
      await ensureCustomMilestoneTasks(hire.id);

      // Register so duplicate rows within the same file match this new record.
      const created = hire as ExistingHire;
      byName.set(normName(created.name), created);
      if (ss) byEmail.set(ss, created);
      if (personal) byEmail.set(personal, created);
      results.push({ name, status: "created" });
    }

    const created = results.filter((r) => r.status === "created").length;
    const updated = results.filter((r) => r.status === "updated").length;
    const unchanged = results.filter((r) => r.status === "unchanged").length;

    return NextResponse.json({ ok: true, created, updated, unchanged, results });
  } catch (error) {
    console.error("New hire import error:", error);
    return NextResponse.json({ message: "Unable to import hires." }, { status: 500 });
  }
}
