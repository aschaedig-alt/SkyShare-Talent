/**
 * Give the document-request step a default Front template.
 *
 * THIS IS THE FOLLOW-UP TO A DELIBERATE OMISSION. scripts/front-templates-sept11/
 * wire.ts wired pilot_app and ebco_form and skipped this one on purpose, with the
 * reason written into it: the config holds ONE template per step, three candidate
 * templates were named, and which is right depends on whether the hire is a pilot
 * or maintenance. Picking one would have sent maintenance staff a pilot document
 * request with nobody looking.
 *
 * That is no longer true. Asked for on 2026-09-11: "the document request template,
 * maintenance, and pilot need a different configuration. I saw one of the other
 * emails we send out. We can click the dropdown and choose from the templates. Why
 * can't I do that on this one and choose the appropriate one?" The send dialog now
 * carries a template picker, so the configured template is the DEFAULT rather than
 * the only option, and a maintenance hire is one dropdown away from the MX version
 * on a screen that shows the whole body before it sends.
 *
 * WHY PILOT IS THE DEFAULT: the step key is pilot_doc_request, the label he wrote
 * himself reads "(Pilot or MX)" with pilot first, and pilots are most of the
 * intake. The (Journey) variant, because that is the set he wrote for this app and
 * the other two wired steps both use it.
 *
 * Without this the picker is unreachable — no configured template means no Send
 * email button on the step at all, and nothing to open the dropdown from.
 *
 * Reversible: --undo restores the exact blob that was there before.
 *
 *   npx tsx scripts/doc-request-template/wire.ts           what would change
 *   npx tsx scripts/doc-request-template/wire.ts --apply   do it
 *   npx tsx scripts/doc-request-template/wire.ts --undo    put it back
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const HERE = join(process.cwd(), "scripts", "doc-request-template");
const UNDO = join(HERE, "UNDO.json");

const SCOPE = "workspace";
const KEY = "onboarding-task-emails";
const TASK = "pilot_doc_request";

const ENTRY = {
  templateId: "rsp_s3bx6",
  templateName: "Pilot - Document Request (Journey)",
  audience: "personal" as const,
  to: [] as string[],
  cc: ["hrotasks@skyshare.com"],
  greeting: true
};

/** The MX one, checked but not written — it is what the dropdown offers instead. */
const ALTERNATE = { templateId: "rsp_s3bve", templateName: "MX - Document Request (Journey)" };

type Entry = typeof ENTRY;
type Blob = Record<string, Entry>;

/** Re-read the id from Front rather than trusting it. A wrong rsp_ id does not
 *  fail here — it fails as a 404 at send time, in front of a real recipient. */
async function verifyInFront(id: string, expectedName: string): Promise<string> {
  const token = process.env.FRONT_API_TOKEN;
  if (!token) throw new Error("No FRONT_API_TOKEN — run with the .env.local values loaded.");
  const res = await fetch(`https://api2.frontapp.com/message_templates/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`Front says ${res.status} for ${id} — refusing to wire an id it cannot resolve.`);
  const body = (await res.json()) as { name?: string };
  const name = body.name ?? "";
  if (name !== expectedName) {
    throw new Error(`Front calls ${id} "${name}", not "${expectedName}". Refusing — the name may have moved to another template.`);
  }
  return name;
}

async function readBlob(): Promise<Blob> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return {};
  return JSON.parse(row.valueJson) as Blob;
}

async function main() {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");

  if (undo) {
    if (!existsSync(UNDO)) throw new Error("No UNDO.json — nothing was applied from here.");
    const saved = readFileSync(UNDO, "utf8");
    await prisma.workspaceSetting.upsert({
      where: { scope_key: { scope: SCOPE, key: KEY } },
      create: { scope: SCOPE, key: KEY, valueJson: saved },
      update: { valueJson: saved }
    });
    console.log(`Restored ${SCOPE}/${KEY} to the blob saved before this ran.`);
    await prisma.$disconnect();
    return;
  }

  // THE WHOLE SCOPE FIRST, so "pilot_doc_request is not wired" is read next to the
  // steps that are, rather than asserted from one lookup that returned nothing.
  const blob = await readBlob();
  const keys = Object.keys(blob);
  console.log(`Every step currently wired to a Front template (${keys.length}):`);
  for (const k of keys) console.log(`  ${k.padEnd(36)} ${blob[k].templateId}  "${blob[k].templateName}"`);
  console.log(`\n${TASK} present: ${keys.includes(TASK) ? `YES — ${blob[TASK].templateName}` : "NO"}`);

  const name = await verifyInFront(ENTRY.templateId, ENTRY.templateName);
  const altName = await verifyInFront(ALTERNATE.templateId, ALTERNATE.templateName);
  console.log(`\nFront confirms ${ENTRY.templateId} = "${name}"   (the default this writes)`);
  console.log(`Front confirms ${ALTERNATE.templateId} = "${altName}"   (not written — what the dropdown offers)`);

  if (blob[TASK]?.templateId === ENTRY.templateId) {
    console.log("\nAlready wired to that template. Nothing to do.");
    await prisma.$disconnect();
    return;
  }
  console.log(`\nWould set ${TASK} -> ${ENTRY.templateId} "${ENTRY.templateName}", to their personal email, cc ${ENTRY.cc.join(", ")}`);

  if (!apply) {
    console.log("\nDry run. Nothing written. Re-run with --apply.");
    await prisma.$disconnect();
    return;
  }

  // The WHOLE blob is saved, not just this key — Manage tasks rewrites the entire
  // value, so restoring one key into a blob that moved on would be the wrong undo.
  writeFileSync(UNDO, JSON.stringify(blob, null, 2));
  const next = { ...blob, [TASK]: ENTRY };
  const value = JSON.stringify(next);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });

  const after = await readBlob();
  console.log(`\nApplied. Now wired (${Object.keys(after).length}):`);
  for (const k of Object.keys(after)) console.log(`  ${k.padEnd(36)} ${after[k].templateId}  "${after[k].templateName}"`);
  console.log(`Undo: ${UNDO}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(String(e));
  await prisma.$disconnect();
  process.exit(1);
});
