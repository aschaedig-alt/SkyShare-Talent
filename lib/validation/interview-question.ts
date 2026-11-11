import { z } from "zod";

// CULTURE and GENERAL added Nov 11 2026: his question doc defines six categories -
// Culture (motivation, attitudes, values, core-value alignment) and General
// (disclosures, candidate questions, logistics - not meant to measure fit).
export const QUESTION_CATEGORIES = ["BEHAVIORAL", "SITUATIONAL", "TECHNICAL", "EXPERIENCE", "CULTURE", "GENERAL", "OTHER"] as const;
export const CORE_VALUE_KEYS = ["teamwork", "innovation", "leadership", "customerFocus", "growthMindset", "integrity"] as const;
export const QUESTION_DEPARTMENTS = ["crew", "maintenance", "fbo", "support"] as const;

// text and guidance arrive as rich-text HTML from the editor (feedback
// cmwcjtm5k); the routes sanitize them and check the PLAIN length, since
// "<p></p>" is longer than five characters and says nothing.
export const interviewQuestionSchema = z.object({
  text: z.string().trim().min(1, "Question text is required.").max(20000),
  category: z.enum(QUESTION_CATEGORIES).default("BEHAVIORAL"),
  /** A question can suit several core values. */
  coreValues: z.array(z.enum(CORE_VALUE_KEYS)).optional(),
  /** Legacy single value — still accepted from older callers. */
  coreValue: z.enum(CORE_VALUE_KEYS).optional().nullable(),
  departments: z.array(z.enum(QUESTION_DEPARTMENTS)).optional(),
  /** Legacy single guidance block — still accepted; stored as the Strong answer. */
  guidance: z.string().trim().max(20000).optional().nullable(),
  /** The two guidance blocks, as rich-text HTML. */
  strongAnswer: z.string().trim().max(20000).optional().nullable(),
  listenFor: z.string().trim().max(20000).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().optional()
});

export const interviewQuestionUpdateSchema = interviewQuestionSchema.partial();

export const interviewQuestionReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(2000)
});
