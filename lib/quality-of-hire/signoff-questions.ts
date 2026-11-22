// The Quality of Hire definitions sign-off - the questions, word for word, and the
// email. Client-safe (no Prisma): the public form, the send dialog and the report
// all read this one list.
//
// Moved INTO Journey on Nov 21 2026 (his ask: "could it be an internal form like the
// manager 3, 6, 12 month reviews instead?"), from the Google Form built earlier that
// day, before it was sent. The wording here is the Google Form's as he left it -
// including his edits to questions 2, 5, 11 and 12 and the department names - read
// back from the form by Apps Script, not retyped from the sign-off page.
//
// ONE ROUND (his call, Nov 21: "managers are not going to approve 2 versions"):
// question 14 is the department's sign-off; HR writes the final definitions from the
// answers and shares them for information only.

export const SIGNOFF_DUE = "Wednesday, Nov 25";

/** The departments a sign-off can answer for, as he named them on the form. */
export const SIGNOFF_DEPARTMENTS = [
  "Pilots: light and midsize",
  "Pilots: heavy",
  "Pilots: Managed",
  "Cabin Attendants",
  "Maintenance",
  "SkyOps",
  "OGD Base Support",
  "DVO FBO",
  "SVR FBO",
  "Accounting and Finance",
  "Sales",
  "Marketing",
  "Detailing",
  "Safety",
  "Human Resources"
];

/** The draft definitions the managers are signing off, shown at the top of the form. */
export const SIGNOFF_DEFINITIONS: { name: string; text: string }[] = [
  {
    name: "Good hire",
    text: 'Stayed at least 12 months: still here, or left after a year. Proposed for new hires (see question 7): at the 12-month check-in the hiring manager scores our four core values 6 or more out of 10 on average ("Meets" or better), and would hire the person again. Past hires have no rating, so for them staying 12 months is enough.'
  },
  {
    name: "Bad hire",
    text: "Let go within 12 months for a reason about the person: performance, misconduct, attendance, or failing training or a checkride. Also anyone who quits within their first 90 days."
  },
  {
    name: "Early loss",
    text: "Chose to leave between 3 and 12 months. Usually schedule, pay or family: a retention problem more than a selection mistake, so it is kept apart from bad hire."
  },
  { name: "Too early to tell", text: "Still here and hired less than 12 months ago." },
  {
    name: "Situational",
    text: "The business caused the exit, not the hire: the Ogden FBO sale is the example. HR marks these one by one, with a note. Never counted as a bad hire."
  },
  {
    name: "Not judged",
    text: "Laid off or position eliminated; situational exits; left for medical reasons, a move or retirement; contractors; offers accepted but never started (those count against the offer process instead)."
  }
];

export type SignoffQuestion = {
  /** Stable key the answers are stored under. */
  key: string;
  num: number;
  title: string;
  help?: string;
  kind: "choice" | "multi" | "text";
  choices?: string[];
  /** Offer an "Other" box with free text. */
  other?: boolean;
  required?: boolean;
  section: "definitions" | "department" | "signoff";
};

