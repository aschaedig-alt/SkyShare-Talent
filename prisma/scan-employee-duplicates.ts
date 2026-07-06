// Read-only scan of the employee (NewHire) roster for likely duplicate people —
// exact name repeats and nickname/spelling variants (Chris/Christopher,
// Ben/Benjamin, etc.). Prints candidate pairs with the attributes needed to
// decide which record to keep. Merges nothing.
//   npx tsx prisma/scan-employee-duplicates.ts
import { prisma } from "@/lib/prisma";

const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

// nickname -> canonical first name
const NICK: Record<string, string> = {
  chris: "christopher", kris: "christopher", ben: "benjamin", benji: "benjamin", nick: "nicholas", nico: "nicholas",
  will: "william", bill: "william", billy: "william", alex: "alexander", matt: "matthew", josh: "joshua",
  rob: "robert", robbie: "robert", bob: "robert", mike: "michael", mick: "michael", mickey: "michael",
  dan: "daniel", danny: "daniel", tom: "thomas", tommy: "thomas", jake: "jacob", andy: "andrew", drew: "andrew",
  katie: "katherine", kate: "katherine", caiden: "caiden", joe: "joseph", jim: "james", jimmy: "james",
  greg: "gregory", sam: "samuel", dave: "david", steve: "steven", tony: "anthony", charlie: "charles",
  rick: "richard", ricky: "richard", rich: "richard", pat: "patrick", ken: "kenneth", jon: "jonathan",
  johnny: "john", zach: "zachary", gabe: "gabriel", nate: "nathan", nathaniel: "nathan", cam: "cameron",
  brad: "bradley", fred: "frederick", teren: "terence", ren: "ren", jeremy: "jeremy", jermey: "jeremy"
};
const canonFirst = (f: string) => NICK[f] ?? f;

function firstsRelated(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return canonFirst(a) === canonFirst(b);
}

async function main() {
  const rows = await prisma.newHire.findMany({
    select: {
      id: true, name: true, stage: true, employmentStatus: true, startDate: true, terminationDate: true,
      position: true, candidateId: true, _count: { select: { roleAssignments: true, employmentStints: true, travelTrips: true } }
    }
  });

  type R = (typeof rows)[number] & { first: string; last: string };
  const people: R[] = rows.map((r) => {
    const parts = norm(r.name).split(" ");
    return { ...r, first: parts[0] ?? "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
  });

  // Group by last name, compare first names within the group.
  const byLast = new Map<string, R[]>();
  for (const p of people) {
    const list = byLast.get(p.last) ?? [];
    list.push(p);
    byLast.set(p.last, list);
  }

  type Pair = { a: R; b: R; exact: boolean };
  const pairs: Pair[] = [];
  for (const group of byLast.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (!a.last) continue; // single-name records
        if (firstsRelated(a.first, b.first)) pairs.push({ a, b, exact: norm(a.name) === norm(b.name) });
      }
    }
  }

  const richness = (r: R) => r._count.roleAssignments * 3 + r._count.employmentStints * 2 + r._count.travelTrips + (r.candidateId ? 1 : 0) + (r.startDate ? 1 : 0);
  pairs.sort((x, y) => Number(y.exact) - Number(x.exact) || x.a.last.localeCompare(y.a.last));

  console.log(`${pairs.length} candidate duplicate pair(s):\n`);
  const line = (r: R) => `${r.name} [${r.employmentStatus}/${r.stage}] ${r.position ?? "—"} · start ${d(r.startDate)} · roles ${r._count.roleAssignments} stints ${r._count.employmentStints} trips ${r._count.travelTrips}${r.candidateId ? " · has-candidate" : ""}`;
  for (const p of pairs) {
    const keep = richness(p.a) >= richness(p.b) ? p.a : p.b;
    console.log(`${p.exact ? "EXACT " : "VARIANT"} — keep richer: ${keep.name}`);
    console.log(`   A ${line(p.a)}   ${p.a.id}`);
    console.log(`   B ${line(p.b)}   ${p.b.id}`);
    console.log("");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
