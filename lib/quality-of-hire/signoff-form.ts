// The definitions sign-off answers, summarized for Reports > Sign-off. Client-safe
// (pure): it reads the requests the page already has, so a send or a cancel in the
// dialog updates the counts without a reload.
//
// Since Nov 21 2026 the answers come from Journey's own sign-off links
// (lib/quality-of-hire/signoff-requests.ts), not from a Google Sheet: the Google
// Form built that morning was replaced before it was ever sent (his ask: "could it
// be an internal form like the manager 3, 6, 12 month reviews instead?").
//
// ONE ROUND (his call, Nov 21): a department's answer to question 14 is its sign-off.

import {
  SIGNOFF_ANYTHING_ELSE,
  SIGNOFF_DEPARTMENTS,
  SIGNOFF_QUESTIONS,
  type SignoffRequestView
} from "@/lib/quality-of-hire/signoff-questions";

export type Who = { name: string; departments: string[] };
export type SummaryQuestion = {
  key: string;
  num: number | null;
  title: string;
  kind: "choice" | "multi" | "text";
  /** Pick-one and tick-all: each answer given, most picked first, with who picked it. */
  tallies: { choice: string; people: Who[] }[];
  /** Written answers, and anything typed into "Other". */
  texts: { who: Who; text: string }[];
};
export type SignoffSummary = {
  responses: { name: string; departments: string[]; at: string; to: string }[];
  questions: SummaryQuestion[];
  /** Departments at least one completed sign-off covers. */
  covered: string[];
  /** Departments with a link out, not yet answered. */
  waiting: string[];
  /** Departments nobody has been sent a link for. */
  notSent: string[];
};

export function summarizeSignoffs(requests: SignoffRequestView[]): SignoffSummary {
  const done = requests.filter((r) => r.state === "COMPLETED" && r.answers);
  const whoOf = (r: SignoffRequestView): Who => {
    const a = r.answers!;
    return { name: a.name || r.toName || r.to, departments: [...a.departments, ...(a.otherDepartment ? [a.otherDepartment] : [])] };
  };

  const questions: SummaryQuestion[] = SIGNOFF_QUESTIONS.map((q) => {
    const byChoice = new Map<string, Who[]>();
    const texts: SummaryQuestion["texts"] = [];
    for (const r of done) {
      const ans = r.answers!.byKey[q.key];
      if (!ans) continue;
      for (const p of ans.picked) byChoice.set(p, [...(byChoice.get(p) ?? []), whoOf(r)]);
      if (ans.text.trim()) texts.push({ who: whoOf(r), text: ans.text.trim() });
    }
    // Keep the form's own order of choices, so the count bars read like the form.
    const tallies = (q.choices ?? []).filter((c) => byChoice.has(c)).map((c) => ({ choice: c, people: byChoice.get(c)! }));
    return { key: q.key, num: q.num, title: `${q.num}. ${q.title}`, kind: q.kind, tallies, texts };
  });
  questions.splice(13, 0, {
    key: "anythingElse",
    num: null,
    title: SIGNOFF_ANYTHING_ELSE,
    kind: "text",
    tallies: [],
    texts: done.filter((r) => r.answers!.anythingElse.trim()).map((r) => ({ who: whoOf(r), text: r.answers!.anythingElse.trim() }))
  });

  const covered = SIGNOFF_DEPARTMENTS.filter((d) => done.some((r) => r.answers!.departments.includes(d)));
  const open = requests.filter((r) => r.state === "PENDING" || r.state === "EXPIRED");
  const waiting = SIGNOFF_DEPARTMENTS.filter((d) => !covered.includes(d) && open.some((r) => r.departments.includes(d)));
  const notSent = SIGNOFF_DEPARTMENTS.filter((d) => !covered.includes(d) && !waiting.includes(d));
  return {
    responses: done.map((r) => ({ ...whoOf(r), at: r.completedAt ?? "", to: r.to })),
    questions,
    covered,
    waiting,
    notSent
  };
}
