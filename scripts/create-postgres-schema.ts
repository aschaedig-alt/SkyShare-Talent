import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "prisma", "schema.prisma");
const targetPath = path.join(root, "prisma", "schema.postgres.prisma");

const source = await readFile(sourcePath, "utf8");
const converted = source.replace('provider = "sqlite"', 'provider = "postgresql"');

if (source === converted) {
  throw new Error('Unable to find SQLite provider line in prisma/schema.prisma.');
}

await writeFile(
  targetPath,
  [
    "// Generated from prisma/schema.prisma for PostgreSQL validation.",
    "// Do not edit by hand; run npm run db:postgres:schema.",
    converted
  ].join("\n\n"),
  "utf8"
);

console.log(`Wrote ${path.relative(root, targetPath)}.`);
