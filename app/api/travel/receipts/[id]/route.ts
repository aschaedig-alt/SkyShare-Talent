import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ id: string }> };

function contentDisposition(filename: string) {
  return `inline; filename="${filename.replace(/"/g, "'")}"`;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireApiPermission("files:read");
    if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const receipt = await prisma.travelReceipt.findUnique({
      where: { id },
      select: { storageKey: true, displayFilename: true, mimeType: true }
    });
    if (!receipt?.storageKey) {
      return NextResponse.json({ message: "Receipt content is not available." }, { status: 404 });
    }

    const { bytes } = await getFileStorageAdapter().read(receipt.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": receipt.mimeType ?? "application/octet-stream",
        "Content-Disposition": contentDisposition(receipt.displayFilename),
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to open receipt." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await requireApiPermission("files:write");
    if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const existing = await prisma.travelReceipt.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ message: "Receipt not found." }, { status: 404 });

    // The stored blob is left in place (no adapter delete yet); only the row is removed.
    await prisma.travelReceipt.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to delete receipt." }, { status: 500 });
  }
}
