// Deterministic employee-history cleanup (idempotent). Dry-run by default:
//   npx tsx prisma/cleanup-employee-history.ts            (preview)
//   npx tsx prisma/cleanup-employee-history.ts --commit   (apply)
//
// Policy (user-approved: "trust the termination dates"):
//   REACTIVATE  Terminated but a role STARTS AFTER the termination date (they
//               kept working / returned) -> the term is stale: set ACTIVE, clear
//               it, reopen the latest stint, reopen an inverted latest role.
//   CLOSE       Terminated with a dangling OPEN role and no work after the term
//               -> the termination is real; close the open role (and any open
//               stint) at the termination date. Status unchanged.
//   CLIP        A role end overruns an earlier closed stint (left-and-returned
//               gap) -> clip the role end to that stint's end.
//   FLAG        Old former employees with junk inferred dates / phantom stints —
//               printed only, fixed by hand in the profile editor.

import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "open");

async function main() {
  const commit = process.argv.includes("--commit");
  const hires = await prisma.newHire.findMany({
    where: { OR: [{ roleAssignments: { some: {} } }, { employmentStints: { some: {} } }] },
    select: {
      id: true, name: true, employmentStatus: true, terminationDate: true,
      roleAssignments: { select: { id: true, title: true, startDate: true, endDate: true, createdAt: true } },
      employmentStints: { select: { id: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" } }
    }
  });

  const changes: string[] = [];
  const flags: string[] = [];
  const ops: Array<() => Promise<unknown>> = [];

  for (const h of hires) {
    const stints = h.employmentStints;
    const latestStint = stints[stints.length - 1];
    const roles = [...h.roleAssignments].sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
    const latestRole = roles[roles.length - 1];
    const term = h.terminationDate;
    const terminated = h.employmentStatus === "TERMINATED" || !!term;
    const hasOpenRole = roles.some((r) => r.endDate === null);
    // "Kept working" = a genuinely current role after the term, or a clear later
    // return (>180d), so an 11-day date fuzz on a short stint isn't mistaken for it.
    const keptWorking =
      !!term &&
      roles.some(
        (r) =>
          (r.endDate === null && r.startDate.getTime() > term.getTime() + DAY) ||
          r.startDate.getTime() > term.getTime() + 180 * DAY
      );

    let latestStintReopened = false;

    if (terminated && keptWorking) {
      // REACTIVATE — worked after the termination date, so it's stale.
      changes.push(`${h.name}: → ACTIVE, clear terminationDate ${d(term ?? null)} (worked after it)`);
      // An active employee shouldn't sit in the ARCHIVED lifecycle stage.
      ops.push(() => prisma.newHire.update({ where: { id: h.id }, data: { employmentStatus: "ACTIVE", terminationDate: null, stage: "POST_ONBOARD" } }));
      if (latestStint && latestStint.endDate) {
        changes.push(`${h.name}: reopen stint (was ${d(latestStint.startDate)}→${d(latestStint.endDate)})`);
        ops.push(() => prisma.employmentStint.update({ where: { id: latestStint.id }, data: { endDate: null } }));
        latestStintReopened = true;
      }
      if (latestRole && latestRole.endDate && latestRole.endDate < latestRole.startDate) {
        changes.push(`${h.name}: reopen returned role "${latestRole.title}" (${d(latestRole.startDate)})`);
        ops.push(() => prisma.roleAssignment.update({ where: { id: latestRole.id }, data: { endDate: null } }));
      }
    } else if (h.employmentStatus === "TERMINATED" && term) {
      // CLOSE — real termination with a dangling open role/stint.
      for (const r of roles) {
        if (r.endDate === null && term.getTime() >= r.startDate.getTime()) {
          changes.push(`${h.name}: close open role "${r.title}" at termination ${d(term)}`);
          ops.push(() => prisma.roleAssignment.update({ where: { id: r.id }, data: { endDate: term } }));
        }
      }
      if (latestStint && latestStint.endDate === null && term.getTime() >= latestStint.startDate.getTime()) {
        changes.push(`${h.name}: close open stint at termination ${d(term)}`);
        ops.push(() => prisma.employmentStint.update({ where: { id: latestStint.id }, data: { endDate: term } }));
      }
    } else if (!terminated && hasOpenRole && latestStint && latestStint.endDate) {
      // ACTIVE but the latest stint was wrongly closed (a snapshot artifact) while
      // the person holds a current role -> reopen the stint (don't clip the role).
      changes.push(`${h.name}: reopen stint (was ${d(latestStint.startDate)}→${d(latestStint.endDate)}; active with a current role)`);
      ops.push(() => prisma.employmentStint.update({ where: { id: latestStint.id }, data: { endDate: null } }));
      latestStintReopened = true;
    }

    // CLIP — role end overruns an earlier closed stint boundary.
    for (const r of roles) {
      if (!r.endDate || r.endDate < r.startDate) continue;
      const host = stints.find((s) => r.startDate >= new Date(s.startDate.getTime() - DAY) && (s.endDate === null || r.startDate <= new Date(s.endDate.getTime() + DAY)));
      if (!host) continue;
      const effectiveEnd = host.id === latestStint?.id && latestStintReopened ? null : host.endDate;
      if (effectiveEnd && r.endDate.getTime() > effectiveEnd.getTime() + DAY) {
        changes.push(`${h.name}: clip "${r.title}" end ${d(r.endDate)} → ${d(effectiveEnd)} (stint boundary)`);
        const clip = effectiveEnd;
        ops.push(() => prisma.roleAssignment.update({ where: { id: r.id }, data: { endDate: clip } }));
      }
    }

    // FLAG remaining structural oddities on still-terminated former employees.
    if (h.employmentStatus === "TERMINATED" && !keptWorking) {
      for (const r of roles) if (r.endDate && r.endDate < r.startDate) flags.push(`${h.name}: role "${r.title}" ends ${d(r.endDate)} before start ${d(r.startDate)} (junk inferred date)`);
      for (const s of stints) if (s.endDate && s.endDate < s.startDate) flags.push(`${h.name}: ${roles.length ? "" : "no roles; "}stint ${d(s.startDate)}→${d(s.endDate)} inverted (phantom return?)`);
    }
  }

  console.log(`${commit ? "APPLYING" : "DRY RUN"} — ${ops.length} op(s):\n`);
  console.log(changes.length ? changes.map((l) => "  ✓ " + l).join("\n") : "  (no auto-fixes)");
  if (flags.length) {
    console.log(`\nFLAGGED — fix by hand in the profile editor (${flags.length}):`);
    console.log(flags.map((l) => "  • " + l).join("\n"));
  }
  if (commit && ops.length) {
    for (const op of ops) await op();
    console.log(`\n✓ Applied ${ops.length} op(s).`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
