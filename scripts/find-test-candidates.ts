import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

// READ-ONLY. This script never writes or deletes. It only scores candidates
// on "looks like test data" signals and prints a list for human review.

const NAME_KEYWORDS = [
  "test", "testing", "tester", "demo", "sample", "example", "dummy", "fake",
  "asdf", "qwerty", "zzz", "xxx", "aaa", "foo", "bar", "baz", "temp",
  "delete", "donotuse", "do not use", "ignore", "placeholder", "n/a", "na",
  "john doe", "jane doe", "first last", "no name", "unknown",
];
const EMAIL_DOMAIN_KEYWORDS = [
  "example.com", "test.com", "test.org", "email.com", "mailinator.com",
  "yopmail.com", "guerrillamail.com", "trash", "fake", "nowhere", "none.com",
];

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function scoreCandidate(c: {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  source: string | null;
  scanExcludedReason: string | null;
  apps: number;
  files: number;
  notes: number;
  interviews: number;
}): { score: number; reasons: string[]; confidence: "HIGH" | "MEDIUM" | "LOW" } {
  const reasons: string[] = [];
  let score = 0;

  const nameBlob = `${norm(c.displayName)} ${norm(c.firstName)} ${norm(c.lastName)}`;
  const email = norm(c.primaryEmail);

  if (norm(c.scanExcludedReason) === "test") {
    score += 100;
    reasons.push("already flagged TEST");
  }

  for (const kw of NAME_KEYWORDS) {
    if (nameBlob.includes(kw)) {
      score += kw.length <= 2 ? 25 : 45; // short tokens are weaker
      reasons.push(`name contains "${kw}"`);
      break;
    }
  }

  for (const kw of EMAIL_DOMAIN_KEYWORDS) {
    if (email.includes(kw)) {
      score += 45;
      reasons.push(`email domain "${kw}"`);
      break;
    }
  }
  if (email && /(^|[._+-])test([._+-]|@|\d)/.test(email)) {
    score += 30;
    reasons.push("email local-part looks like test");
  }

  // Repeated-character gibberish in name (e.g. "aaaa", "sdfsdf")
  if (/(.)\1\1/.test(nameBlob.replace(/\s/g, ""))) {
    score += 20;
    reasons.push("repeated-character gibberish name");
  }

  // Empty / placeholder identity
  if (!c.primaryEmail && !c.primaryPhone) {
    score += 15;
    reasons.push("no email and no phone");
  }

  // Looks like a hollow profile (no real recruiting activity attached)
  const activity = c.apps + c.files + c.notes + c.interviews;
  if (activity === 0) {
    score += 10;
    reasons.push("no applications/files/notes/interviews");
  }

  const confidence: "HIGH" | "MEDIUM" | "LOW" =
    score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";

  return { score, reasons, confidence };
}

async function main() {
  const candidates = await prisma.candidate.findMany({
    select: {
      id: true,
      displayName: true,
      firstName: true,
      lastName: true,
      primaryEmail: true,
      primaryPhone: true,
      source: true,
      status: true,
      scanExcludedReason: true,
      createdAt: true,
      _count: {
        select: { applications: true, files: true, notes: true, interviews: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const total = candidates.length;
  const scored = candidates
    .map((c) => {
      const s = scoreCandidate({
        displayName: c.displayName,
        firstName: c.firstName,
        lastName: c.lastName,
        primaryEmail: c.primaryEmail,
        primaryPhone: c.primaryPhone,
        source: c.source,
        scanExcludedReason: c.scanExcludedReason,
        apps: c._count.applications,
        files: c._count.files,
        notes: c._count.notes,
        interviews: c._count.interviews,
      });
      return { c, ...s };
    })
    .filter((x) => x.score >= 30)
    .sort((a, b) => b.score - a.score);

  const high = scored.filter((x) => x.confidence === "HIGH");
  const medium = scored.filter((x) => x.confidence === "MEDIUM");

  const fmt = (x: (typeof scored)[number]) => {
    const c = x.c;
    const email = c.primaryEmail ?? "—";
    const act = `${c._count.applications}a/${c._count.files}f/${c._count.notes}n/${c._count.interviews}i`;
    const created = c.createdAt.toISOString().slice(0, 10);
    return `  [${x.score}] ${c.displayName}  <${email}>  (${act}, ${created})  id=${c.id}\n        → ${x.reasons.join("; ")}`;
  };

  console.log("\n================ TEST CANDIDATE AUDIT (read-only) ================");
  console.log(`Total candidates in system: ${total}`);
  console.log(`Flagged for review (score >= 30): ${scored.length}`);
  console.log(`  HIGH confidence: ${high.length}   MEDIUM confidence: ${medium.length}`);
  console.log("\nLegend: activity = applications/files/notes/interviews counts\n");

  console.log("---------------- HIGH confidence (very likely test) ----------------");
  if (high.length === 0) console.log("  (none)");
  high.forEach((x) => console.log(fmt(x)));

  console.log("\n---------------- MEDIUM confidence (please eyeball) ----------------");
  if (medium.length === 0) console.log("  (none)");
  medium.forEach((x) => console.log(fmt(x)));

  console.log("\n==================================================================");
  console.log("NOTHING WAS DELETED. This is a review list only.\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
