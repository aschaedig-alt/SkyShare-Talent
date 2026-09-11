/**
 * Point the app at the Front templates she wrote on 2026-09-11.
 *
 * She named them by title; the ids below were read back from the live Front API
 * (82 templates, paginated to exhaustion) rather than typed from memory, and each
 * one is re-verified against Front before anything is written. A wrong rsp_ id
 * fails as a 404 at send time, in front of a real recipient.
 *
 * Dry run by default. --apply writes, and writes an undo file first.
 *
 *   npx tsx scripts/front-templates-sept11/wire.ts           what would change
 *   npx tsx scripts/front-templates-sept11/wire.ts --apply   do it
 *   npx tsx scripts/front-templates-sept11/wire.ts --undo    put it back
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const HERE = join(process.cwd(), "scripts", "front-templates-sept11");
const UNDO = join(HERE, "UNDO.json");

/** The two features that are BUILT and blocked only on a template. */
const STANDALONE = [
  { scope: "front", key: "supervisor-contact-template", templateId: "rsp_s3bru", templateName: "New Hire Contact Details → Supervisor" },
  { scope: "front", key: "travel-reimbursement-template", templateId: "rsp_s3btm", templateName: "Outstanding Reimbursement" }
];

/**
 * Checklist steps, written into the onboarding-task-emails blob that Manage tasks
 * owns. Only the two she named UNAMBIGUOUSLY are here.
 *
 * DELIBERATELY NOT INCLUDED: pilot_doc_request. She gave three possible templates
 * for it — "MX - Document Request (Journey)", "Pilot - Document Request (Journey)"
 * and "Pilot Docs and both Webforms (Journey)" — and the config holds ONE template
 * per step. Which one is right depends on whether the hire is maintenance or a
 * pilot, which this structure cannot express. Picking one would silently send
 * maintenance staff a pilot document request. That needs her answer first.
 */
const TASK_EMAILS: Record<string, { templateId: string; templateName: string; audience: "personal" | "company" | "custom"; to: string[]; cc: string[]; greeting: boolean }> = {
  pilot_app: {
    templateId: "rsp_s3c2i",
    templateName: "Pilot - Application Webform (Journey)",
    audience: "personal",
    to: [],
    cc: ["hrotasks@skyshare.com"],
    greeting: true
  },
  ebco_form: {
    templateId: "rsp_s3byy",
    templateName: "Pilot - Insurance Webform (Journey)",
    audience: "personal",
    to: [],
    cc: ["hrotasks@skyshare.com"],
    greeting: true
  }
};

const TASK_SCOPE = "workspace";
const TASK_KEY = "onboarding-task-emails";

async function frontNames(ids: string[]) {
  const token = process.env.FRONT_API_TOKEN;
  if (!token) throw new Error("FRONT_API_TOKEN is not set — it lives in .env.local, not .env.");
  const out = new Map<string, string>();
  for (const id of ids) {
    const res = await fetch(`https://api2.frontapp.com/message_templates/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    if (!res.ok) throw new Error(`Front ${res.status} on ${id} — refusing to write an id Front does not know.`);
    const body = (await res.json()) as { id: string; name: string };
    out.set(id, body.name);
  }
  return out;
}

async function main() {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");

  if (undo) {
    if (!existsSync(UNDO)) throw new Error("No UNDO.json — nothing was applied from here.");
    const saved = JSON.parse(readFileSync(UNDO, "utf8")) as Array<{ scope: string; key: string; valueJson: string | null }>;
    for (const row of saved) {
      if (row.valueJson === null) {
        await prisma.workspaceSetting.deleteMany({ where: { scope: row.scope, key: row.key } });
        console.log(`  removed ${row.scope}/${row.key} (it did not exist before)`);
      } else {
        await prisma.workspaceSetting.upsert({
          where: { scope_key: { scope: row.scope, key: row.key } },
          create: { scope: row.scope, key: row.key, valueJson: row.valueJson },
          update: { valueJson: row.valueJson }
        });
        console.log(`  restored ${row.scope}/${row.key}`);
      }
    }
    await prisma.$disconnect();
    return;
  }

  // Verify every id against Front BEFORE touching the database.
  const ids = [...STANDALONE.map((s) => s.templateId), ...Object.values(TASK_EMAILS).map((t) => t.templateId)];
  const live = await frontNames(ids);
  console.log("Verified against the live Front API:");
  for (const [id, name] of live) console.log(`  ${id}  ${name}`);

  const mismatches = [
    ...STANDALONE.map((s) => ({ id: s.templateId, expected: s.templateName })),
    ...Object.values(TASK_EMAILS).map((t) => ({ id: t.templateId, expected: t.templateName }))
  ].filter((x) => live.get(x.id) !== x.expected);
  if (mismatches.length) {
    console.log("\nNAME MISMATCH — the id exists but Front calls it something else:");
    for (const m of mismatches) console.log(`  ${m.id}: expected "${m.expected}", Front says "${live.get(m.id)}"`);
  }

  // Current state, for the plan and the undo record.
  const before: Array<{ scope: string; key: string; valueJson: string | null }> = [];
  for (const s of STANDALONE) {
    const row = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: s.scope, key: s.key } }, select: { valueJson: true } });
    before.push({ scope: s.scope, key: s.key, valueJson: row?.valueJson ?? null });
    console.log(`\n${s.scope}/${s.key}`);
    console.log(`  now:   ${row?.valueJson ?? "(not set)"}`);
    console.log(`  after: ${JSON.stringify({ templateId: s.templateId, templateName: s.templateName })}`);
  }

  const taskRow = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: TASK_SCOPE, key: TASK_KEY } }, select: { valueJson: true } });
  before.push({ scope: TASK_SCOPE, key: TASK_KEY, valueJson: taskRow?.valueJson ?? null });
  const existing = taskRow?.valueJson ? (JSON.parse(taskRow.valueJson) as Record<string, unknown>) : {};
  const merged = { ...existing, ...TASK_EMAILS };
  console.log(`\n${TASK_SCOPE}/${TASK_KEY}`);
  console.log(`  keys now:   ${Object.keys(existing).join(", ") || "(none)"}`);
  console.log(`  keys after: ${Object.keys(merged).join(", ")}`);
  console.log(`  ADDED: ${Object.keys(TASK_EMAILS).filter((k) => !(k in existing)).join(", ") || "(none)"}`);
  console.log(`  OVERWRITTEN: ${Object.keys(TASK_EMAILS).filter((k) => k in existing).join(", ") || "(none)"}`);

  if (!apply) {
    console.log("\nDry run. Nothing written. Re-run with --apply.");
    await prisma.$disconnect();
    return;
  }

  writeFileSync(UNDO, JSON.stringify(before, null, 2));
  for (const s of STANDALONE) {
    const valueJson = JSON.stringify({ templateId: s.templateId, templateName: s.templateName });
    await prisma.workspaceSetting.upsert({
      where: { scope_key: { scope: s.scope, key: s.key } },
      create: { scope: s.scope, key: s.key, valueJson },
      update: { valueJson }
    });
  }
  const valueJson = JSON.stringify(merged);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: TASK_SCOPE, key: TASK_KEY } },
    create: { scope: TASK_SCOPE, key: TASK_KEY, valueJson },
    update: { valueJson }
  });
  console.log(`\nApplied. Undo record: ${UNDO}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(String(e));
  await prisma.$disconnect();
  process.exit(1);
});
