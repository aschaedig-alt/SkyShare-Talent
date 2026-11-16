// Interview guides: the scale an answer is judged on, shared by the guide page,
// the interview drawer and the routes. PURE module — no Prisma, no DOM.
//
// Asked for Nov 16 2026 after a pilot interview: "I'd like the system to be able
// to evaluate if the person answered and if it was a strong answer or not. We
// can work on how that is evaluated later." So this scale is a first draft, kept
// as plain strings in the database so it can change without a migration.

export const ANSWER_STRENGTHS = ["STRONG", "ADEQUATE", "WEAK", "NOT_ANSWERED"] as const;
export type AnswerStrength = (typeof ANSWER_STRENGTHS)[number];

export const STRENGTH_LABEL: Record<AnswerStrength, string> = {
  STRONG: "Strong",
  ADEQUATE: "Adequate",
  WEAK: "Weak",
  NOT_ANSWERED: "Did not answer"
};

export const STRENGTH_HINT: Record<AnswerStrength, string> = {
  STRONG: "Answered the question with a specific example that matches the strong answer.",
  ADEQUATE: "Answered it, but general or missing part of what a strong answer covers.",
  WEAK: "Answered, but vague, off the point, or a concern.",
  NOT_ANSWERED: "Did not answer the question that was asked."
};

export function isAnswerStrength(v: unknown): v is AnswerStrength {
  return typeof v === "string" && (ANSWER_STRENGTHS as readonly string[]).includes(v);
}

export function strengthTone(s: AnswerStrength): string {
  switch (s) {
    case "STRONG":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "ADEQUATE":
      return "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300";
    case "WEAK":
      return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
    case "NOT_ANSWERED":
      return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  }
}

/** AI = the draft judge; INTERVIEWER = set by hand, which the judge never overwrites. */
export type EvaluationSource = "AI" | "INTERVIEWER";

/** Largest guide the builder will make. The bank holds ~22 questions today. */
export const GUIDE_MAX_QUESTIONS = 60;
