/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Handbook viewer reads docs/sops/*.html at runtime (see lib/handbook/render.ts).
  // Those files aren't imported, so trace them into the serverless bundle explicitly
  // or they won't exist on Vercel.
  outputFileTracingIncludes: {
    "/handbook/[slug]": ["./docs/sops/*.html"]
  }
};

export default nextConfig;
