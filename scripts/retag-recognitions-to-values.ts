import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

// One-off demo helper: after reconciling RecognitionValue to SkyShare's core
// values, any pre-existing demo recognitions were left untagged. Re-tag every
// recognition that currently has zero values with one core value (round-robin)
// so the feed chips and "Values in Action" breakdown stay populated. Idempotent:
// only touches recognitions that have no values.

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const values = await prisma.recognitionValue.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  if (values.length === 0) throw new Error("No recognition values found — run reconcile first.");

  const untagged = await prisma.recognition.findMany({
    where: { values: { none: {} } },
    select: { id: true },
    orderBy: { createdAt: "asc" }
  });

  let i = 0;
  for (const rec of untagged) {
    const value = values[i % values.length];
    // Give a few of them a second value so the breakdown isn't perfectly uniform.
    const second = i % 3 === 0 ? values[(i + 2) % values.length] : null;
    const connect = second && second.id !== value.id ? [{ id: value.id }, { id: second.id }] : [{ id: value.id }];
    await prisma.recognition.update({ where: { id: rec.id }, data: { values: { connect } } });
    i++;
  }

  console.log(`Re-tagged ${untagged.length} untagged recognition(s) across ${values.length} core values.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
