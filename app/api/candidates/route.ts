import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, authFailureResponse } from "@/lib/auth/route-auth";
import { candidateScopeWhere } from "@/lib/auth/candidate-scope";
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
    // The prepared response rather than a flat 401: it distinguishes "not signed
    // in" from "this account has the candidates module switched off", and the
    // caller here only ever checks res.ok.
    return authFailureResponse(auth);
  }

  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  // Opt-in: include ARCHIVED candidates too. Off by default so the everyday picker
  // stays active-only, but the "add to a job" search turns it on — you often need
  // to link someone who was archived (reconsidering them for a new position, which
  // is exactly what archiving should not block).
  const includeArchived = params.get("includeArchived") === "1";

  // An allowlisted viewer searches only the people they were granted. This is
  // the sharpest edge of the whole restriction: the picker hands back ids, names
  // and emails ten rows at a time on a free-text query, so scoping the list PAGE
  // and leaving this route open would make the allowlist theatre — you could walk
  // the roster from here two letters at a time. Null for everyone else, which is
  // what keeps this safe to add to a route the whole team uses.
  const allowlist = candidateScopeWhere(auth.user.viewer);

  const candidates = await prisma.candidate.findMany({
    where: {
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { normalizedEmail: { contains: q.toLowerCase() } },
              { normalizedName: { contains: q.toLowerCase() } }
            ]
          }
        : {}),
      // Into AND rather than a top-level id key: the OR above is a sibling key,
      // and an id written alongside it would narrow the search rather than
      // intersect with it the moment either side grows another clause.
      ...(allowlist ? { AND: [allowlist] } : {})
    },
    // Active (archivedAt null) first, then most recently touched.
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { updatedAt: "desc" }],
    take: 10,
    select: { id: true, displayName: true, currentTitle: true, stage: true, primaryEmail: true, archivedAt: true }
  });

  return NextResponse.json({
    candidates: candidates.map(({ archivedAt, ...c }) => ({ ...c, archived: Boolean(archivedAt) }))
  });
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

    let reactivated = false;
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

      // If we matched an ARCHIVED candidate, linking them to a job means we are
      // considering them again — bring them back into the active pipeline, the
      // same way POST /api/candidate-applications does. But NOT if they are
      // archived because they were already HIRED and are a current employee
      // (their candidate record is archived precisely so an employee doesn't sit
      // in the candidate pipeline — e.g. Matt Dahle). Without this, the "new
      // candidate on a job" path silently left an archived match archived and
      // could staple an application onto a working employee's record.
      if (existing?.archivedAt) {
        const employedHire = await prisma.newHire.findFirst({
          where: {
            candidateId: candidate.id,
            stage: { in: ["ACTIVE", "POST_ONBOARD"] },
            NOT: { employmentStatus: "TERMINATED" }
          },
          select: { id: true }
        });
        if (!employedHire) {
          await prisma.candidate.update({
            where: { id: candidate.id },
            data: { archivedAt: null, status: "ACTIVE" }
          });
          reactivated = true;
        }
      }
    }

    return NextResponse.json({ candidate: { id: candidate.id, displayName: candidate.displayName }, reused: Boolean(existing), reactivated });
  } catch {
    return NextResponse.json({ message: "Unable to create candidate." }, { status: 500 });
  }
}
