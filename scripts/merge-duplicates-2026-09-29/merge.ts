// Merge the six people who had two records each - one under the name the staff lists
// used, one under the name Paycom's terminated list used, same start date. He
// approved it on 2026-09-29 ("yes merge them"), including that Alex Ortiz and Saul
// Ortiz Parson are one person. Found by the headcount fact-check: four of them were
// counted twice in the 2017-2022 year-end headcounts.
//
// Each pair goes through the app's OWN merge (POST /api/new-hires/merge - the Merge
// button on People > Employees), so it moves exactly what a person's merge would.
// Then the survivor is tidied, because a merge alone keeps both copies of the
// history and tenure would count the overlap twice:
//   - one employment period, ending on Paycom's real last day where it is LATER than
//     the last staff list that shows the person (the lists only say "gone by the
//     next list", dated Dec 31), otherwise on the lists' end;
//   - one role timeline - a duplicate role from the other record is removed, and the
//     last role ends with the period;
//   - type periods end with the period;
//   - legalName = Paycom's name for them, where that differs (the field is for a
//     legal name somebody does not go by; Paycom notice matching reads it too);
//   - a note on the record saying what was merged and why.
//
// Survivor = the record the staff lists made: it holds the stints, roles, birthday
// and type history; the other was made from Paycom's terminated list and holds at
// most a role. For McGrath both came from the lists (Roe to 2021, Lambert after);
// Lambert survives, holding the onboarding checklist, and Roe's candidate link moves.
//
//   npx tsx scripts/merge-duplicates-2026-09-29/merge.ts                   dry run
//   npx tsx scripts/merge-duplicates-2026-09-29/merge.ts --apply [--only N | --from N]   merges (needs the dev server on :3000)
//   npx tsx scripts/merge-duplicates-2026-09-29/merge.ts --undo <file>     restores both records exactly

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";

const DIR = path.join(process.cwd(), "scripts", "merge-duplicates-2026-09-29");
const MERGE_URL = "http://localhost:3000/api/new-hires/merge";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "open");

type Plan = {
  keep: string;
  drop: string;
  /** The survivor's last day after the merge. */
  end: string;
  /** Its first day, where the lists' is wrong (Alex Ortiz's ended before it began). */
  start?: string;
  legalName: string | null;
  /** Role titles on the survivor (after the move) to remove as duplicates. */
  dropRoles?: Array<{ title: string; start: string }>;
  note: string;
};

const PLANS: Plan[] = [
  {
    keep: "Tyson Martinez", drop: "Martin Martinez", end: "2023-07-28", legalName: "Martin Martinez",
    note: "One person, two records: the staff lists (2018-2022) called him Tyson Martinez and Paycom's terminated list Martin Martinez, both starting 2017-07-27. Last day 2023-07-28 is Paycom's; the lists had only 'not on the next list'."
  },
  {
    keep: "Larry Uzelac", drop: "Lawrence Uzelac", end: "2022-12-31", legalName: "Lawrence Uzelac",
    dropRoles: [{ title: "Pilot", start: "2019-01-31" }],
    note: "One person, two records: Larry Uzelac on the staff lists, Lawrence Uzelac on Paycom's terminated list, both starting 2019-01-31. Paycom ended him 2022-05-15, but the July and September 2022 lists still show him and the Terminated tab lists him twice (Full-Time and Contract 1099) - so he probably flew on contract after May 2022. Kept on staff to Dec 31, 2022, as the lists do."
  },
  {
    keep: "Ed Jayousi", drop: "Ahmad Jayousi", end: "2022-05-03", legalName: "Ahmad Jayousi",
    dropRoles: [{ title: "G200 Captain", start: "2021-11-01" }],
    note: "One person, two records: Ed Jayousi on the staff lists, Ahmad Jayousi on Paycom's terminated list, both starting 2021-11-01. Last day 2022-05-03 is Paycom's."
  },
  {
    keep: "Lambert McGrath", drop: "Roe McGrath", end: "2022-12-31", legalName: null,
    dropRoles: [{ title: "G200 Captain", start: "2018-07-16" }],
    note: "One person, two records: the 2018-2021 staff lists called him Roe McGrath and the 2022 lists Lambert McGrath - same start 2018-07-16, same position 'G200 Pilot & PC12 Pilot'. Roe's role history and candidate link are kept here."
  },
  {
    keep: "Alex Ortiz", drop: "Saul Ortiz Parson", start: "2022-01-11", end: "2022-05-03", legalName: "Saul Ortiz Parson",
    note: "One person, two records (he confirmed, 2026-09-29): Alex Ortiz on the staff lists, Saul Ortiz Parson on Paycom's terminated list, both starting 2022-01-11. Last day 2022-05-03 is Paycom's; the old record ended before it began."
  },
  {
    keep: "Mauricio Almeida", drop: "Mauricio Almeida Negron", end: "2022-10-24", legalName: "Mauricio Almeida Negron",
    note: "One person, two records: Mauricio Almeida on the staff list, Mauricio Almeida Negron on Paycom's terminated list, both starting 2022-08-27. Last day 2022-10-24 is Paycom's."
  }
];