export const SIGNOFF_QUESTIONS: SignoffQuestion[] = [
  {
    key: "q1", num: 1, section: "definitions", kind: "choice", other: true, required: true,
    title: "Someone who quits between 3 and 12 months: bad hire, or early loss?",
    help: "38 people from 2021 to 2025. Most often for a career opportunity.",
    choices: ["Early loss, tracked separately", "Bad hire"]
  },
  {
    key: "q2", num: 2, section: "definitions", kind: "choice", other: true, required: true,
    title: "Is 12 months the right timeframe for your department?",
    choices: ["Yes, 12 months", "Shorter, for example 6 months for FBO line roles", "Longer, for example 18 months for pilots, to cover an upgrade"]
  },
  {
    key: "q3", num: 3, section: "definitions", kind: "choice", other: true, required: true,
    title: "Quitting inside 90 days counts as a bad hire, whatever the reason?",
    choices: ["Yes, except layoffs and medical reasons (recommended)", "No, only if let go"]
  },
  {
    key: "q4", num: 4, section: "definitions", kind: "choice", other: true, required: true,
    title: 'Let go for cause after the first year: bad hire, or a separate "late miss"?',
    help: "8 people from 2021 to 2025.",
    choices: ["Late miss, tracked separately", "Bad hire (as drafted)", "Good hire: they gave a year"]
  },
  {
    key: "q5", num: 5, section: "definitions", kind: "choice", other: true, required: true,
    title: "Medical reasons, moving and retirement are not judged?",
    choices: ["Agree", "Count them like any other leaver"]
  },
  {
    key: "q6", num: 6, section: "definitions", kind: "choice", other: true, required: true,
    title: "What makes a hire good beyond staying a year?",
    help: "Pay raises are left out on purpose: pay lives in Paycom only and is not kept in Journey.",
    choices: ["Staying 12 months is enough for past hires", "Also: upgraded or promoted within 18 months"]
  },
  {
    key: "q7", num: 7, section: "definitions", kind: "choice", other: true, required: true,
    title:
      'For new hires, should the 12-month check-in count toward a good hire: an average of 6 or more out of 10 on the four core values ("Meets" or better), and "Yes" to "Would you hire this person again?"',
    help: "The check-ins at 3, 6 and 12 months are already running. The 3- and 6-month scores are an early warning; the 12-month one is the verdict, because a good hire is judged at 12 months.",
    choices: [
      "Yes, as written",
      "Yes, but a different line (say what in Other: a higher average, or no value below 4)",
      "Rate them, but keep the definition to retention for now"
    ]
  },
  {
    key: "q8", num: 8, section: "definitions", kind: "choice", other: true, required: true,
    title: 'Older leavers with no reason on record stay "can\'t tell", never counted as bad?',
    choices: ["Agree", "Disagree"]
  },
  {
    key: "q9", num: 9, section: "definitions", kind: "choice", other: true, required: true,
    title: "A rehire is judged on each employment period separately?",
    choices: ["Agree", "Judge the person once, on their latest period"]
  },
  {
    key: "q10", num: 10, section: "department", kind: "text",
    title: "Is anything a sure sign of a good or bad hire in your department that the draft misses?",
    help: "For example: first-attempt checkride or type rating; finishing training on schedule; certificates or inspections passed."
  },
  {
    key: "q11", num: 11, section: "department", kind: "multi", other: true,
    title: "Which scorecard numbers do you want to see each quarter?",
    help: "Tick all you want. Use Other for anything missing.",
    choices: [
      "Good-hire rate",
      "Bad-hire rate",
      "Left within 90 days",
      "Left within a year (quit and let go)",
      "Interviews per hire",
      "Application to offer (days)",
      "Offers turned down, with the reason",
      "Accepted, never started",
      "Core value ratings at 3, 6 and 12 months",
      "Interview accuracy (interview scores vs later scores and results)"
    ]
  },
  { key: "q12", num: 12, section: "department", kind: "text", title: "Who has the final say on hires in your department?" },
  {
    key: "q13", num: 13, section: "department", kind: "text",
    title: "What does each core value look like on the job in your department?",
    help: 'One or two examples each for Fueled by Passion, Team Alignment, Deliver the Wow and Solutions Focused. For example, "Deliver the Wow" for a pilot is not the same as for a maintenance tech. These may become interview questions in the question bank.'
  },
  {
    key: "q14", num: 14, section: "signoff", kind: "choice", required: true,
    title: "Your sign-off",
    help: "This is your department's sign-off on the definitions and the scorecard. HR writes the final definitions from everyone's answers and shares them; there is no second approval round.",
    choices: ["I approve the definitions as drafted", "I approve them with my answers above", "Not yet - I would like to talk first"]
  }
];

/** "Anything else?" - a free note at the end, not numbered. */
export const SIGNOFF_ANYTHING_ELSE = "Anything else?";

/** One question's answer: the choice picked (or ticked), and any Other / written text. */
export type SignoffAnswer = { picked: string[]; text: string };
export type SignoffAnswers = {
  name: string;
  departments: string[];
  /** Typed into the departments' "Other" box. */
  otherDepartment: string;
  byKey: Record<string, SignoffAnswer>;
  anythingElse: string;
};

/** What is missing before the form can be sent, in plain words. Empty = ready. */
export function missingSignoffAnswers(a: SignoffAnswers): string[] {
  const out: string[] = [];
  if (!a.name.trim()) out.push("your name");
  if (!a.departments.length && !a.otherDepartment.trim()) out.push("which department(s) you are answering for");
  for (const q of SIGNOFF_QUESTIONS) {
    if (!q.required) continue;
    const ans = a.byKey[q.key];
    if (!ans || (!ans.picked.length && !ans.text.trim())) out.push(`question ${q.num}`);
  }
  return out;
}

