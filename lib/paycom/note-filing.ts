import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity/logger";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/candidates/normalize";
import { resolveMergedAway } from "@/lib/candidates/merged-guard";
import { sanitizeRichText, richTextToPlain } from "@/lib/richtext/sanitize";
import { mountainMidnight, parsePaycomName } from "@/lib/paycom/applicant-bundle";
import { createJobForPaycomTitle, loadMatchableJobs, matchCandidate, resolveJob } from "@/lib/paycom/applicant-import";
import type { PaycomApplicationPage } from "@/lib/paycom/notes-page";
import { correctHtml, correctLines, protectedSet, type Correction, type CorrectionOutcome } from "@/lib/paycom/note-spelling";
import { addTags, getMessages, iterateConversations, resolveTagIds } from "@/lib/front";
import { JOURNEY_TAGS } from "@/lib/front/tags";

/**
 * Filing Paycom notes into the app as interviews — the half of the Paycom notes scan
 * that touches the database. The scan itself is a scheduled task in the Claude desktop
 * app (it needs his signed-in Chrome); it saves an application's page text and hands it
 * to scripts/paycom-notes-file.ts, which calls this.
 *
 * HIS RULES (2026-11-06):
 *   - Copy EVERY note on the application that is not already in the app; never duplicate.
 *   - Each note becomes an Interview: status COMPLETED, source "paycom-note", on the job of
 *     the application, dated by the note's own Paycom time — every view of interviews and
 *     notes sorts by that date, so they read in the order they happened.
 *   - A hiring manager's note is a Hiring Manager interview under that person; his own is a
 *     Recruiter Screen. Who wrote it comes from the employee directory, matched on the name
 *     Paycom prints ("ALEXANDER ANDRADE" is Alex Andrade, legal name Alexander Stephen
 *     Andrade, aandrade@skyshare.com).
 *   - The candidate and the application are made to exist first: found by the Application
 *     ID, else matched by email then phone, else created. A name-only match is never acted
 *     on — it is reported for a person to decide, the same rule as the applicant upload.
 *
 * ALREADY THERE means either an interview on that person at the same minute, or one whose
 * text already contains the note's opening — a note he once typed in by hand counts as
 * there. A candidate note (the Notes box) with that text counts too.
 *
 * PAY TALK IS KEPT, word for word. His rule, 2026-11-06: "if there are discussions of pay or
 * comp in the notes, please keep them ... so that we have a true pay conversation history."
 * Only offer-letter details stay out of the open app (the HR-only offer-details box holds
 * those) — a note is a conversation, not an offer, so nothing in one is cut. An earlier
 * version of this file blanked dollar figures; it never ran on a note that had one.
 */

export const NOTE_SOURCE = "paycom-note";
const CANDIDATE_SOURCE = "Paycom notes scan";
const JOB_MARKER = "PAYCOM_NOTES";

/**
 * The recruiting team. Everyone else who writes a note in Paycom is a hiring manager, and
 * a hiring manager's note is the write-up of an interview they held.
 *
 * The team's notes are NOT all interviews — on 2026-11-06 Teya Clarke's record held Aimee's
 * "status" and Hannah's "Candidate Emailed Recruiting". Filed as interviews they would
 * have counted in Recent interviews and the interview reports, so only a team note whose
 * TITLE says it is one becomes a Recruiter Screen; the rest become ordinary candidate notes.
 */
const RECRUITING_TEAM = new Set(["aschaedig@skyshare.com", "hbyers@skyshare.com"]);
const INTERVIEW_TITLE = /\b(interview|screen|screening|summary|debrief|phone call)\b/i;

export type NotePlan = {
  author: string;
  stamp: string;
  at: string;
  title: string;
  interviewer: { name: string; email: string | null; type: "HIRING_MANAGER" | "RECRUITER_SCREEN"; inDirectory: boolean };
  action: "add" | "already-there";
  why?: string;
  /** Spelling fixes made (applied) and refused, from lib/paycom/note-spelling.ts. */
  corrections: CorrectionOutcome[];
  /** An interview write-up, or — for a note Paycom marks Private — an HR-only candidate note. */
  filedAs: "interview" | "note" | "hr-only note";
  interviewId?: string;
  noteId?: string;
};

