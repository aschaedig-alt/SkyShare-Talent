import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  getWorkspaceBranding,
  saveWorkspaceBranding,
  isValidLogoDataUrl,
  MAX_LOGO_DATA_URL_LENGTH
} from "@/lib/data/branding";

export const dynamic = "force-dynamic";

export async function GET() {
  const branding = await getWorkspaceBranding();
  return NextResponse.json(branding);
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");

  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as { logoDataUrl?: unknown };
    const raw = payload?.logoDataUrl;

    // Explicit clear: null / empty string removes the logo.
    if (raw === null || raw === "") {
      const saved = await saveWorkspaceBranding({ logoDataUrl: null });
      return NextResponse.json(saved);
    }

    if (!isValidLogoDataUrl(raw)) {
      return NextResponse.json(
        {
          message: `Upload a PNG, JPG, WEBP, GIF, or SVG image under ${Math.floor(
            MAX_LOGO_DATA_URL_LENGTH / 1000
          )} KB.`
        },
        { status: 400 }
      );
    }

    const saved = await saveWorkspaceBranding({ logoDataUrl: raw });
    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ message: "Unable to save branding." }, { status: 500 });
  }
}
