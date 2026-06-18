/**
 * Parse FLEET_POSITIONS.md (the human-editable master table) and regenerate the
 * RAW_FLEET_POSITIONS block in lib/fleet/positions.ts (between the fleet-sync
 * markers). Run after editing the markdown:  npm run fleet:sync
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MD_PATH = join(ROOT, "FLEET_POSITIONS.md");
const TS_PATH = join(ROOT, "lib", "fleet", "positions.ts");

type Row = { aircraft: string; typeRating: string; role: string; seat: string; title: string; status: string; notes: string };

function parseTable(md: string): Row[] {
  const rows: Row[] = [];
  for (const line of md.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined).split("|").map((c) => c.trim());
    if (cells.length < 6) continue;
    const [aircraft, typeRating, role, seat, title, status, notes = ""] = cells;
    if (aircraft === "Aircraft" || /^-+$/.test(aircraft)) continue; // header / separator
    if (!aircraft || !title) continue;
    if (seat !== "PIC" && seat !== "SIC") {
      console.warn(`! Skipping row with unexpected seat "${seat}": ${title}`);
      continue;
    }
    if (status !== "Active" && status !== "Archived") {
      console.warn(`! Skipping row with unexpected status "${status}": ${title}`);
      continue;
    }
    rows.push({ aircraft, typeRating, role, seat, title, status, notes });
  }
  return rows;
}

function render(rows: Row[]): string {
  const lines = rows
    .map(
      (r) =>
        `  { aircraft: ${JSON.stringify(r.aircraft)}, typeRating: ${JSON.stringify(r.typeRating)}, role: ${JSON.stringify(
          r.role
        )}, seat: ${JSON.stringify(r.seat)}, title: ${JSON.stringify(r.title)}, status: ${JSON.stringify(
          r.status
        )}, notes: ${JSON.stringify(r.notes)} }`
    )
    .join(",\n");
  return `// fleet-sync:start\nconst RAW_FLEET_POSITIONS: RawPosition[] = [\n${lines}\n];\n// fleet-sync:end`;
}

const md = readFileSync(MD_PATH, "utf8");
const rows = parseTable(md);
if (rows.length === 0) {
  console.error("No position rows parsed from FLEET_POSITIONS.md — aborting.");
  process.exit(1);
}

const ts = readFileSync(TS_PATH, "utf8");
const next = ts.replace(/\/\/ fleet-sync:start[\s\S]*?\/\/ fleet-sync:end/, render(rows));
if (next === ts) {
  console.log(`No change — lib/fleet/positions.ts already matches (${rows.length} positions).`);
} else {
  writeFileSync(TS_PATH, next, "utf8");
  console.log(`Synced ${rows.length} positions from FLEET_POSITIONS.md -> lib/fleet/positions.ts`);
}
