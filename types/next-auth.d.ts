import type { RoleName } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: RoleName;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: RoleName;
  }
}