export type FilingResult = {
  status: "filed" | "nothing-new" | "needs-decision" | "signed-out" | "unreadable";
  paycomId: string | null;
  kind: "application" | "candidate";
  candidate: { id: string; name: string; created: boolean } | null;
  application: { id: string; jobTitle: string | null; created: boolean } | null;
  notes: NotePlan[];
  messages: string[];
  undo: { interviewIds: string[]; noteIds: string[]; candidateId: string | null; applicationId: string | null; jobId: string | null };
};

const clean = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const firstLast = (s: string) => {
  const w = clean(s).split(" ");
  return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : w[0] ?? "";
};
const textKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s);

type Person = { name: string; email: string | null };
let directory: Array<{ keys: string[]; person: Person }> | null = null;

/** Every name in the directory and the app's users — all protected from the typo pass. */
async function directoryNames(): Promise<string[]> {
  await whoWrote("");
  return (directory ?? []).map((d) => d.person.name);
}

/** Who a Paycom author is, from the employee directory and the app's users. */
async function whoWrote(author: string): Promise<Person | null> {
  if (!directory) {
    const [hires, users] = await Promise.all([
      prisma.newHire.findMany({ where: { ssEmail: { not: null } }, select: { name: true, legalName: true, ssEmail: true } }),
      prisma.user.findMany({ where: { name: { not: null }, email: { not: null } }, select: { name: true, email: true } })
    ]);
    directory = [
      ...hires.map((h) => ({
        keys: [h.name, h.legalName].filter((v): v is string => Boolean(v)).flatMap((n) => [clean(n), firstLast(n)]),
        person: { name: h.name, email: h.ssEmail?.toLowerCase() ?? null }
      })),
      ...users.map((u) => ({ keys: [clean(u.name ?? ""), firstLast(u.name ?? "")], person: { name: u.name ?? u.email ?? "", email: u.email?.toLowerCase() ?? null } }))
    ];
  }
  const wanted = [clean(author), firstLast(author)];
  const unique = (hits: typeof directory) => {
    const emails = new Set(hits.map((h) => h.person.email));
    // Two different people answering to one name is not a guess this makes.
    return emails.size === 1 ? hits[0].person : null;
  };
  const exact = directory.filter((d) => d.keys.some((k) => k && wanted.includes(k)));
  if (exact.length) return unique(exact);
  // Paycom prints the LEGAL first name; the directory often has the one people use
  // ("RICHARD PADEN" is Rich Paden, seen 2026-11-06). Same surname, and one first name
  // starting the other with at least 3 letters — the rule prisma/paycom-employee-export.ts
  // uses for the same Paycom names.
  const [first, ...rest] = clean(author).split(" ");
  const last = rest[rest.length - 1];
  if (!first || !last || first.length < 3) return null;
  const nick = directory.filter((d) =>
    d.keys.some((k) => {
      const w = k.split(" ");
      const f = w[0] ?? "";
      return w.length > 1 && w[w.length - 1] === last && f.length >= 3 && (first.startsWith(f) || f.startsWith(first));
    })
  );
  return nick.length ? unique(nick) : null;
}