const RELATIONS = ["tasks", "onboardingArchives", "orientationAttendances", "travelTrips", "recognitionsGiven", "recognitionsReceived", "redemptions", "businessCardVariants", "cardOrderLines", "eventAttendances", "eventsOwned", "supervisees", "supervisees2"] as const;

async function snapshot(name: string) {
  const rows = await prisma.newHire.findMany({
    where: { name },
    include: { roleAssignments: true, employmentStints: true, contractPeriods: true, employmentTypePeriods: true, _count: true }
  });
  if (rows.length !== 1) throw new Error(`"${name}": ${rows.length} records, expected exactly 1`);
  return rows[0];
}

type Snap = Awaited<ReturnType<typeof snapshot>>;

async function restore(rec: { pairs: Array<{ keep: Snap; drop: Snap }> }) {
  for (const { keep, drop } of [...rec.pairs].reverse()) {
    const scalars = (h: Snap) => {
      const { roleAssignments, employmentStints, contractPeriods, employmentTypePeriods, _count, ...rest } = h;
      void roleAssignments; void employmentStints; void contractPeriods; void employmentTypePeriods; void _count;
      return rest;
    };
    const k = scalars(keep);
    const dr = scalars(drop);
    await prisma.$transaction(async (tx) => {
      // The survivor's own fields back first - it may hold the candidate link the other one needs.
      await tx.newHire.update({ where: { id: keep.id }, data: { ...k, id: undefined, createdAt: undefined } as never });
      for (const model of ["roleAssignment", "employmentStint", "contractPeriod", "employmentTypePeriod"] as const) {
        await (tx[model] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: { newHireId: keep.id } });
      }
      await tx.newHire.create({ data: dr as never });
      for (const [model, key] of [["roleAssignment", "roleAssignments"], ["employmentStint", "employmentStints"], ["contractPeriod", "contractPeriods"], ["employmentTypePeriod", "employmentTypePeriods"]] as const) {
        for (const row of [...keep[key], ...drop[key]]) {
          await (tx[model] as unknown as { create: (a: unknown) => Promise<unknown> }).create({ data: row as never });
        }
      }
    });
    console.log(`   restored ${keep.name} and ${drop.name}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const undoIdx = args.indexOf("--undo");
  if (undoIdx >= 0) {
    const file = args[undoIdx + 1];
    const rec = JSON.parse(fs.readFileSync(file, "utf8"), (k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ? new Date(v) : v));
    await restore(rec);
    console.log(`undo: restored ${rec.pairs.length} pair(s) from ${file}`);
    return;
  }
  const apply = args.includes("--apply");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? Number(args[onlyIdx + 1]) : null;
  const fromIdx = args.indexOf("--from");
  const from = fromIdx >= 0 ? Number(args[fromIdx + 1]) : 1;
  const plans = only ? PLANS.slice(only - 1, only) : PLANS.slice(from - 1);
  // One undo record per run, rewritten after every pair, so a failure part-way still leaves the way back.
  const undoFile = path.join(DIR, `undo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  const done: Array<{ keep: Snap; drop: Snap }> = [];
  for (const plan of plans) {
    const keep = await snapshot(plan.keep);
    const drop = await snapshot(plan.drop);
    const extra = RELATIONS.filter((r) => (drop._count as Record<string, number>)[r] > 0);
    if (extra.length) throw new Error(`${plan.drop} has ${extra.join(", ")} - the undo does not restore those; stopping`);
    const endDay = day(plan.end);
    const startDay = plan.start ? day(plan.start) : keep.startDate ?? drop.startDate;
    console.log(`\n${plan.keep}  <-  ${plan.drop}`);
    console.log(`   now: ${plan.keep} ${d(keep.startDate)}..${d(keep.terminationDate)}, stints ${keep.employmentStints.map((s) => `${d(s.startDate)}..${d(s.endDate)}`).join(" | ") || "none"}; ${plan.drop} ${d(drop.startDate)}..${d(drop.terminationDate)}`);
    console.log(`   after: one period ${d(startDay)}..${plan.end}; legal name ${plan.legalName ?? "(unchanged)"}; remove role ${plan.dropRoles?.map((r) => `${r.title} from ${r.start}`).join(", ") || "none"}; candidate link ${keep.candidateId ?? drop.candidateId ?? "none"}`);
    if (!apply) continue;

    const res = await fetch(MERGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ primaryId: keep.id, secondaryId: drop.id }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`merge of ${plan.drop} into ${plan.keep} failed: ${res.status} ${JSON.stringify(body)}`);
    done.push({ keep, drop });
    fs.writeFileSync(undoFile, JSON.stringify({ mergedAt: new Date().toISOString(), pairs: done }, null, 1));

    await prisma.$transaction(async (tx) => {
      // Duplicate roles from the other record.
      // Matched on the start's calendar DAY: records from Paycom's list store Mountain
      // midnight (07:00Z), and matching the exact instant missed Lawrence Uzelac's
      // "Pilot" role on the run of 2026-09-30 - fix-larry-role.ts removed it after.
      for (const r of plan.dropRoles ?? []) {
        const from = day(r.start);
        const hits = await tx.roleAssignment.findMany({ where: { newHireId: keep.id, title: r.title, startDate: { gte: from, lt: new Date(from.getTime() + 86_400_000) } }, orderBy: { endDate: "asc" } });
        // Of two identical-title roles, drop the one that is NOT the lists' own timeline row (the shorter / Paycom copy).
        const victim = hits.length > 1 ? hits[0] : hits.length === 1 ? hits[0] : null;
        if (victim) await tx.roleAssignment.delete({ where: { id: victim.id } });
      }
      // One employment period.
      const stints = await tx.employmentStint.findMany({ where: { newHireId: keep.id }, orderBy: { startDate: "asc" } });
      if (stints.length) {
        await tx.employmentStint.update({ where: { id: stints[0].id }, data: { startDate: startDay ?? stints[0].startDate, endDate: endDay, note: null } });
        for (const s of stints.slice(1)) await tx.employmentStint.delete({ where: { id: s.id } });
      }
      // The role timeline ends with the period.
      const roles = await tx.roleAssignment.findMany({ where: { newHireId: keep.id }, orderBy: { startDate: "asc" } });
      for (const [i, r] of roles.entries()) {
        const last = i === roles.length - 1;
        const data: { startDate?: Date; endDate?: Date } = {};
        if (i === 0 && startDay && r.startDate.getTime() !== startDay.getTime()) data.startDate = startDay;
        if (last) data.endDate = endDay;
        else if (r.endDate && r.endDate.getTime() < r.startDate.getTime()) data.endDate = roles[i + 1].startDate;
        if (Object.keys(data).length) await tx.roleAssignment.update({ where: { id: r.id }, data });
      }
      // Type periods end with it too.
      const types = await tx.employmentTypePeriod.findMany({ where: { newHireId: keep.id }, orderBy: { startDate: "asc" } });
      for (const [i, t] of types.entries()) {
        if (t.startDate.getTime() > endDay.getTime()) await tx.employmentTypePeriod.delete({ where: { id: t.id } });
        else if (i === types.length - 1 || (t.endDate && t.endDate.getTime() > endDay.getTime())) await tx.employmentTypePeriod.update({ where: { id: t.id }, data: { endDate: endDay } });
      }
      const note = `Merged ${new Date().toISOString().slice(0, 10)} with the record "${plan.drop}". ${plan.note}`;
      const now = await tx.newHire.findUniqueOrThrow({ where: { id: keep.id }, select: { notes: true } });
      await tx.newHire.update({
        where: { id: keep.id },
        data: {
          ...(startDay ? { startDate: startDay } : {}),
          terminationDate: endDay,
          ...(plan.legalName ? { legalName: plan.legalName } : {}),
          notes: [now.notes, note].filter(Boolean).join("\n\n")
        }
      });
    });
    const after = await snapshot(plan.keep);
    console.log(`   MERGED: ${after.name} ${d(after.startDate)}..${d(after.terminationDate)} | stints ${after.employmentStints.map((s) => `${d(s.startDate)}..${d(s.endDate)}`).join(" | ")} | roles ${after.roleAssignments.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()).map((r) => `${r.title} ${d(r.startDate)}..${d(r.endDate)}`).join(" | ")} | types ${after.employmentTypePeriods.map((t) => `${t.type} ${d(t.startDate)}..${d(t.endDate)}`).join(" | ") || "none"} | legal ${after.legalName ?? "-"} | candidate ${after.candidateId ?? "-"}`);
  }
  if (!apply) console.log(`\nDry run - nothing written. --apply --only 1 merges the first pair; --apply merges them all.`);
  else console.log(`\nUndo: npx tsx scripts/merge-duplicates-2026-09-29/merge.ts --undo ${path.relative(process.cwd(), undoFile)}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
