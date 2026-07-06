// Stronger (fuzzy) duplicate scan over the whole NewHire roster — catches the
// vowel/spelling variants the exact-last-name scan misses (Rozie/Rozella,
// Yousef/Youssef, Sexton/Sexson, Arhibald/Archibald). Read-only. Pairs are tiered
// by confidence: HIGH = similar name AND a shared start date (near-certain same
// person); REVIEW = similar name only (could be two different people).
//   npx tsx prisma/scan-fuzzy-duplicates.ts
import { prisma } from "@/lib/prisma";

const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const DAY = 24 * 60 * 60 * 1000;

const NICK: Record<string, string> = {
  chris: "christopher", kris: "christopher", ben: "benjamin", nick: "nicholas", nico: "nicholas", will: "william",
  bill: "william", alex: "alexander", matt: "matthew", josh: "joshua", rob: "robert", robbie: "robert", mike: "michael",
  mickey: "michael", dan: "daniel", danny: "daniel", tom: "thomas", jake: "jacob", andy: "andrew", drew: "andrew",
  katie: "katherine", joe: "joseph", jim: "james", greg: "gregory", sam: "samuel", dave: "david", steve: "steven",
  tony: "anthony", rick: "richard", ricky: "richard", rich: "richard", pat: "patrick", jon: "jonathan", zach: "zachary",
  nate: "nathan", cam: "cameron", fred: "frederick", dash: "dashiell", phil: "philip", tim: "timothy", gabe: "gabriel"
};
const canonFirst = (f: string) => NICK[f] ?? f;
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
function firstRelated(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (canonFirst(a) === canonFirst(b)) return true;
  if (lev(a, b) <= 1) return true;
  return a.length >= 4 && b.length >= 4 && a.slice(0, 3) === b.slice(0, 3); // catches Rozie/Rozella
}
function lastClose(a: string, b: string) {
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && lev(a, b) <= 1; // Yousef/Youssef, Sexton/Sexson
}

async function main() {
  const rows = await prisma.newHire.findMany({
    select: { id: true, name: true, employmentStatus: true, stage: true, startDate: true, position: true, _count: { select: { roleAssignments: true, employmentStints: true } } }
  });
  const people = rows.map((r) => { const p = norm(r.name).split(" "); return { r, first: p[0] ?? "", last: p.length > 1 ? p[p.length - 1] : "" }; }).filter((x) => x.last);

  type Pair = { a: typeof people[number]; b: typeof people[number]; high: boolean };
  const pairs: Pair[] = [];
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j];
      if (norm(a.r.name) === norm(b.r.name)) { pairs.push({ a, b, high: true }); continue; } // exact (shouldn't remain, but flag)
      if (!lastClose(a.last, b.last)) continue;
      if (!firstRelated(a.first, b.first)) continue;
      const sameStart = !!(a.r.startDate && b.r.startDate && Math.abs(a.r.startDate.getTime() - b.r.startDate.getTime()) <= 5 * DAY);
      const strongFirst = a.first === b.first || canonFirst(a.first) === canonFirst(b.first) || (a.first.length >= 3 && (a.first.startsWith(b.first) || b.first.startsWith(a.first)));
      pairs.push({ a, b, high: sameStart || (a.last === b.last && strongFirst) });
    }

  pairs.sort((x, y) => Number(y.high) - Number(x.high) || x.a.last.localeCompare(y.a.last));
  const line = (m: typeof people[number]) => `${m.r.name} [${m.r.employmentStatus}] ${m.r.position ?? "—"} · start ${d(m.r.startDate)} · roles ${m.r._count.roleAssignments} stints ${m.r._count.employmentStints}  ${m.r.id}`;
  const high = pairs.filter((p) => p.high), low = pairs.filter((p) => !p.high);
  const dump = (label: string, list: Pair[]) => {
    console.log(`\n${label} (${list.length}):`);
    for (const p of list) { console.log(`  • ${p.a.r.name}  ↔  ${p.b.r.name}${p.a.r.startDate && p.b.r.startDate && Math.abs(p.a.r.startDate.getTime() - p.b.r.startDate.getTime()) <= 5 * DAY ? "   (same start)" : ""}`); console.log(`      A ${line(p.a)}`); console.log(`      B ${line(p.b)}`); }
  };
  console.log(`Fuzzy scan of ${people.length} employees — ${high.length} likely duplicate(s), ${low.length} name-similar to review`);
  dump("LIKELY DUPLICATES (shared start / strong name match)", high);
  dump("NAME-SIMILAR — probably different people, eyeball", low);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