/** The note as written, one paragraph per line — nothing cut, pay talk included. */
function noteHtml(lines: string[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return sanitizeRichText(lines.map((l) => `<p>${esc(l)}</p>`).join(""));
}

async function findCandidateAndApplication(page: PaycomApplicationPage, kind: FilingResult["kind"], apply: boolean, result: FilingResult) {
  const id = page.applicationId;
  if (kind === "application" && id) {
    const app = await prisma.candidateApplication.findFirst({
      where: { sourceApplicationId: id },
      select: { id: true, jobId: true, job: { select: { title: true } }, candidate: { select: { id: true, displayName: true, status: true, mergeHistoryJson: true } } }
    });
    if (app) {
      const merged = await resolveMergedAway(app.candidate);
      const candidate = merged.merged && merged.keeper ? merged.keeper : { id: app.candidate.id, displayName: app.candidate.displayName };
      if (merged.merged) result.messages.push(merged.message);
      result.candidate = { id: candidate.id, name: candidate.displayName, created: false };
      result.application = { id: app.id, jobTitle: app.job?.title ?? null, created: false };
      return { candidateId: candidate.id, jobId: app.jobId };
    }
  }
  if (kind === "candidate" && id) {
    const byPaycom = await prisma.candidate.findMany({ where: { paycomPersonId: id }, select: { id: true, displayName: true } });
    if (byPaycom.length === 1) {
      result.candidate = { id: byPaycom[0].id, name: byPaycom[0].displayName, created: false };
      return { candidateId: byPaycom[0].id, jobId: null };
    }
  }

  // Not in the app under that Paycom number: find the person the way the upload does.
  const name = parsePaycomName(page.name ?? "");
  const match = await matchCandidate({ email: page.email, phone: page.phone, firstName: name.firstName, lastName: name.lastName, displayName: name.displayName });
  if (match.kind === "decide") {
    result.status = "needs-decision";
    result.messages.push(`${page.name} (${id}) is not linked in the app, and ${match.by} matches ${match.options.map((o) => `${o.displayName} (/candidates/${o.id})`).join(", ")}. Pick the person, then run the scan again.`);
    return null;
  }

  let candidateId: string;
  if (match.kind === "existing") {
    candidateId = match.hit.id;
    result.candidate = { id: match.hit.id, name: match.hit.displayName, created: false };
  } else {
    result.candidate = { id: "", name: name.displayName, created: true };
    if (!apply) return { candidateId: "", jobId: null };
    const created = await prisma.candidate.create({
      data: {
        firstName: name.firstName,
        lastName: name.lastName,
        displayName: name.displayName,
        normalizedName: normalizeName(name.displayName),
        primaryEmail: page.email,
        normalizedEmail: normalizeEmail(page.email),
        primaryPhone: page.phone,
        normalizedPhone: normalizePhone(page.phone),
        status: "ACTIVE",
        stage: "Applied",
        source: CANDIDATE_SOURCE,
        origin: "PAYCOM",
        ...(kind === "candidate" && id ? { paycomPersonId: id } : {})
      },
      select: { id: true }
    });
    candidateId = created.id;
    result.candidate.id = created.id;
    result.undo.candidateId = created.id;
  }

  if (kind === "candidate" || !page.jobTitle) return { candidateId, jobId: null };

  // The application. A job that matches is used as it is — this is a record of what
  // happened, so a retired job is NOT reopened here (the applicant upload does that).
  const resolution = resolveJob(page.jobTitle, await loadMatchableJobs());
  let jobId: string | null = resolution.match?.jobId ?? null;
  let jobTitle = resolution.match?.title ?? resolution.newJobTitle;
  if (!apply) {
    result.application = { id: "", jobTitle, created: true };
    return { candidateId, jobId };
  }
  if (!jobId) {
    const made = await createJobForPaycomTitle(resolution, page.appliedOn, JOB_MARKER);
    jobId = made.job.id;
    jobTitle = made.job.title;
    if (made.created) {
      result.undo.jobId = made.job.id;
      result.messages.push(`Created job "${made.job.title}".`);
    }
  }
  const application = await prisma.candidateApplication.create({
    data: {
      candidateId,
      jobId,
      sourceApplicationId: id,
      status: "New",
      stage: "Applied",
      source: CANDIDATE_SOURCE,
      origin: "PAYCOM",
      appliedAt: page.appliedOn ? mountainMidnight(page.appliedOn) : null,
      historicalJobTitle: page.jobTitle
    },
    select: { id: true }
  });
  result.application = { id: application.id, jobTitle, created: true };
  result.undo.applicationId = application.id;
  return { candidateId, jobId };
}

export async function fileNotes(
  page: PaycomApplicationPage,
  opts: {
    kind: FilingResult["kind"];
    apply: boolean;
    runBy?: string | null;
    /** Proposed spelling fixes per note, keyed by the note's Paycom stamp ("11/6/2026 | 10:38 AM"). */
    corrections?: Record<string, Correction[]>;
  }
): Promise<FilingResult> {
  const result: FilingResult = {
    status: "filed",
    paycomId: page.applicationId,
    kind: opts.kind,
    candidate: null,
    application: null,
    notes: [],
    messages: [],
    undo: { interviewIds: [], noteIds: [], candidateId: null, applicationId: null, jobId: null }
  };
  if (page.signedOut) return { ...result, status: "signed-out", messages: ["The saved page is Paycom's login page — Paycom has signed out."] };
  if (!page.applicationId) return { ...result, status: "unreadable", messages: ["The page has no applicant name and number on it — it may not have finished loading."] };

  const where = await findCandidateAndApplication(page, opts.kind, opts.apply, result);
  if (!where) return result;

  const [interviews, candidateNotes] = where.candidateId
    ? await Promise.all([
        prisma.interview.findMany({ where: { candidateId: where.candidateId }, select: { startDateTime: true, notes: true } }),
        prisma.candidateNote.findMany({ where: { candidateId: where.candidateId }, select: { body: true, sourceRef: true } })
      ])
    : [[], []];
  const existingText = [...interviews.map((i) => i.notes ?? ""), ...candidateNotes.map((n) => n.body)].map(textKey);
  const minute = (d: Date) => Math.floor(d.getTime() / 60000);
  const takenMinutes = new Set(interviews.map((i) => minute(i.startDateTime)));
  const takenRefs = new Set(candidateNotes.map((n) => n.sourceRef).filter(Boolean));
  const refFor = (stamp: string) => `paycom:${page.applicationId}:${stamp}`;

  const protect = protectedSet([...(await directoryNames()), result.candidate?.name, page.name]);

  // Oldest first, so the rows are also created in the order the notes were written.
  const ordered = [...page.notes].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const note of ordered) {
    const person = await whoWrote(note.author);
    const email = person?.email ?? null;
    const team = Boolean(email && RECRUITING_TEAM.has(email));
    const type = team ? "RECRUITER_SCREEN" : "HIRING_MANAGER";
    const opening = textKey(note.lines.join(" ")).slice(0, 160);
    const plan: NotePlan = {
      author: note.author,
      stamp: note.stamp,
      at: note.at.toISOString(),
      title: note.title,
      interviewer: { name: person?.name ?? titleCase(note.author), email, type, inDirectory: Boolean(person) },
      action: "add",
      corrections: [],
      filedAs: note.private ? "hr-only note" : team && !INTERVIEW_TITLE.test(note.title) ? "note" : "interview"
    };
    if (takenRefs.has(refFor(note.stamp))) {
      plan.action = "already-there";
      plan.why = "this Paycom note is already on the profile as a candidate note";
    } else if (takenMinutes.has(minute(note.at))) {
      plan.action = "already-there";
      plan.why = "an interview at that exact time is already on the profile";
    } else if (opening.length >= 20 && existingText.some((t) => t.includes(opening))) {
      plan.action = "already-there";
      plan.why = "its text is already on the profile";
    } else if (!note.lines.length) {
      plan.action = "already-there";
      plan.why = "the note has no text";
    }
    // Spelling only, never wording: proposals are checked one by one and a refused one
    // leaves the word as Paycom has it. Paycom itself is never edited.
    const fixed = correctLines(note.lines, opts.corrections?.[note.stamp] ?? [], protect);
    plan.corrections = fixed.outcomes;
    // The interest level is part of what the author said, so it travels with the note.
    const body = note.interest ? [`Interest: ${note.interest}`, ...fixed.lines] : fixed.lines;
    const html = noteHtml(body);
    if (!person) result.messages.push(`"${note.author}" is not in the employee directory, so the note is filed under that name with no login email.`);
    const spellingFixes = fixed.outcomes.filter((o) => o.applied).map(({ from, to }) => `${from} → ${to}`);

    // Not an interview: a candidate note, dated by the Paycom note itself. A note its author
    // marked Private in Paycom stays private here — HR-only, hidden from anyone without HR
    // access, as on the profile — where an interview is read by everyone who can open the
    // candidate.
    if (plan.action === "add" && opts.apply && plan.filedAs !== "interview") {
      const author = email ? await prisma.user.findUnique({ where: { email }, select: { id: true } }) : null;
      const heading = [note.title, `(${note.private ? "private " : ""}Paycom note by ${plan.interviewer.name}, ${note.stamp})`].filter(Boolean).join(" ");
      const created = await prisma.candidateNote.create({
        data: {
          candidateId: where.candidateId,
          authorId: author?.id ?? null,
          body: [heading, ...body].join("\n").slice(0, 20000),
          bodyHtml: noteHtml([heading, ...body]).slice(0, 120000),
          source: NOTE_SOURCE,
          sourceRef: refFor(note.stamp),
          hrOnly: note.private,
          createdAt: note.at
        },
        select: { id: true }
      });
      plan.noteId = created.id;
      result.undo.noteIds.push(created.id);
      takenRefs.add(refFor(note.stamp));
      await logActivity({
        userEmail: opts.runBy ?? undefined,
        activityType: "CANDIDATE_EDITED",
        description: `Copied a ${note.private ? "private " : ""}Paycom note (${note.author}, ${note.stamp}) to ${result.candidate?.name ?? "a candidate"} as ${note.private ? "an HR-only" : "a candidate"} note`,
        entityType: "Candidate",
        entityId: where.candidateId,
        metadata: { noteId: created.id, paycomId: page.applicationId, source: NOTE_SOURCE, spellingFixes }
      });
    } else if (plan.action === "add" && opts.apply) {
      const interview = await prisma.interview.create({
        data: {
          candidateId: where.candidateId,
          jobId: where.jobId,
          title: note.title || "Paycom note",
          interviewType: type,
          startDateTime: note.at,
          timezone: "America/Denver",
          interviewer: plan.interviewer.name,
          interviewerEmail: email,
          notes: richTextToPlain(html).slice(0, 20000),
          notesHtml: html.slice(0, 120000),
          status: "COMPLETED",
          source: NOTE_SOURCE
        },
        select: { id: true }
      });
      plan.interviewId = interview.id;
      result.undo.interviewIds.push(interview.id);
      takenMinutes.add(minute(note.at));
      await logActivity({
        userEmail: opts.runBy ?? undefined,
        activityType: "CANDIDATE_EDITED",
        description: `Copied a Paycom note (${note.author}, ${note.stamp}) to ${result.candidate?.name ?? "a candidate"} as an interview`,
        entityType: "Candidate",
        entityId: where.candidateId,
        metadata: {
          interviewId: interview.id,
          paycomId: page.applicationId,
          source: NOTE_SOURCE,
          spellingFixes
        }
      });
    }
    result.notes.push(plan);
  }

  if (!result.notes.some((n) => n.action === "add")) result.status = "nothing-new";
  return result;
}

