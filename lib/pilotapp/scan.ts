import {
  iterateConversations,
  getMessages,
  addComment,
  addTags,
  resolveTagIdByNames,
  downloadAttachment,
  listComments
} from "@/lib/front";
import { prisma } from "@/lib/prisma";
import { createCandidateStorageKey, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { extractFileText } from "@/lib/files/pdf-text";
import { detectDocumentType } from "@/lib/files/document-types";
import { splitCandidateName, normalizeEmail, normalizeName } from "@/lib/candidates/normalize";
import { readPilotApplication, signedPdf, type PilotAppResult } from "./notices";
import { JOURNEY_TAGS, PILOT_APP_TAG, NEVER_APPLY_TAG } from "@/lib/front/tags";

/**
 * Sweep Front for completed pilot applications and file them against candidates.
 *
 * Replaces a manual loop: someone spots the Adobe Sign notice in pilotapp@,
 * downloads the signed PDF, finds the candidate, and uploads it.
 *
 * The rules, straight from how the team wants it to behave:
 *   - candidate found  -> download, attach, tag the thread, LEAVE IT OPEN
 *   - candidate not found -> do NOT download; comment "could not find the
 *     candidate" on the thread and leave it open for a human
 *
 * NOTHING IS ARCHIVED HERE (changed Jul 30). Filing the PDF onto the candidate
 * is only half the job: Hannah still adds each application to Paycom by hand, so
 * archiving on our side hid threads she had not finished with. The thread is the
 * only queue she has for that step, so it stays open and she archives it herself
 * once it is in Paycom. Re-runs are cheap and silent — a PDF already filed is
 * recognised by Front message id and skipped, so an open thread costs one lookup,
 * not a duplicate document.
 */

/** Marker on every note this scanner leaves, so a repeat run can recognise its
    own handiwork and stay quiet instead of commenting again. */
const COMMENT_MARKER = "SkyShare Journey:";

/** What the marker said before the Aug 2026 rename. Threads handled under the old
    name still carry it, so the "have I already commented here?" test below has to
    match either. THIS STAYS FOREVER — drop it and every conversation the app
    already handled looks unhandled, and it comments on all of them a second time. */
const LEGACY_COMMENT_MARKER = "SkyShare Talent-Ops:";

/**
 * Tag names come from lib/front/tags.ts — one list, checked against the real
 * account, shared with the Paycom and travel sweeps.
 *
 * This file used to carry its own copy, and "Candidate Created by App" was
 * silently dead after the Aug 16 renaming: the tag is now "candidate profile
 * created", a name that does not exist resolves to null, and the sweep carries on
 * untagged. Nothing failed; nothing was tagged either.
 */
export const TAGS = {
  /** On every thread the automation acted on. */
  automated: [JOURNEY_TAGS.automated],
  /** What this thread is. Lives under "Pilot" in Front, not SkyShare Journey. */
  pilotApp: [PILOT_APP_TAG],
  /**
   * HANNAH'S TAG. THE APP MUST NEVER APPLY IT. (Changed Aug 7, on the user's
   * instruction, reversing the Jul 27 decision.)
   *
   * "Manually Added to ATS" means a person put the application into PAYCOM. The
   * scanner used to set it on every successful filing, which read as that having
   * happened when all the app had done was attach the PDF on this side — so the
   * one marker telling Hannah what was still outstanding was being ticked for
   * her, by a job that cannot do the thing it claims.
   *
   * Kept here only so the retro-fix script can name the tag it removes. Do not
   * put it back into a tag() call.
   */
  addedToAts: [NEVER_APPLY_TAG],
  /** Seen but NOT actioned — no candidate, or two candidates. */
  needsReview: [JOURNEY_TAGS.needsReview],
  /** This run CREATED the candidate from the application rather than matching an
      existing one: the document was still filed, but the person did not exist
      until this thread arrived, so the record has only what the application
      itself carried. Anyone auditing auto-created people can find them from
      Front with this one tag. */
  candidateCreated: [JOURNEY_TAGS.candidateCreated],
  /** The app downloaded the signed PDF and filed it onto a candidate. Says WHAT
      the automation did to this thread, which "[automated]" alone does not —
      added Aug 16 so a filing is visible in Front and not only on the profile. */
  fileAdded: [JOURNEY_TAGS.fileAdded]
} as const;

/** Adobe Sign is the only sender, and the group is the only cc that matters. */
export const DEFAULT_QUERY = 'is:open cc:pilotapp@skyshare.com from:adobesign@adobesign.com';
/** The same notices regardless of state — for the one-off historical backfill. */
export const BACKFILL_QUERY = "cc:pilotapp@skyshare.com from:adobesign@adobesign.com";

/** How far back the nightly sweep looks. See windowedQuery. */
export const SCAN_WINDOW_DAYS = 30;

/**
 * The nightly query: every Adobe Sign notice from the last N days REGARDLESS OF
 * STATE — open or archived.
 *
 * DEFAULT_QUERY only saw is:open, and that was wrong once the scanner stopped
 * archiving (Jul 30). Hannah archives a thread when she has put the application
 * into Paycom, which is the correct end of her workflow — but an is:open sweep
 * can never see that thread again, so anything she archived before the scan
 * reached it was missed permanently and silently.
 *
 * Dropping the state filter alone would be worse: the archive holds 400-odd
 * notices, and an unbounded all-states query re-walks the whole history every
 * night, hitting the conversation cap on the OLDEST threads and never reaching
 * today's. The date window is what makes all-states affordable — it bounds the
 * set by time rather than by state, so newly archived threads stay visible for a
 * month and old ones drop out on their own.
 *
 * after:<unix> is the one date filter Front's search DSL was confirmed to accept.
 */
export function windowedQuery(days: number = SCAN_WINDOW_DAYS, now: Date = new Date()): string {
  const after = Math.floor(now.getTime() / 1000) - days * 86400;
  return `${BACKFILL_QUERY} after:${after}`;
}

/**
 * Threads one sweep will walk. Raised from 40 with the window above: 40 was sized
 * for "the handful of OPEN threads", and this query also returns everything
 * archived in the last 30 days. Still far below HARD_MAX_CONVERSATIONS, so a
 * query that goes wrong is bounded rather than unlimited.
 */
export const DEFAULT_MAX_CONVERSATIONS = 200;
/**
 * Ceiling for one sweep. Raised from 300 to 800 to finish the one-off historical
 * backfill: the archive holds 400-odd Adobe Sign notices and a 300 cap stopped
 * partway through, leaving the tail permanently unreachable. The nightly run is
 * unaffected (it uses DEFAULT_MAX_CONVERSATIONS against the is:open query, which
 * is only ever a handful of threads). Still bounded rather than unlimited so a
 * runaway query cannot walk the entire inbox.
 */
export const HARD_MAX_CONVERSATIONS = 800;

export type PilotAppRow = PilotAppResult & { conversationId: string };

export type PilotAppReport = {
  query: string;
  conversationsScanned: number;
  noticesFound: number;
  /** Documents actually attached — 0 on a dry run, by definition. */
  attached: number;
  commented: number;
  tally: Record<string, number>;
  results: PilotAppRow[];
  missingTags?: string[];
  /** Candidates created because no existing one matched. */
  createdCandidates?: string[];
};

export type PilotAppScanOptions = {
  /** Write. Leave false and nothing is downloaded, attached or commented on. */
  apply?: boolean;
  query?: string;
  maxConversations?: number;
  /** Days back for the default all-states window. Ignored if query or backfill is set. */
  windowDays?: number;
  /**
   * One-off historical pass over threads the team ALREADY handled by hand.
   *
   * Files anything that matches, but stays silent otherwise: these threads are
   * already archived and nobody is watching them, so commenting on the ones we
   * cannot place would post dozens of notes into old history for no one. Tags
   * still go on, because a tag is how you find them afterwards.
   */
  backfill?: boolean;
  /**
   * Create the candidate when none matched, instead of skipping the document.
   * Off by default: it writes new people into the shared live database, so it
   * should be a deliberate choice rather than a side effect of a routine sweep.
   */
  createMissing?: boolean;
};

export function resolveLimit(requested: unknown): number {
  const n = Number(requested);
  return Number.isFinite(n) && n > 0 ? Math.min(n, HARD_MAX_CONVERSATIONS) : DEFAULT_MAX_CONVERSATIONS;
}

/**
 * Has this exact Front message already been filed?
 *
 * Keyed on the message id recorded in the file's metadata, so a re-run — or a
 * webhook firing on a thread the cron already swept — cannot attach the same
 * PDF twice. Cheaper and more honest than relying on the thread being archived,
 * which only holds if the archive step also succeeded.
 */
async function alreadyFiled(messageId: string): Promise<string | null> {
  const existing = await prisma.candidateFile.findFirst({
    where: { source: "front-pilot-application", metadataJson: { contains: messageId } },
    select: { id: true }
  });
  return existing?.id ?? null;
}

/**
 * Create the candidate this application belongs to, when nobody matched.
 *
 * A completed pilot application IS an application — the person went through
 * Adobe Sign and signed it — so having no candidate record for them is a gap in
 * the pipeline, not a reason to drop the document on the floor.
 *
 * REQUIRES BOTH A NAME AND AN EMAIL. Either alone is not enough: an email with
 * no name gives a candidate called "jdfehrenba", and a name with no email has
 * no key to dedupe against, which is exactly how you end up with two of
 * somebody. The caller has already run the full three-tier match and found
 * nothing, so this only fires when there is genuinely no near neighbour.
 *
 * They are NOT scan-excluded: this is a live applicant who should show up in
 * matching and sourcing like any other.
 */
async function createCandidateFromApplication(
  name: string,
  email: string
): Promise<{ id: string; displayName: string }> {
  const { firstName, lastName, displayName } = splitCandidateName(name);
  const normalizedEmail = normalizeEmail(email);

  return prisma.$transaction(async (tx) => {
    const c = await tx.candidate.create({
      data: {
        firstName,
        lastName,
        displayName,
        normalizedName: normalizeName(displayName),
        primaryEmail: email.trim(),
        normalizedEmail,
        status: "ACTIVE",
        stage: "Applied",
        source: "Pilot application (Adobe Sign)",
        origin: "MANUAL"
      }
    });
    if (normalizedEmail) {
      await tx.candidateContact.create({
        data: {
          candidateId: c.id,
          type: "EMAIL",
          value: email.trim(),
          normalized: normalizedEmail,
          isPrimary: true,
          source: "Pilot application"
        }
      });
    }
    return { id: c.id, displayName: c.displayName };
  });
}

/** Download the signed PDF and attach it to the candidate. Returns the file id. */
async function fileDocument(
  candidateId: string,
  attachment: { filename: string; url: string },
  messageId: string,
  conversationId: string
): Promise<string> {
  const storage = getFileStorageAdapter();
  if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
    // Refuse rather than quietly writing a real candidate's application to local
    // disk on a hosted box.
    throw new Error("Private file storage isn't configured here, so the PDF was not downloaded.");
  }

  const filename = sanitizeFilename(attachment.filename);
  const bytes = Buffer.from(await downloadAttachment(attachment.url));
  const storageKey = createCandidateStorageKey(candidateId, filename);

  await storage.write({
    storageKey,
    bytes,
    contentType: "application/pdf",
    metadata: { candidateId, source: "front-pilot-application", frontMessageId: messageId }
  });

  const extractedText = await extractFileText(bytes, "application/pdf", filename);

  const created = await prisma.candidateFile.create({
    data: {
      candidateId,
      originalFilename: filename,
      displayFilename: filename,
      storageKey,
      mimeType: "application/pdf",
      sizeBytes: bytes.byteLength,
      source: "front-pilot-application",
      documentType: detectDocumentType(filename),
      extractedText: extractedText || null,
      textExtractedAt: extractedText ? new Date() : null,
      metadataJson: JSON.stringify({
        linkedBy: "front-pilot-application-scan",
        linkedAt: new Date().toISOString(),
        storageProvider: storage.provider,
        frontMessageId: messageId,
        frontConversationId: conversationId
      })
    },
    select: { id: true }
  });
  return created.id;
}

