import { z } from "zod";
import { interviewTypes } from "@/lib/calendar/interview-types";
import { zonedWallClockToUtc } from "@/lib/booking/timezone";
import { resolveTimezone } from "@/lib/calendar/timezones";

/**
 * A <input type="datetime-local"> sends "2026-09-15T14:30" with NO zone, and
 * new Date(naive) resolves that in the RUNTIME's zone — 14:30Z on Vercel, which
 * displays as 8:30am Mountain. A 2:30pm interview was stored as 2:30pm UTC.
 *
 * The schema already knew the right zone (timezone defaults to America/Denver
 * below); it just was not used for the parse. A value that already carries an
 * offset or a Z is unambiguous and is left exactly as it is.
 */
function wallClockToInstant(value: string, timezone?: string | null): Date | null {
  const trimmed = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(trimmed);
  if (!m || /[Zz]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return zonedWallClockToUtc(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    resolveTimezone(timezone)
  );
}

// Built from the one list rather than typed out again. The literal union that
// used to live here was the third copy of the same seven strings, and it is the
// copy that would have rejected a new stage with a 400 while the dropdown
// happily offered it.
const interviewTypeEnum = z.enum(interviewTypes);

export const interviewCreateSchema = z
  .object({
    candidateId: z.string().min(1, "Candidate is required."),
    jobId: z.string().optional().nullable(),
    title: z.string().trim().min(2, "Title is required."),
    interviewType: interviewTypeEnum.default("RECRUITER_SCREEN"),
    startDateTime: z.string().min(1, "Start date and time are required."),
    durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
    timezone: z.string().trim().optional().nullable(),
    interviewer: z.string().trim().optional().nullable(),
    location: z.string().trim().optional().nullable(),
    meetingUrl: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    email: z.string().trim().optional().nullable(),
    phone: z.string().trim().optional().nullable(),
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).default("SCHEDULED")
  })
  .transform((value) => {
    const start = wallClockToInstant(value.startDateTime, value.timezone);
    if (!start) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["startDateTime"],
          message: "Start date and time are invalid."
        }
      ]);
    }

    const end = new Date(start.getTime() + value.durationMinutes * 60 * 1000);

    return {
      ...value,
      startDate: start,
      endDate: end,
      timezone: value.timezone?.trim() || "America/Denver",
      jobId: value.jobId?.trim() || null,
      interviewer: value.interviewer?.trim() || null,
      location: value.location?.trim() || null,
      meetingUrl: value.meetingUrl?.trim() || null,
      notes: value.notes?.trim() || null,
      email: value.email?.trim() || null,
      phone: value.phone?.trim() || null
    };
  });

export const interviewUpdateSchema = z
  .object({
    jobId: z.string().optional().nullable(),
    title: z.string().trim().min(2, "Title is required.").optional(),
    interviewType: interviewTypeEnum.optional(),
    startDateTime: z.string().min(1).optional(),
    durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
    timezone: z.string().trim().optional().nullable(),
    interviewer: z.string().trim().optional().nullable(),
    location: z.string().trim().optional().nullable(),
    meetingUrl: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional()
  })
  .transform((value) => {
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (value.startDateTime) {
      const start = wallClockToInstant(value.startDateTime, value.timezone);
      if (!start) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: ["startDateTime"],
            message: "Start date and time are invalid."
          }
        ]);
      }
      startDate = start;
      const minutes = value.durationMinutes ?? 60;
      endDate = new Date(start.getTime() + minutes * 60 * 1000);
    }

    return {
      ...value,
      startDate,
      endDate,
      jobId: value.jobId === undefined ? undefined : value.jobId?.trim() || null,
      timezone: value.timezone === undefined ? undefined : value.timezone?.trim() || "America/Denver",
      interviewer: value.interviewer === undefined ? undefined : value.interviewer?.trim() || null,
      location: value.location === undefined ? undefined : value.location?.trim() || null,
      meetingUrl: value.meetingUrl === undefined ? undefined : value.meetingUrl?.trim() || null,
      notes: value.notes === undefined ? undefined : value.notes?.trim() || null
    };
  });
