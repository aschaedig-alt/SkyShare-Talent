// What one row of Paycom's employee export would change for one person, and doing it.
// Shared by the Imports -> Paycom employees upload (lib/paycom/employee-import.ts) and
// the two CLI scripts this logic was first written in, which still run it the same way:
// prisma/import-paycom-employee-dates.ts and prisma/import-paycom-dol-status.ts.
// Their header comments hold the reasoning; the rules are summarised here.
//
// DATES. Paycom is the authority on hire, re-hire and termination dates, but the app
// also holds history from before Paycom (the year-end lists, back to 2010), so a date
// is only CORRECTED where the two clearly describe the same stretch of employment:
//   - a start within 60 days of Paycom's hire / re-hire date, or a Jan 1 placeholder in
//     the same year (the year-end lists only say "employed by Dec 31");
//   - an end within 60 days of Paycom's termination date, or a Dec 31 placeholder in
//     that year or the one before;
//   - Paycom shows a termination and the app still has them working: done exactly as
//     the profile's own "terminated" control does it (app/api/new-hires/[id]/route.ts) -
//     status TERMINATED, stage ARCHIVED, the date, the open role and stint closed on it;
//   - Paycom shows a leave-and-return the app runs straight through: split in two;
//   - Paycom shows a re-hire AFTER the app's last day for somebody the app has as
//     terminated: a new open stint from the re-hire date and back to current, as the
//     profile's "active" control does it (added 2026-10-25 for the upload).
// Anything else is listed for a person and NOT changed. Absence from an export is
// never evidence that somebody left.
//
// FULL / PART TIME. Paycom's DOL_Status is one undated type per person - what they are
// today, or were when they left - laid down as one dated point, exactly as the workbook
// loader lays its points. See prisma/import-paycom-dol-status.ts.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/prisma/generated/client/client";
import { periodsOf } from "@/lib/data/headcount-history";
import type { ExportRow } from "@/lib/paycom/employee-export";

type Tx = Prisma.TransactionClient;

const DAY = 86_400_000;
const CLOSE_DAYS = 60;

export const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const date = (s: string) => new Date(`${s}T00:00:00.000Z`);
const apart = (a: string, b: string) => Math.abs(date(a).getTime() - date(b).getTime()) / DAY;
/** May the app's date be replaced with Paycom's? */
const closeStart = (app: string, pay: string) => apart(app, pay) <= CLOSE_DAYS || (app.endsWith("-01-01") && app.slice(0, 4) === pay.slice(0, 4));
// A Dec 31 end is the last year-end list that showed them: Paycom's date that year, or
// the next (still there at year end, gone before the next list), replaces it.
const closeEnd = (app: string, pay: string) =>
  apart(app, pay) <= CLOSE_DAYS || (app.endsWith("-12-31") && (app.slice(0, 4) === pay.slice(0, 4) || Number(pay.slice(0, 4)) === Number(app.slice(0, 4)) + 1));

// Dates a person has already settled against Paycom's on purpose. The first run of
// 2026-10-16 moved Larry Uzelac back to May 15 and was reversed the same day.
const SETTLED: Record<string, string> = {
  "Larry Uzelac": "the Sep 29 merge kept him on staff to Dec 31 2022: the Jul and Sep 2022 staff lists still show him after Paycom's May 15, probably flying on contract",
  // He, 2026-10-16: "he left in june 2022 but came back before oct of 2022." Paycom
  // never recorded the return; the app's Aug 1, 2022 is right.
  "Robbie Allen": "he confirmed the app is right: left Jun 2022, came back before Oct 2022, still here; Paycom has no re-hire"
};

