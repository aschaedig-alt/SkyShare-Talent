import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/candidates/normalize";
import { getCandidateProfileData } from "@/lib/data/candidates";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const candidate = await getCandidateProfileData(id);

  if (!candidate) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  return NextResponse.json(candidate);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return auth.response;

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

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating candidate:", error);
    return NextResponse.json({ message: "Failed to update candidate." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { id }
  });

  if (!candidate) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  try {
    await prisma.candidate.delete({
      where: { id }
    });

    return NextResponse.json({ ok: true, message: "Candidate deleted." });
  } catch (error) {
    console.error("Error deleting candidate:", error);
    return NextResponse.json({ message: "Failed to delete candidate." }, { status: 500 });
  }
}
