// Two lists for data review: pilots who have moved (upgraded/transitioned) vs
// pilots who never moved, each with current position + active/terminated status.
//   npx tsx prisma/pilot-movement-lists.ts
import { getUpgradeAnalytics } from "@/lib/data/employee-journey";

async function main() {
  const a = await getUpgradeAnalytics();
  const fmt = (p: (typeof a.pilots)[number]) => {
    const pos = p.steps[p.steps.length - 1]?.title ?? "-";
    return `  ${p.name.padEnd(26)} ${pos.padEnd(24)} ${p.active ? "Active" : "Terminated"}`;
  };
  const moved = a.pilots.filter((p) => p.moves >= 1).sort((x, y) => x.name.localeCompare(y.name));
  const never = a.pilots.filter((p) => p.moves === 0).sort((x, y) => x.name.localeCompare(y.name));

  console.log(`=== MOVED — upgraded or transitioned (${moved.length}) ===`);
  console.log(moved.map(fmt).join("\n"));
  console.log(`\n=== NEVER MOVED (${never.length}) ===`);
  console.log(never.map(fmt).join("\n"));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
