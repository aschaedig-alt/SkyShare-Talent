// Merge duplicate employee (NewHire) records found by scan-employee-duplicates.ts.
// Groups records of the same person (nickname/spelling variants), keeps one
// survivor (an ACTIVE record when status conflicts), rebuilds a single clean role
// journey from the union of both, moves stints/trips/recognitions/redemptions/
// points to the survivor, then deletes the duplicate(s). Final dates/status are
// finished by the CSV reconciliation step afterward.
//   npx tsx prisma/merge-employee-duplicates.ts            (preview)
//   npx tsx prisma/merge-employee-duplicates.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const normTitle = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const NICK: Record<string, string> = {
  chris: "christopher", kris: "christopher", ben: "benjamin", benji: "benjamin", nick: "nicholas", nico: "nicholas",
  will: "william", bill: "william", billy: "william", alex: "alexander", matt: "matthew", josh: "joshua",
  rob: "robert", robbie: "robert", bob: "robert", mike: "michael", mick: "michael", mickey: "michael",
  dan: "daniel", danny: "daniel", tom: "thomas", tommy: "thomas", jake: "jacob", andy: "andrew", drew: "andrew",
  katie: "katherine", kate: "katherine", joe: "joseph", jim: "james", jimmy: "james", greg: "gregory",
  sam: "samuel", dave: "david", steve: "steven", tony: "anthony", charlie: "charles", rick: "richard",
  ricky: "richard", rich: "richard", pat: "patrick", ken: "kenneth", jon: "jonathan", johnny: "john",
  zach: "zachary", gabe: "gabriel", nate: "nathan", nathaniel: "nathan", cam: "cameron", brad: "bradley",
  fred: "frederick", teren: "terence", jermey: "jeremy", dash: "dashiell", dashiell: "dashiell", phil: "philip", tim: "timothy"
};
const canonFirst = (f: string) => NICK[f] ?? f;
function firstsRelated(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return canonFirst(a) === canonFirst(b);
}

type Hire = {
  id: string; name: string; stage: string; employmentStatus: string; startDate: Date | null; terminationDate: Date | null;
  position: string | null; department: string | null; birthday: Date | null; candidateId: string | null; pointsBalance: number;
  roleAssignments: { id: string; title: string; seat: string | null; aircraft: string | null; fleetPositionSlug: string | null; department: string | null; startDate: Date; endDate: Date | null; createdAt: Date }[];
  employmentStints: { id: string; startDate: Date; endDate: Date | null; note: string | null }[];
  _count: { roleAssignments: number; employmentStints: number; travelTrips: number };
};