export const loadEmployees = (ids?: string[]) =>
  prisma.newHire.findMany({
    where: { canceled: false, ...(ids ? { id: { in: ids } } : {}) },
    select: {
      id: true, name: true, legalName: true, position: true, department: true, startDate: true, terminationDate: true, employmentStatus: true, stage: true,
      employmentStints: { select: { id: true, startDate: true, endDate: true, note: true }, orderBy: { startDate: "asc" } },
      roleAssignments: { select: { id: true, title: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" } },
      employmentTypePeriods: { select: { id: true, type: true, startDate: true, endDate: true, source: true } }
    }
  });
export type Employee = Awaited<ReturnType<typeof loadEmployees>>[number];

// ---------------------------------------------------------------- dates

type Span = { start: string; end: string | null; note: string | null };

export type DatesPlan =
  | { kind: "agree" }
  | { kind: "judgment"; why: string }
  | { kind: "change"; spans: Span[]; terminate: string | null; rehire: string | null; newEnd: string | null; oldEnd: string | null; what: string[] };

export function planDates(r: ExportRow, p: Employee, note: string): DatesPlan {
  if (SETTLED[p.name]) return { kind: "judgment", why: `settled already - ${SETTLED[p.name]}` };
  if (p.employmentStatus === "CONTRACT") return { kind: "judgment", why: "the app has them as a contractor today" };
  const from = p.employmentStints.length
    ? p.employmentStints.map((s) => ({ start: iso(s.startDate)!, end: iso(s.endDate), note: s.note }))
    : periodsOf(p).map((x) => ({ start: iso(x.start)!, end: iso(x.end), note: null as string | null }));
  const spans: Span[] = from.sort((a, b) => a.start.localeCompare(b.start)).map((s) => ({ ...s }));
  if (!spans.length) return { kind: "judgment", why: "no dates in the app at all" };
  const oldEnd = iso(p.terminationDate) ?? from[from.length - 1].end;
  const want = r.rehire ? [{ start: r.hire, end: r.prevTerm }, { start: r.rehire, end: r.term }] : [{ start: r.hire, end: r.term }];
  if (r.rehire && !r.prevTerm) return { kind: "judgment", why: "Paycom has a re-hire with no earlier termination date" };
  const what: string[] = [];

  // Back after leaving: Paycom's re-hire comes after the app's last day.
  const last = spans[spans.length - 1];
  let rehire: string | null = null;
  if (r.rehire && p.employmentStatus === "TERMINATED" && last.end && r.rehire > last.end && !spans.some((s) => closeStart(s.start, r.rehire!))) {
    spans.push({ start: r.rehire, end: null, note });
    rehire = r.rehire;
    what.push(`re-hired ${r.rehire}`);
  }
  // A leave-and-return Paycom has and the app runs straight through.
  else if (r.rehire && r.prevTerm && !spans.some((s) => closeStart(s.start, r.rehire!)) && closeStart(last.start, r.hire) && last.start <= r.prevTerm) {
    spans.splice(spans.length - 1, 1, { start: last.start, end: r.prevTerm, note }, { start: r.rehire, end: last.end, note });
    what.push(`split at Paycom's break ${r.prevTerm} to ${r.rehire}`);
  }
  if (spans.length < want.length) return { kind: "judgment", why: "Paycom has more employment periods than the app" };

  let terminate: string | null = null;
  const tail = spans.slice(-want.length);
  for (let i = 0; i < want.length; i++) {
    const s = tail[i], w = want[i], isLast = i === want.length - 1;
    if (s.start !== w.start) {
      if (!closeStart(s.start, w.start)) return { kind: "judgment", why: `starts ${s.start} in the app, ${w.start} in Paycom` };
      what.push(`start ${s.start} -> ${w.start}`); s.start = w.start; s.note = note;
    }
    if (s.end === w.end) continue;
    if (!w.end) return { kind: "judgment", why: `the app has them leaving ${s.end}, Paycom has them still working` };
    if (!s.end) {
      if (!isLast || (p.employmentStatus !== "ACTIVE" && !rehire)) return { kind: "judgment", why: `Paycom has them leaving ${w.end}, the app has an open period` };
      terminate = w.end; what.push(rehire ? `left again ${w.end}` : `left ${w.end} (still working in the app)`);
    } else {
      if (!closeEnd(s.end, w.end)) return { kind: "judgment", why: `leaves ${s.end} in the app, ${w.end} in Paycom` };
      what.push(`end ${s.end} -> ${w.end}`);
    }
    s.end = w.end; s.note = note;
  }
  for (let i = 1; i < spans.length; i++) if (spans[i].start <= (spans[i - 1].end ?? "9999")) return { kind: "judgment", why: "the corrected periods would overlap" };
  if (!what.length) return { kind: "agree" };
  const lastNow = spans[spans.length - 1];
  if (lastNow.end && p.roleAssignments.some((ra) => iso(ra.startDate)! > lastNow.end!)) return { kind: "judgment", why: `a role starts after Paycom's last day ${lastNow.end}` };
  // Re-hired and gone again before this export: the stint just added is closed too, and
  // they stay terminated - see applyDates.
  return { kind: "change", spans, terminate, rehire, newEnd: lastNow.end, oldEnd, what };
}

export type DatesUndo = {
  before: { employmentStatus: string; stage: string; terminationDate: string | null };
  oldStints: Array<{ id: string; startDate: string; endDate: string | null; note: string | null }>;
  createdStintIds: string[];
  roleEnds: Array<{ id: string; endDate: string | null }>;
  createdRoleIds?: string[];
};

/** Write a "change" plan. `rehireRole` is the role step a re-hire starts in, when known. */
export async function applyDates(
  tx: Tx,
  p: Employee,
  plan: Extract<DatesPlan, { kind: "change" }>,
  opts: { rehireRole?: { title: string } | null } = {}
): Promise<DatesUndo> {
  const undo: DatesUndo = {
    before: { employmentStatus: p.employmentStatus, stage: p.stage, terminationDate: p.terminationDate ? p.terminationDate.toISOString() : null },
    oldStints: p.employmentStints.map((s) => ({ id: s.id, startDate: s.startDate.toISOString(), endDate: s.endDate?.toISOString() ?? null, note: s.note })),
    createdStintIds: [], roleEnds: [], createdRoleIds: []
  };
  await tx.employmentStint.deleteMany({ where: { id: { in: p.employmentStints.map((s) => s.id) } } });
  for (const s of plan.spans) {
    const c = await tx.employmentStint.create({ data: { newHireId: p.id, startDate: date(s.start), endDate: s.end ? date(s.end) : null, note: s.note } });
    undo.createdStintIds.push(c.id);
  }
  if (plan.rehire) {
    if (plan.newEnd) {
      // Back and gone again: only the new stint and the later last day. Their roles all
      // belong to the earlier employment and keep their dates.
      await tx.newHire.update({ where: { id: p.id }, data: { terminationDate: date(plan.newEnd) } });
      return undo;
    }
    // The profile's "active" control: current again, no termination date.
    await tx.newHire.update({ where: { id: p.id }, data: { employmentStatus: "ACTIVE", stage: "POST_ONBOARD", terminationDate: null } });
    if (opts.rehireRole) {
      const role = await tx.roleAssignment.create({
        data: { newHireId: p.id, title: opts.rehireRole.title, startDate: date(plan.rehire), transitionType: "HIRE", notes: "Re-hire, from Paycom's employee export" }
      });
      undo.createdRoleIds!.push(role.id);
      await tx.newHire.update({ where: { id: p.id }, data: { position: opts.rehireRole.title } });
    }
  } else if (plan.newEnd) {
    const end = date(plan.newEnd);
    // Roles still open, or ending on the old last day, end on Paycom's last day instead.
    const roles = p.roleAssignments.filter((ra) => !ra.endDate || (plan.oldEnd && iso(ra.endDate) === plan.oldEnd));
    undo.roleEnds = roles.map((ra) => ({ id: ra.id, endDate: ra.endDate?.toISOString() ?? null }));
    await tx.roleAssignment.updateMany({ where: { id: { in: roles.map((ra) => ra.id) } }, data: { endDate: end } });
    await tx.newHire.update({ where: { id: p.id }, data: plan.terminate ? { employmentStatus: "TERMINATED", stage: "ARCHIVED", terminationDate: end } : { terminationDate: end } });
  }
  return undo;
}

export async function undoDates(tx: Tx, newHireId: string, u: DatesUndo) {
  if (u.createdRoleIds?.length) await tx.roleAssignment.deleteMany({ where: { id: { in: u.createdRoleIds } } });
  await tx.employmentStint.deleteMany({ where: { id: { in: u.createdStintIds } } });
  for (const s of u.oldStints) await tx.employmentStint.create({ data: { id: s.id, newHireId, startDate: new Date(s.startDate), endDate: s.endDate ? new Date(s.endDate) : null, note: s.note } });
  for (const r of u.roleEnds) await tx.roleAssignment.update({ where: { id: r.id }, data: { endDate: r.endDate ? new Date(r.endDate) : null } });
  await tx.newHire.update({ where: { id: newHireId }, data: { employmentStatus: u.before.employmentStatus, stage: u.before.stage, terminationDate: u.before.terminationDate ? new Date(u.before.terminationDate) : null } });
}

// ---------------------------------------------------------------- full / part time

export const DOL_SOURCE = "paycom-dol-status";
// Every full staff list in the roster workbook that records a type (its tabs; the
// pilots-only VaxPilots list is not one) - the same dates import-employment-types.ts derives.
const LISTS = ["2017-12-31", "2018-12-31", "2019-12-31", "2020-12-31", "2021-12-31", "2022-09-20", "2024-08-13"].map((s) => Date.parse(`${s}T00:00:00Z`));
export const DOL_WORDS: Record<string, string> = { FULL_TIME: "Full time", PART_TIME: "Part time" };
export const dayIso = (t: number | null) => (t === null ? "open" : new Date(t).toISOString().slice(0, 10));
const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export type DolChange =
  | { kind: "create"; type: string; start: number; end: number | null }
  | { kind: "switch"; closeId: string; oldType: string; oldEnd: number | null; cut: number; type: string; end: number | null };

export type DolPlan =
  | { kind: "none"; tally: string }
  | { kind: "judgment"; tally: string; why: string }
  | { kind: "change"; tally: string; at: number; change: DolChange };

/** `asOf` is the day the export was run (ms, UTC midnight). */
export function planDol(r: ExportRow, p: Employee, asOf: number): DolPlan {
  if (!r.dol) return { kind: "none", tally: "Paycom has no DOL status" };
  const at = r.term ? Date.parse(`${r.term}T00:00:00Z`) : asOf;
  const emp = periodsOf(p).map((x) => ({ start: dayOf(x.start), end: x.end ? dayOf(x.end) : null })).find((x) => x.start <= at && (x.end === null || x.end >= at));
  if (!emp) return { kind: "judgment", tally: "no employment in the app on that day", why: `Paycom ${DOL_WORDS[r.dol]} on ${dayIso(at)}, but the app has no employment that day` };
  const inside = p.employmentTypePeriods
    .map((t) => ({ ...t, s: dayOf(t.startDate), e: t.endDate ? dayOf(t.endDate) : null }))
    .filter((t) => t.s >= emp.start && (emp.end === null || t.s <= emp.end))
    .sort((a, b) => a.s - b.s);
  const cover = inside.find((t) => t.s <= at && (t.e === null || t.e >= at));
  if (cover) {
    if (cover.type === r.dol) return { kind: "none", tally: "same type already on file" };
    if (r.dol === "PART_TIME" && ["DAY_RATE", "TEMP", "LEAVE"].includes(cover.type)) return { kind: "none", tally: `workbook's ${cover.type} kept` };
    const lists = LISTS.filter((d) => d >= cover.s && d < at);
    if (!lists.length) return { kind: "judgment", tally: "changed type, no list to date it", why: `${cover.type} from ${dayIso(cover.s)} on file, Paycom says ${DOL_WORDS[r.dol]}, and no staff list dates the change` };
    const cut = Math.max(...lists);
    return { kind: "change", tally: "changed type", at, change: { kind: "switch", closeId: cover.id, oldType: cover.type, oldEnd: cover.e, cut, type: r.dol, end: emp.end } };
  }
  const prevList = LISTS.filter((d) => d < at);
  const reach = prevList.length ? Math.max(...prevList) + DAY : emp.start;
  const before = inside.filter((t) => t.e !== null && t.e < at).map((t) => (t.e as number) + DAY);
  const start = Math.max(emp.start, reach, ...before);
  const after = inside.find((t) => t.s > at);
  if (after) return { kind: "judgment", tally: "a later type already on file", why: `a type starting ${dayIso(after.s)} is on file after Paycom's point ${dayIso(at)}` };
  return { kind: "change", tally: `new: ${DOL_WORDS[r.dol]}`, at, change: { kind: "create", type: r.dol, start, end: emp.end } };
}

export function describeDol(c: DolChange, at: number) {
  return c.kind === "create"
    ? `${DOL_WORDS[c.type]} ${dayIso(c.start)}..${dayIso(c.end)}  (Paycom, as of ${dayIso(at)})`
    : `${c.oldType} now ends ${dayIso(c.cut)} (was ${dayIso(c.oldEnd)}), then ${DOL_WORDS[c.type]} ${dayIso(c.cut + DAY)}..${dayIso(c.end)}  (Paycom, as of ${dayIso(at)})`;
}

export type DolUndo = { created: string[]; closed: Array<{ id: string; endDate: string | null }> };

export async function applyDol(tx: Tx, newHireId: string, plan: Extract<DolPlan, { kind: "change" }>, note: string): Promise<DolUndo> {
  const c = plan.change;
  const undo: DolUndo = { created: [], closed: [] };
  if (c.kind === "switch") {
    await tx.employmentTypePeriod.update({ where: { id: c.closeId }, data: { endDate: new Date(c.cut) } });
    undo.closed.push({ id: c.closeId, endDate: c.oldEnd === null ? null : new Date(c.oldEnd).toISOString() });
  }
  const start = c.kind === "switch" ? c.cut + DAY : c.start;
  const made = await tx.employmentTypePeriod.create({
    data: { newHireId, type: c.type, startDate: new Date(start), endDate: c.end === null ? null : new Date(c.end), source: DOL_SOURCE, note: `${note}: ${DOL_WORDS[c.type]} as of ${dayIso(plan.at)}` }
  });
  undo.created.push(made.id);
  return undo;
}

export async function undoDol(tx: Tx, u: DolUndo) {
  await tx.employmentTypePeriod.deleteMany({ where: { id: { in: u.created }, source: DOL_SOURCE } });
  for (const c of u.closed) await tx.employmentTypePeriod.update({ where: { id: c.id }, data: { endDate: c.endDate ? new Date(c.endDate) : null } });
}