/** Reverse one filing from its undo record. Only rows this scan created are touched. */
export async function undoFiling(undo: FilingResult["undo"]): Promise<string[]> {
  const done: string[] = [];
  if (undo.interviewIds.length) {
    const r = await prisma.interview.deleteMany({ where: { id: { in: undo.interviewIds }, source: NOTE_SOURCE } });
    done.push(`removed ${r.count} interview(s)`);
  }
  // Older undo records predate private notes and carry no noteIds.
  if (undo.noteIds?.length) {
    const r = await prisma.candidateNote.deleteMany({ where: { id: { in: undo.noteIds }, source: NOTE_SOURCE } });
    done.push(`removed ${r.count} HR-only note(s)`);
  }
  if (undo.applicationId) {
    const r = await prisma.candidateApplication.deleteMany({ where: { id: undo.applicationId, source: CANDIDATE_SOURCE } });
    done.push(`removed ${r.count} application(s)`);
  }
  if (undo.candidateId) {
    const left = await Promise.all([
      prisma.candidateApplication.count({ where: { candidateId: undo.candidateId } }),
      prisma.interview.count({ where: { candidateId: undo.candidateId } }),
      prisma.candidateNote.count({ where: { candidateId: undo.candidateId } }),
      prisma.candidateFile.count({ where: { candidateId: undo.candidateId } })
    ]);
    if (left.every((n) => n === 0)) {
      await prisma.candidate.deleteMany({ where: { id: undo.candidateId, source: CANDIDATE_SOURCE } });
      done.push("removed the candidate it created");
    } else {
      done.push("kept the candidate it created — other records are attached now");
    }
  }
  if (undo.jobId && (await prisma.candidateApplication.count({ where: { jobId: undo.jobId } })) === 0) {
    await prisma.job.deleteMany({ where: { id: undo.jobId, sourceFilename: JOB_MARKER } });
    done.push("removed the job it created");
  }
  return done;
}

