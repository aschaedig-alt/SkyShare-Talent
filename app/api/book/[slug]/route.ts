import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getHostBySlug, checkSlotStillFree, toPublicHost } from "@/lib/data/booking";
import { publicBookingSchema } from "@/lib/validation/booking";
import { pushBookingToGoogle } from "@/lib/google/booking-sync";
import { pushInterviewToGoogle } from "@/lib/google/interview-sync";

/** Public: host details + active booking types. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const host = await getHostBySlug(slug);
  if (!host || !host.isActive) {
    return NextResponse.json({ message: "Scheduling link not found." }, { status: 404 });
  }
  return NextResponse.json({ host: toPublicHost(host) });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

/** Public: submit a booking. Re-checks availability, then books + syncs to Google. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const host = await getHostBySlug(slug);
    if (!host || !host.isActive) {
      return NextResponse.json({ message: "Scheduling link not found." }, { status: 404 });
    }

    const payload = publicBookingSchema.parse(await request.json());
    const type = host.bookingTypes.find((t) => t.id === payload.bookingTypeId);
    if (!type) {
      return NextResponse.json({ message: "That meeting type is no longer available." }, { status: 400 });
    }

    const start = new Date(payload.startDateTime);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ message: "Invalid time." }, { status: 400 });
    }
    const end = new Date(start.getTime() + type.durationMinutes * 60 * 1000);

    // Re-check the slot is still free (guards against a race between viewing and booking).
    const free = await checkSlotStillFree(host, type, start);
    if (!free) {
      return NextResponse.json(
        { message: "Sorry — that time was just taken. Please pick another slot." },
        { status: 409 }
      );
    }

    const inviteeTimezone = payload.timezone?.trim() || host.timezone;
    let candidateId: string | null = null;
    let interviewId: string | null = null;

    // INTERVIEW types create/match a Candidate and an Interview so the booking
    // flows through the existing recruiting pipeline + calendar.
    if (type.kind === "INTERVIEW") {
      const normEmail = normalizeEmail(payload.inviteeEmail);
      const existing = await prisma.candidate.findFirst({
        where: { normalizedEmail: normEmail },
        select: { id: true }
      });

      if (existing) {
        candidateId = existing.id;
      } else {
        const created = await prisma.candidate.create({
          data: {
            displayName: payload.inviteeName,
            primaryEmail: payload.inviteeEmail.trim(),
            normalizedEmail: normEmail,
            primaryPhone: payload.inviteePhone?.trim() || null,
            normalizedPhone: payload.inviteePhone ? normalizePhone(payload.inviteePhone) : null,
            source: "public-booking"
          },
          select: { id: true }
        });
        candidateId = created.id;
      }

      const interviewType = host.role === "HIRING_MANAGER" ? "HIRING_MANAGER" : "RECRUITER_SCREEN";
      const interview = await prisma.interview.create({
        data: {
          candidateId,
          jobId: payload.jobId?.trim() || null,
          title: type.name,
          interviewType,
          startDateTime: start,
          endDateTime: end,
          timezone: host.timezone,
          interviewer: host.name,
          location: type.location ?? null,
          notes: payload.notes?.trim() || null,
          status: "SCHEDULED",
          source: "public-booking"
        },
        select: { id: true }
      });
      interviewId = interview.id;
    }

    const booking = await prisma.booking.create({
      data: {
        hostId: host.id,
        bookingTypeId: type.id,
        startDateTime: start,
        endDateTime: end,
        timezone: inviteeTimezone,
        inviteeName: payload.inviteeName,
        inviteeEmail: payload.inviteeEmail.trim(),
        inviteePhone: payload.inviteePhone?.trim() || null,
        notes: payload.notes?.trim() || null,
        status: "CONFIRMED",
        candidateId,
        jobId: payload.jobId?.trim() || null,
        interviewId,
        cancelToken: randomUUID(),
        source: "public-booking"
      },
      select: { id: true, startDateTime: true, endDateTime: true, cancelToken: true }
    });

    // Sync to Google. INTERVIEW bookings get their event from the interview push
    // (tagged via DB-name matching); MEETING bookings push a host-tagged event.
    if (interviewId) {
      await pushInterviewToGoogle(interviewId);
    } else {
      await pushBookingToGoogle(booking.id);
    }

    return NextResponse.json({
      ok: true,
      message: "You're booked!",
      booking: {
        id: booking.id,
        start: booking.startDateTime.toISOString(),
        end: booking.endDateTime.toISOString(),
        hostName: host.name,
        typeName: type.name,
        location: type.location,
        timezone: inviteeTimezone
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Booking failed:", error);
    return NextResponse.json({ message: "Unable to complete booking." }, { status: 500 });
  }
}
