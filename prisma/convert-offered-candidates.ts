// Move 5 "offered but never hired" people off the employee roster and record
// them as offered candidates instead (per the user: "they were all offered
// candidates; note them as that only"). For each: create a Candidate at the
// "Offer" stage (offer/start dates preserved as a note), then delete the stray
// NewHire record (cascades its placeholder onboarding checklist).
//
//   npx tsx prisma/convert-offered-candidates.ts            (preview)
//   npx tsx prisma/convert-offered-candidates.ts --commit   (apply)

import { prisma } from "@/lib/prisma";
import { normalizeName, splitCandidateName } from "@/lib/candidates/normalize";

const IDS = [
  "cmr151pxc000j04jsg9717s0s", // Blake Gillespie
  "cmr151rsi001204js883hf4kk", // Brooks Furlong
  "cmr151s9i001l04jst4unim6x", // Chris Sharpe
  "cmr151sqc002404jsijmiclvv", // Fred Saadat
  "cmr151pfl000004jszuqyolpm" // James Behrens
];

const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

function noteBody(h: { offerSentDate: Date | null; offerSignedDate: Date | null; startDate: Date | null }): string {
  const parts: string[] = [];
  if (h.offerSentDate) parts.push(`offer extended ${d(h.offerSentDate)}`);
  if (h.offerSignedDate) parts.push(`offer signed ${d(h.offerSignedDate)}`);
  if (h.startDate) parts.push(`start was scheduled ${d(h.startDate)}`);
  const detail = parts.length ? `${parts.join("; ")}. ` : "";
  return `${detail}Did not start — recorded as an offered candidate (moved off the employee roster).`;
}

async function main() {
  const commit = process.argv.includes("--commit");
  const hires = await prisma.newHire.findMany({
    where: { id: { in: IDS } },
    select: { id: true, name: true, position: true, offerSentDate: true, offerSignedDate: true, startDate: true }
  });

  console.log(`${commit ? "APPLYING" : "DRY RUN"} — ${hires.length} of ${IDS.length} records found:\n`);

  for (const h of hires) {
    const { firstName, lastName, displayName } = splitCandidateName(h.name);
    console.log(`  ${h.name} → Candidate [Offer]  ${h.position ? `(${h.position}) ` : ""}note: ${noteBody(h)}`);
    if (!commit) continue;
    await prisma.$transaction(async (tx) => {
      const cand = await tx.candidate.create({
        data: {
          displayName,
          firstName,
          lastName,
          normalizedName: normalizeName(h.name),
          currentTitle: h.position,
          stage: "Offer",
          status: "ACTIVE",
          origin: "MANUAL",
          source: "Offered — not hired"
        }
      });
      await tx.candidateNote.create({ data: { candidateId: cand.id, body: noteBody(h), source: "system" } });
      await tx.newHire.delete({ where: { id: h.id } });
    });
  }

  const missing = IDS.filter((id) => !hires.some((h) => h.id === id));
  if (missing.length) console.log(`\n(${missing.length} id(s) not found — already converted or removed.)`);
  if (commit) console.log(`\n✓ Converted ${hires.length} record(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
