import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";

/**
 * Work out ONE surviving pilot requirement per real role, and report it.
 *
 * Background: de-duplicating JOBS silently took the requirements with them. The
 * Pilot Requirements page hides any requirement whose source job was merged away,
 * and the merge never re-pointed the requirement at the surviving job — so 48 of
 * 60 disappeared, including every core fleet seat.
 *
 * Grouping is by fleetPositionSlug, which is the app's OWN canonical role id
 * (lib/fleet/positions.ts, generated from FLEET_POSITIONS.md). An earlier draft
 * of this script grouped by a hand-rolled title regex and got it wrong twice: it
 * merged "CJ Captain" into "CJ2 Captain" (Citation CJ and CJ2 are different
 * aircraft, both Active) and merged the archived 560XLS+ and PC-12 NG/NGX
 * positions into their active siblings. The slug already encodes all of that.
 *
 * This script only PLANS — it writes a review file and touches nothing.
 */

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const reviewRank: Record<string, number> = { APPROVED: 0, NEEDS_REVIEW: 1, DRAFT: 2 };

(async () => {
  const reqs = await prisma.pilotRequirement.findMany({
    include: {
      gates: { select: { enabled: true } },
      sourceJobRecord: { select: { id: true, title: true, status: true, mergedIntoJobId: true } },
      _count: { select: { applications: true, managedVariants: true } }
    }
  });

  // No slug means the app itself could not confidently say which role this is —
  // e.g. a bare "CE525" title, which is ambiguous between M2/CJ/CJ2 ON PURPOSE.
  // Those are left completely alone and reported, never auto-grouped.
  const unslugged = reqs.filter((r) => !r.fleetPositionSlug);
  const slugged = reqs.filter((r) => r.fleetPositionSlug);

  const groups = new Map<string, typeof reqs>();
  for (const r of slugged) {
    const key = r.fleetPositionSlug!;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("PILOT REQUIREMENT CONSOLIDATION — PROPOSED PLAN (nothing has been written)");
  push("=".repeat(78));
  push();
  push(`${reqs.length} requirements: ${slugged.length} carry a fleet position slug and collapse`);
  push(`into ${groups.size} real roles. ${unslugged.length} have no slug and are LEFT ALONE (end of file).`);
  push();
  push("KEEP   = stays, and is re-pointed at the surviving canonical job so it shows again.");
  push("RETIRE = status set to HISTORICAL. NOTHING IS DELETED — gates, history and");
  push("         applications stay attached, and apply.ts writes an undo file.");
  push();
  push("Keeper is chosen by: most gates actually turned on, then furthest through");
  push("review, then most recently updated.");
  push();

  let keepCount = 0;
  let retireCount = 0;
  let willBecomeVisible = 0;

  for (const [slug, members] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ranked = [...members].sort(
      (a, b) =>
        b.gates.filter((g) => g.enabled).length - a.gates.filter((g) => g.enabled).length ||
        (reviewRank[a.reviewStatus] ?? 3) - (reviewRank[b.reviewStatus] ?? 3) ||
        +b.updatedAt - +a.updatedAt
    );
    const keeper = ranked[0];
    keepCount += 1;
    retireCount += ranked.length - 1;
    if (keeper.sourceJobRecord?.mergedIntoJobId) willBecomeVisible += 1;

    push("-".repeat(78));
    push(`ROLE ${slug}   (${members.length} record${members.length === 1 ? "" : "s"})`);
    for (const r of ranked) {
      const on = r.gates.filter((g) => g.enabled).length;
      const hidden = r.sourceJobRecord?.mergedIntoJobId ? "  [hidden today]" : "";
      push(
        `  ${r === keeper ? "KEEP  " : "RETIRE"} ${r.title.slice(0, 44).padEnd(44)}` +
          ` gates ${String(on).padStart(2)}/${r.gates.length}` +
          ` ${r.reviewStatus.padEnd(12)} apps=${r._count.applications} variants=${r._count.managedVariants}${hidden}`
      );
    }
    const job = keeper.sourceJobRecord;
    push(`         keeper's job: ${job ? `"${job.title}" [${job.status}]` : "(none)"}`);
  }

  if (unslugged.length) {
    push();
    push("=".repeat(78));
    push("LEFT ALONE — no fleet position slug, so the app cannot say which role these are.");
    push("Neither is touched by apply.ts. Both need a human decision:");
    for (const r of unslugged) {
      const on = r.gates.filter((g) => g.enabled).length;
      push(`  ${r.title.padEnd(44)} gates ${on}/${r.gates.length} status=${r.status} roleCategory=${r.roleCategory}`);
    }
  }

  push();
  push("=".repeat(78));
  push(`SUMMARY: keep ${keepCount}, retire ${retireCount}, delete 0, leave alone ${unslugged.length}.`);
  push(`${willBecomeVisible} currently-hidden keepers become visible again.`);

  const out = "scripts/requirement-consolidation/PLAN.txt";
  writeFileSync(out, lines.join("\n"), "utf8");
  console.log(`roles: ${groups.size} | keep ${keepCount} | retire ${retireCount} | delete 0 | left alone ${unslugged.length}`);
  console.log(`${willBecomeVisible} hidden keepers become visible again`);
  console.log(`\nFull plan -> ${out}`);
  await prisma.$disconnect();
})();
