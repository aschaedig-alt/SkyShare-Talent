import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { readFileSync } from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import { ONBOARDING_TASKS, SHEET_LABEL_TO_KEY } from "../lib/onboarding/tasks";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const DEFAULT_PATH = "C:\\Users\\Recruiter\\Downloads\\Pre-Onboarding Status - Main.csv";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseDate(raw: string | undefined): Date | null {
  const v = (raw ?? "").trim();
  if (!v || /^n\/?a$/i.test(v)) {
    return null;
  }
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) {
    return null;
  }
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) {
    year += 2000;
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function boolStatus(raw: string | undefined): "DONE" | "TODO" | "NA" {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "TRUE") return "DONE";
  if (v === "FALSE") return "TODO";
  return "NA";
}

function travelStatusFrom(raw: string | undefined): "DONE" | "TODO" | "NA" {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "YES" || v === "TRUE" || v === "COMPLETE") return "DONE";
  if (v === "NO" || v === "FALSE") return "TODO";
  return "NA";
}

function mapStage(taskValue: string | undefined): { stage: string; canceled: boolean } {
  const v = (taskValue ?? "").trim().toUpperCase();
  if (v === "COMPLETE") return { stage: "POST_ONBOARD", canceled: false };
  if (v.startsWith("CANCEL")) return { stage: "ARCHIVED", canceled: true };
  return { stage: "ACTIVE", canceled: false };
}

async function main() {
  const path = process.argv[2] || DEFAULT_PATH;
  const text = readFileSync(path, "utf8");
  const rows = parseCsv(text);
  if (!rows.length) {
    throw new Error("CSV appears empty");
  }

  // Build a label -> row values lookup (row[0] is the field label, row[1..] are per-person values).
  const byLabel = new Map<string, string[]>();
  for (const r of rows) {
    const label = (r[0] ?? "").trim().toLowerCase();
    if (label) {
      byLabel.set(label, r);
    }
  }

  const nameRow = byLabel.get("name");
  if (!nameRow) {
    throw new Error("Could not find the Name row");
  }

  const get = (label: string, col: number) => (byLabel.get(label)?.[col] ?? "").trim();

  let created = 0;
  for (let col = 1; col < nameRow.length; col++) {
    const name = (nameRow[col] ?? "").trim();
    if (!name) continue;

    const startRaw = get("start date", col);
    const { stage, canceled } = mapStage(get("task", col));
    const travelRaw = get("travel accomodations complete", col) || get("travel accommodations complete", col);

    const importKey = `${name}|${startRaw}|${col}`;

    const data = {
      name,
      position: get("position", col) || null,
      department: get("department", col) || null,
      phone: get("phone", col) || null,
      ssEmail: get("ss email", col) || null,
      personalEmail: get("personal email", col) || null,
      offerSentDate: parseDate(get("offer sent", col)),
      offerSignedDate: parseDate(get("offer signed", col)),
      startDate: parseDate(startRaw),
      orientationDate: parseDate(get("orientation date", col)),
      stage,
      canceled,
      travelStatus: travelRaw || null,
      importKey
    };

    const hire = await prisma.newHire.upsert({
      where: { importKey },
      create: data,
      update: data
    });

    // Build status per task key from the sheet cells.
    const statusByKey = new Map<string, "DONE" | "TODO" | "NA">();
    for (const [label, key] of Object.entries(SHEET_LABEL_TO_KEY)) {
      const r = byLabel.get(label);
      if (!r) continue;
      statusByKey.set(key, key === "travel_complete" ? travelStatusFrom(r[col]) : boolStatus(r[col]));
    }

    for (let i = 0; i < ONBOARDING_TASKS.length; i++) {
      const def = ONBOARDING_TASKS[i];
      const status = statusByKey.get(def.key) ?? "NA";
      await prisma.onboardingTask.upsert({
        where: { newHireId_key: { newHireId: hire.id, key: def.key } },
        create: {
          newHireId: hire.id,
          key: def.key,
          label: def.label,
          group: def.group,
          order: i,
          status,
          completedAt: status === "DONE" ? new Date() : null
        },
        update: {
          label: def.label,
          group: def.group,
          order: i,
          status
        }
      });
    }

    created++;
  }

  const counts = await prisma.newHire.groupBy({ by: ["stage"], _count: { stage: true } });
  console.log(`Imported/updated ${created} new hires.`);
  console.log("By stage:", counts.map((c) => `${c.stage}=${c._count.stage}`).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
