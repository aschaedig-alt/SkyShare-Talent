import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { candidateScopeWhere } from "@/lib/auth/candidate-scope";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/candidates/normalize";
import { linkCandidateToJob, type LinkToJobResult } from "@/lib/candidates/link-to-job";

/**
 * POST /api/candidate-applications/batch — add many candidates to one job.
 *
 * WHY: linking a Paycom requisition's applicant list one search at a time is
 * thirty searches, and the scan that follows then has to be scoped by hand. This
 * resolves a pasted list in one call, shows what it matched BEFORE writing
 * anything, and links only the ids that come back confirmed.
 *
 * TWO MODES, and the preview is the point — the same dry-run-then-apply shape the
 * scripts in this repo use, for the same reason: this writes to the shared live
 * database, so you read what it is about to do first.
 *
 *   { mode: "preview", jobId, text }         resolves, WRITES NOTHING
 *   { mode: "apply",   jobId, candidateIds } links exactly those ids
 *
 * Apply deliberately takes IDS, not the text again: what you confirmed on screen
 * is what gets written, and a re-resolve between the two steps could silently
 * land on a different person.
 */

const MAX_PER_BATCH = 200;

type PreviewRow = {
  line: string;
  matchedBy: "email" | "phone" | "name" | null;
  candidate: {
    id: string;
    displayName: string;
    currentTitle: string | null;
    primaryEmail: string | null;
    archived: boolean;
    alreadyLinked: boolean;
    /**
     * The two facts that decide whether adding this person actually gets you
     * anywhere on the matchboard: it ranks on metrics, and metrics come from
     * document text. Surfaced here so the review step can say "linked, but there
     * is nothing to read" before you pay to find that out.
     */
    hasMetrics: boolean;
    hasDocumentText: boolean;
  } | null;
  /** Populated instead of `candidate` when the line matched more than one person. */
  ambiguous?: { id: string; displayName: string; primaryEmail: string | null }[];
};

const EMAIL_RE = /[^\s,;|<>()]+@[^\s,;|<>()]+\.[^\s,;|<>()]+/;

/**
 * Pull the usable keys out of one pasted line. Paycom's applicant list pastes as
 * tab- or comma-separated columns, but people also paste a bare email, a bare
 * name, or "Name <email>" — so this reads whatever is there rather than assuming
 * a column order that will not hold.
 */
