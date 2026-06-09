import { z } from "zod";

const nullableText = z
  .string()
  .trim()
  .transform((value) => (value.length ? value : null))
  .nullable()
  .optional();

export const pilotRequirementGateUpdateSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  numericValue: z
    .union([z.number().int().nonnegative(), z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }

      if (typeof value === "number") {
        return value;
      }

      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }),
  textValue: nullableText,
  evidenceText: nullableText
});

export const pilotRequirementUpdateSchema = z.object({
  title: z.string().trim().min(2, "Title is required."),
  status: z.enum(["ACTIVE", "INACTIVE", "HISTORICAL", "RETIRED", "EVERGREEN", "ARCHIVED"]),
  reviewStatus: z.enum(["DRAFT", "NEEDS_REVIEW", "READY_FOR_REVIEW", "APPROVED"]),
  operatorType: z.enum(["SkyShare", "Managed"]).nullable().optional(),
  pilotSeat: z.enum(["PIC", "SIC", "Lead PIC", "Chief Pilot", "Assistant Chief Pilot", "Mixed"]).nullable().optional(),
  baseCity: nullableText,
  baseState: nullableText,
  baseAirport: nullableText,
  payScaleRaw: nullableText,
  manualOverrideNotes: nullableText,
  gates: z.array(pilotRequirementGateUpdateSchema)
});

export type PilotRequirementUpdateInput = z.infer<typeof pilotRequirementUpdateSchema>;
