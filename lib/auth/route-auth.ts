import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { hasPermission, isRoleName, type Permission, type RoleName } from "@/lib/auth/roles";
import { isAuthRequired } from "@/lib/auth/auth-config";

export type ApiRouteUser = {
  id: string | null;
  email: string | null;
  name?: string | null;
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

/** Allow any authenticated user (any role). Used for actions every user may take, e.g. feedback. */
export async function requireApiUser(): Promise<ApiAuthResult> {
  if (!isAuthRequired()) {
    return {
      ok: true,
      user: { id: null, email: null, role: "ADMIN", authMode: "local-bypass" }
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

  return {
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      role,
      authMode: "session"
    }
  };
}

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