async function tag(conversationId: string, wanted: readonly (readonly string[])[], missing: Set<string>) {
  try {
    const ids: string[] = [];
    for (const names of wanted) {
      const id = await resolveTagIdByNames([...names]);
      if (id) ids.push(id);
      else missing.add(names[0]);
    }
    if (ids.length) await addTags(conversationId, ids);
  } catch {
    /* a tag is a label, not the work */
  }
}

/**
 * Handle ONE conversation. Shared by the scan, the manual button and (once the
 * Front rule exists) the webhook — only the doorbell differs.
 */
export async function processPilotAppConversation(
  conversationId: string,
  opts: { apply?: boolean; missingTags?: Set<string>; backfill?: boolean; createMissing?: boolean; createdCandidates?: string[] } = {}
): Promise<PilotAppRow[]> {
  const apply = opts.apply === true;
  const backfill = opts.backfill === true;
  const createMissing = opts.createMissing === true;
  const missing = opts.missingTags ?? new Set<string>();
  const createdCandidates = opts.createdCandidates ?? [];
  const out: PilotAppRow[] = [];

  const messages = await getMessages(conversationId);
  for (const message of messages) {
    if (message.is_inbound === false) continue;
    let result = await readPilotApplication(message);
    if (result.outcome === "not-a-pilot-application") continue;

    // Idempotency check runs on dry runs too, so a preview tells the truth about
    // what a real run would skip.
    const priorFileId = await alreadyFiled(message.id);
    if (priorFileId) {
      out.push({ conversationId, ...result, outcome: "already-attached", candidateFileId: priorFileId, detail: "This PDF is already on the candidate." });
      continue;
    }

    if (!apply) {
      out.push({ conversationId, ...result });
      continue;
    }

    // --- from here on we are writing ---

    // Did THIS message create the person? Drives both the tag and the wording of
    // the Front comment below, neither of which can be inferred afterwards:
    // a created candidate has matchedBy null, which is indistinguishable from a
    // plain name match once we are past this block.
    let createdHere = false;

    // No candidate, but we know exactly who signed — create them and carry on.
    // Only on a clean no-match: an AMBIGUOUS one means someone very like them is
    // already here, and creating a second record is the worst possible answer.
    if (createMissing && result.outcome === "no-match" && result.signerName && result.signerEmail) {
      try {
        const made = await createCandidateFromApplication(result.signerName, result.signerEmail);
        createdHere = true;
        result = {
          ...result,
          outcome: "attached",
          candidateId: made.id,
          candidateName: made.displayName,
          matchedBy: null,
          detail: `Created a new candidate from this application (${result.signerEmail}).`
        };
        createdCandidates.push(made.displayName);
      } catch (err) {
        out.push({
          conversationId,
          ...result,
          detail: `Couldn't create the candidate — ${err instanceof Error ? err.message : "unknown error"}`
        });
        continue;
      }
    }

    if (result.outcome === "attached" && result.candidateId) {
      const pdf = signedPdf(message);
      if (!pdf) {
        out.push({ conversationId, ...result, outcome: "no-attachment" });
        continue;
      }
      try {
        const fileId = await fileDocument(result.candidateId, pdf, message.id, conversationId);
        // A created candidate has no matchedBy, so without this branch the note
        // below would claim we "matched on the name" somebody who did not exist
        // until a moment ago — the one line a recruiter reads to decide whether
        // to trust the filing.
        const via = createdHere
          ? `new candidate created from this application`
          : result.matchedBy === "email"
            ? `matched on ${result.signerEmail}`
            : result.matchedBy === "nickname"
              ? `matched "${result.signerName}" to them by surname and first name`
              : `matched on the name "${result.signerName}"`;
        if (!backfill) try {
          await addComment(
            conversationId,
            `SkyShare Journey: filed "${pdf.filename}" to ${result.candidateName}'s documents (${via}). ` +
              `Leaving this thread OPEN — the application still needs adding to Paycom by hand. Archive it once that's done.`
          );
        } catch {
          /* the document is filed — a failed note must not undo that */
        }
        // NOT addedToAts — see the comment on that tag. Filing the PDF here is
        // not the same as somebody putting the application into Paycom, and the
        // app claiming the latter took away the only signal Hannah had for what
        // was still outstanding.
        // fileAdded goes on every successful filing: "[automated]" says a robot
        // touched the thread, this says what it actually DID with it. Without it,
        // a filed application and a thread the app merely read and gave up on
        // carried the same marks in Front.
        await tag(
          conversationId,
          createdHere
            ? [TAGS.automated, TAGS.pilotApp, TAGS.fileAdded, TAGS.candidateCreated]
            : [TAGS.automated, TAGS.pilotApp, TAGS.fileAdded],
          missing
        );
        // Deliberately NOT archived: Paycom is still a manual step and this thread
        // is the queue for it. See the note at the top of the file.
        out.push({ conversationId, ...result, outcome: "attached", candidateFileId: fileId });
      } catch (err) {
        const why = err instanceof Error ? err.message : "Unknown error";
        try {
          await addComment(
            conversationId,
            `SkyShare Journey: found ${result.candidateName} but could NOT file the application — ${why}. Left open for a human.`
          );
        } catch {
          /* nothing more we can do here */
        }
        await tag(conversationId, [TAGS.automated, TAGS.pilotApp, TAGS.needsReview], missing);
        out.push({ conversationId, ...result, outcome: "no-attachment", detail: why });
      }
      continue;
    }

    // Not filed: no candidate, two candidates, no identifier, or no PDF. Say so
    // on the thread and LEAVE IT OPEN — an archived thread is out of sight, and
    // these are exactly the ones a person still needs to deal with.
    const who = result.signerName ?? result.signerEmail ?? "the signer";
    const note =
      result.outcome === "no-match"
        ? `SkyShare Journey: could not find the candidate for this pilot application (${who}). The PDF was not downloaded — please file it by hand, or add the candidate and re-run.`
        : result.outcome === "ambiguous-match"
          ? `SkyShare Journey: could not file this pilot application — ${result.detail} Nothing was downloaded; please pick the right person by hand.`
          : result.outcome === "no-identifier"
            ? "SkyShare Journey: could not read a signer name or email from this notice, so the pilot application was not filed."
            : "SkyShare Journey: this notice had no PDF attached, so nothing was filed.";
    // These threads stay OPEN on purpose, so the nightly sweep sees them again.
    // Say it once: without this guard an unresolvable notice collects the same
    // note every night until a human gets to it.
    // On a backfill we never comment: these threads are archived history and a
    // note about a candidate who was never added helps nobody now.
    let alreadySaid = backfill;
    if (!backfill) try {
      const comments = await listComments(conversationId);
      alreadySaid = comments.some((c) => {
        const body = c.body ?? "";
        return body.includes(COMMENT_MARKER) || body.includes(LEGACY_COMMENT_MARKER);
      });
    } catch {
      /* if we can't read comments, prefer saying it twice to saying it never */
    }
    if (!alreadySaid) {
      try {
        await addComment(conversationId, note);
        out.push({ conversationId, ...result });
      } catch {
        out.push({ conversationId, ...result, detail: `${result.detail ?? ""} (couldn't leave a comment)`.trim() });
      }
    } else {
      out.push({ conversationId, ...result, detail: `${result.detail ?? ""} (already flagged on this thread)`.trim() });
    }
    await tag(conversationId, [TAGS.automated, TAGS.pilotApp, TAGS.needsReview], missing);
  }

  return out;
}

