// Reading Paycom's employee exports and finding each row's person - shared by
// prisma/import-paycom-employee-dates.ts and prisma/import-paycom-dol-status.ts.
//
// Two shapes have arrived (both .xlsx; dates are read as Paycom wrote them, and a
// serial number is converted only where the cell really holds one):
//   "Employee Dates" report (2026-10-15): EE Code, "LAST, FIRST" name, Status, text
//     dates "2024-12-16", "0000-00-00" for none. Current staff plus six recent leavers.
//   Advanced Report Writer (2026-10-16): Legal_Firstname, Legal_Lastname, dates as
//     Excel serials, "00/00/0000" for none, and DOL_Status (Full Time / Part Time).
//     Everybody on Paycom since SkyShare moved to it (terminations from Dec 2021),
//     two test logins included. He: "this is all i can get you. all payroll can be
//     under cb aviation" - so absence from it says nothing about whether somebody left.

import XLSX from "xlsx";

export type ExportRow = {
  label: string;          // for the review: "BROCK TYLER"
  first: string[];        // cleaned first-name tokens
  last: string;           // cleaned last name, may be two words ("gonzalez herrera")
  position: string;
  hire: string;           // YYYY-MM-DD
  prevTerm: string | null;
  rehire: string | null;
  term: string | null;
  dol: "FULL_TIME" | "PART_TIME" | null;
};

export const clean = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const YMD = /^\d{4}-\d{2}-\d{2}$/;
function dateCell(v: unknown, what: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) throw new Error(`${what}: ${v} is not a plausible date serial`);
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (s === "0000-00-00" || s === "00/00/0000") return null;
  if (YMD.test(s)) return s;
  throw new Error(`${what}: "${s}" is not a date this reader knows`);
}

const TEST_LOGINS = /^(johnny|manager) test$/i; // Paycom's own test people, not employees

export function readExport(file: string): ExportRow[] {
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: null });
  const out: ExportRow[] = [];
  for (const x of rows) {
    let first: string, last: string, label: string;
    if ("EE Name" in x) {
      label = String(x["EE Name"]);
      [last, first = ""] = label.split(",");
    } else {
      first = String(x.Legal_Firstname ?? ""); last = String(x.Legal_Lastname ?? "");
      label = `${first} ${last}`.trim();
    }
    if (TEST_LOGINS.test(label)) continue;
    const g = (a: string, b: string) => (a in x ? x[a] : x[b]);
    const hire = dateCell(g("Hire Date", "Hire_Date"), `${label} hire`);
    if (!hire) throw new Error(`${label}: no hire date`);
    const dolRaw = String(x.DOL_Status ?? "");
    out.push({
      label, first: clean(first).split(" ").filter(Boolean), last: clean(last), position: String(x["Position"] ?? x.Position ?? ""),
      hire,
      prevTerm: dateCell(g("Previous Termination Date", "Previous_Termination_Date"), `${label} previous termination`),
      rehire: dateCell(g("Re-hire Date", "Rehire_Date"), `${label} rehire`),
      term: dateCell(g("Termination Date", "Termination_Date"), `${label} termination`),
      dol: /full/i.test(dolRaw) ? "FULL_TIME" : /part/i.test(dolRaw) ? "PART_TIME" : null
    });
  }
  return out;
}

type Named = { id: string; name: string; legalName: string | null; startDate: Date | null; terminationDate: Date | null };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** One app person for a Paycom row, or null when no single person fits. Same last name
    (any word of a two-word one) plus: the same first name, else one whose first name
    shares its first three letters (Benjamin = Ben), else one with the identical hire or
    termination date (Paycom's legal "Caiden" is the app's "Katie", hired the same day). */
export function matchPerson<P extends Named>(r: ExportRow, people: P[]): P | null {
  const names = (p: P) => [p.name, p.legalName].filter(Boolean).map((n) => clean(n as string));
  const lastWords = r.last.split(" ");
  const sameLast = people.filter((p) => names(p).some((n) => n.endsWith(` ${r.last}`) || lastWords.includes(n.split(" ").pop() as string)));
  const firstOf = (n: string) => n.split(" ")[0];
  const exact = sameLast.filter((p) => names(p).some((n) => r.first.includes(firstOf(n))));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const nick = sameLast.filter((p) => names(p).some((n) => { const f = firstOf(n), g = r.first[0] ?? ""; return g.length >= 3 && f.length >= 3 && (g.startsWith(f.slice(0, 3)) || f.startsWith(g.slice(0, 3))); }));
  if (nick.length === 1) return nick[0];
  if (nick.length > 1) return null;
  const sameDay = sameLast.filter((p) => day(p.startDate) === (r.rehire ?? r.hire) || (r.term && day(p.terminationDate) === r.term));
  return sameDay.length === 1 ? sameDay[0] : null;
}
