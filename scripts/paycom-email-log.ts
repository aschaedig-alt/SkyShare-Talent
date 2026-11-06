/**
 * The Paycom email log (lib/paycom/email-log.ts) — classify, record and undo.
 *
 *   npx tsx scripts/paycom-email-log.ts --classify <dir>
 *       READ ONLY. <dir> holds Gmail exports (one JSON per month: { messages: [{ id, threadId,
 *       date, subject, body }] }). Prints the count per family and the subjects in each.
 *   npx tsx scripts/paycom-email-log.ts --plan <dir> --out <review.json>
 *       READ ONLY (reads the database, writes nothing to it). Builds the log row for every
 *       email and writes them to <review.json> for a person to read.
 *   npx tsx scripts/paycom-email-log.ts --apply <review.json> [--only <id,id,...>] [--skip-existing]
 *       stores those rows. Writes an undo file under scripts/paycom-notes/undo/.
 *   npx tsx scripts/paycom-email-log.ts --record --id <gmail id> --date <iso> --subject "<s>"
 *       [--thread <id>] [--body-file <file>] [--outcome <o>] [--reason "<text>"]
 *       [--candidate <id>] [--paycom-id <id>] [--person "<name>"] [--interviews a,b] [--notes a,b]
 *       [--hr-only] [--front-tagged n] [--front-archived n]
 *       one row, for the scheduled scan. Classifies it; personal mail keeps date + family only.
 *   npx tsx scripts/paycom-email-log.ts --interviews <dir> [--out <review.json>] [--only <id,...> | --only-file <f>] [--apply]
 *       interview invites -> interviews on the candidate's profile (lib/paycom/interview-invites.ts).
 *       DRY RUN unless --apply. On apply: creates the interviews, updates their log rows, then
 *       tags the Front copies [automated] and archives them; writes an undo file.
 *   npx tsx scripts/paycom-email-log.ts --undo <undo file>
 *       puts the touched months back exactly as they were.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FAMILIES, buildRow, classifyPaycomEmail, extractIdentity, inviteDetails, listMonths, readMonth, restoreMonths, upsertRows, type PaycomLogRow } from "../lib/paycom/email-log";
import { cancelFromEmail, recordInvites, undoInvites, undoReschedules, type InvitePlan } from "../lib/paycom/interview-invites";
import { findCopiesBySubject, tagAndArchive } from "../lib/paycom/front-copies";
import { JOURNEY_TAGS } from "../lib/front/tags";
import { prisma } from "../lib/prisma";

const UNDO_DIR = path.join("scripts", "paycom-notes", "undo");

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

type Exported = { id: string; threadId?: string; date: string; subject: string; body?: string | null };

function readExports(dir: string): Exported[] {
  const seen = new Map<string, Exported>();
  for (const f of readdirSync(dir).filter((n) => /^\d{4}-\d{2}\.json$/.test(n)).sort()) {
    const data = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { messages: Exported[] };
    for (const m of data.messages) if (!seen.has(m.id)) seen.set(m.id, m);
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function writeUndo(before: Record<string, unknown>, label: string) {
  if (!existsSync(UNDO_DIR)) mkdirSync(UNDO_DIR, { recursive: true });
  const file = path.join(UNDO_DIR, `log-${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.json`);
  writeFileSync(file, JSON.stringify({ kind: "paycom-email-log", before }, null, 1));
  return file;
}

async function main() {
  const classifyDir = arg("--classify");
  if (classifyDir) {
    const all = readExports(classifyDir);
    const byFamily = new Map<string, Map<string, number>>();
    for (const m of all) {
      const fam = classifyPaycomEmail(m.subject, m.body ?? null);
      const subjects = byFamily.get(fam) ?? new Map<string, number>();
      // Interview subjects carry names; count the shape, not the person.
      const shape = fam === "personal" ? "(personal)" : m.subject.replace(/^.+?\s-\s/, "<name> - ");
      subjects.set(shape, (subjects.get(shape) ?? 0) + 1);
      byFamily.set(fam, subjects);
    }
    console.log(`${all.length} emails, ${all[0]?.date.slice(0, 10)} to ${all.at(-1)?.date.slice(0, 10)}\n`);
    for (const fam of Object.keys(FAMILIES)) {
      const s = byFamily.get(fam);
      if (!s) continue;
      const total = [...s.values()].reduce((a, b) => a + b, 0);
      console.log(`${fam.padEnd(18)} ${String(total).padStart(5)}`);
      for (const [subj, n] of [...s.entries()].sort((a, b) => b[1] - a[1]).slice(0, fam === "interview" ? 40 : 12)) console.log(`      ${String(n).padStart(4)}  ${subj}`);
    }
    return;
  }

  const planDir = arg("--plan");
  if (planDir) {
    const out = arg("--out");
    if (!out) throw new Error("--plan needs --out <review.json>");
    const rows: PaycomLogRow[] = [];
    for (const m of readExports(planDir)) rows.push(await buildRow({ id: m.id, threadId: m.threadId ?? null, at: m.date, subject: m.subject, body: m.body ?? null }));
    writeFileSync(out, JSON.stringify(rows, null, 1));
    const tally: Record<string, number> = {};
    for (const r of rows) tally[`${r.family} / ${r.outcome}`] = (tally[`${r.family} / ${r.outcome}`] ?? 0) + 1;
    console.log(JSON.stringify({ rows: rows.length, out, tally }, null, 1));
    return;
  }

  const applyFile = arg("--apply");
  if (applyFile) {
    let rows = JSON.parse(readFileSync(applyFile, "utf8")) as PaycomLogRow[];
    const only = arg("--only");
    if (only) {
      const ids = new Set(only.split(","));
      rows = rows.filter((r) => ids.has(r.id));
    }
    // A plan row is built before any filing; storing it over a row the filing already updated
    // would put that email back to "waiting". --skip-existing leaves logged rows alone.
    if (process.argv.includes("--skip-existing")) {
      const logged = new Set<string>();
      for (const m of await listMonths()) for (const id of Object.keys(await readMonth(m))) logged.add(id);
      rows = rows.filter((r) => !logged.has(r.id));
    }
    const before = await upsertRows(rows);
    console.log(JSON.stringify({ stored: rows.length, months: Object.keys(before), undo: writeUndo(before, `${rows.length}rows`) }, null, 1));
    return;
  }

  if (process.argv.includes("--record")) {
    const id = arg("--id");
    const date = arg("--date");
    const subject = arg("--subject");
    if (!id || !date || subject === null) throw new Error("--record needs --id, --date and --subject");
    // Already logged: leave it. A fresh row would put a filed or recorded email back to
    // "waiting". --force overrides.
    if (!process.argv.includes("--force")) {
      const existing = (await readMonth(new Date(date).toISOString().slice(0, 7)))[id];
      if (existing) {
        console.log(JSON.stringify({ skipped: "already logged", row: existing }, null, 1));
        return;
      }
    }
    const bodyFile = arg("--body-file");
    const body = bodyFile ? readFileSync(bodyFile, "utf8") : null;
    const at = new Date(date).toISOString();
    const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : undefined);

    // --act: an invite becomes an interview, a cancellation cancels one — the same rules as the
    // backfill (lib/paycom/interview-invites.ts). Front copies are tagged [automated] and
    // archived only after the interview is saved.
    const family = classifyPaycomEmail(subject, body);
    let acted: Partial<PaycomLogRow> = {};
    const undoExtra: { interviewIds?: string[]; updates?: NonNullable<InvitePlan["update"]>[] } = {};
    if (process.argv.includes("--act") && family === "interview") {
      const [p] = await recordInvites([{ gmailId: id, at, subject, body }], [], { apply: true, runBy: "aschaedig@skyshare.com" });
      if (p.action === "add" && p.interviewId) undoExtra.interviewIds = [p.interviewId];
      if (p.update) undoExtra.updates = [p.update];
      const front =
        p.interviewId && (p.action === "add" || p.action === "rescheduled")
          ? await tagAndArchive(await findCopiesBySubject(subject, at), [JOURNEY_TAGS.automated], { archive: true }).catch(() => null)
          : null;
      acted = {
        outcome: p.action === "add" || p.action === "rescheduled" ? "interview-recorded" : p.action === "already-there" || p.action === "duplicate-invite" ? "already-in-app" : "needs-decision",
        reason: p.action === "add" ? `${p.status.toLowerCase()} ${p.type === "RECRUITER_SCREEN" ? "recruiter screen" : p.type === "HIRING_MANAGER" ? "hiring team interview" : "interview"}` : (p.why ?? undefined),
        candidateId: p.candidateId ?? undefined,
        interviewIds: p.interviewId ? [p.interviewId] : undefined,
        front: front ? { tagged: front.tagged.length + front.alreadyTagged.length, archived: front.archived.length } : undefined
      };
    } else if (process.argv.includes("--act") && family === "interview-change") {
      const who = extractIdentity("interview-change", subject, body).person;
      const step = inviteDetails(body).step ?? subject.match(/(HR|HM)\s+Interview/i)?.[0] ?? null;
      const c = await cancelFromEmail(who, step, { apply: true, runBy: "aschaedig@skyshare.com" });
      if (c) undoExtra.updates = [{ id: c.id, before: c.before }];
      acted = c
        ? { outcome: "interview-recorded", reason: `marked the ${c.before.startDateTime.slice(0, 10)} interview cancelled`, candidateId: c.candidateId, interviewIds: [c.id] }
        : { outcome: "skipped", reason: "no recorded invite for this person to cancel" };
    }
    const row = await buildRow(
      { id, threadId: arg("--thread"), at, subject, body },
      {
        outcome: (arg("--outcome") as PaycomLogRow["outcome"] | null) ?? undefined,
        reason: arg("--reason") ?? undefined,
        candidateId: arg("--candidate") ?? undefined,
        paycomId: arg("--paycom-id") ?? undefined,
        person: arg("--person") ?? undefined,
        interviewIds: list(arg("--interviews")),
        noteIds: list(arg("--notes")),
        hrOnly: process.argv.includes("--hr-only") || undefined,
        front:
          arg("--front-tagged") || arg("--front-archived")
            ? { tagged: Number(arg("--front-tagged") ?? 0), archived: Number(arg("--front-archived") ?? 0) }
            : undefined,
        ...acted
      }
    );
    const before = await upsertRows([row]);
    if (!existsSync(UNDO_DIR)) mkdirSync(UNDO_DIR, { recursive: true });
    const file = path.join(UNDO_DIR, `log-${new Date().toISOString().replace(/[:.]/g, "-")}-${id}.json`);
    writeFileSync(file, JSON.stringify({ kind: "paycom-email-log", ...undoExtra, before }, null, 1));
    console.log(JSON.stringify({ row, undo: file }, null, 1));
    return;
  }

  // Interview invites -> interviews (lib/paycom/interview-invites.ts). Dry run unless --apply.
  const ivDir = arg("--interviews");
  if (ivDir) {
    const apply = process.argv.includes("--apply");
    // --only-file: the same comma list in a file, for lists too long for a Windows command line.
    const onlyList = arg("--only") ?? (arg("--only-file") ? readFileSync(arg("--only-file")!, "utf8").trim() : null);
    const only = onlyList ? new Set(onlyList.split(",").filter(Boolean)) : null;
    const all = readExports(ivDir).map((m) => ({ ...m, family: classifyPaycomEmail(m.subject, m.body ?? null) }));
    const cancellations = all
      .filter((m) => m.family === "interview-change")
      .map((m) => {
        const id = extractIdentity("interview-change", m.subject, m.body ?? null);
        return { at: m.date, person: id.person, requisition: id.requisition, step: inviteDetails(m.body ?? null).step ?? m.subject.match(/(HR|HM)\s+Interview/i)?.[0] ?? null };
      });
    const invites = all
      .filter((m) => m.family === "interview")
      .map((m) => ({ gmailId: m.id, at: m.date, subject: m.subject, body: m.body ?? null }));
    const plans = await recordInvites(invites, cancellations, { apply, runBy: "aschaedig@skyshare.com", only });
    const tally: Record<string, number> = {};
    for (const p of plans) tally[`${p.action}${p.action === "add" ? ` ${p.status}` : ""}`] = (tally[`${p.action}${p.action === "add" ? ` ${p.status}` : ""}`] ?? 0) + 1;
    const out = arg("--out");
    if (out) writeFileSync(out, JSON.stringify(plans, null, 1));
    if (!apply) {
      console.log(JSON.stringify({ apply, invites: plans.length, tally, out }, null, 1));
      return;
    }
    // Undo first, before anything else can fail: the interviews created, then the log rows.
    const created = plans.filter((p) => p.action === "add" && p.interviewId).map((p) => p.interviewId!);
    const byId = new Map(plans.map((p) => [p.gmailId, p]));
    const patches = all
      .filter((m) => byId.has(m.id))
      .map((m) => ({ m, p: byId.get(m.id)! }))
      .filter(({ p }) => p.action !== "unreadable");
    const before: Record<string, Record<string, PaycomLogRow> | null> = {};
    const rows: PaycomLogRow[] = [];
    for (const { m, p } of patches) {
      const front = p.interviewId
        ? await tagAndArchive(await findCopiesBySubject(m.subject, m.date), [JOURNEY_TAGS.automated], { archive: true }).catch(() => null)
        : null;
      rows.push(
        await buildRow(
          { id: m.id, threadId: m.threadId ?? null, at: m.date, subject: m.subject, body: m.body ?? null },
          {
            outcome: p.action === "add" || p.action === "rescheduled" ? "interview-recorded" : p.action === "already-there" || p.action === "duplicate-invite" ? "already-in-app" : "needs-decision",
            reason: p.action === "add" ? `${p.status.toLowerCase()} ${p.type === "RECRUITER_SCREEN" ? "recruiter screen" : p.type === "HIRING_MANAGER" ? "hiring team interview" : "interview"}` : p.why ?? undefined,
            candidateId: p.candidateId ?? undefined,
            interviewIds: p.interviewId ? [p.interviewId] : undefined,
            front: front ? { tagged: front.tagged.length + front.alreadyTagged.length, archived: front.archived.length } : undefined
          }
        )
      );
    }
    // The cancellation emails: each says which interview it called off, or that none matched.
    // Matched against the DATABASE, not this run's plans, so a cancellation recorded by an
    // earlier run (a smaller batch) is still found.
    {
      const key = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
      const cancelledRows = await prisma.interview.findMany({
        where: { source: "paycom-invite", status: "CANCELLED" },
        select: { id: true, candidateId: true, startDateTime: true, candidate: { select: { displayName: true } } }
      });
      for (const m of all.filter((x) => x.family === "interview-change")) {
        const person = extractIdentity("interview-change", m.subject, m.body ?? null).person;
        const hit = cancelledRows.find((c) => key(c.candidate.displayName) === key(person));
        rows.push(
          await buildRow(
            { id: m.id, threadId: m.threadId ?? null, at: m.date, subject: m.subject, body: m.body ?? null },
            hit
              ? { outcome: "interview-recorded", reason: `marked the ${hit.startDateTime.toISOString().slice(0, 10)} interview cancelled`, candidateId: hit.candidateId, interviewIds: [hit.id] }
              : { outcome: "skipped", reason: "no recorded invite for this person to cancel" }
          )
        );
      }
    }
    Object.assign(before, await upsertRows(rows));
    if (!existsSync(UNDO_DIR)) mkdirSync(UNDO_DIR, { recursive: true });
    const file = path.join(UNDO_DIR, `invites-${new Date().toISOString().replace(/[:.]/g, "-")}-${created.length}.json`);
    writeFileSync(file, JSON.stringify({ kind: "paycom-email-log", interviewIds: created, updates: plans.filter((p) => p.update).map((p) => p.update), before }, null, 1));
    console.log(JSON.stringify({ apply, invites: plans.length, tally, created: created.length, logRows: rows.length, undo: file }, null, 1));
    return;
  }

  const undoFile = arg("--undo");
  if (undoFile) {
    const record = JSON.parse(readFileSync(undoFile, "utf8")) as { kind: string; interviewIds?: string[]; updates?: NonNullable<InvitePlan["update"]>[]; before: Parameters<typeof restoreMonths>[0] };
    if (record.kind !== "paycom-email-log") throw new Error("Not a Paycom email log undo file.");
    if (record.interviewIds?.length) console.log(`removed ${await undoInvites(record.interviewIds)} interview(s) recorded from invites`);
    // Newest first, so an interview moved twice ends at its original time.
    if (record.updates?.length) console.log(`put back ${await undoReschedules([...record.updates].reverse())} rescheduled interview(s)`);
    console.log((await restoreMonths(record.before)).join("\n"));
    console.log("Front tags and archiving are not undone; reopen a thread in Front if needed.");
    return;
  }
  throw new Error("Pass --classify, --plan, --apply, --record or --undo.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
