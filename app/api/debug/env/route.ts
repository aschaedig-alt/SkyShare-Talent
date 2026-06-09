import { NextResponse } from "next/server";

export async function GET() {
  // IMPORTANT: Only return non-sensitive info for debugging
  return NextResponse.json({
    env: {
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ? "SET" : "MISSING",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "SET" : "MISSING",
      AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ? "SET" : "MISSING",
      AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ? "SET" : "MISSING",
      DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    },
    googleConfigured: Boolean(
      process.env.NEXTAUTH_SECRET &&
        process.env.AUTH_GOOGLE_ID &&
        process.env.AUTH_GOOGLE_SECRET
    ),
  });
}
