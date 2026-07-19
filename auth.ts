import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { isEmailBlocked } from "@/lib/auth/blocklist";

function csvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function authSecret() {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
}

export function isGoogleAuthConfigured() {
  return Boolean(
    authSecret() &&
      (process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID) &&
      (process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)
  );
}

export function isEmailAllowedForAuth(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.split("@")[1] ?? "";
  const allowedEmails = csvEnv("AUTH_ALLOWED_EMAILS");
  const allowedDomains = csvEnv("AUTH_ALLOWED_DOMAINS");
  const adminEmails = csvEnv("AUTH_ADMIN_EMAILS");

  return (
    adminEmails.includes(normalizedEmail) ||
    allowedEmails.includes(normalizedEmail) ||
    allowedDomains.includes(domain)
  );
}

function initialRoleForEmail(email: string | null | undefined): RoleName {
  const normalizedEmail = email?.trim().toLowerCase();

  if (normalizedEmail && csvEnv("AUTH_ADMIN_EMAILS").includes(normalizedEmail)) {
    return "ADMIN";
  }

  // New team members get read-only access by default. Admins must grant access via Settings.
  return "VIEWER";
}

async function loadTokenUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true }
  });

  if (!user) {
    return null;
  }

  const firstAdminRole = initialRoleForEmail(email);

  if (firstAdminRole === "ADMIN" && user.role !== "ADMIN") {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
      select: { id: true, role: true }
    });

    return updated;
  }

  return user;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: authSecret(),
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  providers: isGoogleAuthConfigured()
    ? [
        GoogleProvider({
          clientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
          allowDangerousEmailAccountLinking: false
        })
      ]
    : [],
  callbacks: {
    async signIn({ user }) {
      // A revoked (blocked) email can never sign back in, even if its domain is
      // otherwise allowed — this is what makes offboarding stick.
      if (await isEmailBlocked(user.email)) {
        return false;
      }
      return isEmailAllowedForAuth(user.email);
    },
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email)?.trim().toLowerCase();

      if (!email) {
        return token;
      }

      const dbUser = await loadTokenUser(email);
      const role = isRoleName(dbUser?.role) ? dbUser.role : initialRoleForEmail(email);

      token.id = dbUser?.id ?? token.sub;
      token.role = role;

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : token.sub ?? "";
        session.user.role = isRoleName(String(token.role)) ? (token.role as RoleName) : "VIEWER";
      }

      return session;
    }
  }
};
