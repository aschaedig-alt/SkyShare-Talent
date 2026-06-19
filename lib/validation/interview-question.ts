import { z } from "zod";

export const QUESTION_CATEGORIES = ["BEHAVIORAL", "SITUATIONAL", "TECHNICAL", "EXPERIENCE", "OTHER"] as const;
export const CORE_VALUE_KEYS = ["teamwork", "innovation", "leadership", "customerFocus", "growthMindset", "integrity"] as const;
export const QUESTION_DEPARTMENTS = ["crew", "maintenance", "fbo", "support"] as const;

export const interviewQuestionSchema = z.object({
  text: z.string().trim().min(5, "Question text is required."),
  category: z.enum(QUESTION_CATEGORIES).default("BEHAVIORAL"),
  coreValue: z.enum(CORE_VALUE_KEYS).optional().nullable(),
  departments: z.array(z.enum(QUESTION_DEPARTMENTS)).optional(),
  guidance: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().optional()
});

export const interviewQuestionUpdateSchema = interviewQuestionSchema.partial();
