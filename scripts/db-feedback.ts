// READ-ONLY: list feedback submitted in a given month (default: July 2026).
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const from = new Date("2026-07-01T00:00:00Z");
  const to = new Date("2026-08-01T00:00:00Z");

  const total = await prisma.feedback.count();
  const rows = await prisma.feedback.findMany({
    where: { createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, status: true, message: true, page: true, userName: true, userEmail: true, createdAt: true }
  });

  console.log(`Feedback rows total (all time): ${total}`);
  console.log(`Submitted in July 2026: ${rows.length}\n`);

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byType[r.type] = (byType[r.type] ?? 0) + 1;
  }
  console.log("By status:", JSON.stringify(byStatus));
  console.log("By type:  ", JSON.stringify(byType));
  console.log("\n" + "=".repeat(90));

  for (const r of rows) {
    const when = r.createdAt.toISOString().slice(0, 10);
    console.log(`\n[${when}] ${r.type} / ${r.status}  — ${r.userName ?? r.userEmail ?? "unknown"}`);
    console.log(`  page: ${r.page ?? "—"}`);
    console.log(`  ${r.message.replace(/\s+/g, " ").trim()}`);
    console.log(`  id: ${r.id}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
