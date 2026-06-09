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
      notes: value.notes?.trim() || null
    };
  });