// ---------------------------------------------------------------- which mention emails are done

const STATE = { scope: "paycom-notes", key: "handled-mentions" } as const;

export type HandledMention = { at: string; paycomId: string | null; result: string };

/** Gmail message ids the scan has finished with — kept in the database so any run can see them. */
export async function handledMentions(): Promise<Record<string, HandledMention>> {
  const row = await prisma.workspaceSetting.findUnique({ where: { scope_key: STATE } });
  return row ? (JSON.parse(row.valueJson) as Record<string, HandledMention>) : {};
}

export async function markMentionHandled(messageId: string, entry: HandledMention) {
  const all = await handledMentions();
  all[messageId] = entry;
  await prisma.workspaceSetting.upsert({
    where: { scope_key: STATE },
    create: { ...STATE, valueJson: JSON.stringify(all) },
    update: { valueJson: JSON.stringify(all) }
  });
}

// ---------------------------------------------------------------- the Front tag

/**
 * Tag the Front copies of the mention emails for this application "Notes Auto Added", so a
 * person looking in Front can see which mentions are done. His request, 2026-11-06.
 *
 * WHERE THE COPIES ARE. The notice reaches Aimee's PRIVATE Front inbox, which this
 * company token cannot read (403 by Front's design — see lib/paycom/notices.ts). Her
 * Aug 2026 Front rule copies Paycom mail into the shared HR Onboarding inbox, and those
 * copies CAN be read and tagged. But the copy is not made for every notice: of the
 * mentions since 2026-08-01, 17 reached HR Onboarding and several did not (Raymond
 * Cardenas 395768 on 2026-11-06 among them; read conversation by conversation, not
 * inferred from a search). So Gmail stays the list the scan works from, the handled list
 * below is what makes it skip, and this tag is the visible mark where a copy exists.
 *
 * FINDING THEM. Front's search did NOT find "395768" inside a notice that contains it
 * (checked 2026-11-06), so the number is never searched for: the recent notices are
 * listed by the bare Paycom address term (the same rule lib/paycom/scan.ts uses) inside
 * a window, and each body is read for "(<id>)".
 */
