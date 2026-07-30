
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, requireApiUser } from "@/lib/auth/route-auth";
import { canWriteModule } from "@/lib/auth/module-write-access";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/candidates/normalize";
import { getCandidateProfileData } from "@/lib/data/candidates";
import { logActivity } from "@/lib/activity/logger";
import { isTestTagged, TEST_TAG } from "@/lib/testdata/markers";
import { resolveViewerScope } from "@/lib/auth/viewer-scope";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) {
  return NextResponse.json(
    { message: "Unauthorized" },
    { status: 401 }
  );
}

  const { id } = await params;
  const viewer = await resolveViewerScope(auth.user.role, auth.user.id, auth.user.email);
  const candidate = await getCandidateProfileData(id, viewer);

  if (!candidate) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  return NextResponse.json(candidate);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return (auth as { ok: false; response: NextResponse }).response;
  }
  if (!(await canWriteModule(auth.user, "candidates", "edit"))) {
    return NextResponse.json({ message: "You do not have permission to edit candidates." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const candidate = await prisma.candidate.findUnique({
    where: { id }
  });

  if (!candidate) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  const updateData: Record<string, string | null> = {};

  if (typeof body.displayName === "string") {
    updateData.displayName = body.displayName.trim();
  }

  if (typeof body.firstName === "string") {
    updateData.firstName = body.firstName.trim() || null;
  }

  if (typeof body.lastName === "string") {
    updateData.lastName = body.lastName.trim() || null;
  }

  if (typeof body.currentTitle === "string") {
    updateData.currentTitle = body.currentTitle.trim() || null;
  }

  if (typeof body.status === "string") {
    updateData.status = body.status;
  }

  if (typeof body.stage === "string") {
    updateData.stage = body.stage.trim() || null;
  }

  if (typeof body.source === "string") {
    updateData.source = body.source.trim() || null;
  }

  if (typeof body.owner === "string") {
    updateData.owner = body.owner.trim() || null;
  }

  // Paycom's person id (e.g. 320080). Paycom's "Offer Accepted" emails quote it,
  // and it is the only EXACT key we get for a person — matching on name is what
  // created duplicate people. So it has to be storable before any inbound Paycom
  // automation can be trusted. Digits only, since that is what Paycom issues.
  if (typeof body.paycomPersonId === "string") {
    const trimmed = body.paycomPersonId.trim();
    if (trimmed && !/^\d{1,20}$/.test(trimmed)) {
      return NextResponse.json({ message: "A Paycom ID is digits only, e.g. 320080." }, { status: 400 });
    }
    updateData.paycomPersonId = trimmed || null;
  }

  // The direct link to this person's own Paycom record, pasted in by hand —
  // there is no reliable formula to construct one from paycomPersonId alone.
  // http(s) only, same rule the rich-text editor's link button uses: never
  // javascript:, data:, or a bare scheme.
  if (typeof body.paycomLink === "string") {
    const trimmed = body.paycomLink.trim();
    if (trimmed && !/^https?:\/\/\S+$/i.test(trimmed)) {
      return NextResponse.json({ message: "That doesn't look like a link — it should start with http:// or https://." }, { status: 400 });
    }
    updateData.paycomLink = trimmed || null;
  }

  // Pros & cons — structured strengths/concerns tags (recruiter observations).
  // NOTE: a future compliance audit (CA FEHA, NYC Local Law 144) may require
  // disclaimers/access gating; see roadmap "Scoring transparency & compliance".
  if (Array.isArray(body.pros)) {
    const cleaned = [...new Set(body.pros.map((p: unknown) => String(p).trim()).filter(Boolean))].slice(0, 30);
    updateData.prosJson = cleaned.length ? JSON.stringify(cleaned) : null;
  }
  if (Array.isArray(body.cons)) {
    const cleaned = [...new Set(body.cons.map((c: unknown) => String(c).trim()).filter(Boolean))].slice(0, 30);
    updateData.consJson = cleaned.length ? JSON.stringify(cleaned) : null;
  }

  // Handle email update
  if (typeof body.primaryEmail === "string") {
    const email = body.primaryEmail.trim();
    const normalizedEmail = normalizeEmail(email);

    if (email && !normalizedEmail) {
      return NextResponse.json({ message: "Invalid email address." }, { status: 400 });
    }

    updateData.primaryEmail = email || null;
    updateData.normalizedEmail = normalizedEmail;

    // Create/update contact if email is provided
    if (normalizedEmail) {
      await prisma.candidateContact.upsert({
        where: { id: `${id}-email-${normalizedEmail}` },
        update: { value: email, normalized: normalizedEmail, isPrimary: true },
        create: {
          id: `${id}-email-${normalizedEmail}`,
          candidateId: id,
          type: "email",
          value: email,
          normalized: normalizedEmail,
          isPrimary: true
        }
      });
    }
  }

  // Handle phone update
  if (typeof body.primaryPhone === "string") {
    const phone = body.primaryPhone.trim();
    const normalizedPhone = normalizePhone(phone);

    if (phone && !normalizedPhone) {
      return NextResponse.json({ message: "Invalid phone number. Use 10-digit US format." }, { status: 400 });
    }

    updateData.primaryPhone = phone || null;
    updateData.normalizedPhone = normalizedPhone;

    // Create/update contact if phone is provided
    if (normalizedPhone) {
      await prisma.candidateContact.upsert({
        where: { id: `${id}-phone-${normalizedPhone}` },
        update: { value: phone, normalized: normalizedPhone, isPrimary: true },
        create: {
          id: `${id}-phone-${normalizedPhone}`,
          candidateId: id,
          type: "phone",
          value: phone,
          normalized: normalizedPhone,
          isPrimary: true
        }
      });
    }
  }

  // Update normalized name if display name changed
  if (updateData.displayName) {
    updateData.normalizedName = normalizeName(updateData.displayName);
  }

  try {
    await prisma.candidate.update({
      where: { id },
      data: updateData
    });

    const updated = await getCandidateProfileData(id);
    if (!updated) {
      return NextResponse.json({ message: "Failed to retrieve updated candidate." }, { status: 500 });
    }

    // Log activity
    await logActivity({
      userId: auth.user?.id,
      userEmail: auth.user?.email || undefined,
      activityType: "CANDIDATE_EDITED",
      description: `Updated candidate ${updated.displayName}`,
      entityType: "Candidate",
      entityId: id,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating candidate:", error);
    return NextResponse.json({ message: "Failed to update candidate." }, { status: 500 });
  }
}

// Permanently delete a candidate — a TEST-DATA-ONLY teardown, not a general
// control. Because dev and prod share one live database, this is fenced three
// ways: (1) admin only (settings:admin), (2) the candidate must carry the TEST
// tag, and (3) the caller must type the exact display name to confirm. A real
// candidate has none of the TEST marker, so it simply cannot be removed here.
// Most child rows cascade at the DB level (applications, offers, notes, tags,
// interviews, travel, etc.); the loose NewHire.candidateId link has no FK, so an
// onboarding record it produced is removed too only when deleteHire is set.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Admin access is required." }, { status: 403 });
  }

  const { id } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { candidateTags: { include: { tag: { select: { label: true } } } } }
  });

  if (!candidate) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  // Merge legacy tagsJson tags with normalized CandidateTag labels, then require
  // the TEST marker. This is the guard that makes real data untouchable.
  let jsonTags: string[] = [];
  try {
    const parsed = candidate.tagsJson ? (JSON.parse(candidate.tagsJson) as unknown) : [];
    if (Array.isArray(parsed)) jsonTags = parsed.map((t) => String(t));
  } catch {
    jsonTags = [];
  }
  const tags = [...jsonTags, ...candidate.candidateTags.map((ct) => ct.tag.label)];
  if (!isTestTagged(tags)) {
    return NextResponse.json(
      { message: `Only test candidates can be deleted here. Add the "${TEST_TAG}" tag to this candidate first.` },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { confirmName?: unknown; deleteHire?: unknown };
  if (typeof body.confirmName !== "string" || body.confirmName.trim() !== candidate.displayName.trim()) {
    return NextResponse.json(
      { message: "Type the candidate's exact name to confirm deletion." },
      { status: 400 }
    );
  }
  const deleteHire = body.deleteHire === true;

  try {
    const candidateName = candidate.displayName;

    // The NewHire link is a loose id (no FK), so deleting the candidate never
    // touches it — remove it explicitly when asked, in the same transaction so a
    // teardown is all-or-nothing.
    const linkedHires = deleteHire
      ? await prisma.newHire.findMany({ where: { candidateId: id }, select: { id: true } })
      : [];

    await prisma.$transaction(async (tx) => {
      if (linkedHires.length > 0) {
        await tx.newHire.deleteMany({ where: { id: { in: linkedHires.map((h) => h.id) } } });
      }
      await tx.candidate.delete({ where: { id } });
    });

    await logActivity({
      userId: auth.user?.id,
      userEmail: auth.user?.email || undefined,
      activityType: "CANDIDATE_DELETED",
      description: `Deleted TEST candidate ${candidateName}${linkedHires.length ? ` + ${linkedHires.length} onboarding record(s)` : ""}`,
      entityType: "Candidate",
      entityId: id,
    });

    return NextResponse.json({ ok: true, message: "Test candidate deleted.", deletedHires: linkedHires.length });
  } catch (error) {
    console.error("Error deleting candidate:", error);
    return NextResponse.json({ message: "Failed to delete candidate." }, { status: 500 });
  }
}
