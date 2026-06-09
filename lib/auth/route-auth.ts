import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { hasPermission, isRoleName, type Permission, type RoleName } from "@/lib/auth/roles";
import { isAuthRequired } from "@/lib/auth/auth-config";

export type ApiRouteUser = {
  id: string | null;
  email: string | null;
  role: RoleName;
  authMode: "local-bypass" | "session";
};

export type ApiAuthResult =
  | {
      ok: true;
      user: ApiRouteUser;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireApiPermission(permission: Permission): Promise<ApiAuthResult> {
  if (!isAuthRequired()) {
    return {
      ok: true,
      user: {
        id: null,
        email: null,
        role: "ADMIN",
        authMode: "local-bypass"
      }
    };
  }

  const session = await getServerSession(authOptions);
  const role = isRoleName(session?.user?.role) ? session.user.role : null;

  if (!session?.user?.id || !role) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Authentication is required." }, { status: 401 })
    };
  }

  if (!hasPermission(role, permission)) {
    return {
      ok: false,
      response: NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 })
    };
  }

  return {
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      role,
      authMode: "session"
    }
  };
}
