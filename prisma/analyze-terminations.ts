// Classify the "TERMINATED but has an open role" conflict so we can decide with
// the user. A role starting AFTER the termination date means they kept working
// (stale termination); otherwise the termination may be real and the open role
// simply wasn't closed.
import { prisma } from "@/lib/prisma";

const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "open");

async function main() {
  const hires = await prisma.newHire.findMany({
    select: {
      name: true, employmentStatus: true, terminationDate: true, importKey: true,
      roleAssignments: { select: { title: true, startDate: true, endDate: true } },
      employmentStints: { select: { endDate: true } }
    }
  });

  let terminated = 0, termWithOpenRole = 0;
  const staleTerm: string[] = []; // a role starts after the termination date
  const realTerm: string[] = [];  // all roles start on/before the termination date

  for (const h of hires) {
    if (h.employmentStatus === "TERMINATED") terminated++;
    const openRole = h.roleAssignments.some((r) => r.endDate === null);
    if (h.employmentStatus !== "TERMINATED" || !openRole || !h.terminationDate) continue;
    termWithOpenRole++;
    const term = h.terminationDate;
    const roleAfter = h.roleAssignments.find((r) => r.startDate.getTime() > term.getTime());
    const stintClosedAtTerm = h.employmentStints.some((s) => s.endDate && Math.abs(s.endDate.getTime() - term.getTime()) < 2 * 86400000);
    const line = `${h.name} — term ${d(term)}${roleAfter ? `, role "${roleAfter.title}" starts ${d(roleAfter.startDate)} AFTER term` : ""}${stintClosedAtTerm ? ", stint closed at term" : ""}${h.importKey ? `  [${h.importKey.split("|")[0].slice(0, 22)}]` : ""}`;
    (roleAfter ? staleTerm : realTerm).push(line);
  }

  console.log(JSON.stringify({ totalEmployees: hires.length, terminated, termWithOpenRole, staleTermination_keptWorking: staleTerm.length, plausiblyRealTermination: realTerm.length }, null, 2));
  console.log(`\nSTALE termination — kept working after (should REACTIVATE) [${staleTerm.length}]:`);
  console.log(staleTerm.map((s) => "  " + s).join("\n"));
  console.log(`\nPLAUSIBLY REAL termination — open role should be CLOSED at term [${realTerm.length}]:`);
  console.log(realTerm.map((s) => "  " + s).join("\n"));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
