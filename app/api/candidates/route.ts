import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { normalizeEmail, normalizeName, normalizePhone, splitCandidateName } from "@/lib/candidates/normalize";

type CreateBody = {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  currentTitle?: string;
  stage?: string;
  tags?: string;
  jobId?: string;
};

function parseTags(value: string | undefined) {
  if (!value) return [];
  return value
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// GET /api/candidates?q=  — lightweight search used by the "Add candidate to job" picker.
export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  const candidates = await prisma.candidate.findMany({
    where: {
      archivedAt: null,
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { normalizedEmail: { contains: q.toLowerCase() } },
              { normalizedName: { contains: q.toLowerCase() } }
            ]
          }
        : {})
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, displayName: true, currentTitle: true, stage: true, primaryEmail: true }
  });

  return NextResponse.json({ candidates });
}

// POST /api/candidates — create a candidate (optionally linking to a job in one step).
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateBody;

    const first = body.firstName?.trim() || null;
    const last = body.lastName?.trim() || null;
    let firstName = first;
    let lastName = last;
    let displayName = [first, last].filter(Boolean).join(" ").trim();
    if (!displayName) {
      const split = splitCandidateName(body.displayName);
      firstName = split.firstName;
      lastName = split.lastName;
      displayName = split.displayName;
    }

    if (!displayName || displayName === "Unnamed candidate") {
      return NextResponse.json({ message: "A name is required." }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(body.email);
    const normalizedPhone = normalizePhone(body.phone);
    const tags = parseTags(body.tags);

    // Reuse an existing candidate if the email or phone already matches, to avoid duplicates.
    const existing =
      normalizedEmail || normalizedPhone
        ? await prisma.candidate.findFirst({
            where: {
              OR: [
                normalizedEmail ? { normalizedEmail } : undefined,
                normalizedPhone ? { normalizedPhone } : undefined
              ].filter(Boolean) as Array<{ normalizedEmail: string } | { normalizedPhone: string }>
            }
          })
        : null;

    const candidate =
      existing ??
      (await prisma.candidate.create({
        data: {
          firstName,
          lastName,
          displayName,
          normalizedName: normalizeName(displayName),
          primaryEmail: body.email?.trim() || null,
          normalizedEmail,
          primaryPhone: body.phone?.trim() || null,
          normalizedPhone,
          currentTitle: body.currentTitle?.trim() || null,
          status: "ACTIVE",
          stage: body.stage?.trim() || "New",
          source: "Manual entry",
          tagsJson: tags.length ? JSON.stringify(tags) : null
        }
      }));

    if (!existing) {
      if (normalizedEmail) {
        await prisma.candidateContact.create({
          data: { candidateId: candidate.id, type: "EMAIL", value: body.email!.trim(), normalized: normalizedEmail, isPrimary: true, source: "Manual entry" }
        });
      }
      if (normalizedPhone) {
        await prisma.candidateContact.create({
          data: { candidateId: candidate.id, type: "PHONE", value: body.phone!.trim(), normalized: normalizedPhone, isPrimary: true, source: "Manual entry" }
        });
      }
    }

    if (body.jobId) {
      const already = await prisma.candidateApplication.findFirst({
        where: { candidateId: candidate.id, jobId: body.jobId }
      });
      if (!already) {
        await prisma.candidateApplication.create({
          data: {
            candidateId: candidate.id,
            jobId: body.jobId,
            status: body.stage?.trim() || "New",
            stage: "Applied",
            source: "Manual entry",
            appliedAt: new Date()
          }
        });
      }
    }

    return NextResponse.json({ candidate: { id: candidate.id, displayName: candidate.displayName }, reused: Boolean(existing) });
  } catch {
    return NextResponse.json({ message: "Unable to create candidate." }, { status: 500 });
  }
}
