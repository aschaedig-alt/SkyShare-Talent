import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { applyScan, getScanUndo, scanInvoice, undoScan, type ScanFile } from "@/lib/events/invoice-scan";
import { SCAN_MAX_TOTAL_BYTES, type ApplyItem } from "@/lib/events/invoice-scan-shared";

// Scan a supplier invoice into the stock room (Aimee's feedback cmwwjnqfj). Rules
// in lib/events/invoice-scan.ts.
//
//   GET                                     whether an undo is available
//   POST multipart  files=...               READ the files and return the items (writes nothing)
//   POST multipart  action=apply, payload=<json>, photo_<n>=<jpeg>   add the confirmed items
//   POST json       { action: "undo" }      take the last confirmed scan back out

export const maxDuration = 300;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET() {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  return NextResponse.json({ undo: await getScanUndo() });
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const actor = auth.user.email ?? auth.user.name ?? null;

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "undo") return NextResponse.json({ message: "Unknown action." }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await undoScan()) });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ message: "Choose the files." }, { status: 400 });

  try {
    if (form.get("action") === "apply") {
      const payload = JSON.parse(String(form.get("payload") ?? "{}")) as {
        items?: unknown[];
        supplier?: { name?: unknown; website?: unknown };
        invoiceDate?: unknown;
      };
      const items: ApplyItem[] = (payload.items ?? []).slice(0, 200).map((raw) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        return {
          include: o.include === true,
          name: str(o.name, 200) ?? "",
          category: str(o.category, 20) ?? "SWAG",
          quantity: Math.max(0, Math.floor(num(o.quantity) ?? 0)),
          unitCost: num(o.unitCost),
          itemNumber: str(o.itemNumber, 80),
          color: str(o.color, 80),
          details: str(o.details, 500),
          setupFee: num(o.setupFee),
          existingId: str(o.existingId, 40),
          photoField: str(o.photoField, 20)
        };
      });
      const photos: Record<string, { bytes: Buffer; contentType: string }> = {};
      for (const [k, v] of form.entries()) {
        if (!/^photo_\d+$/.test(k) || typeof v === "string") continue;
        if (!IMAGE_TYPES.has(v.type) || v.size > 3 * 1024 * 1024) continue;
        const bytes = Buffer.from(await v.arrayBuffer());
        const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
        const png = bytes[0] === 0x89 && bytes[1] === 0x50;
        if (!jpeg && !png) continue;
        photos[k] = { bytes, contentType: jpeg ? "image/jpeg" : "image/png" };
      }
      const result = await applyScan({
        items,
        photos,
        supplier: { name: str(payload.supplier?.name, 120), website: str(payload.supplier?.website, 300) },
        invoiceDate: str(payload.invoiceDate, 20),
        actor
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const files: ScanFile[] = [];
    let total = 0;
    for (const v of form.getAll("files")) {
      if (typeof v === "string") continue;
      total += v.size;
      if (total > SCAN_MAX_TOTAL_BYTES) return NextResponse.json({ message: "Those files add up to more than 4 MB. Scan fewer at a time." }, { status: 400 });
      const isPdf = v.type === "application/pdf" || v.name.toLowerCase().endsWith(".pdf");
      if (!isPdf && !IMAGE_TYPES.has(v.type)) return NextResponse.json({ message: `${v.name}: use a PDF or a picture (JPEG, PNG or WebP).` }, { status: 400 });
      files.push({ name: v.name, type: isPdf ? "application/pdf" : v.type, bytes: Buffer.from(await v.arrayBuffer()) });
    }
    return NextResponse.json({ ok: true, result: await scanInvoice(files) });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "Could not read those files." }, { status: 400 });
  }
}
