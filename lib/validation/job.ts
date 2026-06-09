import { z } from "zod";

export const jobStatusSchema = z.enum(["DRAFT", "ACTIVE", "RETIRED", "NEEDS_REVIEW"]);

export const paycomUpdateSchema = z.object({
  workflow: z.string().trim().optional().nullable(),
  externalApplication: z.string().trim().optional().nullable(),
  externalKnockout: z.string().trim().optional().nullable(),
  externalGlobal: z.string().trim().optional().nullable(),
  externalJobLevel: z.string().trim().optional().nullable(),
  externalFollowUps: z.string().trim().optional().nullable(),
  internalApplication: z.string().trim().optional().nullable(),
  internalKnockout: z.string().trim().optional().nullable(),
  internalGlobal: z.string().trim().optional().nullable(),
  internalJobLevel: z.string().trim().optional().nullable()
});

export const jobFormSchema = z.object({
  title: z.string().trim().min(1, "Job title is required"),
  internalName: z.string().trim().optional().nullable(),
  department: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  location: z.string().trim().min(1, "Location is required"),
  secondaryLocation: z.string().trim().optional().nullable(),
  positionType: z.string().trim().min(1, "Position type is required"),
  salaryRange: z.string().trim().optional().nullable(),
  reportsTo: z.string().trim().optional().nullable(),
  positionCode: z.string().trim().optional().nullable(),
  seatCode: z.string().trim().optional().nullable(),
  travelPercentage: z.string().trim().optional().nullable(),
  educationLevel: z.string().trim().optional().nullable(),
  workSchedule: z.string().trim().optional().nullable(),
  summary: z.string().trim().optional().nullable(),
  keyResponsibilities: z.string().trim().optional().nullable(),
  qualificationsText: z.string().trim().optional().nullable(),
  benefitsText: z.string().trim().optional().nullable(),
  postedDate: z.string().trim().optional().nullable(),
  status: jobStatusSchema,
  paycom: paycomUpdateSchema.optional().nullable()
});

export const jobUpdateSchema = jobFormSchema.partial().extend({
  title: z.string().trim().min(1, "Job title is required").optional(),
  location: z.string().trim().optional().nullable(),
  positionType: z.string().trim().optional().nullable()
});

export type JobFormValues = z.infer<typeof jobFormSchema>;
