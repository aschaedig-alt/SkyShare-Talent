import { z } from "zod";
import { richTextField } from "@/lib/validation/rich-text";
import { RICH_NOTE_MAX_CHARS } from "@/lib/richtext/stored";
import { ANSWER_STRENGTHS, GUIDE_MAX_QUESTIONS } from "@/lib/interview-guides/constants";
import { CORE_VALUE_KEYS, QUESTION_DEPARTMENTS } from "@/lib/validation/interview-question";

export const guideCreateSchema = z.object({
  title: z.string().trim().max(200).optional(),
  // Bank question ids, in the order they should be asked. Wording is copied
  // from the bank on the server, never taken from the request.
  questionIds: z.array(z.string().min(1)).min(1, "Pick at least one question.").max(GUIDE_MAX_QUESTIONS),
  candidateId: z.string().min(1).nullable().optional(),
  interviewId: z.string().min(1).nullable().optional(),
  departmentKey: z.enum(QUESTION_DEPARTMENTS).nullable().optional(),
  interviewer: z.string().trim().max(120).nullable().optional()
});

export const guideUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  candidateId: z.string().min(1).nullable().optional(),
  interviewId: z.string().min(1).nullable().optional(),
  interviewer: z.string().trim().max(120).nullable().optional()
});

export const guideItemUpdateSchema = z.object({
  answer: richTextField(RICH_NOTE_MAX_CHARS),
  // Setting a strength by hand marks it INTERVIEWER, so the draft judge leaves it alone.
  strength: z.enum(ANSWER_STRENGTHS).nullable().optional(),
  evaluationNote: z.string().trim().max(1000).nullable().optional(),
  // Core values this answer showed BEYOND the question's own (ticked during the
  // interview). The route drops any that the question was already written for.
  shownValues: z.array(z.enum(CORE_VALUE_KEYS)).max(10).optional(),
  // The answer's WHOLE set of values, ticked or unticked, including the
  // question's own (Nov 16 2026: an asked value can be unticked). Preferred
  // over shownValues; when both are sent this one wins.
  values: z.array(z.enum(CORE_VALUE_KEYS)).max(10).optional(),
  // "Not asked" in this interview (Nov 16 2026). Nothing typed is deleted.
  skipped: z.boolean().optional()
});
