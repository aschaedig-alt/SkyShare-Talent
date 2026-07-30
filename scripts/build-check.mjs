#!/usr/bin/env node
/**
 * Verification build that cannot collide with a running dev server.
 *
 * WHY THIS EXISTS. Several Claude sessions share this one working tree. The
 * build output directory belongs to the DIRECTORY, not to the git branch, so
 * `npm run build` and a live `next dev` were writing the same .next and
 * corrupting it. The errors that came out pointed nowhere near the cause:
 * "Failed to collect page data for /api/book/[slug]" and then
 * "Cannot find module for page: /_document". The only fix was deleting .next.
 *
 * This sets NEXT_DIST_DIR so the build lands in .next-check (see the distDir
 * line in next.config.mjs) and the dev server keeps .next to itself. Vercel
 * sets nothing and uses the default.
 *
 * Written as a node script rather than an inline env assignment because
 * `FOO=bar npm run build` is not portable to Windows shells, and adding
 * cross-env just for this was not worth a dependency.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIST = process.env.NEXT_DIST_DIR || ".next-check";

/**
 * Next rewrites these two TRACKED files to match distDir — next-env.d.ts gets a
 * reference to <distDir>/types and tsconfig.json gets it added to `include`
 * (and reformatted). In a shared working tree that shows up as spurious
 * modifications for every other session, and a committed next-env.d.ts pointing
 * at .next-check would be wrong for both the dev server and Vercel. So snapshot
 * them and put them back afterwards: this script must leave the tree as it
 * found it.
 */
const GUARDED = ["next-env.d.ts", "tsconfig.json"];
const before = new Map(
  GUARDED.filter((f) => existsSync(f)).map((f) => [f, readFileSync(f, "utf8")])
);

function restore() {
  for (const [file, contents] of before) {
    try {
      if (readFileSync(file, "utf8") !== contents) {
        writeFileSync(file, contents);
        console.log(`[build:check] restored ${file}`);
      }
    } catch {
      // best effort — never fail the run over this
    }
  }
}

console.log(`[build:check] building into ${DIST} (leaves .next alone)\n`);

// Bigger heap: a plain `next build` OOMs on this project after compiling.
const child = spawn("npm", ["run", "build"], {
  stdio: "inherit",
  shell: true, // npm is a shell script on Windows
  env: {
    ...process.env,
    NEXT_DIST_DIR: DIST,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=8192`.trim()
  }
});

child.on("exit", (code) => {
  restore();
  if (code === 0) console.log(`\n[build:check] clean — this is what Vercel will do.`);
  process.exit(code ?? 1);
});

// Ctrl-C mid-build would otherwise leave the guarded files rewritten.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}
