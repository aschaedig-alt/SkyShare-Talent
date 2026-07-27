import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizeName } from "@/lib/candidates/normalize";
import type { FrontMessage } from "@/lib/front";

/**
 * Reading Adobe Acrobat Sign's "completed pilot application" notice.
 *
 * The team's pilot application is signed in Adobe Sign, which cc's
 * pilotapp@skyshare.com on the completion notice with the signed PDF attached.
 * Today someone downloads that PDF by hand and uploads it to the candidate.
 *
 * Anatomy of the real notice (verified against msg_2t78xal6):
 *   subject     Completed: You're copied on "PilotApplication"
 *   from        adobesign@adobesign.com
 *   to          crich@skyshare.com, scottcaspary138@yahoo.com   <- the signer
 *   cc          pilotapp@skyshare.com
 *   body        "…final agreement between: <ul><li>CB Skyshare</li><li>Scott Caspary</li></ul>"
 *   attachment  "PilotApplication - signed.pdf" (application/pdf)
 *
 * TWO identifiers come out of that, and the email one is far the stronger:
 * the signer's own address is a recipient, while the name is free text that the
 * user warns varies (extra middle names, a nickname used on the application).
 * So we match on email first and only fall back to the name.
 */

/**
 * Exactly the subject the team sees.
 *
 * Deliberately tolerant of SMART PUNCTUATION: mail clients and Adobe itself
 * swap the straight apostrophe in "You're" for a curly one, and the straight
 * quotes around the agreement name for typographic ones. Anchored at both ends
 * so a reply ("Re: Completed: …") is NOT treated as a fresh notice.
 */
const APOS = "['‘’´]";
const QUOTE = "[\"'“”‘’]";
const SUBJECT_RE = new RegExp(
  `^\\s*completed:\\s*you${APOS}?re copied on\\s*${QUOTE}?pilotapplication${QUOTE}?\\s*$`,
  "i"
);

export function isPilotApplicationSubject(subject: string | undefined | null): boolean {
  return SUBJECT_RE.test((subject ?? "").replace(/\s+/g, " ").trim());
}

/** Our own domain — never the candidate. */
const INTERNAL_DOMAIN = /@skyshare\.com$/i;
/** Adobe's own addresses, which are on every one of these. */
const ADOBE = /@(adobesign|echosign)\.com$/i;

/**
 * The signer's email: a recipient that is neither ours nor Adobe's.
 *
 * Returns null when the signer happens to have a SkyShare address (an internal
 * applicant) — then only the name is left to go on, which the caller handles.
 */
export function signerEmail(message: FrontMessage): string | null {
  const handles = (message.recipients ?? [])
    .filter((r) => r.role === "to" || r.role === "cc")
    .map((r) => (r.handle ?? "").trim())
    .filter((h) => h.includes("@") && !INTERNAL_DOMAIN.test(h) && !ADOBE.test(h));
  // "to" before "cc" — the signer is a direct recipient.
  const to = (message.recipients ?? [])
    .filter((r) => r.role === "to")
    .map((r) => (r.handle ?? "").trim())
    .find((h) => h.includes("@") && !INTERNAL_DOMAIN.test(h) && !ADOBE.test(h));
  return to ?? handles[0] ?? null;
}

/** Anything that reads as the SkyShare side of the agreement, not the person. */
function isCompanyParty(name: string): boolean {
  return /sky\s*share/i.test(name);
}

/**
 * The signer's NAME, from the "final agreement between:" list.
 *
 * The list holds the company and the person, in that order. We take the entries
 * that don't look like the company — so an added party or a reordered list
 * doesn't silently pick the wrong one. Falls back to a plain-text scrape when
 * the HTML isn't shaped as expected.
 */
