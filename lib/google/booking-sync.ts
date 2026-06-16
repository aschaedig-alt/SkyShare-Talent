/**
 * Push public bookings to the shared Google Calendar. Every event is tagged with
 * the host id (private extended property) so per-host free/busy works on the one
 * shared calendar. Safe no-op when Google isn't configured; never throws.
 */
import { prisma } from "@/lib/prisma";
import {
  isGoogleCalendarConfigured,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  getSharedCalendarId,
  type GoogleEventInput
} from "@/lib/google/calendar";

type BookingForSync = {
  id: string;
  hostId: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string | null;
  notes: string | null;
  status: string;
  googleEventId: string | null;
  host: { name: string };
  bookingType: { name: string; kind: string; location: string | null } | null;
};

function buildEventInput(booking: BookingForSync): GoogleEventInput {
  const typeName = booking.bookingType?.name ?? "Meeting";
  const summary = `${typeName}: ${booking.inviteeName} (with ${booking.host.name})`;

  const descriptionLines = [
    `Booked via SkyShare scheduling`,
    `Host: ${booking.host.name}`,
    `Invitee: ${booking.inviteeName} <${booking.inviteeEmail}>`,
    booking.inviteePhone ? `Phone: ${booking.inviteePhone}` : null,
    booking.notes ? `\nNotes:\n${booking.notes}` : null,
    `\n— Booking id: ${booking.id}`
  ].filter(Boolean) as string[];

  return {
    summary,
    description: descriptionLines.join("\n"),
    location: booking.bookingType?.location ?? undefined,
    start: booking.startDateTime,
    end: booking.endDateTime,
    timezone: booking.timezone,
    status: booking.status === "CANCELLED" ? "cancelled" : "confirmed",
    privateProps: { hostId: booking.hostId, bookingId: booking.id }
  };
}

const bookingInclude = {
  host: { select: { name: true } },
  bookingType: { select: { name: true, kind: true, location: true } }
} as const;

/** Create or update a booking's event on the shared calendar. */
export async function pushBookingToGoogle(bookingId: string): Promise<void> {
  if (!isGoogleCalendarConfigured()) return;

  const booking = (await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude
  })) as BookingForSync | null;
  if (!booking) return;

  try {
    const input = buildEventInput(booking);
    if (booking.googleEventId) {
      await updateGoogleEvent(booking.googleEventId, input);
    } else {
      const eventId = await createGoogleEvent(input);
      if (eventId) {
        await prisma.booking.update({
          where: { id: bookingId },
          data: { googleEventId: eventId, googleCalendarId: getSharedCalendarId() }
        });
      }
    }
  } catch (error) {
    console.error("Failed to push booking to Google:", error);
  }
}

/** Remove a booking's event from the shared calendar (on cancel). */
export async function removeBookingFromGoogle(googleEventId: string | null): Promise<void> {
  if (!isGoogleCalendarConfigured() || !googleEventId) return;
  try {
    await deleteGoogleEvent(googleEventId);
  } catch (error) {
    console.error("Failed to delete booking event:", error);
  }
}
