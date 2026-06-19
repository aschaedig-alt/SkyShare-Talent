import { z } from "zod";

const ratingEnum = z.enum(["EXCEEDS", "MEETS", "CAN_DEVELOP", "DOES_NOT_MEET"]);
const recommendationEnum = z.enum(["STRONG_YES", "YES", "NO", "STRONG_NO"]);

const itemSchema = z.object({
  q: z.string().trim().min(1, "Question text is required."),
  rating: ratingEnum.nullable().default(null)
});

export const scorecardCreateSchema = z.object({
  interviewId: z.string().min(1, "Interview is required."),
  interviewer: z.string().trim().min(1, "Interviewer is required."),
  recommendation: recommendationEnum.optional().nullable(),
  items: z.array(itemSchema).max(50).default([]),
  comments: z.string().trim().max(4000).optional().nullable()
});

export const scorecardUpdateSchema = z.object({
  interviewer: z.string().trim().min(1).optional(),
  recommendation: recommendationEnum.optional().nullable(),
  items: z.array(itemSchema).max(50).optional(),
  comments: z.string().trim().max(4000).optional().nullable()
});
