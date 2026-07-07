// Apply the user-chosen module-access matrix (Jul admin audit):
//   ADMIN         → Full everywhere (Settings locked to admin).
//   RECRUITER     → Full operator: Full on everything except Settings.
//   HIRING_MANAGER→ Reviewer + interview tools: View on the review surfaces,
//                   Full on Calendar/Scheduling/Interview Questions, back-office hidden.
//   VIEWER        → Restricted: View on Command Center + Reports only; rest hidden.
//   npx tsx prisma/set-access-policy.ts            (preview grid)
//   npx tsx prisma/set-access-policy.ts --commit   (apply)
import { moduleIds, type ModuleId } from "@/lib/navigation/modules";
import { saveWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";

const commit = process.argv.includes("--commit");
type Lvl = "Full" | "View" | "Hidden";

// [RECRUITER, HIRING_MANAGER, VIEWER] — ADMIN is always Full; Settings is force-locked.
const GRID: Record<ModuleId, [Lvl, Lvl, Lvl]> = {
  "command-center": ["Full", "View", "View"],
  candidates: ["Full", "View", "Hidden"],
  "recruiting-jobs": ["Full", "View", "Hidden"],
  "pilot-requirements": ["Full", "View", "Hidden"],
  matching: ["Full", "View", "Hidden"],
  calendar: ["Full", "Full", "Hidden"],
  scheduling: ["Full", "Full", "Hidden"],
  "interview-questions": ["Full", "Full", "Hidden"],
  imports: ["Full", "Hidden", "Hidden"],
  "duplicate-review": ["Full", "Hidden", "Hidden"],
  reports: ["Full", "View", "View"],
  archive: ["Full", "Hidden", "Hidden"],
  jobs: ["Full", "Hidden", "Hidden"],
  review: ["Full", "Hidden", "Hidden"],
  blocks: ["Full", "Hidden", "Hidden"],
  people: ["Full", "View", "Hidden"],
  settings: ["Hidden", "Hidden", "Hidden"] // admin Full applied by normalize
};

const rule = (l: Lvl) =>
  l === "Full"
    ? { showInSidebar: true, accessLevel: "FULL_ACCESS" as const }
    : l === "View"
      ? { showInSidebar: true, accessLevel: "VIEW_ONLY" as const }
      : { showInSidebar: false, accessLevel: "HIDDEN" as const };

async function main() {
  const policy = {} as Record<ModuleId, Record<string, ReturnType<typeof rule>>>;
  console.log("module".padEnd(20), "ADMIN".padEnd(7), "RECRUITER".padEnd(10), "HIRING_MGR".padEnd(11), "VIEWER");
  for (const m of moduleIds) {
    const [rec, hm, vw] = GRID[m];
    policy[m] = { ADMIN: rule("Full"), RECRUITER: rule(rec), HIRING_MANAGER: rule(hm), VIEWER: rule(vw) };
    const adm = m === "settings" ? "Full" : "Full";
    const r = m === "settings" ? "Hidden" : rec;
    const h = m === "settings" ? "Hidden" : hm;
    const v = m === "settings" ? "Hidden" : vw;
    console.log(m.padEnd(20), adm.padEnd(7), r.padEnd(10), h.padEnd(11), v);
  }

  if (commit) {
    await saveWorkspaceModuleAccessPolicy(policy as never);
    console.log("\nAPPLIED");
  } else {
    console.log("\nDRY RUN — re-run with --commit");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
