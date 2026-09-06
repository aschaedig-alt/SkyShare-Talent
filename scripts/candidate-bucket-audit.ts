/**
 * READ-ONLY. Sizes the six candidate buckets against live data, and reports how
 * well the Paycom "Hiring Metrics" CSV would match existing people and jobs.
 *
 *   npx tsx scripts/candidate-bucket-audit.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { prisma } from "@/lib/prisma";

function norm(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

async function main() {
  const [candTotal, byOrigin, byStatus, appTotal, appByOrigin, jobCount] = await Promise.all([
    prisma.candidate.count(),
    prisma.candidate.groupBy({ by: ["origin"], _count: true }),
    prisma.candidate.groupBy({ by: ["status"], _count: true }),
    prisma.candidateApplication.count(),
    prisma.candidateApplication.groupBy({ by: ["origin"], _count: true }),
    prisma.job.count()
  ]);

  console.log("=== CANDIDATES ===");
  console.log("total:", candTotal);
  console.log("by origin:", byOrigin.map((r) => `${r.origin}=${r._count}`).join("  "));
  console.log("by status:", byStatus.map((r) => `${r.status}=${r._count}`).join("  "));

  console.log("\n=== APPLICATIONS ===");
  console.log("total:", appTotal);
  console.log("by origin:", appByOrigin.map((r) => `${r.origin}=${r._count}`).join("  "));

  const withJob = await prisma.candidateApplication.count({ where: { jobId: { not: null } } });
  console.log("linked to a Job row:", withJob, "/", appTotal);

  const disp = await prisma.candidateApplication.groupBy({ by: ["disposition"], _count: true });
  console.log("\ndispositions stored today:");
  disp.sort((a, b) => b._count - a._count).forEach((r) => console.log(`  ${String(r._count).padStart(5)}  ${JSON.stringify(r.disposition)}`));

  const st = await prisma.candidateApplication.groupBy({ by: ["status"], _count: true });
  console.log("\napplication.status stored today:");
  st.sort((a, b) => b._count - a._count).forEach((r) => console.log(`  ${String(r._count).padStart(5)}  ${JSON.stringify(r.status)}`));

  // How many candidates have ZERO applications — the ones a bucket rule can't reach.
  const noApps = await prisma.candidate.count({ where: { applications: { none: {} } } });
  console.log("\ncandidates with NO application rows:", noApps);

  console.log("\n=== JOBS ===");
  console.log("total jobs:", jobCount);
  const jobs = await prisma.job.findMany({ select: { id: true, title: true, status: true } });
  const jobByNorm = new Map<string, { title: string; status: string | null }>();
  for (const j of jobs) jobByNorm.set(norm(j.title), { title: j.title, status: j.status });

  // CSV role match
  const fs = await import("node:fs");
  const raw = fs.readFileSync("C:/Users/Recruiter/Downloads/Hiring Metrics - Sheet9.csv", "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  lines.shift();
  const rows = lines.map((l) => {
    const p: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < l.length; i++) { const c = l[i];
      if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ",") { p.push(cur); cur = ""; } else cur += c; }
    p.push(cur); return p;
  });

  const csvRoles = new Set(rows.map((r) => (r[1] || "").trim()).filter(Boolean));
  const matchedRoles = [...csvRoles].filter((r) => jobByNorm.has(norm(r)));
  const unmatchedRoles = [...csvRoles].filter((r) => !jobByNorm.has(norm(r)));
  console.log(`CSV roles matching a Job by exact normalized title: ${matchedRoles.length}/${csvRoles.size}`);
  console.log("UNMATCHED roles:");
  unmatchedRoles.forEach((r) => console.log("   ", r));

  // CSV name match against candidates
  const cands = await prisma.candidate.findMany({ select: { id: true, displayName: true, origin: true } });
  const byName = new Map<string, string[]>();
  for (const c of cands) {
    const k = norm(c.displayName || "");
    if (!k) continue;
    byName.set(k, [...(byName.get(k) ?? []), c.id]);
  }
  const csvNames = new Set(rows.map((r) => (r[0] || "").trim()).filter(Boolean));
  let exactOne = 0, ambiguous = 0, missing = 0;
  const missingSample: string[] = [];
  const ambiguousSample: string[] = [];
  for (const n of csvNames) {
    const hit = byName.get(norm(n));
    if (!hit) { missing++; if (missingSample.length < 10) missingSample.push(n); }
    else if (hit.length === 1) exactOne++;
    else { ambiguous++; if (ambiguousSample.length < 10) ambiguousSample.push(`${n} (${hit.length})`); }
  }
  console.log(`\n=== CSV NAME MATCH (${csvNames.size} distinct names) ===`);
  console.log("unique match :", exactOne);
  console.log("AMBIGUOUS    :", ambiguous, ambiguousSample);
  console.log("no match     :", missing, missingSample);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
