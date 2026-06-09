import NextAuth from "next-auth";
import { authOptions } from "@/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
// Auth redeploy trigger at Tue Jun  9 15:14:56 MDT 2026
