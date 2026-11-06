/**
 * File a Paycom application's notes into the app — what the "Paycom notes scan"
 * scheduled task calls for each "You've Been Mentioned" email.
 *
 *   npx tsx scripts/paycom-notes-file.ts --page <page.txt> [--candidate] [--mention <gmail id>]
 *       DRY RUN: prints what would be filed as JSON. Writes nothing.
 *   ... --apply
 *       files every note not already in the app, writes an undo record under
 *       scripts/paycom-notes/undo/, and (with --mention) marks that email handled and updates
 *       its row in the Paycom email log (--mention-date <iso> [--mention-subject "<s>"] adds
 *       the row if the log has not seen that email yet).
 *   ... --corrections <fixes.json>
 *       spelling fixes to propose, keyed by the note's Paycom stamp:
 *       { "10/30/2026 | 3:18 PM": [{ "from": "Lets", "to": "Let's" }] }
 *       Each is checked by lib/paycom/note-spelling.ts; a refused one is left as written.
 *   npx tsx scripts/paycom-notes-file.ts --fix <interview id> --corrections <fixes.json> [--apply]
 *       the same typo pass on a Paycom note already filed (fixes.json is a plain array).
 *   npx tsx scripts/paycom-notes-file.ts --tag-front <paycom id> [--candidate] [--archive]
 *       tag that application's mention emails in Front "Notes Auto Added" (apply does this too,
 *       and archives them, only once the notes are saved). Looks back to 2025-01-01.
 *   npx tsx scripts/paycom-notes-file.ts --handled
 *       prints the Gmail message ids already handled, so a run can skip them.
 *   npx tsx scripts/paycom-notes-file.ts --mark <gmail id> --result "<text>" [--paycom-id <id>]
 *       marks an email handled without filing (e.g. a decision was made by hand).
 *   npx tsx scripts/paycom-notes-file.ts --undo <undo file>
 *       removes exactly what that run created.
 *
 * <page.txt> is the text of the application page in Paycom with its Notes tab open
 * (Claude in Chrome get_page_text). --candidate is for a CANDIDATE-level mention ("within
 * the notes of the following candidate(s): Candidate: <Name> (<id>)"), which has no job.
 * The logic lives in lib/paycom/note-filing.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseApplicationPage } from "../lib/paycom/notes-page";
import { correctFiledNote, fileNotes, handledMentions, markMentionHandled, tagFrontCopies, undoFiling, type FilingResult } from "../lib/paycom/note-filing";
import { correctLines, protectedSet, type Correction } from "../lib/paycom/note-spelling";
import { patchRow } from "../lib/paycom/email-log";
import { prisma } from "../lib/prisma";

const UNDO_DIR = path.join("scripts", "paycom-notes", "undo");

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  if (process.argv.includes("--handled")) {
    console.log(JSON.stringify(await handledMentions(), null, 1));
    return;
  }
  const mark = arg("--mark");
  if (mark) {
    await markMentionHandled(mark, { at: new Date().toISOString(), paycomId: arg("--paycom-id"), result: arg("--result") ?? "marked by hand" });
    console.log(`Marked ${mark} handled.`);
    return;
  }
  const undoFile = arg("--undo");
  if (undoFile) {
    const record = JSON.parse(readFileSync(undoFile, "utf8")) as { undo: FilingResult["undo"] };
    console.log((await undoFiling(record.undo)).join("; ") || "nothing to undo");
    return;
  }

  const fix = arg("--fix");
  if (fix) {
    const proposed = JSON.parse(readFileSync(arg("--corrections") ?? "", "utf8")) as Correction[];
    if (!process.argv.includes("--apply")) {
      // Dry run: judge the proposals against the fixed protected list only.
      console.log(JSON.stringify(correctLines([proposed.map((c) => c.from).join(" ")], proposed, protectedSet([])).outcomes, null, 1));
      console.log("DRY RUN — add --apply to change the note.");
      return;
    }
    console.log(JSON.stringify(await correctFiledNote(fix, proposed, "aschaedig@skyshare.com"), null, 1));
    return;
  }
  const tagFront = arg("--tag-front");
  if (tagFront) {
    console.log(JSON.stringify(await tagFrontCopies(tagFront, process.argv.includes("--candidate") ? "candidate" : "application", { archive: process.argv.includes("--archive") }), null, 1));
    return;
  }

  // --batch <list.json> --out <dir>: many filings in ONE process (a backfill), each exactly as a
  // single --page run would do it. The list is [{ page, kind, mention, also, corrections }].
  const batchFile = arg("--batch");
  if (batchFile) {
    const outDir = arg("--out");
    if (!outDir) throw new Error("--batch needs --out <dir>");
    const list = JSON.parse(readFileSync(batchFile, "utf8")) as Array<{ page: string; kind: FilingResult["kind"]; mention?: string; also?: string[]; corrections?: string; key: string }>;
    for (const b of list) {
      const out = path.join(outDir, `${b.key}.json`);
      if (existsSync(out) && !readFileSync(out, "utf8").includes('"placeholder"')) continue;
      const r = await fileOne({ pageFile: b.page, apply: process.argv.includes("--apply"), mention: b.mention ?? null, correctionsFile: b.corrections ?? null, kind: b.kind, also: b.also ?? [], mentionDate: null, mentionSubject: null });
      writeFileSync(out, JSON.stringify(r, null, 1));
      const added = r.notes.filter((n) => n.action === "add").length;
      const f = r.front && !("error" in r.front) ? `front t${r.front.tagged.length} a${r.front.archived.length}` : r.front ? "front ERROR" : "";
      console.log(`${b.key} ${r.status} ${added} added ${f}`);
    }
    console.log("DONE");
    return;
  }

  const pageFile = arg("--page");
  if (!pageFile) throw new Error("Pass --page <file> (the Paycom application page text), or --handled / --mark / --undo.");
  const out = await fileOne({
    pageFile,
    apply: process.argv.includes("--apply"),
    mention: arg("--mention"),
    correctionsFile: arg("--corrections"),
    kind: process.argv.includes("--candidate") ? "candidate" : "application",
    also: (arg("--also-mentions") ?? "").split(",").filter(Boolean),
    mentionDate: arg("--mention-date"),
    mentionSubject: arg("--mention-subject")
  });
  console.log(JSON.stringify(out, null, 1));
}

/** One filing: the notes, the undo record, the handled list, Front, and the log row. */
async function fileOne(o: {
  pageFile: string;
  apply: boolean;
  mention: string | null;
  correctionsFile: string | null;
  kind: FilingResult["kind"];
  also: string[];
  mentionDate: string | null;
  mentionSubject: string | null;
}) {
  const { apply, mention, kind, also } = o;
  const page = parseApplicationPage(readFileSync(o.pageFile, "utf8"));
  const corrections = o.correctionsFile ? (JSON.parse(readFileSync(o.correctionsFile, "utf8")) as Record<string, Correction[]>) : undefined;
  const result = await fileNotes(page, { kind, apply, runBy: "aschaedig@skyshare.com", corrections });

  if (apply && (result.undo.interviewIds.length || result.undo.noteIds.length || result.undo.candidateId || result.undo.applicationId)) {
    if (!existsSync(UNDO_DIR)) mkdirSync(UNDO_DIR, { recursive: true });
    const file = path.join(UNDO_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${result.paycomId}.json`);
    writeFileSync(file, JSON.stringify({ paycomId: result.paycomId, mention, undo: result.undo }, null, 2));
    result.messages.push(`Undo record: ${file}`);
  }
  // A mention is finished when its notes are in the app — filed now, or already there.
  if (apply && mention && (result.status === "filed" || result.status === "nothing-new")) {
    await markMentionHandled(mention, {
      at: new Date().toISOString(),
      paycomId: result.paycomId,
      result: `${result.status}: ${result.notes.filter((n) => n.interviewId).length} added, ${result.notes.filter((n) => n.action === "already-there").length} already there`
    });
  }
  // The visible mark in Front, once the notes are in: tagged, then archived. Only after the
  // save succeeded (filed, or already there) — an archived thread is out of sight, so a
  // failed filing must stay open. A Front failure never undoes the filing.
  const saved = result.status === "filed" || result.status === "nothing-new";
  let front: Awaited<ReturnType<typeof tagFrontCopies>> | { error: string } | null = null;
  if (apply && result.paycomId && saved) {
    front = await tagFrontCopies(result.paycomId, kind, { archive: true }).catch((error: unknown) => ({ error: String(error) }));
  }

  // The Paycom email log row for this mention (lib/paycom/email-log.ts). --mention-date and
  // --mention-subject let a run log a mention the log has not seen yet.
  // Other mention emails naming the same application: done by this same filing.
  if (apply && saved && also.length) {
    for (const id of also) await markMentionHandled(id, { at: new Date().toISOString(), paycomId: result.paycomId, result: `same application as ${mention ?? "this filing"}` });
  }
  let log: unknown = null;
  if (apply && mention) {
    const added = result.notes.filter((n) => n.action === "add");
    const patch = {
      outcome: saved ? (added.length ? ("note-filed" as const) : ("already-in-app" as const)) : ("needs-decision" as const),
      reason: saved
        ? `${added.length} added (${added.map((n) => n.filedAs).join(", ") || "none"}), ${result.notes.filter((n) => n.action === "already-there").length} already there`
        : result.messages.join(" ").slice(0, 300),
      candidateId: result.candidate?.id || undefined,
      paycomId: result.paycomId ?? undefined,
      person: result.candidate?.name ?? undefined,
      interviewIds: result.undo.interviewIds.length ? result.undo.interviewIds : undefined,
      noteIds: result.undo.noteIds.length ? result.undo.noteIds : undefined,
      hrOnly: added.some((n) => n.filedAs === "hr-only note") || undefined,
      front: front && !("error" in front) ? { tagged: front.tagged.length + front.alreadyTagged.length, archived: front.archived.length } : undefined
    };
    const date = o.mentionDate;
    const before = await patchRow(mention, patch, date ? { at: new Date(date).toISOString(), subject: o.mentionSubject ?? "You've Been Mentioned" } : undefined);
    // The same application's other mention emails get the same outcome, pointing at this one.
    for (const id of also) {
      const b = await patchRow(id, { ...patch, reason: `same application as the ${mention} filing: ${patch.reason}`, front: undefined });
      if (b && before) for (const [m, v] of Object.entries(b)) if (!(m in before)) before[m] = v;
    }
    if (before) {
      if (!existsSync(UNDO_DIR)) mkdirSync(UNDO_DIR, { recursive: true });
      const file = path.join(UNDO_DIR, `log-${new Date().toISOString().replace(/[:.]/g, "-")}-${mention}.json`);
      writeFileSync(file, JSON.stringify({ kind: "paycom-email-log", before }, null, 1));
      log = { updated: mention, undo: file };
    } else log = { updated: null, note: "this mention is not in the Paycom email log yet; pass --mention-date to add it" };
  }
  return { apply, ...result, front, log };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
