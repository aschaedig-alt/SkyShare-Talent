import { z } from "zod";

/** Public booking submission. */
export const publicBookingSchema = z.object({
  bookingTypeId: z.string().min(1, "Choose a meeting type."),
  startDateTime: z.string().min(1, "Pick a time."), // ISO UTC instant
  inviteeName: z.string().trim().min(1, "Your name is required."),
  inviteeEmail: z.string().trim().email("A valid email is required."),
  inviteePhone: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  jobId: z.string().trim().optional().nullable(),
  timezone: z.string().trim().optional().nullable()
});

const buffer = z.coerce.number().int().refine((v) => v === 0 || v === 10, "Buffer must be 0 or 10 minutes.");
const duration = z.coerce.number().int().refine((v) => [30, 45, 60].includes(v), "Duration must be 30, 45, or 60.");

/** Admin: host create / update. */
export const hostCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Slug may use lowercase letters, numbers, and hyphens."),
  email: z.string().trim().email().optional().nullable(),
  role: z.enum(["RECRUITER", "HIRING_MANAGER", "OTHER"]).default("RECRUITER"),
  departments: z.array(z.enum(["crew", "maintenance", "fbo", "support"])).optional(),
  title: z.string().trim().optional().nullable(),
  avatarUrl: z.string().optional().nullable(), // data URL or null to clear
  timezone: z.string().trim().min(1).default("America/Denver"),
  calendarId: z.string().trim().optional().nullable(),
  minNoticeHours: z.coerce.number().int().min(0).max(720).default(6),
  bookingWindowDays: z.coerce.number().int().min(1).max(365).default(90),
  maxPerDay: z.coerce.number().int().min(1).max(50).optional().nullable(),
  bufferMinutes: buffer.default(0),
  isActive: z.boolean().default(true)
});
export const hostUpdateSchema = hostCreateSchema.partial();

export const weeklyRuleSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startMinute: z.coerce.number().int().min(0).max(1440),
    endMinute: z.coerce.number().int().min(0).max(1440)
  })
  .refine((v) => v.endMinute > v.startMinute, { message: "End must be after start." });

/** Replace a host's entire weekly schedule in one call. */
export const weeklyRulesSchema = z.object({ rules: z.array(weeklyRuleSchema) });

export const overrideSchema = z
  .object({
    hostId: z.string().optional().nullable(), // null = org-wide (holiday)
    startDate: z.string().min(1), // YYYY-MM-DD
    endDate: z.string().min(1),
    kind: z.enum(["BLOCK", "CUSTOM"]).default("BLOCK"),
    startMinute: z.coerce.number().int().min(0).max(1440).optional().nullable(),
    endMinute: z.coerce.number().int().min(0).max(1440).optional().nullable(),
    label: z.string().trim().optional().nullable()
  })
  .refine((v) => v.kind !== "CUSTOM" || (v.startMinute != null && v.endMinute != null && v.endMinute > v.startMinute), {
    message: "Custom hours need a start and end."
  });

export const bookingTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  kind: z.enum(["INTERVIEW", "MEETING"]).default("INTERVIEW"),
  durationMinutes: duration.default(30),
  bufferMinutes: buffer.optional().nullable(),
  location: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0)
});
export const bookingTypeUpdateSchema = bookingTypeSchema.partial();
