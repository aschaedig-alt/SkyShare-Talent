import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname
});

const config = [
  {
    // ESLint has its OWN ignore list — being in .gitignore is not enough. When
    // .next-check (the isolated verification-build output, see
    // scripts/build-check.mjs) was missing from here, ESLint walked thousands of
    // generated bundles, reported a wall of no-require-imports errors from
    // compiled output, and then ran out of memory. Any new build directory has
    // to be added here as well as to .gitignore.
    ignores: [
      ".next/**",
      ".next-check/**",
      "node_modules/**",
      "next-env.d.ts",
      "scripts/**/*.cjs",
      "public/vendor/**"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript")
];

export default config;
