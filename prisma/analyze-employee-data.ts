// Read-only audit of employee-history data quality, to scope the cleanup:
//   npx tsx prisma/analyze-employee-data.ts
// Reports on: rehire stints, role ends that cross stint gaps (clip candidates),
// inferred-looking dates (year-end / Jan-1 snapshots), and suspect transitions
// (PIC -> SIC downgrades, roles sitting inside a leave/return gap).

import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
const mmdd = (x: Date) => x.toISOString().slice(5, 10);

async function main() {
  const hires = await prisma.newHire.findMany({
    where: { OR: [{ roleAssignments: { some: {} } }, { employmentStints: { some: {} } }] },
    select: {
      id: true,
      name: true,
      importKey: true,
      employmentStatus: true,
      terminationDate: true,
      roleAssignments: {
        select: { id: true, title: true, seat: true, aircraft: true, startDate: true, endDate: true, transitionType: true, createdAt: true }
      },
      employmentStints: { select: { id: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" } }
    }
  });

  let totalRoles = 0;
  let inferredDates = 0; // startDate mm-dd is 12-31 or 01-01
  let rehires = 0;
  const clipCandidates: string[] = [];
  const gapRoles: string[] = [];
  const downgrades: string[] = [];
  const rolesPerPerson: Record<number, number> = {};
  let rosterOwned = 0;

  for (const h of hires) {
    if (h.importKey?.startsWith("roster:")) rosterOwned++;
    const roles = [...h.roleAssignments].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
    );
    totalRoles += roles.length;
    rolesPerPerson[roles.length] = (rolesPerPerson[roles.length] ?? 0) + 1;

    for (const r of roles) {
      const md = mmdd(r.startDate);
      if (md === "12-31" || md === "01-01") inferredDates++;
    }

    // PIC -> SIC downgrade (usually a snapshot artifact, e.g. an odd one-off seat)
    for (let i = 1; i < roles.length; i++) {
      if (roles[i - 1].seat === "PIC" && roles[i].seat === "SIC") {
        downgrades.push(`${h.name}: ${roles[i - 1].title} (${d(roles[i - 1].startDate)}) -> ${roles[i].title} (${d(roles[i].startDate)})`);
      }
    }

    const stints = h.employmentStints;
    if (stints.length > 1) {
      rehires++;
      // Clip check: for a closed stint, any role starting inside it should end by
      // that stint's end. A role whose start sits in a leave/return GAP is suspect.
      for (const r of roles) {
        const inStint = stints.find(
          (s) => r.startDate >= s.startDate && (s.endDate === null || r.startDate <= new Date(s.endDate.getTime() + DAY))
        );
        if (!inStint) {
          gapRoles.push(`${h.name}: ${r.title} starts ${d(r.startDate)} (inside a leave gap)`);
          continue;
        }
        if (inStint.endDate && r.endDate && r.endDate.getTime() > inStint.endDate.getTime() + DAY) {
          clipCandidates.push(
            `${h.name}: ${r.title} ends ${d(r.endDate)} but stint ends ${d(inStint.endDate)} (over by ${Math.round((r.endDate.getTime() - inStint.endDate.getTime()) / DAY)}d)`
          );
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        employees: hires.length,
        rosterOwned,
        totalRoles,
        inferredDatePct: totalRoles ? Math.round((inferredDates / totalRoles) * 100) : 0,
        inferredDates,
        rehires,
        clipCandidateCount: clipCandidates.length,
        gapRoleCount: gapRoles.length,
        downgradeCount: downgrades.length,
        rolesPerPerson
      },
      null,
      2
    )
  );
  const show = (label: string, arr: string[]) => {
    if (!arr.length) return;
    console.log(`\n${label} (${arr.length}):`);
    for (const s of arr.slice(0, 25)) console.log("  " + s);
    if (arr.length > 25) console.log(`  … +${arr.length - 25} more`);
  };
  show("ROLE ENDS CROSSING A STINT (clip candidates)", clipCandidates);
  show("ROLES STARTING INSIDE A LEAVE GAP", gapRoles);
  show("PIC -> SIC DOWNGRADES (suspect)", downgrades);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
