/**
 * Reconcile the 6 offer steps across their two homes.
 *
 * The SAME six offer keys (lib/offers/steps.ts OFFER_STEP_KEYS) live in two places:
 *   1. The candidate's application  -> CandidateApplication.offerStepsJson
 *   2. The linked new hire's checklist -> OnboardingTask rows, group "OFFER"
 *      (one row per key, status TODO | DONE | NA)
 *
 * A NewHire links to a candidate via NewHire.candidateId. A new two-way sync
 * (lib/offers/onboarding-sync.ts + lib/offers/record-offer-step.ts) keeps the two
 * in step going forward. But pairs that were linked / moved in BEFORE that sync
 * shipped can have DIVERGED: a step ticked on one side after the move never
 * reached the other. This script finds and (optionally) heals that drift.
 *
 * RECONCILIATION RULE = union / furthest-along, per step:
 *   if EITHER side shows a step done, it should be DONE on both. We never lose
 *   recorded progress. NA tasks are left exactly as-is (reported, never flipped) --
 *   NA means "not applicable", it is neither "done" (so it never pushes the offer
 *   side) nor a blocker (so an offer-done step never clobbers an NA task).
 *
 * USAGE (from project root):
 *   npx tsx ./scripts/reconcile-offer-onboarding.mts            # DRY RUN (default)
 *   npx tsx ./scripts/reconcile-offer-onboarding.mts --apply    # WRITE (heals drift)
 *
 * DRY RUN prints a per-person review + totals to stdout AND writes it to
 * scratchpad/offer-reconcile-review.txt. It writes NOTHING to the database.
 *
 * ---- On the --apply write path (do not run casually; this is a live DB) --------
 * For each step that should end DONE on both but currently is not, we reconcile in
 * the correct direction so audit/dates stay honest:
 *
 *   - OFFER AHEAD (offer step done, task still TODO): we set the TASK done via
 *     prisma.onboardingTask.updateMany, carrying the offer's ORIGINAL completion
 *     date onto the task. We deliberately do NOT round-trip through recordOfferStep
 *     here, because recordOfferStep re-stamps the offer step with "now" and would
 *     lose the real tick date.
 *
 *   - OFFER BEHIND (task done, offer step missing): we write the offer step through
 *     recordOfferStep -- the one audited path that stamps offerStatus, the timeline
 *     entry and the activity log via recordOfferStatus, and then mirrors back onto
 *     the (already-done) task idempotently.
 *
 * Note: because recordOfferStep now mirrors to the task automatically, a simpler
 * uniform implementation -- call recordOfferStep(appId, key, true) for every
 * newly-done step -- would also reconcile both sides. We avoid it only to preserve
 * the original offer-side date in the OFFER-AHEAD case and to never touch NA tasks.
 */
import { prisma } from "@/lib/prisma";
import { recordOfferStep } from "@/lib/offers/record-offer-step";
import { findOfferApplicationId } from "@/lib/offers/onboarding-sync";
import {
  OFFER_STEP_KEYS,
  OFFER_STEPS,
  parseOfferSteps,
  offerStepCompletedAt,
  type OfferStepKey
} from "@/lib/offers/steps";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const APPLY = process.argv.slice(2).includes("--apply");

const REVIEW_FILE =
  "C:/Users/Recruiter/AppData/Local/Temp/claude/C--Users-Recruiter-Projects-skyshare-talent-ops/777f167a-7dc2-4dd1-b3eb-0557b4b41b55/scratchpad/offer-reconcile-review.txt";

const LABEL: Record<OfferStepKey, string> = Object.fromEntries(
  OFFER_STEPS.map((s) => [s.key, s.label])
) as Record<OfferStepKey, string>;

type Direction = "TASK_TO_DONE" | "OFFER_TO_DONE";

type StepPlan = {
  key: OfferStepKey;
  label: string;
  offerDone: boolean;
  taskStatus: string | null; // null = no task row for this key
  direction: Direction;
  wouldDo: string;
  offerDate: Date | null;
};

type PersonReport = {
  hireId: string;
  hireName: string;
  candidateId: string;
  candidateName: string;
  applicationId: string | null;
  diverged: StepPlan[];
  naNotes: string[]; // NA disagreements we surface but never flip
  noAppNote: string | null;
};

