/**
 * Imports -> Paycom employees: Paycom's "Advanced Report Writer" employee export
 * (.xlsx), read against the Employees directory.
 *
 * Paycom is the source of truth for staff and will not integrate, so this upload is
 * how the directory keeps up: terminations, re-hires, date corrections, full / part
 * time and position changes. The rules for dates and full / part time are the CLI
 * scripts' (lib/paycom/employee-plan.ts); this file adds the preview, the position
 * comparison, apply and undo.
 *
 * POSITIONS ARE COMPARED PAYCOM-TO-PAYCOM. Paycom's Position is a payroll code
 * ("Pilot CJ2 PIC", "AR Specialist - Salary"); the app's titles are the fleet names
 * ("CJ2 Captain"). On the Oct 16 export 105 of the 154 current people differ in
 * wording alone. So a position change is Paycom's value moving between two APPLIED
 * uploads - the latest COMPLETED batch is the baseline - never Paycom against the
 * app's title. The first upload has nothing to compare with and only records the
 * starting point. The app title to write is suggested from what the people already
 * holding that Paycom position are called in the app, and can be edited.
 *
 * A position change updates NewHire.position ONLY - no new role step. His decision,
 * 2026-10-25: Paycom gives no date for the change, only that it moved between two exports.
 *
 * Flow: upload -> preview (the batch, nothing else written) -> apply ticked people ->
 * undo per batch. Each person applied is one ImportRow holding exactly what it
 * changed, written in the same transaction as the change.
 */

import { prisma } from "@/lib/prisma";
import { matchPerson, type ExportRow } from "@/lib/paycom/employee-export";
import {
  applyDates, applyDol, describeDol, loadEmployees, planDates, planDol, undoDates, undoDol,
  type DatesPlan, type DatesUndo, type DolPlan, type DolUndo, type Employee
} from "@/lib/paycom/employee-plan";

export const SOURCE_TYPE = "PAYCOM_EMPLOYEES";

export type PreviewChange = {
  newHireId: string;
  name: string;
  rowNumber: number;
  paycomLabel: string;
  appStatus: string;
  paycom: { position: string; hire: string; prevTerm: string | null; rehire: string | null; term: string | null; dol: string | null };
  /** "terminate" | "rehire" | "correct" */
  dates: { action: "terminate" | "rehire" | "correct"; what: string[]; result: string } | null;
  dol: string | null;
  position: { from: string; to: string; appTitle: string | null } | null;
  /** The app title a position change or a re-hire's role would get, editable on the page. */
  suggestedTitle: string | null;
  signature: string;
};

export type Preview = {
  asOf: string;
  asOfFrom: "file name" | "upload day" | "typed";
  exportRows: number;
  matched: number;
  agree: number;
  changes: PreviewChange[];
  forPerson: Array<{ name: string; paycomLabel: string; why: string }>;
  unmatched: Array<{ label: string; position: string; hire: string; term: string | null }>;
  dolTally: Record<string, number>;
  baseline: { batchId: string; at: string; file: string | null } | null;
};

/** Paycom names its exports "20261016105442_Advanced_Report_Writer_....xlsx": the run time. */
export function asOfFromFilename(filename: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})\d{6}_/.exec(filename);
  if (!m) return null;
  const s = `${m[1]}-${m[2]}-${m[3]}`;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

const note = (file: string) => `Paycom export ${file}`;
const dolNote = (file: string) => `Paycom DOL status (export ${file})`;
const openTitle = (p: Employee) => p.roleAssignments.filter((r) => !r.endDate).map((r) => r.title).pop() ?? p.position ?? null;

/** What each Paycom position is called in the app, by the people holding it now. */
function titleSuggestions(rows: ExportRow[], people: Employee[]) {
  const counts = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.term || !r.position) continue;
    const p = matchPerson(r, people);
    if (!p || p.employmentStatus !== "ACTIVE") continue;
    const t = openTitle(p);
    if (!t) continue;
    const m = counts.get(r.position) ?? new Map<string, number>();
    m.set(t, (m.get(t) ?? 0) + 1);
    counts.set(r.position, m);
  }
  const out: Record<string, string> = {};
  for (const [pos, m] of counts) {
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) out[pos] = ranked[0][0];
  }
  return out;
}

/** The positions recorded by the latest applied upload, by person. */
export async function loadBaseline(excludeBatchId?: string) {
  const b = await prisma.importBatch.findFirst({
    where: { sourceType: SOURCE_TYPE, status: "COMPLETED", ...(excludeBatchId ? { id: { not: excludeBatchId } } : {}) },
    orderBy: { completedAt: "desc" }
  });
  if (!b) return null;
  const s = JSON.parse(b.summaryJson ?? "{}") as { baselinePositions?: Record<string, string> };
  return { batchId: b.id, at: (b.completedAt ?? b.createdAt).toISOString(), file: b.sourceFilename, positions: s.baselinePositions ?? {} };
}

