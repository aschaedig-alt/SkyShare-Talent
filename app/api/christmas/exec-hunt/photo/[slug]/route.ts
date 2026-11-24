import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";

// PUBLIC - an executive's uploaded photo. URLs carry ?v=<upload time>, so a
// replaced photo gets a new URL and the old one can be cached for good: 200 phones
// on hangar Wi-Fi then get each photo from the CDN, not from this function.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const exec = await prisma.execHuntExecutive.findUnique({ where: { slug } });
  if (!exec?.photoKey) return NextResponse.json({ message: "No photo" }, { status: 404 });
  try {
    const file = await getFileStorageAdapter().read(exec.photoKey);
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": exec.photoContentType ?? file.contentType ?? "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Exec hunt photo error:", error);
    return NextResponse.json({ message: "Photo unavailable" }, { status: 404 });
  }
}
