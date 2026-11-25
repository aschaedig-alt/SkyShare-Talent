import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { getSupplyPhotos } from "@/lib/events/invoice-scan";

// A stock-room item's picture (from an invoice scan, feedback cmwwjnqfj). The map
// of item -> stored picture is in lib/events/invoice-scan.ts.

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("events:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  const photo = (await getSupplyPhotos())[id];
  if (!photo) return NextResponse.json({ message: "No picture." }, { status: 404 });
  try {
    const file = await getFileStorageAdapter().read(photo.key);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=3600" }
    });
  } catch {
    return NextResponse.json({ message: "The picture could not be read." }, { status: 404 });
  }
}