export function signerName(message: FrontMessage): string | null {
  const html = message.body ?? "";
  const between = html.search(/final agreement between/i);
  if (between >= 0) {
    const after = html.slice(between, between + 2000);
    const items = [...after.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const people = items.filter((i) => !isCompanyParty(i));
    if (people.length === 1) return people[0];
    // More than one non-company party is ambiguous — say so rather than guess.
    if (people.length > 1) return null;
  }
  // Plain-text fallback: "…between: CB Skyshare Scott Caspary Read it with…"
  const text = (message.text ?? "").replace(/\s+/g, " ");
  const m = /final agreement between:\s*(.+?)\s+Read it with/i.exec(text);
  if (m) {
    const chunk = m[1].replace(/CB\s+Sky\s*share/i, "").replace(/Sky\s*Share/i, "").trim();
    return chunk || null;
  }
  return null;
}

/** The signed PDF. Adobe attaches exactly one; anything else is not our file. */
export function signedPdf(message: FrontMessage): { id: string; filename: string; url: string; size: number } | null {
  const atts = message.attachments ?? [];
  const pdf = atts.find((a) => /\.pdf$/i.test(a.filename ?? "") && /pilot\s*application/i.test(a.filename ?? ""));
  return pdf ?? atts.find((a) => /\.pdf$/i.test(a.filename ?? "")) ?? null;
}

// --- matching ---------------------------------------------------------------

export type CandidateMatch = {
  id: string;
  displayName: string;
  primaryEmail: string | null;
};

export type MatchOutcome = {
  matches: CandidateMatch[];
  matchedBy: "email" | "name" | "nickname" | null;
};

const SELECT = { id: true, displayName: true, primaryEmail: true } as const;

/**
 * Find the candidate this application belongs to.
 *
 * Three tiers, strongest first, and each must land on exactly ONE person:
 *   1. email    — the signer's own address, an exact key
 *   2. name     — normalized full name, exact
 *   3. nickname — same surname AND first names agreeing on their first three
 *                 letters, which is what catches "Mike"/"Michael" and an added
 *                 middle name. Deliberately last and deliberately narrow.
 *
 * Two candidates at any tier is reported as ambiguous rather than guessed at —
 * attaching a pilot application to the wrong person is worse than not attaching it.
 */
export async function matchCandidate(email: string | null, name: string | null): Promise<MatchOutcome> {
  if (email) {
    const e = normalizeEmail(email);
    if (e) {
      const byEmail = await prisma.candidate.findMany({
        where: { normalizedEmail: e, status: { not: "MERGED" } },
        select: SELECT
      });
      if (byEmail.length) return { matches: byEmail, matchedBy: "email" };
    }
  }

  if (!name) return { matches: [], matchedBy: null };
  const n = normalizeName(name);
  if (!n) return { matches: [], matchedBy: null };

  const byName = await prisma.candidate.findMany({
    where: { normalizedName: n, status: { not: "MERGED" } },
    select: SELECT
  });
  if (byName.length) return { matches: byName, matchedBy: "name" };

  // Nickname / extra-middle-name tier: anchor on the surname, then require the
  // first names to agree on three letters.
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { matches: [], matchedBy: null };
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (first.length < 3) return { matches: [], matchedBy: null };

  const sameSurname = await prisma.candidate.findMany({
    where: { normalizedName: { endsWith: ` ${last}` }, status: { not: "MERGED" } },
    select: { ...SELECT, normalizedName: true }
  });
  const near = sameSurname.filter((c) => {
    const cf = (c.normalizedName ?? "").split(/\s+/)[0] ?? "";
    return cf.length >= 3 && (cf.startsWith(first.slice(0, 3)) || first.startsWith(cf.slice(0, 3)));
  });
  if (near.length) {
    return { matches: near.map(({ id, displayName, primaryEmail }) => ({ id, displayName, primaryEmail })), matchedBy: "nickname" };
  }

  return { matches: [], matchedBy: null };
}

// --- one message, read ------------------------------------------------------

export type PilotAppOutcome =
  | "not-a-pilot-application"
  | "no-attachment"
  | "no-identifier"
  | "no-match"
  | "ambiguous-match"
  | "already-attached"
  | "attached";

export type PilotAppResult = {
  outcome: PilotAppOutcome;
  messageId: string;
  subject: string;
  signerName: string | null;
  signerEmail: string | null;
  attachmentName: string | null;
  matchedBy: MatchOutcome["matchedBy"];
  candidateId?: string;
  candidateName?: string;
  /** Set when a file was created (or would be, on a dry run). */
  candidateFileId?: string;
  detail?: string;
};

/** Everything we can learn from the message WITHOUT writing anything. */
export async function readPilotApplication(message: FrontMessage): Promise<PilotAppResult> {
  const subject = (message.subject ?? "").trim();
  const base = {
    messageId: message.id,
    subject,
    signerName: null as string | null,
    signerEmail: null as string | null,
    attachmentName: null as string | null,
    matchedBy: null as MatchOutcome["matchedBy"]
  };

  if (!isPilotApplicationSubject(subject)) {
    return { ...base, outcome: "not-a-pilot-application" };
  }

  const name = signerName(message);
  const email = signerEmail(message);
  const pdf = signedPdf(message);
  const info = { ...base, signerName: name, signerEmail: email, attachmentName: pdf?.filename ?? null };

  if (!pdf) return { ...info, outcome: "no-attachment", detail: "The notice carried no PDF." };
  if (!name && !email) {
    return { ...info, outcome: "no-identifier", detail: "Couldn't read a signer name or email from the notice." };
  }

  const { matches, matchedBy } = await matchCandidate(email, name);
  if (matches.length === 0) {
    return { ...info, outcome: "no-match", detail: `No candidate matches ${name ?? email}.` };
  }
  if (matches.length > 1) {
    return {
      ...info,
      outcome: "ambiguous-match",
      matchedBy,
      detail: `${matches.length} candidates match ${name ?? email}: ${matches.map((m) => m.displayName).join(", ")}.`
    };
  }

  return {
    ...info,
    outcome: "attached", // provisional — the caller decides after the upload
    matchedBy,
    candidateId: matches[0].id,
    candidateName: matches[0].displayName
  };
}
