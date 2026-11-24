import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFailureResponse, requireApiPermission } from "@/lib/auth/route-auth";
import { deleteStoredFiles, getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { invalidateLiveCache } from "@/lib/exec-hunt/server";

// ADMIN - upload or replace an executive's photo. Changing the photo never
// touches a picture's publicKey, so printed QR codes are unaffected (reprint the
// cards PDF if you want the new photo on them).
//
// JPEG or PNG only: those are the two formats the cards PDF (pdf-lib) can embed.
// The admin page resizes in the browser to a ~1000px JPEG first, so what arrives
// is small enough for 200 phones on hangar Wi-Fi.
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return authFailureResponse(auth);
  const { slug } = await params;
  const exec = await prisma.execHuntExecutive.findUnique({ where: { slug } });
  if (!exec) return NextResponse.json({ message: "No such executive." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File)) return NextResponse.json({ message: "Choose a photo." }, { status: 400 });
  const extension = TYPES[photo.type];
  if (!extension) return NextResponse.json({ message: "Use a JPEG or PNG photo." }, { status: 400 });
  if (photo.size > MAX_BYTES) return NextResponse.json({ message: "That photo is over 4 MB." }, { status: 400 });

  const bytes = Buffer.from(await photo.arrayBuffer());
  // Magic-number check: the declared type has to match the bytes.
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if ((extension === "jpg" && !isJpeg) || (extension === "png" && !isPng)) {
    return NextResponse.json({ message: "That file is not really a JPEG or PNG." }, { status: 400 });
  }

  const storageKey = `exec-hunt/${exec.slug}/${Date.now()}-${randomUUID()}.${extension}`;
  await getFileStorageAdapter().write({ storageKey, bytes, contentType: photo.type });
  await prisma.execHuntExecutive.update({
    where: { id: exec.id },
    data: { photoKey: storageKey, photoContentType: photo.type, photoUpdatedAt: new Date() }
  });
  if (exec.photoKey) await deleteStoredFiles([exec.photoKey]).catch(() => undefined);
  invalidateLiveCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return authFailureResponse(auth);
  const { slug } = await params;
  const exec = await prisma.execHuntExecutive.findUnique({ where: { slug } });
  if (!exec) return NextResponse.json({ message: "No such executive." }, { status: 404 });
  await prisma.execHuntExecutive.update({
    where: { id: exec.id },
    data: { photoKey: null, photoContentType: null, photoUpdatedAt: new Date() }
  });
  if (exec.photoKey) await deleteStoredFiles([exec.photoKey]).catch(() => undefined);
  invalidateLiveCache();
  return NextResponse.json({ ok: true });
}
