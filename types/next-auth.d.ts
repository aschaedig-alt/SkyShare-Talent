import type { RoleName } from "@/lib/auth/roles";
import type { ViewAsTokenState } from "@/lib/auth/view-as-token";

declare module "next-auth" {
  interface Session {
    // While an ADMIN is viewing as somebody, THIS IS THE OTHER PERSON — that is
    // the whole design (lib/auth/view-as.ts). The admin's own identity is in
    // viewAs below.
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: RoleName;
    };
    // Present only while viewing as somebody else.
    viewAs?: {
      realUserId: string;
      realEmail: string | null;
      realName: string | null;
      startedAt: number;
      expiresAt: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    // Always the REAL signed-in account, even while viewing as somebody.
    id?: string;
    role?: RoleName;
    viewAs?: ViewAsTokenState;
  }
}
