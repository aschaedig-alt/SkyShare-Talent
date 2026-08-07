/**
 * READ ONLY preview of what the nightly pilot-application sweep would do.
 *
 *   npx tsx scripts/pilot-app-dry-run.ts
 *
 * apply:false, so nothing is downloaded, attached, commented on or created. It
 * exists because the equivalent HTTP route needs a logged-in browser session -
 * requireApiPermission reads the NextAuth session, so curl gets a flat 401 - and
 * "check before the unattended run writes people into a shared database" should
 * not depend on having a browser open.
 *
 * WHY THIS DERIVES THE CREATE LIST RATHER THAN READING IT: createMissing is a
 * NO-OP on a dry run. scanPilotApplications returns before its write block, so
 * createdCandidates is never populated and passing the flag changes nothing. The
 * list below is therefore rebuilt from the SAME three conditions the real
 * creation gate uses - outcome no-match, a signer name, and a signer email - so
 * it says what the real run will do rather than what a flag reported.
 *
 * ENV: FRONT_API_TOKEN lives ONLY in .env.local while DATABASE_URL lives in
 * .env, and dotenv/config reads .env alone. Both are loaded explicitly below,
 * .env.local first so it wins. Without that this reports zero threads and looks
 * like a quiet inbox.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { scanPilotApplications, windowedQuery, SCAN_WINDOW_DAYS } from "../lib/pilotapp/scan";

async function main() {
  if (!process.env.FRONT_API_TOKEN) {
    console.log("NO FRONT_API_TOKEN — refusing to report an empty result as a real one.");
    process.exit(1);
  }
  console.log(`QUERY: ${windowedQuery(SCAN_WINDOW_DAYS)}\n`);

  const report = await scanPilotApplications({ apply: false, maxConversations: 400 });

  console.log(`threads scanned : ${report.conversationsScanned}`);
  console.log(`notices found   : ${report.noticesFound}`);
  console.log(`outcome tally   : ${JSON.stringify(report.tally)}\n`);

  const wouldCreate = report.results.filter((r) => r.outcome === "no-match" && r.signerName && r.signerEmail);
  console.log(`WOULD CREATE ${wouldCreate.length}:`);
  for (const r of wouldCreate) console.log(`  ${r.signerName}  <${r.signerEmail}>`);

  // POSITIVE CONTROLS. An empty create-list has to be provably empty rather than
  // a broken query, so the same run reports what it DID resolve.
  //
  // The outcome names are TYPED (PilotAppOutcome) rather than loose strings on
  // purpose: an earlier version of this script tested for "ambiguous", which is
  // not one of the values — the real name is "ambiguous-match" — so it reported
  // a confident "0 ambiguous" that could never have been anything else. The
  // typecheck catches that; a bare string comparison would not have.
  const already = report.results.filter((r) => r.outcome === "already-attached");
  const matched = report.results.filter((r) => r.outcome === "attached" || r.candidateId);
  const refused = report.results.filter(
    (r) => r.outcome === "ambiguous-match" || r.outcome === "no-identifier" || r.outcome === "no-attachment"
  );
  const noName = report.results.filter((r) => r.outcome === "no-match" && !(r.signerName && r.signerEmail));
  console.log(`\nPOSITIVE CONTROLS from the same run:`);
  console.log(`  already filed (would be skipped) : ${already.length}`);
  console.log(`  matched to an existing candidate : ${matched.length}`);
  console.log(`  REFUSED to act (ambiguous-match / no-identifier / no-attachment) : ${refused.length}`);
  for (const r of refused) console.log(`      [${r.outcome}] ${r.signerName ?? "?"} <${r.signerEmail ?? "?"}> — ${r.detail ?? ""}`);
  console.log(`  no-match but missing name/email  : ${noName.length}`);
  for (const r of noName) console.log(`      name=${r.signerName ?? "(none)"} email=${r.signerEmail ?? "(none)"}`);
}

main().catch((e) => {
  console.log("ERROR: " + String(e?.message ?? e));
  process.exit(1);
});
