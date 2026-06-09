import { z } from "zod";

export const interviewCreateSchema = z
  .object({
    candidateId: z.string().min(1, "Candidate is required."),
    jobId: z.string().optional().nullable(),
    title: z.string().trim().min(2, "Title is required."),
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
    const start = new Date(value.startDateTime);
    if (Number.isNaN(start.getTime())) {
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
      const start = new Date(value.startDateTime);
      if (Number.isNaN(start.getTime())) {
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
