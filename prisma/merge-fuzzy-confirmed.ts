// Merge the 4 fuzzy-scan duplicates that are unambiguous (same start date, clear
// spelling/nickname variant, one thin placeholder). Rebuilds a single role journey
// on the survivor, moves relations, sets the correct display name. Ambiguous pairs
// (Angel Pagan-Martinez/Martinez, Brannon Bedde/Beddes, Rozie/Rozella Nelson) are
// intentionally NOT here — left for the user.
//   npx tsx prisma/merge-fuzzy-confirmed.ts            (preview)
//   npx tsx prisma/merge-fuzzy-confirmed.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
const normTitle = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// [survivorId, dropId, finalName]
const PAIRS: [string, string, string][] = [
  ["cmr5kd2cj001ancrm6p3gp0ik", "cmqac9tkt00d7pkrm4l0w59ec", "Aleksandar Kostic"],
  ["cmr5dx4z700680ormam8j3v5s", "cmr18a50d001m04jqhjhge8c8", "Zachary Kuno"],
  ["cmr5dxedh00ap0ormj563kx9h", "cmr5dxlpo00ef0ormdyzvj08p", "Erika Tobias"],
  ["cmr5kd2ik001encrm9d8sj6r6", "cmqac9upy00espkrmcjh9gz36", "Gavin Wunderlich"]
];

async function main() {
  for (const [survId, dropId, finalName] of PAIRS) {
    const [surv, drop] = await Promise.all([
      prisma.newHire.findUnique({ where: { id: survId }, select: { id: true, name: true, employmentStatus: true, terminationDate: true, startDate: true, department: true, birthday: true, candidateId: true, pointsBalance: true, roleAssignments: { select: { title: true, seat: true, aircraft: true, fleetPositionSlug: true, department: true, startDate: true, createdAt: true } } } }),
      prisma.newHire.findUnique({ where: { id: dropId }, select: { id: true, name: true, employmentStatus: true, terminationDate: true, startDate: true, pointsBalance: true, roleAssignments: { select: { title: true, seat: true, aircraft: true, fleetPositionSlug: true, department: true, startDate: true, createdAt: true } } } })
    ]);
    if (!surv || !drop) { console.log(`(skip — missing: surv:${!!surv} drop:${!!drop})`); continue; }

    const anyActive = surv.employmentStatus !== "TERMINATED" || drop.employmentStatus !== "TERMINATED";
    const status = anyActive ? "ACTIVE" : "TERMINATED";
    const term = anyActive ? null : [surv.terminationDate, drop.terminationDate].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
    const startDate = [surv.startDate, drop.startDate].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;

    // Union roles by normalized title (earliest start; prefer a fleet-mapped one).
    const byTitle = new Map<string, { title: string; seat: string | null; aircraft: string | null; fleetPositionSlug: string | null; department: string | null; startDate: Date }>();
    for (const r of [...surv.roleAssignments, ...drop.roleAssignments]) {
      const k = normTitle(r.title);
      const cur = byTitle.get(k);
      if (!cur) { byTitle.set(k, { ...r }); continue; }
      if (r.startDate < cur.startDate) cur.startDate = r.startDate;
      if (!cur.fleetPositionSlug && r.fleetPositionSlug) { cur.fleetPositionSlug = r.fleetPositionSlug; cur.seat = r.seat; cur.aircraft = r.aircraft; }
    }
    const seq = [...byTitle.values()].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    let prevSeat: string | null = null;
    const chain = seq.map((r, i) => {
      const end = i < seq.length - 1 ? seq[i + 1].startDate : status === "TERMINATED" ? term : null;
      const tt = i === 0 ? "HIRE" : prevSeat === "SIC" && r.seat === "PIC" ? "UPGRADE" : "PROMOTION";
      if (r.seat) prevSeat = r.seat;
      return { r, end, tt };
    });

    console.log(`${finalName}  ←  merge ${surv.name} + ${drop.name}  [${status}${term ? " " + d(term) : ""}] start ${d(startDate)}`);
    for (const c of chain) console.log(`    ${c.r.title} [${c.r.seat ?? "—"}] ${d(c.r.startDate)}→${d(c.end)} ${c.tt}`);
    if (!commit) continue;

    await prisma.$transaction(async (tx) => {
      await tx.travelTrip.updateMany({ where: { newHireId: dropId }, data: { newHireId: survId } });
      await tx.redemption.updateMany({ where: { newHireId: dropId }, data: { newHireId: survId } });
      await tx.recognition.updateMany({ where: { giverId: dropId }, data: { giverId: survId } });
      await tx.recognition.updateMany({ where: { recipientId: dropId }, data: { recipientId: survId } });
      await tx.roleAssignment.deleteMany({ where: { newHireId: { in: [survId, dropId] } } });
      for (const c of chain) await tx.roleAssignment.create({ data: { newHireId: survId, title: c.r.title, seat: c.r.seat, aircraft: c.r.aircraft, fleetPositionSlug: c.r.fleetPositionSlug, department: c.r.department, startDate: c.r.startDate, endDate: c.end, transitionType: c.tt } });
      // one stint spanning the tenure
      await tx.employmentStint.deleteMany({ where: { newHireId: { in: [survId, dropId] } } });
      if (startDate) await tx.employmentStint.create({ data: { newHireId: survId, startDate, endDate: status === "TERMINATED" ? term : null } });
      await tx.newHire.update({ where: { id: survId }, data: { name: finalName, position: seq.length ? seq[seq.length - 1].title : undefined, employmentStatus: status, terminationDate: term, stage: status === "TERMINATED" ? "ARCHIVED" : "POST_ONBOARD", startDate, pointsBalance: surv.pointsBalance + drop.pointsBalance } });
      await tx.newHire.delete({ where: { id: dropId } });
    });
  }
  console.log(`\n${commit ? "MERGED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
