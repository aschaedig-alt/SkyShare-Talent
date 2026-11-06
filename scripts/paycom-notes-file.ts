/**
 * File a Paycom application's notes into the app — what the "Paycom notes scan"
 * scheduled task calls for each "You've Been Mentioned" email.
 *
 *   npx tsx scripts/paycom-notes-file.ts --page <page.txt> [--candidate] [--mention <gmail id>]
 *       DRY RUN: prints what would be filed as JSON. Writes nothing.
 *   ... --apply
 *       files every note not already in the app, writes an undo record under
 *       scripts/paycom-notes/undo/, and (with --mention) marks that email handled.
 *   ... --corrections <fixes.json>
 *       spelling fixes to propose, keyed by the note's Paycom stamp:
 *       { "10/30/2026 | 3:18 PM": [{ "from": "Lets", "to": "Let's" }] }
 *       Each is checked by lib/paycom/note-spelling.ts; a refused one is left as written.
 *   npx tsx scripts/paycom-notes-file.ts --fix <interview id> --corrections <fixes.json> [--apply]
 *       the same typo pass on a Paycom note already filed (fixes.json is a plain array).
 *   npx tsx scripts/paycom-notes-file.ts --tag-front <paycom id> [--candidate]
 *       tag that application's mention emails in Front "Notes Auto Added" (apply does this too).
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
    console.log(JSON.stringify(await tagFrontCopies(tagFront, process.argv.includes("--candidate") ? "candidate" : "application"), null, 1));
    return;
  }

  const pageFile = arg("--page");
  if (!pageFile) throw new Error("Pass --page <file> (the Paycom application page text), or --handled / --mark / --undo.");
  const apply = process.argv.includes("--apply");
  const mention = arg("--mention");
  const page = parseApplicationPage(readFileSync(pageFile, "utf8"));
  const correctionsFile = arg("--corrections");
  const corrections = correctionsFile ? (JSON.parse(readFileSync(correctionsFile, "utf8")) as Record<string, Correction[]>) : undefined;
  const kind = process.argv.includes("--candidate") ? "candidate" : "application";
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
  // The visible mark in Front, once the notes are in. A Front failure never undoes the filing.
  let front: unknown = null;
  if (apply && result.paycomId && (result.status === "filed" || result.status === "nothing-new")) {
    front = await tagFrontCopies(result.paycomId, kind).catch((error: unknown) => ({ error: String(error) }));
  }
  console.log(JSON.stringify({ apply, ...result, front }, null, 1));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