async function main() {
  const commit = process.argv.includes("--commit");
  const rows = (await prisma.newHire.findMany({
    select: {
      id: true, name: true, stage: true, employmentStatus: true, startDate: true, terminationDate: true, position: true,
      department: true, birthday: true, candidateId: true, pointsBalance: true,
      roleAssignments: { select: { id: true, title: true, seat: true, aircraft: true, fleetPositionSlug: true, department: true, startDate: true, endDate: true, createdAt: true } },
      employmentStints: { select: { id: true, startDate: true, endDate: true, note: true } },
      _count: { select: { roleAssignments: true, employmentStints: true, travelTrips: true } }
    }
  })) as Hire[];

  const meta = rows.map((r) => {
    const parts = norm(r.name).split(" ");
    return { r, first: parts[0] ?? "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
  });

  // Union-find groups of same-person records (same last name + related first).
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const m of meta) parent.set(m.r.id, m.r.id);
  const byLast = new Map<string, typeof meta>();
  for (const m of meta) { if (!m.last) continue; const l = byLast.get(m.last) ?? []; l.push(m); byLast.set(m.last, l); }
  for (const group of byLast.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        if (firstsRelated(group[i].first, group[j].first)) parent.set(find(group[i].r.id), find(group[j].r.id));

  const groups = new Map<string, Hire[]>();
  for (const m of meta) { const root = find(m.r.id); const g = groups.get(root) ?? []; g.push(m.r); groups.set(root, g); }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);

  const richness = (r: Hire) => r._count.roleAssignments * 3 + r._count.employmentStints * 2 + r._count.travelTrips;
  let merged = 0;

  for (const group of dupGroups) {
    const anyActive = group.some((r) => r.employmentStatus !== "TERMINATED");
    const pool = anyActive ? group.filter((r) => r.employmentStatus !== "TERMINATED") : group;
    const survivor = [...pool].sort((a, b) => richness(b) - richness(a))[0];
    const drops = group.filter((r) => r.id !== survivor.id);

    const status = anyActive ? "ACTIVE" : "TERMINATED";
    const termDate = anyActive ? null : group.map((r) => r.terminationDate).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
    const startDate = group.map((r) => r.startDate).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
    const stage = anyActive ? "POST_ONBOARD" : "ARCHIVED";

    // Union roles -> one per normalized title (prefer a fleet-mapped one; earliest start).
    const byTitle = new Map<string, Hire["roleAssignments"][number]>();
    for (const r of group)
      for (const role of r.roleAssignments) {
        const k = normTitle(role.title);
        const cur = byTitle.get(k);
        if (!cur) { byTitle.set(k, { ...role }); continue; }
        if (role.startDate < cur.startDate) cur.startDate = role.startDate;
        if (!cur.fleetPositionSlug && role.fleetPositionSlug) { cur.fleetPositionSlug = role.fleetPositionSlug; cur.seat = role.seat; cur.aircraft = role.aircraft; }
      }
    const seq = [...byTitle.values()].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    let prevSeat: string | null = null;
    const chain = seq.map((role, i) => {
      const end = i < seq.length - 1 ? seq[i + 1].startDate : status === "TERMINATED" ? termDate : null;
      const tt = i === 0 ? "HIRE" : prevSeat === "SIC" && role.seat === "PIC" ? "UPGRADE" : "PROMOTION";
      if (role.seat) prevSeat = role.seat;
      return { role, end, tt };
    });

    console.log(`${survivor.name}  ←  ${drops.map((x) => x.name).join(", ")}   [${status}${termDate ? " " + d(termDate) : ""}] start ${d(startDate)}`);
    for (const c of chain) console.log(`    ${c.role.title} [${c.role.seat ?? "—"}] ${d(c.role.startDate)}→${d(c.end)} ${c.tt}`);
    merged++;

    if (!commit) continue;
    const dropIds = drops.map((x) => x.id);
    const pointsSum = drops.reduce((s, x) => s + x.pointsBalance, 0);
    await prisma.$transaction(async (tx) => {
      // Move keepable relations from drops -> survivor.
      await tx.travelTrip.updateMany({ where: { newHireId: { in: dropIds } }, data: { newHireId: survivor.id } });
      await tx.redemption.updateMany({ where: { newHireId: { in: dropIds } }, data: { newHireId: survivor.id } });
      await tx.recognition.updateMany({ where: { giverId: { in: dropIds } }, data: { giverId: survivor.id } });
      await tx.recognition.updateMany({ where: { recipientId: { in: dropIds } }, data: { recipientId: survivor.id } });
      // Rebuild the role journey on the survivor from the deduped union.
      await tx.roleAssignment.deleteMany({ where: { newHireId: { in: [survivor.id, ...dropIds] } } });
      for (const c of chain)
        await tx.roleAssignment.create({ data: { newHireId: survivor.id, title: c.role.title, seat: c.role.seat, aircraft: c.role.aircraft, fleetPositionSlug: c.role.fleetPositionSlug, department: c.role.department, startDate: c.role.startDate, endDate: c.end, transitionType: c.tt } });
      // Consolidate stints: union, dedup by start day, close/open per status.
      const stints = group.flatMap((r) => r.employmentStints);
      const uniq = new Map<string, { startDate: Date; endDate: Date | null; note: string | null }>();
      for (const s of stints) { const k = d(s.startDate); if (!uniq.has(k)) uniq.set(k, { startDate: s.startDate, endDate: s.endDate, note: s.note }); }
      const sortedStints = [...uniq.values()].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      if (sortedStints.length) sortedStints[sortedStints.length - 1].endDate = status === "TERMINATED" ? termDate : null;
      await tx.employmentStint.deleteMany({ where: { newHireId: { in: [survivor.id, ...dropIds] } } });
      for (const s of sortedStints) await tx.employmentStint.create({ data: { newHireId: survivor.id, startDate: s.startDate, endDate: s.endDate, note: s.note } });

      await tx.newHire.update({
        where: { id: survivor.id },
        data: {
          employmentStatus: status,
          terminationDate: termDate,
          stage,
          startDate,
          position: seq.length ? seq[seq.length - 1].title : survivor.position ?? drops.find((x) => x.position)?.position ?? null,
          department: survivor.department ?? drops.find((x) => x.department)?.department ?? null,
          birthday: survivor.birthday ?? drops.find((x) => x.birthday)?.birthday ?? null,
          candidateId: survivor.candidateId ?? drops.find((x) => x.candidateId)?.candidateId ?? null,
          pointsBalance: survivor.pointsBalance + pointsSum
        }
      });
      await tx.newHire.deleteMany({ where: { id: { in: dropIds } } });
    });
  }

  console.log(`\n${commit ? "MERGED" : "WOULD MERGE"} ${merged} group(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
