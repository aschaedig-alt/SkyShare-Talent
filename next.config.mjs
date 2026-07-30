/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Several Claude sessions share this one working tree, and the build output
  // directory belongs to the DIRECTORY rather than to the git branch — so a
  // verification build and a running dev server were writing the same .next and
  // corrupting it. Symptoms were misleading: "Failed to collect page data" and
  // "Cannot find module for page: /_document", neither of which points at the
  // real cause. A verification build now sets NEXT_DIST_DIR (see the build:check
  // script) so it lands somewhere else entirely and the dev server keeps .next
  // to itself. Vercel sets nothing, so production builds use the default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The Handbook viewer reads docs/sops/*.html at runtime (see lib/handbook/render.ts).
  // Those files aren't imported, so trace them into the serverless bundle explicitly
  // or they won't exist on Vercel.
  outputFileTracingIncludes: {
    "/handbook/[slug]": ["./docs/sops/*.html"]
  }
};

export default nextConfig;