/** Throws if Front can't be read — callers decide how to report that. */
export async function scanPilotApplications(opts: PilotAppScanOptions = {}): Promise<PilotAppReport> {
  const apply = opts.apply === true;
  const backfill = opts.backfill === true;
  const createMissing = opts.createMissing === true;
  // Default is now the 30-day all-states window rather than is:open — see
  // windowedQuery for why. An explicit ?q= still wins, and ?backfill=1 still
  // reaches the whole history for a one-off catch-up.
  const query = opts.query?.trim() || (backfill ? BACKFILL_QUERY : windowedQuery(opts.windowDays));
  const maxConversations = opts.maxConversations ?? DEFAULT_MAX_CONVERSATIONS;

  const results: PilotAppRow[] = [];
  const missingTags = new Set<string>();
  const createdCandidates: string[] = [];
  let conversationsScanned = 0;

  for await (const conversation of iterateConversations(query)) {
    if (conversationsScanned >= maxConversations) break;
    conversationsScanned++;
    const rows = await processPilotAppConversation(conversation.id, { apply, missingTags, backfill, createMissing, createdCandidates });
    results.push(...rows);
  }

  const tally: Record<string, number> = {};
  for (const r of results) tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;

  return {
    query,
    conversationsScanned,
    noticesFound: results.length,
    attached: results.filter((r) => r.outcome === "attached" && r.candidateFileId).length,
    // A backfill doesn't comment (those threads are archived history nobody is
    // watching), so this has to know about the flag that suppresses the thing it
    // counts — otherwise it reports notes that were never posted.
    commented:
      apply && !backfill ? results.filter((r) => r.outcome !== "attached" && r.outcome !== "already-attached").length : 0,
    tally,
    results,
    ...(missingTags.size ? { missingTags: [...missingTags] } : {}),
    ...(createdCandidates.length ? { createdCandidates } : {})
  };
}
