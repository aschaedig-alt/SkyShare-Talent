/**
 * READ-ONLY check of the candidate search patterns (lib/candidates/search/query.ts)
 * in BOTH engines they run in - Postgres (~*) finds the people, JavaScript marks
 * the words - against the spellings pilots actually write. Writes nothing.
 *
 *   npx tsx scripts/check-candidate-search.ts
 *
 * Run it after changing the query language, the aircraft list, or the patterns.
 * Exits non-zero on any failure.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { prisma } from "../lib/prisma";
import { parseSearch, parsePlaces, EXPERIENCE_PLACES, ALL_PLACES } from "../lib/candidates/search/query";

// query, text the first term MUST match, text it must NOT match
const CASES: Array<[string, string[], string[]]> = [
  [
    "challenger 350",
    ["Currently Operating as PIC/SIC Challenger 300/350 under", "CL-350 SIC", "cl350", "CL 350", "BD-100", "Challenger 300", "CL-30 type rating", "CHALLENGER350", "Type Rated Pilot in CL35/300"],
    ["Challenger 604", "phone 3852350111", "1stChallenger 350"]
  ],
  ['"challenger 350"', ["Challenger 350", "challenger-350", "Challenger 300/350"], ["Challenger 300", "CL350"]],
  ["capt", ["Captain", "CAPTAINS"], ["escaped", "Kapt"]],
  ["350", ["350 hrs", "CL350", "Challenger 300/350"], ["3500", "3852350111"]],
  ["pc 12", ["PC-12 NG", "pc12", "Pilatus PC 12"], ["PC-24", "PC-120"]],
  ["king air 350", ["King Air 350", "KingAir 350", "BE-350"], ["King Air 200"]],
  ["g450", ["G450", "G-450", "Gulfstream G350"], ["G4500", "G550"]],
  ["385-229-7212", ["(385) 229-7212", "3852297212"], ["38522972120"]],
  ["hunter@gmail", ["hunter@gmail.com"], ["hunter at gmail"]]
];

async function pg(text: string, pattern: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ m: boolean }>>(`select $1 ~* $2 as m`, text, pattern);
  return rows[0].m;
}

async function main() {
  let failures = 0;
  const fail = (message: string) => {
    failures += 1;
    console.log(`FAIL ${message}`);
  };

  for (const [query, yes, no] of CASES) {
    const term = parseSearch(query).groups[0]?.[0];
    if (!term) {
      fail(`${query}: did not parse to a term`);
      continue;
    }
    const re = new RegExp(term.pattern, "i");
    for (const text of yes) {
      const [js, db] = [re.test(text), await pg(text, term.pattern)];
      if (!js || !db) fail(`${query} should match "${text}" (js ${js}, postgres ${db})`);
    }
    for (const text of no) {
      const [js, db] = [re.test(text), await pg(text, term.pattern)];
      if (js || db) fail(`${query} should NOT match "${text}" (js ${js}, postgres ${db})`);
    }
  }

  const parsed = parseSearch('challenger 350 -pilatus cl605 OR "global express" resume:"first officer" -jobs:captain');
  const shape = JSON.stringify({
    groups: parsed.groups.map((group) => group.map((t) => `${t.kind}:${t.text}${t.places ? `@${t.places}` : ""}`)),
    exclude: parsed.exclude.map((t) => `${t.kind}:${t.text}${t.places ? `@${t.places}` : ""}`)
  });
  const want = JSON.stringify({
    groups: [["aircraft:challenger 350"], ["aircraft:cl605", "phrase:global express"], ["phrase:first officer@resume"]],
    exclude: ["word:pilatus", "word:captain@jobs"]
  });
  if (shape !== want) fail(`the full grammar parsed as ${shape}`);

  if (parsePlaces(["resume", "experience"]).join() !== EXPERIENCE_PLACES.join()) fail("the Experience preset does not win over ticks");
  if (parsePlaces(["all", "notes"]).join() !== ALL_PLACES.join()) fail("the Everywhere preset does not win over ticks");
  if (parsePlaces([]).join() !== ALL_PLACES.join()) fail("no places ticked should mean everywhere");

  console.log(failures ? `${failures} FAILURE(S)` : `ALL PASS - ${CASES.length} queries in both engines, the grammar, and the presets`);
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
