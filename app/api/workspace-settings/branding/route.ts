import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  getWorkspaceBranding,
  saveWorkspaceBranding,
  isValidLogoDataUrl,
  MAX_LOGOS,
  MAX_LOGO_DATA_URL_LENGTH
} from "@/lib/data/branding";

export const dynamic = "force-dynamic";

/** Total serialized logo payload cap, to keep the settings row reasonable. */
const MAX_TOTAL_LOGO_BYTES = 6_000_000;

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
    const payload = (await request.json()) as { logos?: unknown; assignments?: unknown };
    const logos = Array.isArray(payload?.logos) ? payload.logos : [];

    if (logos.length > MAX_LOGOS) {
      return NextResponse.json({ message: `You can store up to ${MAX_LOGOS} logos.` }, { status: 400 });
    }

    let totalBytes = 0;
    for (const entry of logos) {
      const dataUrl = (entry as { dataUrl?: unknown })?.dataUrl;
      if (!isValidLogoDataUrl(dataUrl)) {
        return NextResponse.json(
          {
            message: `Each logo must be a PNG, JPG, WEBP, GIF, or SVG under ${Math.floor(
              MAX_LOGO_DATA_URL_LENGTH / 1000
            )} KB.`
          },
          { status: 400 }
        );
      }
      totalBytes += dataUrl.length;
    }

    if (totalBytes > MAX_TOTAL_LOGO_BYTES) {
      return NextResponse.json(
        { message: "Total logo size is too large. Remove a logo or use smaller files." },
        { status: 400 }
      );
    }

    const saved = await saveWorkspaceBranding(payload);
    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ message: "Unable to save branding." }, { status: 500 });
  }
}