export async function tagFrontCopies(paycomId: string, kind: FilingResult["kind"], days = 120): Promise<{ tagged: string[]; alreadyTagged: string[]; missingTags: string[] }> {
  const { ids, missing } = await resolveTagIds([JOURNEY_TAGS.notesAutoAdded, JOURNEY_TAGS.automated]);
  const out = { tagged: [] as string[], alreadyTagged: [] as string[], missingTags: missing };
  if (!ids.length) return out;
  const after = Math.floor((Date.now() - days * 86_400_000) / 1000);
  const label = kind === "candidate" ? "Candidate" : "Application";
  // String.raw keeps the backslashes: in a plain template literal "\(" is just "(", and the
  // first version of this line silently matched nothing because of exactly that.
  const needle = new RegExp(String.raw`${label}:\s*[^(<]*\(${paycomId}\)`);
  for await (const conversation of iterateConversations(`systemmessage@paycomonline.com mentioned after:${after}`)) {
    if (!/mentioned/i.test(conversation.subject ?? "")) continue;
    const messages = await getMessages(conversation.id);
    const text = messages.map((m) => `${m.text ?? ""} ${(m.body ?? "").replace(/<[^>]+>/g, " ")}`).join(" ");
    if (!needle.test(text.replace(/\s+/g, " "))) continue;
    const names = ((conversation.tags ?? []) as Array<{ name?: string }>).map((t) => (t.name ?? "").toLowerCase());
    if (names.includes(JOURNEY_TAGS.notesAutoAdded.toLowerCase())) {
      out.alreadyTagged.push(conversation.id);
      continue;
    }
    await addTags(conversation.id, ids);
    out.tagged.push(conversation.id);
  }
  return out;
}

// ---------------------------------------------------------------- fixing a note already filed

/**
 * Run the typo pass over a Paycom note that is already in the app. Only notes this scan
 * filed (source "paycom-note") — a write-up somebody typed is theirs to edit. The changes
 * go to the activity log, which is how one is put back.
 */
export async function correctFiledNote(interviewId: string, proposed: Correction[], runBy?: string | null) {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, source: NOTE_SOURCE },
    select: { id: true, notes: true, notesHtml: true, candidateId: true, interviewer: true, candidate: { select: { displayName: true } } }
  });
  if (!interview) throw new Error(`${interviewId} is not a Paycom note this scan filed.`);
  const protect = protectedSet([...(await directoryNames()), interview.candidate.displayName, interview.interviewer]);
  const fixed = correctLines([interview.notes ?? ""], proposed, protect);
  const applied = fixed.outcomes.filter((o) => o.applied).map(({ from, to }) => ({ from, to }));
  if (applied.length) {
    await prisma.interview.update({
      where: { id: interview.id },
      data: { notes: fixed.lines[0], notesHtml: interview.notesHtml ? correctHtml(interview.notesHtml, applied) : interview.notesHtml }
    });
    await logActivity({
      userEmail: runBy ?? undefined,
      activityType: "CANDIDATE_EDITED",
      description: `Fixed ${applied.length} spelling mistake(s) in a Paycom note on ${interview.candidate.displayName}`,
      entityType: "Candidate",
      entityId: interview.candidateId,
      metadata: { interviewId: interview.id, source: NOTE_SOURCE, spellingFixes: applied.map(({ from, to }) => `${from} → ${to}`) }
    });
  }
  return fixed.outcomes;
}
