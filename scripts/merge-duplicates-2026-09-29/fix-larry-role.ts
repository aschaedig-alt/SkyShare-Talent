// Finishes pair 2 of the Sep 29 merge: Lawrence Uzelac's generic "Pilot" role, moved onto Larry Uzelac, should
// have been removed as the duplicate of Larry's own "G200 Captain" (same start, same person). merge.ts matched it
// on an exact midnight start; Paycom-list records store another time of day, so it survived. Removed here by
// title on Larry's record; the merge's undo file already holds the role as it was, so undo is unaffected.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { prisma } from "../../lib/prisma";
(async () => {
  const larry = await prisma.newHire.findFirstOrThrow({ where: { name: "Larry Uzelac" }, select: { id: true } });
  const roles = await prisma.roleAssignment.findMany({ where: { newHireId: larry.id }, select: { id: true, title: true, startDate: true, endDate: true } });
  console.log(`before: ${roles.map((r) => `${r.title} ${r.startDate.toISOString()}..${r.endDate?.toISOString() ?? "open"}`).join(" | ")}`);
  const pilot = roles.filter((r) => r.title === "Pilot");
  if (pilot.length !== 1 || !roles.some((r) => r.title === "G200 Captain")) throw new Error("not the expected two roles - stopping");
  await prisma.roleAssignment.delete({ where: { id: pilot[0].id } });
  const after = await prisma.roleAssignment.findMany({ where: { newHireId: larry.id }, select: { title: true, startDate: true, endDate: true } });
  console.log(`after:  ${after.map((r) => `${r.title} ${r.startDate.toISOString().slice(0, 10)}..${r.endDate?.toISOString().slice(0, 10) ?? "open"}`).join(" | ")}`);
  await prisma.$disconnect();
})();
