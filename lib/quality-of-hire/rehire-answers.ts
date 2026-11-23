import { prisma } from "@/lib/prisma";

// "Would you hire them back?" for people who quit in their first year with no manager
// check-in on file. Under the Good Hire Criteria (Nov 23 2026), that one answer sorts a
// first-year quitter: yes is a regretted loss (not a bad hire), no is a bad hire. HR
// answered it for the older hires in one pass from a spreadsheet; the script
// scripts/qoh/save-rehire-answers.ts loads that sheet here, with a dry run and an undo.
//
// Same shape as the situational marks beside it: one WorkspaceSetting, keyed by hire
// period, so there is no schema change and no person's record is touched.

const SCOPE = "workspace";
export const REHIRE_ANSWERS_KEY = "qoh-rehire-answers";

export type RehireAnswer = {
  answer: "YES" | "NO";
  /** HR's note, or a correction to the recorded reason ("Didnt pass indoc"). */
  note: string | null;
  by: string | null;
  at: string;
  /** Where the answer came from, e.g. the spreadsheet's file name. */
  source: string;
};
/** Keyed by hire period: `${newHireId}|${startDate YYYY-MM-DD}` (periodKey in situational.ts). */
export type RehireAnswers = Record<string, RehireAnswer>;

export function parseRehireAnswers(valueJson: string | null | undefined): RehireAnswers {
  if (!valueJson) return {};
  try {
    const parsed = JSON.parse(valueJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: RehireAnswers = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const a = v as Partial<RehireAnswer> | null;
      if (a && (a.answer === "YES" || a.answer === "NO")) {
        out[k] = { answer: a.answer, note: typeof a.note === "string" ? a.note : null, by: typeof a.by === "string" ? a.by : null, at: String(a.at ?? ""), source: String(a.source ?? "") };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function getRehireAnswers(): Promise<RehireAnswers> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: REHIRE_ANSWERS_KEY }, select: { valueJson: true } });
  return parseRehireAnswers(row?.valueJson);
}

/** The stored value exactly as it is now (null when there is none) - what an undo restores. */
export async function readRehireAnswersRaw(): Promise<string | null> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: REHIRE_ANSWERS_KEY }, select: { valueJson: true } });
  return row?.valueJson ?? null;
}

/** Replace the whole set, or remove it (null). Used by the load script's apply and undo. */
export async function writeRehireAnswersRaw(valueJson: string | null): Promise<void> {
  if (valueJson === null) {
    await prisma.workspaceSetting.deleteMany({ where: { scope: SCOPE, key: REHIRE_ANSWERS_KEY } });
    return;
  }
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: REHIRE_ANSWERS_KEY } },
    create: { scope: SCOPE, key: REHIRE_ANSWERS_KEY, valueJson },
    update: { valueJson }
  });
}