type PersonPlan = { r: ExportRow; rowNumber: number; p: Employee; dates: DatesPlan; dol: DolPlan; position: PreviewChange["position"] };

function planPerson(r: ExportRow, rowNumber: number, p: Employee, file: string, asOf: string, baseline: Record<string, string> | null): PersonPlan {
  const dates = planDates(r, p, note(file));
  const dol = planDol(r, p, Date.parse(`${asOf}T00:00:00Z`));
  const rehiring = dates.kind === "change" && Boolean(dates.rehire);
  const before = baseline?.[p.id];
  const position =
    before !== undefined && before !== r.position && !r.term && p.employmentStatus === "ACTIVE" && !rehiring
      ? { from: before, to: r.position, appTitle: openTitle(p) }
      : null;
  return { r, rowNumber, p, dates, dol, position };
}

function signatureOf(pp: PersonPlan) {
  return JSON.stringify({
    dates: pp.dates.kind === "change" ? { spans: pp.dates.spans, terminate: pp.dates.terminate, rehire: pp.dates.rehire } : pp.dates.kind,
    dol: pp.dol.kind === "change" ? pp.dol.change : pp.dol.kind,
    position: pp.position
  });
}

function hasChange(pp: PersonPlan) {
  return pp.dates.kind === "change" || pp.dol.kind === "change" || Boolean(pp.position);
}

/** Read-only: what applying this export would do. */
export async function buildPreview(input: { rows: ExportRow[]; file: string; asOf: string; asOfFrom: Preview["asOfFrom"]; baseline: Awaited<ReturnType<typeof loadBaseline>> }) {
  const { rows, file, asOf, baseline } = input;
  const people = await loadEmployees();
  const titles = titleSuggestions(rows, people);
  const preview: Preview = {
    asOf, asOfFrom: input.asOfFrom, exportRows: rows.length, matched: 0, agree: 0, changes: [], forPerson: [], unmatched: [], dolTally: {},
    baseline: baseline ? { batchId: baseline.batchId, at: baseline.at, file: baseline.file } : null
  };
  // Every matched person's Paycom position, for the next upload to compare with.
  const positions: Record<string, string> = {};
  const seen = new Map<string, string>();

  rows.forEach((r, rowNumber) => {
    const p = matchPerson(r, people);
    if (!p) {
      preview.unmatched.push({ label: r.label, position: r.position, hire: r.hire, term: r.term });
      return;
    }
    // Two Paycom rows on one person would apply twice; neither goes ahead.
    if (seen.has(p.id)) {
      preview.forPerson.push({ name: p.name, paycomLabel: r.label, why: `also matched Paycom's ${seen.get(p.id)} - two rows on one person, neither applied` });
      preview.changes = preview.changes.filter((c) => c.newHireId !== p.id);
      return;
    }
    seen.set(p.id, r.label);
    preview.matched++;
    positions[p.id] = r.position;
    const pp = planPerson(r, rowNumber, p, file, asOf, baseline?.positions ?? null);
    preview.dolTally[pp.dol.tally] = (preview.dolTally[pp.dol.tally] ?? 0) + 1;
    if (pp.dates.kind === "judgment") preview.forPerson.push({ name: p.name, paycomLabel: r.label, why: pp.dates.why });
    if (pp.dol.kind === "judgment") preview.forPerson.push({ name: p.name, paycomLabel: r.label, why: `full / part time: ${pp.dol.why}` });
    if (!hasChange(pp)) {
      if (pp.dates.kind === "agree") preview.agree++;
      return;
    }
    const d = pp.dates.kind === "change" ? pp.dates : null;
    preview.changes.push({
      newHireId: p.id,
      name: p.name,
      rowNumber,
      paycomLabel: r.label,
      appStatus: p.employmentStatus,
      paycom: { position: r.position, hire: r.hire, prevTerm: r.prevTerm, rehire: r.rehire, term: r.term, dol: r.dol },
      dates: d
        ? { action: d.rehire ? "rehire" : d.terminate ? "terminate" : "correct", what: d.what, result: d.spans.map((s) => `${s.start}..${s.end ?? "open"}`).join(", ") }
        : null,
      dol: pp.dol.kind === "change" ? describeDol(pp.dol.change, pp.dol.at) : null,
      position: pp.position,
      suggestedTitle: titles[r.position] ?? null,
      signature: signatureOf(pp)
    });
  });
  return { preview, positions };
}

export type RowUndo = {
  dates?: DatesUndo;
  dol?: DolUndo;
  position?: { priorPosition: string | null };
};

