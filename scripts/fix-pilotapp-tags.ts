/**
 * One-off correction of pilot-application Front tags, on the user's instruction
 * of Aug 7.
 *
 *   npx tsx scripts/fix-pilotapp-tags.ts                 # dry run, writes nothing
 *   npx tsx scripts/fix-pilotapp-tags.ts --apply --limit 10
 *   npx tsx scripts/fix-pilotapp-tags.ts --apply
 *   npx tsx scripts/fix-pilotapp-tags.ts --undo --apply
 *
 * TWO CORRECTIONS:
 *
 * 1. ADD "Candidate Created by App" where the app created the candidate. The tag
 *    did not exist until Aug 7, so every person the scanner created before then
 *    — including the whole Jul 27 backfill — is unmarked, and there is no way to
 *    tell from Front which records came from a person and which from a job.
 *
 * 2. REMOVE "Manually Added to ATS" where THE APP applied it. That tag means a
 *    human put the application into Paycom. The scanner used to set it on every
 *    successful filing, which read as that having happened when all the app had
 *    done was attach the PDF on this side.
 *
 * PROVENANCE IS ESTABLISHED, NOT GUESSED. Front's conversation events name the
 * actor behind every tag as api, teammate or rule, so removal touches only what
 * the API added. Measured before writing: of 443 threads carrying that tag, 422
 * were tagged by a TEAMMATE and are left completely alone; 21 were the app's.
 * A heuristic here would have deleted 422 of Hannah's own markers.
 *
 * Reversible: --undo puts back exactly what this removed and removes exactly
 * what it added, from the same plan file.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { frontFetch, getConversationTagNames, addTags, removeTags, resolveTagIdByNames } from "../lib/front";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const li = process.argv.indexOf("--limit");
const LIMIT = li >= 0 ? Number(process.argv[li + 1]) : Infinity;
const PLAN = "scripts/out/pilotapp-tag-fix.json";

const ATS_NAMES = ["Manually Added to ATS", "manually added to ats"];
const CREATED_NAMES = ["Candidate Created by App", "candidate created by app"];
const ATS = ATS_NAMES[0].toLowerCase();
const CREATED = CREATED_NAMES[0].toLowerCase();

type Ev = { type?: string; emitted_at?: number; source?: { type?: string; _meta?: { type?: string } }; target?: { data?: { name?: string } } };
/** Front nests the actor under source._meta.type, NOT source.type. Reading the
    wrong one yields undefined for every event and a confident, wrong zero. */
const actorOf = (e: Ev): string => e.source?._meta?.type ?? e.source?.type ?? "unknown";

type Plan = { addCreated: Array<{ cid: string; name: string }>; removeAts: Array<{ cid: string; name: string; when: string }> };

async function build(): Promise<Plan> {
  const files = await prisma.candidateFile.findMany({
    where: { source: "front-pilot-application" },
    select: { metadataJson: true, candidate: { select: { displayName: true, source: true } } }
  });
  const threads = new Map<string, { name: string; appCreated: boolean }>();
  for (const f of files) {
    let cid: string | undefined;
    try { cid = (JSON.parse(f.metadataJson ?? "{}") as { frontConversationId?: string }).frontConversationId; } catch { /* ignore */ }
    if (!cid) continue;
    const appCreated = f.candidate?.source === "Pilot application (Adobe Sign)";
    const prev = threads.get(cid);
    threads.set(cid, { name: f.candidate?.displayName ?? "?", appCreated: appCreated || Boolean(prev?.appCreated) });
  }
  console.log(`threads with a filed pilot application: ${threads.size}`);

  const addCreated: Plan["addCreated"] = [];
  const removeAts: Plan["removeAts"] = [];
  let n = 0;
  for (const [cid, info] of threads) {
    if (++n % 100 === 0) console.log(`  ...${n}/${threads.size}`);
    let tags: string[];
    try { tags = (await getConversationTagNames(cid)).map((t) => t.trim().toLowerCase()); } catch { continue; }

    if (info.appCreated && !tags.includes(CREATED)) addCreated.push({ cid, name: info.name });

    if (tags.includes(ATS)) {
      try {
        const ev = await frontFetch<{ _results?: Ev[] }>(`/conversations/${cid}/events`);
        const hits = (ev?._results ?? []).filter((e) => e.type === "tag" && e.target?.data?.name?.trim().toLowerCase() === ATS);
        if (!hits.length) continue; // no evidence it was the app — leave it
        hits.sort((a, b) => (a.emitted_at ?? 0) - (b.emitted_at ?? 0));
        if (actorOf(hits[0]) === "api") {
          removeAts.push({ cid, name: info.name, when: new Date((hits[0].emitted_at ?? 0) * 1000).toISOString() });
        }
      } catch {
        /* unreadable events means unproven — leave the tag alone */
      }
    }
  }
  return { addCreated, removeAts };
}

async function main() {
  const createdId = await resolveTagIdByNames(CREATED_NAMES);
  const atsId = await resolveTagIdByNames(ATS_NAMES);
  if (!createdId || !atsId) throw new Error(`tag not found in Front: created=${createdId} ats=${atsId}`);

  if (UNDO) {
    if (!existsSync(PLAN)) throw new Error(`no plan file at ${PLAN} — nothing to undo`);
    const plan = JSON.parse(readFileSync(PLAN, "utf8")) as Plan;
    console.log(`UNDO: removing the created tag from ${plan.addCreated.length}, restoring ATS on ${plan.removeAts.length}`);
    if (!APPLY) { console.log("Dry run. Add --apply."); return; }
    for (const r of plan.addCreated) await removeTags(r.cid, [createdId]);
    for (const r of plan.removeAts) await addTags(r.cid, [atsId]);
    console.log("Undone.");
    return;
  }

  const plan = await build();
  console.log(`\nWOULD ADD "Candidate Created by App" to : ${plan.addCreated.length} threads`);
  console.log(`WOULD REMOVE "Manually Added to ATS" from: ${plan.removeAts.length} threads (app-applied only)`);
  for (const r of plan.removeAts) console.log(`    ${r.cid}  ${r.name}  (app tagged it ${r.when})`);
  writeFileSync(PLAN, JSON.stringify(plan, null, 2));
  console.log(`\nPlan written to ${PLAN} — this is the undo list.`);

  if (!APPLY) { console.log("\nDRY RUN. Nothing written. Add --apply."); return; }

  let added = 0, removed = 0;
  for (const r of plan.addCreated.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
    try { await addTags(r.cid, [createdId]); added++; } catch (e) { console.log(`  FAILED add ${r.cid}: ${String((e as Error).message)}`); }
  }
  for (const r of plan.removeAts.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
    try { await removeTags(r.cid, [atsId]); removed++; } catch (e) { console.log(`  FAILED remove ${r.cid}: ${String((e as Error).message)}`); }
  }
  console.log(`\nADDED the created tag to ${added}. REMOVED the ATS tag from ${removed}.`);
}

main().catch((e) => { console.log("ERROR: " + String(e?.message ?? e)); process.exit(1); }).finally(() => prisma.$disconnect());