const out: string[] = [];
const log = (line = "") => {
  out.push(line);
  // eslint-disable-next-line no-console
  console.log(line);
};

async function main() {
  log(`Offer <-> onboarding reconciliation  (${APPLY ? "APPLY / WRITE" : "DRY RUN"})`);
  log(`Run at ${new Date().toISOString()}`);
  log("");

  // 1. Every new hire that is linked to a candidate.
  const hires = await prisma.newHire.findMany({
    where: { candidateId: { not: null } },
    select: { id: true, name: true, candidateId: true }
  });

  // 2. Candidate display names, in bulk (NewHire has no candidate relation field).
  const candidateIds = Array.from(new Set(hires.map((h) => h.candidateId).filter(Boolean))) as string[];
  const candidates = await prisma.candidate.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, displayName: true }
  });
  const candidateName = new Map(candidates.map((c) => [c.id, c.displayName]));

  const reports: PersonReport[] = [];
  let pairsScanned = 0;
  let pairsWithNoApp = 0;
  let stepsToReconcile = 0;
  let naDisagreements = 0;

  for (const hire of hires) {
    const candidateId = hire.candidateId as string;

    // OFFER-group onboarding tasks for this hire. A "pair" requires OFFER task rows.
    const tasks = await prisma.onboardingTask.findMany({
      where: { newHireId: hire.id, group: "OFFER" },
      select: { key: true, status: true }
    });
    if (tasks.length === 0) continue; // not a pair (no OFFER checklist rows)

    pairsScanned++;

    const taskStatusByKey = new Map(tasks.map((t) => [t.key, t.status]));

    // The application that carries the offer -- furthest-along one, mirroring
    // findOfferApplicationId used by the live sync.
    const applicationId = await findOfferApplicationId(candidateId);
    let offerSteps = {} as ReturnType<typeof parseOfferSteps>;
    if (applicationId) {
      const app = await prisma.candidateApplication.findUnique({
        where: { id: applicationId },
        select: { offerStepsJson: true }
      });
      offerSteps = parseOfferSteps(app?.offerStepsJson);
    }

    const report: PersonReport = {
      hireId: hire.id,
      hireName: hire.name,
      candidateId,
      candidateName: candidateName.get(candidateId) ?? "(unknown candidate)",
      applicationId,
      diverged: [],
      naNotes: [],
      noAppNote: null
    };

    if (!applicationId) {
      pairsWithNoApp++;
      report.noAppNote =
        "Linked hire but candidate has NO application to hold the offer -- offer side cannot be compared or written.";
    }

    for (const key of OFFER_STEP_KEYS) {
      const offerDone = Boolean(offerSteps[key]);
      const taskStatus = taskStatusByKey.get(key) ?? null; // null = no row for this key
      const taskDone = taskStatus === "DONE";
      const taskNA = taskStatus === "NA";

      // NA is left as-is. Report a disagreement only when the offer side is done
      // against an NA task (that is the only informative NA case).
      if (taskNA) {
        if (offerDone) {
          naDisagreements++;
          report.naNotes.push(
            `  [NA-KEEP] ${LABEL[key]}: offer=DONE but task=NA -> left NA (not flipped)`
          );
        }
        continue;
      }

      if (offerDone === taskDone) continue; // agree -> nothing to do

      // Disagreement on a non-NA task. Union rule: the loser becomes DONE.
      if (offerDone && !taskDone) {
        // OFFER AHEAD -> flip the task to DONE (carry the offer's original date).
        stepsToReconcile++;
        report.diverged.push({
          key,
          label: LABEL[key],
          offerDone,
          taskStatus,
          direction: "TASK_TO_DONE",
          offerDate: offerStepCompletedAt(offerSteps, key),
          wouldDo: `task ${taskStatus ?? "(missing row)"} -> DONE  (offer already DONE; task side via onboardingTask.updateMany)`
        });
      } else {
        // OFFER BEHIND -> write the offer step via recordOfferStep (audited).
        // Only possible when we actually have an application to write to.
        stepsToReconcile++;
        report.diverged.push({
          key,
          label: LABEL[key],
          offerDone,
          taskStatus,
          direction: "OFFER_TO_DONE",
          offerDate: null,
          wouldDo: applicationId
            ? `offer step -> DONE  (task already DONE; offer side via recordOfferStep, mirrors back to task)`
            : `offer step -> DONE  BLOCKED: no application to write to (task is DONE, offer store missing)`
        });
      }
    }

    if (report.diverged.length > 0 || report.naNotes.length > 0 || report.noAppNote) {
      reports.push(report);
    }
  }

  // ---- Per-person review -------------------------------------------------------
  log("================ PER-PERSON REVIEW ================");
  if (reports.length === 0) {
    log("No divergences found. Every linked pair already agrees.");
  }
  for (const r of reports) {
    log("");
    log(`* ${r.candidateName}   (hire ${r.hireId})`);
    log(`  hire name: ${r.hireName}   candidateId: ${r.candidateId}`);
    log(`  application: ${r.applicationId ?? "(none)"}`);
    if (r.noAppNote) log(`  ! ${r.noAppNote}`);
    for (const d of r.diverged) {
      log(`  - ${d.key} (${d.label})`);
      log(`      offer=${d.offerDone ? "DONE" : "not-done"}  task=${d.taskStatus ?? "(no row)"}`);
      log(`      WOULD ${APPLY ? "APPLY" : "(dry-run)"}: ${d.wouldDo}`);
    }
    for (const n of r.naNotes) log(n);
  }

  // ---- Totals ------------------------------------------------------------------
  log("");
  log("==================== TOTALS =======================");
  log(`Linked hires with candidateId set ............. ${hires.length}`);
  log(`Pairs scanned (linked hire + OFFER tasks) ..... ${pairsScanned}`);
  log(`Pairs with at least one divergence ............ ${reports.filter((r) => r.diverged.length > 0).length}`);
  log(`Steps to reconcile (non-NA disagreements) ..... ${stepsToReconcile}`);
  log(`  - offer ahead (flip task -> DONE) ........... ${countDir(reports, "TASK_TO_DONE")}`);
  log(`  - offer behind (flip offer -> DONE) ......... ${countDir(reports, "OFFER_TO_DONE")}`);
  log(`  - of those, BLOCKED (offer behind, no app) .. ${countBlocked(reports)}`);
  log(`NA disagreements (reported, never flipped) .... ${naDisagreements}`);
  log(`Pairs with NO candidate application ........... ${pairsWithNoApp}`);
  log("");

  if (!APPLY) {
    log("DRY RUN -- nothing was written. Re-run with --apply to heal the drift above.");
  }

  // Persist review file (both dry-run and apply, so there's an audit trail).
  try {
    mkdirSync(dirname(REVIEW_FILE), { recursive: true });
    writeFileSync(REVIEW_FILE, out.join("\n"), "utf8");
    // eslint-disable-next-line no-console
    console.log(`\nReview written to ${REVIEW_FILE}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`Could not write review file: ${String(e)}`);
  }

  // ---- Write path (gated) ------------------------------------------------------
  if (APPLY) {
    console.log("\nApplying reconciliation...");
    const actor = { email: "reconcile-offer-onboarding-script" };
    let applied = 0;
    for (const r of reports) {
      for (const d of r.diverged) {
        if (d.direction === "TASK_TO_DONE") {
          await prisma.onboardingTask.updateMany({
            where: { newHireId: r.hireId, key: d.key },
            data: { status: "DONE", completedAt: d.offerDate ?? new Date() }
          });
          applied++;
        } else if (d.direction === "OFFER_TO_DONE" && r.applicationId) {
          await recordOfferStep(r.applicationId, d.key, true, actor);
          applied++;
        }
        // BLOCKED cases (offer behind, no application) are skipped -- nothing to write to.
      }
    }
    console.log(`Applied ${applied} step reconciliations.`);
  }
}

function countDir(reports: PersonReport[], dir: Direction): number {
  return reports.reduce((n, r) => n + r.diverged.filter((d) => d.direction === dir).length, 0);
}
function countBlocked(reports: PersonReport[]): number {
  return reports.reduce(
    (n, r) => n + r.diverged.filter((d) => d.direction === "OFFER_TO_DONE" && !r.applicationId).length,
    0
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
