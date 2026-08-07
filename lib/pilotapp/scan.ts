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
 * Tag names as they REALLY exist in Front (read from the account, not guessed).
 * Each entry lists acceptable spellings for one tag and the first that exists
 * wins, so renaming one in Front doesn't silently switch the tagging off.
 */
export const TAGS = {
  /** On every thread the automation acted on. */
  automated: ["[Automated]", "automated"],
  /** What this thread is. */
  pilotApp: ["Pilot App", "pilot app"],
  /** The team's existing "this is in the ATS now" marker, applied on success.
      Means the PDF is on the candidate here — NOT that it's in Paycom; that step
      is still Hannah's, and the open thread is what tells her it's outstanding. */
  addedToAts: ["Manually Added to ATS", "manually added to ats"],
  /** Seen but NOT actioned — no candidate, or two candidates. */
  needsReview: ["Needs Review", "needs review"],
  /** This run CREATED the candidate from the application rather than matching an
      existing one. Applied alongside addedToAts, not instead of it: the document
      was still filed, but the person did not exist until this thread arrived, so
      the record has only what the application itself carried. Anyone auditing
      auto-created people can find them from Front with this one tag. */
  candidateCreated: ["Candidate Created by App", "candidate created by app"]
} as const;

/** Adobe Sign is the only sender, and the group is the only cc that matters. */
export const DEFAULT_QUERY = 'is:open cc:pilotapp@skyshare.com from:adobesign@adobesign.com';
/** The same notices regardless of state — for the one-off historical backfill. */
export const BACKFILL_QUERY = "cc:pilotapp@skyshare.com from:adobesign@adobesign.com";
export const DEFAULT_MAX_CONVERSATIONS = 40;
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
        await tag(
          conversationId,
          createdHere
            ? [TAGS.automated, TAGS.pilotApp, TAGS.addedToAts, TAGS.candidateCreated]
            : [TAGS.automated, TAGS.pilotApp, TAGS.addedToAts],
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
  const query = opts.query?.trim() || (backfill ? BACKFILL_QUERY : DEFAULT_QUERY);
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
