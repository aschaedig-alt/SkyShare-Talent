/**
 * Move current staff who report to David Ricks / Devon Carter onto the ROLES.
 *
 * Asked for 2026-11-10: Ricks stepped down as Chief Pilot (now a G200 pilot),
 * Carter gave notice as Assistant Chief Pilot, Cameron Morgan is the new Chief
 * Pilot and Alex Andrade the new Assistant Chief Pilot. Supervisor slots used to
 * name a person, so 83 people still pointed at Ricks and 82 at Carter. His
 * answers, same day:
 *   - switch now (not on the Nov 16 role start date)
 *   - current staff only: the people who have left keep who they reported to
 *   - Cameron Smith and Jonathan Gleisberg (Carter + Harry Mitchel) get the two
 *     roles like everyone else
 *   - new pilot hires default to the roles automatically (app code, not here)
 *
 * What it writes:
 *   1. LeadershipRole rows: chief-pilot -> Cameron Morgan, assistant-chief-pilot
 *      -> Alex Andrade.
 *   2. Every NOT-terminated, not-cancelled hire with either supervisor slot linked
 *      to Ricks or Carter: slot 1 follows chief-pilot, slot 2 follows
 *      assistant-chief-pilot, typed fallbacks cleared. Devon Carter himself gets
 *      slot 1 only (he is the outgoing assistant chief pilot).
 *   3. David Ricks himself: now a line pilot, so he gets the two roles too.
 *   4. Any other current hire whose TYPED fallback still names Ricks or Carter
 *      (behind a real link): the typed fallback is cleared, the link untouched.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/role-supervisor-migrate.ts                 dry run -> review file
 *   npx tsx scripts/role-supervisor-migrate.ts --commit --limit 3
 *   npx tsx scripts/role-supervisor-migrate.ts --commit
 *   npx tsx scripts/role-supervisor-migrate.ts --undo
 *
 * Every committed row's previous values are appended to the undo file first, so
 * --undo puts each one back exactly. Output lives in scripts/_role-supervisor/
 * (untracked).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const OUT = path.join(process.cwd(), "scripts", "_role-supervisor");
const UNDO = path.join(OUT, "undo.jsonl");

// Fixed ids, read from the live database 2026-11-10 — names are not unique
// enough to look up blind (there are several Carters and Camerons).
const RICKS = "cmr5dx0jy00460orme9zalyi3"; // David Ricks
const CARTER = "cmr5dyqxi000k6grmn4s6ps8b"; // Devon Carter
const MORGAN = "cmvpe0oj4000107l9l8obyoux"; // Cameron Morgan, Chief Pilot
const ANDRADE = "cmqac9j1s001lpkrm4ovuzh4z"; // Alex Andrade, Assistant Chief Pilot

const ROLES = [
  { key: "chief-pilot", title: "Chief Pilot", sortOrder: 1, holderHireId: MORGAN },
  { key: "assistant-chief-pilot", title: "Assistant Chief Pilot", sortOrder: 2, holderHireId: ANDRADE }
];

const FIELDS = {
  id: true,
  name: true,
  position: true,
  employmentStatus: true,
  supervisorHireId: true,
  supervisorName: true,
  supervisorEmail: true,
  supervisorRoleKey: true,
  supervisor2HireId: true,
  supervisor2Name: true,
  supervisor2Email: true,
  supervisor2RoleKey: true
} as const;

type Row = {
  id: string;
  name: string;
  position: string | null;
  employmentStatus: string;
  supervisorHireId: string | null;
  supervisorName: string | null;
  supervisorEmail: string | null;
  supervisorRoleKey: string | null;
  supervisor2HireId: string | null;
  supervisor2Name: string | null;
  supervisor2Email: string | null;
  supervisor2RoleKey: string | null;
};
type Patch = Partial<Omit<Row, "id" | "name" | "position" | "employmentStatus">>;
type Plan = { row: Row; kind: string; patch: Patch };

const BOTH: Patch = {
  supervisorRoleKey: "chief-pilot",
  supervisorHireId: MORGAN,
  supervisorName: null,
  supervisorEmail: null,
  supervisor2RoleKey: "assistant-chief-pilot",
  supervisor2HireId: ANDRADE,
  supervisor2Name: null,
  supervisor2Email: null
};

const names: Record<string, string> = {
  [RICKS]: "David Ricks",
  [CARTER]: "Devon Carter",
  [MORGAN]: "Cameron Morgan",
  [ANDRADE]: "Alex Andrade"
};

function slot(row: Row, which: 1 | 2): string {
  const id = which === 1 ? row.supervisorHireId : row.supervisor2HireId;
  const role = which === 1 ? row.supervisorRoleKey : row.supervisor2RoleKey;
  const typed = which === 1 ? row.supervisorName : row.supervisor2Name;
  if (role) return `role:${role}`;
  if (id) return names[id] ?? `link:${id}`;
  if (typed) return `typed:${typed}`;
  return "-";
}

async function plan(): Promise<Plan[]> {
  const current = { employmentStatus: { not: "TERMINATED" }, canceled: false };
  const linked = (await prisma.newHire.findMany({
    where: {
      ...current,
      OR: [{ supervisorHireId: { in: [RICKS, CARTER] } }, { supervisor2HireId: { in: [RICKS, CARTER] } }],
      id: { notIn: [MORGAN, ANDRADE] }
    },
    select: FIELDS,
    orderBy: { name: "asc" }
  })) as Row[];

  const plans: Plan[] = linked.map((row) =>
    row.id === CARTER
      ? {
          row,
          kind: "carter-self",
          patch: { supervisorRoleKey: "chief-pilot", supervisorHireId: MORGAN, supervisorName: null, supervisorEmail: null }
        }
      : { row, kind: "linked", patch: BOTH }
  );

  const ricks = (await prisma.newHire.findUnique({ where: { id: RICKS }, select: FIELDS })) as Row | null;
  if (ricks && !plans.some((p) => p.row.id === RICKS)) plans.push({ row: ricks, kind: "ricks-self", patch: BOTH });

  const typedOnly = (await prisma.newHire.findMany({
    where: {
      ...current,
      id: { notIn: plans.map((p) => p.row.id) },
      OR: ["Ricks", "Devon Carter"].flatMap((n) => [
        { supervisorName: { contains: n, mode: "insensitive" as const } },
        { supervisor2Name: { contains: n, mode: "insensitive" as const } }
      ])
    },
    select: FIELDS
  })) as Row[];
  for (const row of typedOnly) {
    const patch: Patch = {};
    if (/ricks|devon carter/i.test(row.supervisorName ?? "")) Object.assign(patch, { supervisorName: null, supervisorEmail: null });
    if (/ricks|devon carter/i.test(row.supervisor2Name ?? "")) Object.assign(patch, { supervisor2Name: null, supervisor2Email: null });
    plans.push({ row, kind: "typed-fallback-only", patch });
  }
  return plans;
}

function before(row: Row, patch: Patch): Patch {
  const prev: Patch = {};
  for (const k of Object.keys(patch) as Array<keyof Patch>) (prev as Record<string, unknown>)[k] = row[k];
  return prev;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

  if (args.includes("--undo")) {
    const lines = fs.existsSync(UNDO) ? fs.readFileSync(UNDO, "utf8").trim().split("\n").filter(Boolean) : [];
    for (const line of lines.reverse()) {
      const u = JSON.parse(line) as { type: string; id: string; name: string; prev: Record<string, unknown> };
      if (u.type === "hire") await prisma.newHire.update({ where: { id: u.id }, data: u.prev });
      if (u.type === "role") await prisma.leadershipRole.update({ where: { key: u.id }, data: u.prev });
      console.log(`undone ${u.type} ${u.name}`);
    }
    fs.renameSync(UNDO, UNDO.replace(".jsonl", `.undone-${Date.now()}.jsonl`));
    console.log(`Undid ${lines.length} changes.`);
    return;
  }

  const plans = await plan();
  const roleRows = await prisma.leadershipRole.findMany();

  const lines: string[] = [];
  lines.push(`# Role-based supervisors - ${commit ? "COMMIT" : "DRY RUN"} ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Leadership roles");
  for (const r of ROLES) {
    const cur = roleRows.find((x) => x.key === r.key);
    lines.push(`- ${r.title}: ${cur?.holderHireId ? names[cur.holderHireId] ?? cur.holderHireId : "(no row / vacant)"} -> ${names[r.holderHireId]}`);
  }
  lines.push("");
  const byKind = (k: string) => plans.filter((p) => p.kind === k);
  for (const [kind, label] of [
    ["linked", "Current staff linked to Ricks or Carter -> Chief Pilot + Assistant Chief Pilot"],
    ["carter-self", "Devon Carter himself -> Chief Pilot only (he is the outgoing ACP)"],
    ["ricks-self", "David Ricks himself, now a line pilot -> Chief Pilot + Assistant Chief Pilot"],
    ["typed-fallback-only", "Typed fallback still names Ricks/Carter behind a real link -> typed text cleared, link untouched"]
  ] as const) {
    const rows = byKind(kind);
    lines.push(`## ${label} (${rows.length})`);
    lines.push("");
    lines.push("| Name | Position | Status | Supervisor now | Second now |");
    lines.push("|---|---|---|---|---|");
    for (const p of rows) lines.push(`| ${p.row.name} | ${p.row.position ?? ""} | ${p.row.employmentStatus} | ${slot(p.row, 1)} | ${slot(p.row, 2)} |`);
    lines.push("");
  }
  const review = path.join(OUT, `${commit ? "commit" : "dry-run"}-${Date.now()}.md`);
  fs.writeFileSync(review, lines.join("\n"));
  console.log(lines.join("\n"));
  console.log(`\nReview file: ${review}`);

  if (!commit) {
    console.log("\nDRY RUN - nothing written. Re-run with --commit (optionally --limit N).");
    return;
  }

  // Roles first, so a follower never points at a role that does not exist.
  for (const r of ROLES) {
    const cur = roleRows.find((x) => x.key === r.key);
    if (cur?.holderHireId === r.holderHireId) continue;
    fs.appendFileSync(
      UNDO,
      JSON.stringify({ type: "role", id: r.key, name: r.title, prev: { holderHireId: cur?.holderHireId ?? null } }) + "\n"
    );
    await prisma.leadershipRole.upsert({
      where: { key: r.key },
      create: { key: r.key, title: r.title, sortOrder: r.sortOrder, holderHireId: r.holderHireId },
      update: { holderHireId: r.holderHireId }
    });
    console.log(`role ${r.title} -> ${names[r.holderHireId]}`);
  }

  let n = 0;
  for (const p of plans) {
    if (n >= limit) break;
    fs.appendFileSync(UNDO, JSON.stringify({ type: "hire", id: p.row.id, name: p.row.name, prev: before(p.row, p.patch) }) + "\n");
    await prisma.newHire.update({ where: { id: p.row.id }, data: p.patch });
    console.log(`updated ${p.row.name} (${p.kind})`);
    n++;
  }
  console.log(`\nCommitted ${n} of ${plans.length} hire changes. Undo: npx tsx scripts/role-supervisor-migrate.ts --undo`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
