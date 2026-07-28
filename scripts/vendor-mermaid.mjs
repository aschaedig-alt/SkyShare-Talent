// Copies mermaid's self-contained browser bundle out of node_modules into
// public/vendor so the in-app Handbook can load it as a static asset. Runs as
// part of `dev` and `build` (see package.json), the same way prisma generate
// does, so it is always in place before Next serves anything.
//
// The copied file is gitignored — it is a generated artifact of the installed
// mermaid dependency, not source. Committing 3.5 MB of minified vendor code
// would bloat the repo and drift from the pinned package version.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "mermaid", "dist", "mermaid.min.js");
const dest = join(root, "public", "vendor", "mermaid.min.js");

if (!existsSync(src)) {
  // Not fatal: a lint-only or type-only CI step may run without a full install.
  // The Handbook pages degrade to showing the diagram source until mermaid is present.
  console.warn(`[vendor-mermaid] ${src} not found — skipping (is mermaid installed?)`);
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("[vendor-mermaid] copied mermaid.min.js -> public/vendor/");