function parseLine(line: string) {
  const email = normalizeEmail(line.match(EMAIL_RE)?.[0] ?? null);

  // Strip the email before looking for a phone, so the digits inside an address
  // (jsmith2024@…) are not read as a number.
  const withoutEmail = line.replace(EMAIL_RE, " ");
  let phone: string | null = null;
  for (const chunk of withoutEmail.split(/[\t,;|]/)) {
    const found = normalizePhone(chunk);
    if (found) {
      phone = found;
      break;
    }
  }

  // The name is whatever is left once the email and phone columns are gone. A
  // column of pure digits, dates or status words is not a name, so anything
  // without two alphabetic parts is discarded rather than guessed at.
  const nameCandidates = withoutEmail
    .split(/[\t,;|]/)
    .map((part) => part.trim())
    .filter((part) => /^[\p{L}][\p{L}'`\-.\s]*\s+[\p{L}][\p{L}'`\-.\s]*$/u.test(part));
  const name = normalizeName(nameCandidates[0] ?? null);

  return { email, phone, name };
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Same allowlist the picker applies. This route resolves arbitrary text into
  // candidate ids in bulk, which makes it the widest matcher we expose — leaving
  // it unscoped would let an allowlisted viewer walk the roster a paste at a time.
  const allowlist = candidateScopeWhere(auth.user.viewer);

  try {
    const body = (await request.json()) as {
      mode?: unknown;
      jobId?: unknown;
      text?: unknown;
      candidateIds?: unknown;
    };

    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId) {
      return NextResponse.json({ message: "jobId is required." }, { status: 400 });
    }
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!job) {
      return NextResponse.json({ message: "Job not found." }, { status: 404 });
    }

    // ---- APPLY ------------------------------------------------------------
    if (body.mode === "apply") {
      const ids = Array.isArray(body.candidateIds)
        ? [...new Set(body.candidateIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ message: "Select at least one candidate." }, { status: 400 });
      }
      if (ids.length > MAX_PER_BATCH) {
        return NextResponse.json(
          { message: `A batch adds at most ${MAX_PER_BATCH} candidates.` },
          { status: 400 }
        );
      }
      const permitted = allowlist ? new Set(await visibleIds(ids, allowlist)) : null;

      // Sequential on purpose. Each link reads the candidate, may create the
      // application and may reactivate — and the concurrency this would save is
      // worth less than not firing thirty overlapping transactions at a database
      // that both dev and production share.
      const results: LinkToJobResult[] = [];
      for (const candidateId of ids) {
        if (permitted && !permitted.has(candidateId)) {
          results.push({ candidateId, applicationId: null, reused: false, reactivated: false, error: "missing" });
          continue;
        }
        results.push(
          await linkCandidateToJob({ candidateId, jobId, source: "Batch add" })
        );
      }

      return NextResponse.json({
        ok: true,
        results,
        linked: results.filter((r) => r.applicationId && !r.reused).length,
        reused: results.filter((r) => r.reused).length,
        reactivated: results.filter((r) => r.reactivated).length,
        missing: results.filter((r) => r.error === "missing").length
      });
    }

    // ---- PREVIEW ----------------------------------------------------------
    const text = typeof body.text === "string" ? body.text : "";
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, MAX_PER_BATCH);
    if (lines.length === 0) {
      return NextResponse.json({ message: "Paste at least one name or email." }, { status: 400 });
    }

    const parsed = lines.map((line) => ({ line, ...parseLine(line) }));

    // One query per key type over the whole paste rather than one per line: a
    // 30-line paste is 3 queries, not 90.
    const emails = [...new Set(parsed.map((p) => p.email).filter((v): v is string => Boolean(v)))];
    const phones = [...new Set(parsed.map((p) => p.phone).filter((v): v is string => Boolean(v)))];
    const names = [...new Set(parsed.map((p) => p.name).filter((v): v is string => Boolean(v)))];

    const found = await prisma.candidate.findMany({
      where: {
        // Merged-away tombstones are excluded from matching entirely. They share
        // an email and phone with their keeper, so leaving them in turns every
        // merged person into a false "matched more than one" — and picking one at
        // random is the Matt Smith incident (an empty duplicate reactivated into
        // the live pool while the record holding the files stayed archived).
        status: { not: "MERGED" },
        mergeHistoryJson: null,
        OR: [
          ...(emails.length ? [{ normalizedEmail: { in: emails } }] : []),
          ...(phones.length ? [{ normalizedPhone: { in: phones } }] : []),
          ...(names.length ? [{ normalizedName: { in: names } }] : [])
        ],
        ...(allowlist ? { AND: [allowlist] } : {})
      },
      select: {
        id: true,
        displayName: true,
        currentTitle: true,
        primaryEmail: true,
        normalizedEmail: true,
        normalizedPhone: true,
        normalizedName: true,
        archivedAt: true,
        applications: { where: { jobId }, select: { id: true }, take: 1 },
        metrics: { select: { id: true }, take: 1 },
        files: {
          where: { AND: [{ extractedText: { not: null } }, { extractedText: { not: "" } }] },
          select: { id: true },
          take: 1
        }
      }
    });

    const byEmail = new Map<string, typeof found>();
    const byPhone = new Map<string, typeof found>();
    const byName = new Map<string, typeof found>();
    const push = (map: Map<string, typeof found>, key: string | null, row: (typeof found)[number]) => {
      if (!key) return;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    };
    for (const row of found) {
      push(byEmail, row.normalizedEmail, row);
      push(byPhone, row.normalizedPhone, row);
      push(byName, row.normalizedName, row);
    }

    const rows: PreviewRow[] = parsed.map((p) => {
      // Email, then phone, then name — the same order and the same "exactly one
      // live candidate" rule the document intake uses (see
      // app/api/document-intake/route.ts). Name is last and weakest: two real
      // people share one often enough that it must never outrank a contact key.
      const attempts: [PreviewRow["matchedBy"], (typeof found)[number][] | undefined][] = [
        ["email", p.email ? byEmail.get(p.email) : undefined],
        ["phone", p.phone ? byPhone.get(p.phone) : undefined],
        ["name", p.name ? byName.get(p.name) : undefined]
      ];

      for (const [matchedBy, hits] of attempts) {
        if (!hits || hits.length === 0) continue;
        if (hits.length > 1) {
          return {
            line: p.line,
            matchedBy: null,
            candidate: null,
            ambiguous: hits.map((h) => ({ id: h.id, displayName: h.displayName, primaryEmail: h.primaryEmail }))
          };
        }
        const hit = hits[0];
        return {
          line: p.line,
          matchedBy,
          candidate: {
            id: hit.id,
            displayName: hit.displayName,
            currentTitle: hit.currentTitle,
            primaryEmail: hit.primaryEmail,
            archived: Boolean(hit.archivedAt),
            alreadyLinked: hit.applications.length > 0,
            hasMetrics: hit.metrics.length > 0,
            hasDocumentText: hit.files.length > 0
          }
        };
      }

      return { line: p.line, matchedBy: null, candidate: null };
    });

    return NextResponse.json({
      ok: true,
      rows,
      truncated: text.split(/\r?\n/).filter((l) => l.trim()).length > MAX_PER_BATCH
    });
  } catch {
    return NextResponse.json({ message: "Unable to process the batch." }, { status: 500 });
  }
}

/** The subset of `ids` this viewer is allowed to touch. */
async function visibleIds(ids: string[], allowlist: { id: { in: string[] } }) {
  const rows = await prisma.candidate.findMany({
    where: { id: { in: ids }, AND: [allowlist] },
    select: { id: true }
  });
  return rows.map((r) => r.id);
}
