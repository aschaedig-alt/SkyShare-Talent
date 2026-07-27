import {
  iterateConversations,
  getMessages,
  addComment,
  addTags,
  resolveTagIdByNames,
  downloadAttachment,
  archiveConversation,
  listComments
} from "@/lib/front";
import { prisma } from "@/lib/prisma";
import { createCandidateStorageKey, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { extractFileText } from "@/lib/files/pdf-text";
import { detectDocumentType } from "@/lib/files/document-types";
import { readPilotApplication, signedPdf, type PilotAppResult } from "./notices";

/**
 * Sweep Front for completed pilot applications and file them against candidates.
 *
 * Replaces a manual loop: someone spots the Adobe Sign notice in pilotapp@,
 * downloads the signed PDF, finds the candidate, and uploads it.
 *
 * The rules, straight from how the team wants it to behave:
 *   - candidate found  -> download, attach, THEN archive the thread in Front
 *   - candidate not found -> do NOT download; comment "could not find the
 *     candidate" on the thread and leave it open for a human
 *
 * Archiving strictly after a successful upload is the important ordering: an
 * archived thread is out of sight, so it must never be archived on a run that
 * did not actually file the document.
 */

/** Marker on every note this scanner leaves, so a repeat run can recognise its
    own handiwork and stay quiet instead of commenting again. */
const COMMENT_MARKER = "SkyShare Talent-Ops:";

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
  /** The team's existing "this is in the ATS now" marker — the one that tells a
      human the filing is genuinely done, which is why it's applied on success. */
  addedToAts: ["Manually Added to ATS", "manually added to ats"],
  /** Seen but NOT actioned — no candidate, or two candidates. */
  needsReview: ["Needs Review", "needs review"]
} as const;

/** Adobe Sign is the only sender, and the group is the only cc that matters. */
export const DEFAULT_QUERY = 'is:open cc:pilotapp@skyshare.com from:adobesign@adobesign.com';
/** The same notices regardless of state — for the one-off historical backfill. */
export const BACKFILL_QUERY = "cc:pilotapp@skyshare.com from:adobesign@adobesign.com";
export const DEFAULT_MAX_CONVERSATIONS = 40;
export const HARD_MAX_CONVERSATIONS = 300;

export type PilotAppRow = PilotAppResult & { conversationId: string };

export type PilotAppReport = {
  query: string;
  conversationsScanned: number;
  noticesFound: number;
  /** Documents actually attached — 0 on a dry run, by definition. */
  attached: number;
  archived: number;
  commented: number;
  tally: Record<string, number>;
  results: PilotAppRow[];
  missingTags?: string[];
};

export type PilotAppScanOptions = {
  /** Write. Leave false and nothing is downloaded, attached, commented or archived. */
  apply?: boolean;
  query?: string;
  maxConversations?: number;
  /**
   * One-off historical pass over threads the team ALREADY handled by hand.
   *
   * Files anything that matches, but stays silent otherwise: these threads are
   * already archived and nobody is watching them, so commenting on the ones we
   * cannot place would post dozens of notes into old history for no one, and
   * re-archiving an archived thread is pointless. Tags still go on, because a
   * tag is how you find them afterwards.
   */
  backfill?: boolean;
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
  opts: { apply?: boolean; missingTags?: Set<string>; backfill?: boolean } = {}
): Promise<PilotAppRow[]> {
  const apply = opts.apply === true;
  const backfill = opts.backfill === true;
  const missing = opts.missingTags ?? new Set<string>();
  const out: PilotAppRow[] = [];

  const messages = await getMessages(conversationId);
  for (const message of messages) {
    if (message.is_inbound === false) continue;
    const result = await readPilotApplication(message);
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

    if (result.outcome === "attached" && result.candidateId) {
      const pdf = signedPdf(message);
      if (!pdf) {
        out.push({ conversationId, ...result, outcome: "no-attachment" });
        continue;
      }
      try {
        const fileId = await fileDocument(result.candidateId, pdf, message.id, conversationId);
        const via =
          result.matchedBy === "email"
            ? `matched on ${result.signerEmail}`
            : result.matchedBy === "nickname"
              ? `matched "${result.signerName}" to them by surname and first name`
              : `matched on the name "${result.signerName}"`;
        if (!backfill) try {
          await addComment(
            conversationId,
            `SkyShare Talent-Ops: filed "${pdf.filename}" to ${result.candidateName}'s documents (${via}). Archiving this thread.`
          );
        } catch {
          /* the document is filed — a failed note must not undo that */
        }
        await tag(conversationId, [TAGS.automated, TAGS.pilotApp, TAGS.addedToAts], missing);
        // ONLY now, with the document really attached. Skipped on a backfill:
        // those threads are already archived.
        if (!backfill) await archiveConversation(conversationId);
        out.push({ conversationId, ...result, outcome: "attached", candidateFileId: fileId });
      } catch (err) {
        const why = err instanceof Error ? err.message : "Unknown error";
        try {
          await addComment(
            conversationId,
            `SkyShare Talent-Ops: found ${result.candidateName} but could NOT file the application — ${why}. Left open for a human.`
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
        ? `SkyShare Talent-Ops: could not find the candidate for this pilot application (${who}). The PDF was not downloaded — please file it by hand, or add the candidate and re-run.`
        : result.outcome === "ambiguous-match"
          ? `SkyShare Talent-Ops: could not file this pilot application — ${result.detail} Nothing was downloaded; please pick the right person by hand.`
          : result.outcome === "no-identifier"
            ? "SkyShare Talent-Ops: could not read a signer name or email from this notice, so the pilot application was not filed."
            : "SkyShare Talent-Ops: this notice had no PDF attached, so nothing was filed.";
    // These threads stay OPEN on purpose, so the nightly sweep sees them again.
    // Say it once: without this guard an unresolvable notice collects the same
    // note every night until a human gets to it.
    // On a backfill we never comment: these threads are archived history and a
    // note about a candidate who was never added helps nobody now.
    let alreadySaid = backfill;
    if (!backfill) try {
      const comments = await listComments(conversationId);
      alreadySaid = comments.some((c) => (c.body ?? "").includes(COMMENT_MARKER));
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
  const query = opts.query?.trim() || (backfill ? BACKFILL_QUERY : DEFAULT_QUERY);
  const maxConversations = opts.maxConversations ?? DEFAULT_MAX_CONVERSATIONS;

  const results: PilotAppRow[] = [];
  const missingTags = new Set<string>();
  let conversationsScanned = 0;

  for await (const conversation of iterateConversations(query)) {
    if (conversationsScanned >= maxConversations) break;
    conversationsScanned++;
    const rows = await processPilotAppConversation(conversation.id, { apply, missingTags, backfill });
    results.push(...rows);
  }

  const tally: Record<string, number> = {};
  for (const r of results) tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;

  return {
    query,
    conversationsScanned,
    noticesFound: results.length,
    attached: results.filter((r) => r.outcome === "attached" && r.candidateFileId).length,
    archived: apply ? results.filter((r) => r.outcome === "attached" && r.candidateFileId).length : 0,
    commented: apply ? results.filter((r) => r.outcome !== "attached" && r.outcome !== "already-attached").length : 0,
    tally,
    results,
    ...(missingTags.size ? { missingTags: [...missingTags] } : {})
  };
}
