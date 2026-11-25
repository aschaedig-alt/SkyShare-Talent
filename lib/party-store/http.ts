import { NextResponse } from "next/server";
import { requireApiPermission, type ApiRouteUser } from "@/lib/auth/route-auth";
import { StoreError } from "@/lib/party-store/server";

/**
 * Every admin store route: events:write (a viewer who can see Events cannot
 * ring anything up or read the personal links), then the handler, with a
 * StoreError turned into its message and anything else into a plain 500.
 */
export async function storeAdminRoute(
  label: string,
  handler: (user: ApiRouteUser) => Promise<Response>
): Promise<Response> {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  try {
    return await handler(auth.user);
  } catch (error) {
    return storeErrorResponse(label, error);
  }
}

export function storeErrorResponse(label: string, error: unknown) {
  if (error instanceof StoreError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error(`Party store: ${label}:`, error);
  return NextResponse.json({ message: "Something went wrong. Try again." }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    throw new StoreError("That request was not readable.");
  }
}

/** Who did it, for the order record. Null under the local-dev bypass. */
export function actorOf(user: ApiRouteUser) {
  return user.email ?? null;
}
