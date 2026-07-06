// Normalize CE-525 → CJ2 in the role journey itself (not just the Reports display
// relabel). Two steps, scoped to people who actually hold a CE-525 role:
//   1) Rename role title/aircraft "CE-525"/"CE525" → "CJ2".
//   2) Merge any consecutive roles that become identical (same title + seat) as a
//      RESULT of the rename — keep the earlier row, extend its endDate over the
//      later one, delete the later. Only collapses a pair when one side was a
//      CE-525 role, so legitimate repeats are never touched.
//
//   npx tsx prisma/normalize-ce525-to-cj2.ts            (preview)
//   npx tsx prisma/normalize-ce525-to-cj2.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);
const relabel = (s: string | null) => (s == null ? s : s.replace(/CE-?525/gi, "CJ2"));
const isCe525 = (r: { title: string; aircraft: string | null }) => /CE-?525/i.test(`${r.title} ${r.aircraft ?? ""}`);

async function main() {
  // People with at least one CE-525 role.
  const ce = await prisma.roleAssignment.findMany({
    where: { OR: [{ title: { contains: "CE-525" } }, { title: { contains: "CE525" } }, { aircraft: { contains: "CE-525" } }, { aircraft: { contains: "CE525" } }] },
    select: { newHireId: true }
  });
  const hireIds = [...new Set(ce.map((r) => r.newHireId))];
  console.log(`People holding a CE-525 role: ${hireIds.length}\n`);

  let renamed = 0;
  let merged = 0;

  for (const hireId of hireIds) {
    const roles = await prisma.roleAssignment.findMany({
      where: { newHireId: hireId },
      select: { id: true, title: true, aircraft: true, seat: true, startDate: true, endDate: true, transitionType: true, createdAt: true, newHire: { select: { name: true } } },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }]
    });
    const name = roles[0]?.newHire.name ?? hireId;

    // Step 1 — relabel (in memory first; apply below).
    const view = roles.map((r) => ({ ...r, wasCe: isCe525(r), newTitle: relabel(r.title)!, newAircraft: relabel(r.aircraft) }));

    // Step 2 — find merges: adjacent, identical (newTitle + seat), and at least one was CE-525.
    const kept: typeof view = [];
    const deletes: { id: string; name: string }[] = [];
    const extend: { id: string; endDate: Date | null }[] = [];
    for (const r of view) {
      const prev = kept[kept.length - 1];
      if (prev && prev.newTitle === r.newTitle && (prev.seat ?? "") === (r.seat ?? "") && (prev.wasCe || r.wasCe)) {
        // Merge r into prev: prev absorbs the later boundary; drop r.
        extend.push({ id: prev.id, endDate: r.endDate });
        prev.endDate = r.endDate;
        deletes.push({ id: r.id, name: name });
        merged++;
      } else {
        kept.push(r);
      }
    }

    const renames = view.filter((r) => r.newTitle !== r.title || r.newAircraft !== r.aircraft);
    if (renames.length || deletes.length) {
      const seq = kept.map((r) => `${r.newTitle}${r.endDate === null ? "*" : ""}`).join(" → ");
      log(`${name}: ${renames.length} relabel, ${deletes.length} merge  ⇒  ${seq}`);
    }

    if (commit) {
      // Apply relabels for every role that changed (including ones about to be deleted is harmless, but skip deletes).
      const deleteIds = new Set(deletes.map((d) => d.id));
      for (const r of view) {
        if (deleteIds.has(r.id)) continue;
        if (r.newTitle !== r.title || r.newAircraft !== r.aircraft) {
          await prisma.roleAssignment.update({ where: { id: r.id }, data: { title: r.newTitle, aircraft: r.newAircraft } });
          renamed++;
        }
      }
      // Extend survivors' endDates, then delete absorbed rows.
      for (const e of extend) await prisma.roleAssignment.update({ where: { id: e.id }, data: { endDate: e.endDate } });
      for (const d of deletes) await prisma.roleAssignment.delete({ where: { id: d.id } });
    }
  }

  console.log(`\n${commit ? `APPLIED — renamed ${renamed}, merged ${merged}` : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
