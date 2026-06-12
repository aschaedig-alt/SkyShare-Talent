import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { readFileSync } from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import { ONBOARDING_TASKS } from "../lib/onboarding/tasks";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const DEFAULT_PATH = "C:\\Users\\Recruiter\\Downloads\\Pre-Onboarding Status - Copy of Main.csv";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += ch; }
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") { field += ch; }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function parseDate(raw: string | undefined): Date | null {
  const v = (raw ?? "").trim();
  if (!v || /^n\/?a$/i.test(v)) return null;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
}

async function main() {
  const path = process.argv[2] || DEFAULT_PATH;
  const rows = parseCsv(readFileSync(path, "utf8"));

  // This sheet has NO leading label column; rows are in a fixed order.
  const NAME = 0, OFFER_SENT = 1, OFFER_SIGNED = 2, START = 3, ORIENT = 4, PHONE = 5, SS_EMAIL = 6, PERSONAL = 7, POSITION = 8, DEPT = 9;
  const names = rows[NAME] ?? [];
  const cell = (r: number, c: number) => (rows[r]?.[c] ?? "").trim();

  // Existing names already in the system (skip these to avoid duplicates), and which
  // were created by a previous run of this importer (those we may safely re-update).
  const existing = await prisma.newHire.findMany({ select: { name: true, importKey: true } });
  const blockedNames = new Set(
    existing.filter((h) => !(h.importKey ?? "").startsWith("prevhire|")).map((h) => h.name.trim().toLowerCase())
  );

  const created: string[] = [];
  const skipped: string[] = [];

  for (let c = 0; c < names.length; c++) {
    const name = (names[c] ?? "").trim();
    if (!name) continue;

    if (blockedNames.has(name.toLowerCase())) {
      skipped.push(name);
      continue;
    }

    const startDate = parseDate(cell(START, c));
    const importKey = `prevhire|${name}|${c}`;

    const data = {
      name,
      position: cell(POSITION, c) || null,
      department: cell(DEPT, c) || null,
      phone: cell(PHONE, c) || null,
      ssEmail: cell(SS_EMAIL, c) || null,
      personalEmail: cell(PERSONAL, c) || null,
      offerSentDate: parseDate(cell(OFFER_SENT, c)),
      offerSignedDate: parseDate(cell(OFFER_SIGNED, c)),
      startDate,
      orientationDate: parseDate(cell(ORIENT, c)),
      stage: "POST_ONBOARD",
      onboardedAt: startDate ?? null,
      importKey
    };

    const hire = await prisma.newHire.upsert({ where: { importKey }, create: data, update: data });

    // Mark every onboarding task complete.
    for (let i = 0; i < ONBOARDING_TASKS.length; i++) {
      const def = ONBOARDING_TASKS[i];
      await prisma.onboardingTask.upsert({
        where: { newHireId_key: { newHireId: hire.id, key: def.key } },
        create: { newHireId: hire.id, key: def.key, label: def.label, group: def.group, order: i, status: "DONE", completedAt: new Date() },
        update: { status: "DONE", completedAt: new Date() }
      });
    }

    created.push(name);
  }

  console.log(`Created/updated ${created.length} previous hires (all tasks complete, post-onboard).`);
  console.log(`Skipped ${skipped.length} already in the system: ${skipped.join(", ") || "(none)"}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