/** Clean an answer set that arrived from the public form: only known questions and choices, bounded text. */
export function cleanSignoffAnswers(raw: unknown): SignoffAnswers {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Typed by someone who is not signed in: stored as plain text, any markup removed.
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim().slice(0, max) : "");
  const byKeyRaw = (o.byKey && typeof o.byKey === "object" ? o.byKey : {}) as Record<string, unknown>;
  const byKey: Record<string, SignoffAnswer> = {};
  for (const q of SIGNOFF_QUESTIONS) {
    const v = (byKeyRaw[q.key] && typeof byKeyRaw[q.key] === "object" ? byKeyRaw[q.key] : {}) as Record<string, unknown>;
    const picked = Array.isArray(v.picked) ? v.picked.filter((p): p is string => typeof p === "string" && (q.choices ?? []).includes(p)) : [];
    byKey[q.key] = { picked: q.kind === "choice" ? picked.slice(0, 1) : [...new Set(picked)], text: q.kind === "text" || q.other ? str(v.text, 4000) : "" };
  }
  const departments = Array.isArray(o.departments) ? [...new Set(o.departments.filter((d): d is string => typeof d === "string" && SIGNOFF_DEPARTMENTS.includes(d)))] : [];
  return { name: str(o.name, 80), departments, otherDepartment: str(o.otherDepartment, 120), byKey, anythingElse: str(o.anythingElse, 4000) };
}

// ---------------------------------------------------------------------------
// The email. The app writes the body (no Front template behind it) and HR can edit
// it for each send - her standing rule for every send. The greeting and the link
// block are added around it, so an edit can never drop the link.

export const SIGNOFF_LINK_PATH = "/signoff";
export const SIGNOFF_LINK_DAYS = 30;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ESC[c]);
// The same Verdana/9pt wrapper every hand-built send in lib/front uses.
function para(inner: string): string {
  return `<div style="line-height: 1.5;" dir="ltr"><span style="font-family: Verdana, sans-serif;"><span style="background-color: transparent; font-size: 9pt;">${inner}</span></span></div>`;
}
const GAP = "<div><br /></div>";

export function signoffGreetingHtml(recipientName: string | null): string {
  const first = (recipientName ?? "").trim().split(/\s+/)[0] || "there";
  return para(`Hi ${esc(first)},`) + GAP;
}

export function defaultSignoffSubject(): string {
  return "Quick sign-off: what makes a good hire";
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Short and plain on purpose (his ask, Nov 21: "shorter, more clear, and more human
// sounding"). HR can still edit it for each send.
export function defaultSignoffBodyHtml(departments: string[]): string {
  const for_ = departments.length ? ` for ${esc(joinList(departments))}` : "";
  return (
    para(`We're putting down in writing what makes a good hire at SkyShare, and I'd like your input${for_}.`) +
    GAP +
    para(`It's a short form, about 15 minutes, no login needed. Your answers are your sign-off, so there's nothing to approve later.`) +
    GAP +
    para(`Could you fill it out by ${SIGNOFF_DUE}?`) +
    GAP +
    para("Thanks,<br />SkyShare HR")
  );
}

export function signoffLinkBlockHtml(url: string, expiresAt: string): string {
  const until = new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Denver" });
  return (
    GAP +
    para(`<a href="${esc(url)}" style="font-weight: bold;">Open your sign-off form</a>`) +
    para(`<span style="color: #63666a;">The link works until ${esc(until)}.</span>`)
  );
}

export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// ---------------------------------------------------------------------------
// A request: one link, to one person, for the departments HR ticked.

export type SignoffRequestState = "PENDING" | "COMPLETED" | "EXPIRED" | "CANCELLED";
export const SIGNOFF_STATE_LABEL: Record<SignoffRequestState, string> = { PENDING: "Sent", COMPLETED: "Signed off", EXPIRED: "Expired", CANCELLED: "Cancelled" };

export type SignoffRequestView = {
  id: string;
  to: string;
  toName: string | null;
  departments: string[];
  state: SignoffRequestState;
  firstSentAt: string;
  lastSentAt: string;
  expiresAt: string;
  sendCount: number;
  completedAt: string | null;
  cancelledAt: string | null;
  answers: SignoffAnswers | null;
};
