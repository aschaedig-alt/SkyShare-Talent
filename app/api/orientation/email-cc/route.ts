import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getOrientationCc, resetOrientationCc, saveOrientationCc } from "@/lib/orientation/email-cc";

export const dynamic = "force-dynamic";

/** Who is cc'd on every orientation email (the hire's supervisor is added
    separately, from their own record). */
export async function GET() {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getOrientationCc());
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { addresses?: unknown; reset?: boolean };
    if (body?.reset === true) {
      return NextResponse.json({ ok: true, addresses: await resetOrientationCc(), customized: false });
    }
    if (!Array.isArray(body?.addresses)) {
      return NextResponse.json({ message: "addresses must be a list." }, { status: 400 });
    }
    // Anything that isn't a valid address is dropped, so say what was kept —
    // silently discarding a typo'd address is how someone stops getting cc'd
    // without ever finding out.
    const addresses = await saveOrientationCc(body.addresses);
    const dropped = body.addresses.filter(
      (a): a is string => typeof a === "string" && a.trim().length > 0 && !addresses.includes(a.trim().toLowerCase())
    );
    return NextResponse.json({ ok: true, addresses, customized: true, dropped });
  } catch (error) {
    console.error("Save orientation cc error:", error);
    return NextResponse.json({ message: "Unable to save the cc list." }, { status: 500 });
  }
}