export type ApplyOutcome =
  | { newHireId: string; name: string; result: "applied"; did: string[] }
  | { newHireId: string; name: string; result: "skipped" | "error"; reason: string };

/** Apply the ticked people. Each is re-planned against the database first; one that no longer matches its preview is skipped. */
export async function applyChanges(input: {
  batchId: string;
  rows: ExportRow[];
  file: string;
  asOf: string;
  preview: Preview;
  baseline: Record<string, string> | null;
  newHireIds: string[];
  titles: Record<string, string>;
}): Promise<ApplyOutcome[]> {
  const wanted = input.preview.changes.filter((c) => input.newHireIds.includes(c.newHireId));
  const people = new Map((await loadEmployees(wanted.map((c) => c.newHireId))).map((p) => [p.id, p]));
  const outcomes: ApplyOutcome[] = [];

  for (const c of wanted) {
    const p = people.get(c.newHireId);
    const r = input.rows[c.rowNumber];
    if (!p || !r) {
      outcomes.push({ newHireId: c.newHireId, name: c.name, result: "skipped", reason: "No longer in the app." });
      continue;
    }
    const pp = planPerson(r, c.rowNumber, p, input.file, input.asOf, input.baseline);
    if (signatureOf(pp) !== c.signature) {
      outcomes.push({ newHireId: c.newHireId, name: c.name, result: "skipped", reason: "Their record changed since the preview - upload the file again to see what is left." });
      continue;
    }
    const title = (input.titles[c.newHireId] ?? c.suggestedTitle ?? "").trim();
    // A re-hire still working needs a current role; one already gone again does not.
    const rehire = pp.dates.kind === "change" && pp.dates.rehire && !pp.dates.newEnd;
    if ((pp.position || rehire) && !title) {
      outcomes.push({ newHireId: c.newHireId, name: c.name, result: "skipped", reason: "Needs the app title to use." });
      continue;
    }
    try {
      const did: string[] = [];
      await prisma.$transaction(async (tx) => {
        const undo: RowUndo = {};
        if (pp.dates.kind === "change") {
          undo.dates = await applyDates(tx, p, pp.dates, { rehireRole: rehire ? { title } : null });
          did.push(...pp.dates.what, ...(rehire ? [`current role ${title} from ${pp.dates.rehire}`] : []));
        }
        if (pp.dol.kind === "change") {
          undo.dol = await applyDol(tx, p.id, pp.dol, dolNote(input.file));
          did.push(describeDol(pp.dol.change, pp.dol.at));
        }
        if (pp.position) {
          undo.position = { priorPosition: p.position };
          await tx.newHire.update({ where: { id: p.id }, data: { position: title } });
          did.push(`position ${p.position ?? "(none)"} -> ${title} (Paycom ${pp.position.from} -> ${pp.position.to})`);
        }
        await tx.importRow.create({
          data: { importBatchId: input.batchId, rowNumber: c.rowNumber, status: "IMPORTED", rawJson: JSON.stringify({ newHireId: p.id, name: p.name, row: r, did, undo }) }
        });
      });
      outcomes.push({ newHireId: c.newHireId, name: c.name, result: "applied", did });
    } catch (error) {
      outcomes.push({ newHireId: c.newHireId, name: c.name, result: "error", reason: error instanceof Error ? error.message : "unknown error" });
    }
  }
  return outcomes;
}

/** The positions the NEXT upload compares with: this export's, except where a position change was not applied - those keep the old value so they show again. */
export function nextBaseline(positions: Record<string, string>, previous: Record<string, string> | null, preview: Preview, applied: Set<string>) {
  const out = { ...(previous ?? {}), ...positions };
  for (const c of preview.changes) if (c.position && !applied.has(c.newHireId)) out[c.newHireId] = c.position.from;
  return out;
}

export type UndoReport = { undone: number; errors: string[] };

/** Put a batch back, newest row first, from what each ImportRow recorded. */
export async function undoBatch(batchId: string): Promise<UndoReport> {
  const rows = await prisma.importRow.findMany({ where: { importBatchId: batchId, status: "IMPORTED" }, orderBy: { createdAt: "desc" } });
  const report: UndoReport = { undone: 0, errors: [] };
  for (const row of rows) {
    const { newHireId, name, undo } = JSON.parse(row.rawJson) as { newHireId: string; name: string; undo: RowUndo };
    try {
      await prisma.$transaction(async (tx) => {
        if (undo.position) await tx.newHire.update({ where: { id: newHireId }, data: { position: undo.position.priorPosition } });
        if (undo.dol) await undoDol(tx, undo.dol);
        if (undo.dates) await undoDates(tx, newHireId, undo.dates);
        await tx.importRow.update({ where: { id: row.id }, data: { status: "UNDONE" } });
      });
      report.undone++;
    } catch (error) {
      report.errors.push(`${name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return report;
}

