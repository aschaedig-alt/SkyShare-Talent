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
  },
  async redirects() {
    return [
      // Fleet positions moved out of Admin > Settings to /fleet/positions — it
      // is recruiting reference data, not an admin setting. The old path was in
      // the sidebar for months, so it is bookmarked and linked to.
      //
      // Done HERE rather than with redirect() in a page: a redirect() thrown
      // from a Server Component under /settings was caught by a parent error
      // boundary and rendered as an error page (NEXT_REDIRECT in the payload,
      // HTTP 200, no Location header) instead of redirecting. A config redirect
      // is a real 308 that never reaches React and cannot be swallowed.
      { source: "/settings/fleet", destination: "/fleet/positions", permanent: true }
    ];
  }
};

export default nextConfig;
