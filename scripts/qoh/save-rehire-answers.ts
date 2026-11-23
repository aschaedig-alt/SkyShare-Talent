// Load HR's "would you hire them back?" answers for first-year quitters into Journey
// (WorkspaceSetting workspace / qoh-rehire-answers - see lib/quality-of-hire/rehire-answers.ts).
//
// The database is shared and live, so this is a DRY RUN unless told otherwise:
//
//   node --env-file=.env --env-file=.env.local node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json \
//     scripts/qoh/save-rehire-answers.ts "<filled-in .csv>"            dry run: writes review.md + plan.json, changes nothing
//   ... scripts/qoh/save-rehire-answers.ts --apply "<filled-in .csv>"  writes the answers; saves undo.json FIRST
//   ... scripts/qoh/save-rehire-answers.ts --undo "<undo.json>"        puts the setting back exactly as it was
//
// Each sheet row is matched to ONE hire period by name + start date, using the Quality of
// Hire report's own list of hires. A row that matches nothing, or more than one period, is
// listed and left out - never guessed. Blank or "don't know" answers are left out too.
// The sheet is read as plain text (never with a spreadsheet library).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { prisma } from "@/lib/prisma";
import { getQualityOfHire, type QohHire } from "@/lib/quality-of-hire/report";
import { periodKey } from "@/lib/quality-of-hire/situational";
import { parseRehireAnswers, readRehireAnswersRaw, writeRehireAnswersRaw, type RehireAnswer, type RehireAnswers } from "@/lib/quality-of-hire/rehire-answers";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); rows.push(row); row = []; f = "";
    } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const mountainDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const outDir = () => {
  const dir = join("scripts", `_rehire-answers-${mountainDay()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

type Row = { line: number; name: string; start: string; answer: "YES" | "NO" | null; raw: string; why: string; notes: string };
type Planned = { key: string; hire: QohHire; row: Row; value: RehireAnswer; change: "add" | "change" | "same"; flags: string[] };

async function plan(csvPath: string) {
  const text = readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  const [head, ...body] = parseCsv(text);
  const col = (re: RegExp) => head.findIndex((h) => re.test(h.trim()));
  const iName = col(/^Name$/i), iStart = col(/^Started$/i), iAns = col(/hire them back/i), iWhy = col(/^Why they left/i), iNotes = col(/^Notes$/i);
  if (iName < 0 || iStart < 0 || iAns < 0) throw new Error('The sheet needs "Name", "Started" and "Would you hire them back?" columns.');

  const rows: Row[] = body.map((r, n) => {
    const raw = (r[iAns] ?? "").trim();
    const a = raw.toLowerCase();
    return {
      line: n + 2,
      name: (r[iName] ?? "").trim(),
      start: (r[iStart] ?? "").trim(),
      answer: a === "yes" || a === "y" ? "YES" : a === "no" || a === "n" ? "NO" : null,
      raw,
      why: iWhy >= 0 ? (r[iWhy] ?? "").trim() : "",
      notes: iNotes >= 0 ? (r[iNotes] ?? "").trim() : ""
    };
  });

  const q = await getQualityOfHire();
  const byNameStart = new Map<string, QohHire[]>();
  for (const h of q.hires) {
    const k = `${h.name.trim().toLowerCase()}|${h.start}`;
    byNameStart.set(k, [...(byNameStart.get(k) ?? []), h]);
  }

  const current = parseRehireAnswers(await readRehireAnswersRaw());
  const at = new Date().toISOString();
  const source = basename(csvPath);
  const planned: Planned[] = [];
  const skipped: Array<{ row: Row; why: string }> = [];
  for (const row of rows) {
    if (!row.answer) { skipped.push({ row, why: row.raw ? `answer "${row.raw}" is not yes or no` : "no answer" }); continue; }
    const hits = byNameStart.get(`${row.name.toLowerCase()}|${row.start}`) ?? [];
    if (hits.length !== 1) { skipped.push({ row, why: hits.length ? `${hits.length} hire periods match` : "no hire period with this name and start date" }); continue; }
    const hire = hits[0];
    const flags: string[] = [];
    if (hire.stillHere) flags.push("still here in Journey");
    else if (hire.tenureDays >= 365) flags.push(`left after ${hire.tenureDays} days, not in the first year`);
    if (hire.voluntary !== "V") flags.push(`Paycom says ${hire.voluntary === "I" ? "let go" : "quit or let go not recorded"}`);
    const notes: string[] = [];
    if (row.why && hire.reason && row.why !== hire.reason) {
      notes.push(`Reason given by HR: ${row.why} (Paycom: ${hire.reason})`);
      flags.push(`reason changed on the sheet: "${hire.reason}" -> "${row.why}"`);
    }
    if (row.notes) notes.push(row.notes);
    const value: RehireAnswer = { answer: row.answer, note: notes.length ? notes.join(" | ") : null, by: null, at, source };
    const key = periodKey(hire.id, hire.start);
    const before = current[key];
    const change = !before ? "add" : before.answer === value.answer && (before.note ?? null) === value.note ? "same" : "change";
    planned.push({ key, hire, row, value, change, flags });
  }

  const next: RehireAnswers = { ...current };
  for (const p of planned) if (p.change !== "same") next[p.key] = p.value;
  return { rows, planned, skipped, current, next, source };
}

function review(p: Awaited<ReturnType<typeof plan>>, mode: "dry run" | "applied"): string {
  const yes = p.planned.filter((x) => x.value.answer === "YES").length;
  const no = p.planned.filter((x) => x.value.answer === "NO").length;
  const L: string[] = [];
  L.push(`# Would-hire-back answers - ${mode}`, "");
  L.push(`Sheet: ${p.source} (${p.rows.length} rows)`, "");
  L.push(`- To save: ${p.planned.length} (${yes} yes = regretted loss, ${no} no = bad hire)`);
  L.push(`- New: ${p.planned.filter((x) => x.change === "add").length}, changed: ${p.planned.filter((x) => x.change === "change").length}, already saved the same: ${p.planned.filter((x) => x.change === "same").length}`);
  L.push(`- Left out: ${p.skipped.length}`);
  L.push(`- Answers already in Journey before this: ${Object.keys(p.current).length}`, "");
  L.push("Where: one WorkspaceSetting (scope workspace, key qoh-rehire-answers). No person's record is changed.", "");
  if (p.skipped.length) {
    L.push("## Left out", "", "| Line | Name | Started | Why |", "|---|---|---|---|");
    for (const s of p.skipped) L.push(`| ${s.row.line} | ${s.row.name} | ${s.row.start} | ${s.why} |`);
    L.push("");
  }
  const flagged = p.planned.filter((x) => x.flags.length);
  if (flagged.length) {
    L.push("## Saved, but look at these", "", "| Name | Started | Answer | Note |", "|---|---|---|---|");
    for (const x of flagged) L.push(`| ${x.hire.name} | ${x.hire.start} | ${x.value.answer} | ${x.flags.join("; ")} |`);
    L.push("");
  }
  L.push("## Every answer", "", "| Name | Started | Left | Paycom reason | Answer | Counts as |", "|---|---|---|---|---|---|");
  for (const x of [...p.planned].sort((a, b) => a.hire.start.localeCompare(b.hire.start))) {
    L.push(`| ${x.hire.name}${x.hire.rehire ? " (rehire)" : ""} | ${x.hire.start} | ${x.hire.end ?? ""} | ${x.hire.reason ?? ""} | ${x.value.answer} | ${x.value.answer === "YES" ? "Regretted loss" : "Bad hire"} |`);
  }
  return L.join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--undo") {
    const undo = JSON.parse(readFileSync(args[1], "utf8")) as { key: string; before: string | null };
    if (undo.key !== "qoh-rehire-answers") throw new Error("That is not an undo file for the would-hire-back answers.");
    await writeRehireAnswersRaw(undo.before);
    const after = await readRehireAnswersRaw();
    console.log(`Undone. The setting is ${after === null ? "gone, as it was before" : `back to ${Object.keys(parseRehireAnswers(after)).length} answers`}.`);
    return;
  }
  const apply = args[0] === "--apply";
  const csvPath = apply ? args[1] : args[0];
  if (!csvPath) throw new Error("Pass the filled-in .csv (and --apply to write).");
  const p = await plan(csvPath);
  const dir = outDir();
  if (!apply) {
    writeFileSync(join(dir, "review.md"), review(p, "dry run"));
    writeFileSync(join(dir, "plan.json"), JSON.stringify(p.next, null, 2));
    console.log(`DRY RUN - nothing written to the database.`);
    console.log(`to save: ${p.planned.length} | left out: ${p.skipped.length} | already in Journey: ${Object.keys(p.current).length}`);
    console.log(`review: ${join(dir, "review.md")}`);
    return;
  }
  const before = await readRehireAnswersRaw();
  const undoPath = join(dir, `undo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(undoPath, JSON.stringify({ key: "qoh-rehire-answers", before, savedAt: new Date().toISOString() }, null, 2));
  await writeRehireAnswersRaw(JSON.stringify(p.next));
  const after = parseRehireAnswers(await readRehireAnswersRaw());
  writeFileSync(join(dir, "review-applied.md"), review(p, "applied"));
  console.log(`APPLIED. Answers in Journey now: ${Object.keys(after).length} (wrote ${p.planned.filter((x) => x.change !== "same").length}).`);
  console.log(`undo: ${undoPath}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
