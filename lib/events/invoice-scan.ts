import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { deleteStoredFiles, getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isSupplyCategory } from "@/lib/events/constants";
import type { ApplyItem, ScanResult, ScannedItem } from "@/lib/events/invoice-scan-shared";

// Scan a supplier invoice (and its mock-ups) into the stock room. Her ask and her
// rules: invoice-scan-shared.ts.
//
// HOW: every uploaded file goes to Claude in ONE request - PDFs as documents,
// pictures as images - so it can read the invoice lines AND look at each mock-up to
// see which line it shows. It returns each line with the file and the box on that
// page where the product's picture is. The BROWSER then crops the picture out of
// its own render of that page (react-pdf, already used by the PDF viewer), so the
// server never renders a PDF and needs no native image library.
//
// NOTHING IS SAVED BY A SCAN. HR reviews the list - name, category, how many to
// add, the picture - and confirms; only then are supply items made or topped up and
// the pictures stored. Every confirm records what it did, and "Undo last scan"
// takes it back out.
//
// PICTURES WITHOUT A SCHEMA CHANGE: SupplyItem has no picture column, so each
// item's picture lives in file storage under supply-photos/<id>/..., and the map of
// item -> picture is one WorkspaceSetting (scope "events", key "supply-photos"), the
// same trade the rest of the app makes against the shared live database.

const SCOPE = "events";
const PHOTO_KEY = "supply-photos";
const UNDO_KEY = "supply-scan-undo";
const MODEL = process.env.INVOICE_SCAN_MODEL || "claude-opus-5-5";

export type SupplyPhoto = { key: string; contentType: string; updatedAt: string };
type UndoRecord = {
  at: string;
  by: string | null;
  note: string;
  created: string[];
  updated: Array<{ id: string; onHand: number; unitCost: number | null; vendor: string | null; reorderUrl: string | null; notes: string | null }>;
  photos: Array<{ id: string; previous: SupplyPhoto | null; added: string }>;
};

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: SCOPE, key } }, select: { valueJson: true } });
  if (!row?.valueJson) return fallback;
  try {
    return JSON.parse(row.valueJson) as T;
  } catch {
    return fallback;
  }
}
async function writeSetting(key: string, value: unknown): Promise<void> {
  const valueJson = JSON.stringify(value);
  await prisma.workspaceSetting.upsert({ where: { scope_key: { scope: SCOPE, key } }, create: { scope: SCOPE, key, valueJson }, update: { valueJson } });
}

export async function getSupplyPhotos(): Promise<Record<string, SupplyPhoto>> {
  return readSetting<Record<string, SupplyPhoto>>(PHOTO_KEY, {});
}

export function isScanConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ---------------------------------------------------------------------------
// Reading.

const NS = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const NN = { anyOf: [{ type: "number" }, { type: "null" }] } as const;
const NI = { anyOf: [{ type: "integer" }, { type: "null" }] } as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "invoiceDate", "items", "notes"],
  properties: {
    supplier: {
      type: "object",
      additionalProperties: false,
      required: ["name", "website", "email", "phone"],
      properties: { name: NS, website: NS, email: NS, phone: NS }
    },
    invoiceDate: NS,
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "itemNumber", "color", "quantity", "unitPrice", "lineTotal", "setupFee", "details", "category", "pictureFile", "pictureBox"],
        properties: {
          name: { type: "string" },
          itemNumber: NS,
          color: NS,
          quantity: NN,
          unitPrice: NN,
          lineTotal: NN,
          setupFee: NN,
          details: NS,
          category: { type: "string", enum: ["SWAG", "PRINT", "BOOTH", "APPAREL", "OTHER"] },
          pictureFile: NI,
          pictureBox: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["x", "y", "w", "h"],
                properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } }
              },
              { type: "null" }
            ]
          }
        }
      }
    },
    notes: { type: "array", items: { type: "string" } }
  }
} as const;

const SYSTEM = [
  "You read a supplier's paperwork for SkyShare's stock room of promotional items (swag): usually one invoice plus one mock-up (proof) page per item, but it can be an invoice alone, mock-ups alone, a receipt, or photos.",
  "Return one item per product line on the invoice. Skip lines that are only fees (Setup Fee, Processing Fee, Shipping, Tax); a Setup Fee that follows a product line is that product's setupFee.",
  "THE NAME: use the invoice line's Description exactly as written (keep the trademark symbols and quotes). Never use the heading printed on a mock-up page as the name - mock-up headings are often shortened (\"CUSTOM PEN - RED\") and can even carry another item's title by mistake. If there is no invoice, use the mock-up's file name without the extension.",
  "THE PICTURE: for each item, find the uploaded file whose picture SHOWS that product - decide by what the picture shows (a pen, a keychain, sunglasses), by its colour and by the file name, never by the heading printed on the mock-up. pictureFile is that file's number as given (File 0, File 1, ...). pictureBox is the rectangle around the product picture itself on that file's FIRST page, as fractions of the page width and height (x and y are the top-left corner, 0 to 1). Include the whole product, leave out the side panels, logos panel, headings and footers. If several pictures of the product are on the page (front and back), box all of them together. Use the invoice's own tiny thumbnail only when no other file shows the product. null when no file shows it.",
  "details: the imprint details from the mock-up (location, size, method and imprint colour, e.g. \"Front, 4in wide, embroidery, white; Back, 4in wide, embroidery, white\"), or null.",
  "category: APPAREL for clothing and hats, PRINT for paper (cards, flyers, banners), BOOTH for display equipment, SWAG for other giveaways, OTHER when unsure.",
  "Numbers are plain numbers (2.4, not \"$2.40\"). invoiceDate is the invoice date as YYYY-MM-DD, or null.",
  "notes: short plain sentences about anything HR should check - a mock-up you could not match to a line, a line with no picture, a quantity you could not read. Empty when everything matched."
].join("\n");

export type ScanFile = { name: string; type: string; bytes: Buffer };

/** Read the files into items. Writes nothing. Throws with a readable message. */
export async function scanInvoice(files: ScanFile[]): Promise<ScanResult> {
  if (!isScanConfigured()) throw new Error("Scanning needs the Anthropic key, which is not set on this server.");
  if (!files.length) throw new Error("Choose the invoice and its mock-ups.");
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  files.forEach((f, i) => {
    content.push({ type: "text", text: `File ${i}: ${f.name}` });
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.bytes.toString("base64") } });
    } else {
      const media = f.type === "image/png" ? "image/png" : f.type === "image/webp" ? "image/webp" : "image/jpeg";
      content.push({ type: "image", source: { type: "base64", media_type: media, data: f.bytes.toString("base64") } });
    }
  });
  content.push({ type: "text", text: "Return every item in this paperwork." });

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }]
  });
  const response = await stream.finalMessage();
  if (response.stop_reason === "refusal") throw new Error("The files could not be read (the model declined them).");
  if (response.stop_reason === "max_tokens") throw new Error("Too much to read in one go. Scan fewer items at a time.");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  if (!text.trim()) throw new Error("Nothing came back from reading the files.");
  const raw = JSON.parse(text) as ScanResult;

  // Items already in the stock room under the same name: the scan adds to them.
  const existing = await prisma.supplyItem.findMany({ select: { id: true, name: true } });
  const byName = new Map(existing.map((e) => [e.name.trim().toLowerCase(), e]));
  const frac = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const items: ScannedItem[] = (raw.items ?? [])
    .filter((it) => it && typeof it.name === "string" && it.name.trim())
    .map((it) => {
      const match = byName.get(it.name.trim().toLowerCase());
      const file = typeof it.pictureFile === "number" && it.pictureFile >= 0 && it.pictureFile < files.length ? it.pictureFile : null;
      const box = it.pictureBox && file !== null ? { x: frac(it.pictureBox.x), y: frac(it.pictureBox.y), w: frac(it.pictureBox.w), h: frac(it.pictureBox.h) } : null;
      return {
        ...it,
        name: it.name.trim().slice(0, 200),
        category: isSupplyCategory(it.category) ? it.category : "SWAG",
        pictureFile: file,
        pictureBox: box && box.w > 0.02 && box.h > 0.02 ? box : null,
        existingId: match?.id ?? null,
        existingName: match?.name ?? null
      };
    });
  return { supplier: raw.supplier ?? { name: null, website: null, email: null, phone: null }, invoiceDate: raw.invoiceDate ?? null, items, notes: raw.notes ?? [] };
}

// ---------------------------------------------------------------------------
// Confirming.

const money = (n: number) => `$${n.toFixed(2)}`;

/** The notes line a scanned item carries, so the details survive without new columns. */
function notesFor(it: ApplyItem, supplier: string | null, invoiceDate: string | null): string {
  return [
    it.itemNumber ? `Item # ${it.itemNumber}` : null,
    it.color ? `Color: ${it.color}` : null,
    it.details ? `Imprint: ${it.details}` : null,
    it.setupFee ? `Setup fee ${money(it.setupFee)} (one time)` : null,
    supplier || invoiceDate ? `From the ${supplier ?? "supplier"} invoice${invoiceDate ? ` of ${invoiceDate}` : ""}` : null
  ]
    .filter(Boolean)
    .join(" · ");
}

export type ApplyResult = { created: number; updated: number; photos: number };

export async function applyScan(input: {
  items: ApplyItem[];
  photos: Record<string, { bytes: Buffer; contentType: string }>;
  supplier: { name: string | null; website: string | null };
  invoiceDate: string | null;
  actor: string | null;
}): Promise<ApplyResult> {
  const chosen = input.items.filter((i) => i.include && i.name.trim());
  if (!chosen.length) throw new Error("Tick at least one item to add.");
  const photoMap = await getSupplyPhotos();
  const undo: UndoRecord = { at: new Date().toISOString(), by: input.actor, note: "", created: [], updated: [], photos: [] };
  const vendor = input.supplier.name?.trim() || null;
  const website = input.supplier.website?.trim() ? (/^https?:\/\//i.test(input.supplier.website.trim()) ? input.supplier.website.trim() : `https://${input.supplier.website.trim()}`) : null;
  const written: string[] = [];
  try {
    for (const it of chosen) {
      const qty = Math.max(0, Math.floor(Number.isFinite(it.quantity) ? it.quantity : 0));
      const unitCost = typeof it.unitCost === "number" && Number.isFinite(it.unitCost) ? it.unitCost : null;
      const note = notesFor(it, vendor, input.invoiceDate);
      let id: string;
      const existing = it.existingId ? await prisma.supplyItem.findUnique({ where: { id: it.existingId } }) : null;
      if (existing) {
        undo.updated.push({ id: existing.id, onHand: existing.onHand, unitCost: existing.unitCost, vendor: existing.vendor, reorderUrl: existing.reorderUrl, notes: existing.notes });
        await prisma.supplyItem.update({
          where: { id: existing.id },
          data: {
            onHand: existing.onHand + qty,
            unitCost: unitCost ?? existing.unitCost,
            vendor: existing.vendor ?? vendor,
            reorderUrl: existing.reorderUrl ?? website,
            notes: existing.notes ? (existing.notes.includes(note) ? existing.notes : `${existing.notes}\n${note}`) : note || null
          }
        });
        id = existing.id;
      } else {
        const created = await prisma.supplyItem.create({
          data: {
            name: it.name.trim().slice(0, 200),
            category: isSupplyCategory(it.category) ? it.category : "SWAG",
            unit: "each",
            onHand: qty,
            reorderThreshold: 0,
            vendor,
            reorderUrl: website,
            unitCost,
            notes: note || null
          }
        });
        undo.created.push(created.id);
        id = created.id;
      }
      const photo = it.photoField ? input.photos[it.photoField] : undefined;
      if (photo) {
        const ext = photo.contentType === "image/png" ? "png" : "jpg";
        const key = `supply-photos/${id}/${Date.now()}-${randomUUID()}.${ext}`;
        await getFileStorageAdapter().write({ storageKey: key, bytes: photo.bytes, contentType: photo.contentType });
        written.push(key);
        undo.photos.push({ id, previous: photoMap[id] ?? null, added: key });
        photoMap[id] = { key, contentType: photo.contentType, updatedAt: new Date().toISOString() };
      }
    }
  } finally {
    // Whatever got written is recorded, so Undo can take it back even after a failure part way.
    undo.note = `Scanned ${vendor ?? "an invoice"}: ${undo.created.length} new, ${undo.updated.length} topped up`;
    await writeSetting(PHOTO_KEY, photoMap);
    await writeSetting(UNDO_KEY, undo);
  }
  return { created: undo.created.length, updated: undo.updated.length, photos: undo.photos.length };
}

export async function getScanUndo(): Promise<{ note: string; at: string } | null> {
  const u = await readSetting<UndoRecord | null>(UNDO_KEY, null);
  return u && (u.created.length || u.updated.length || u.photos.length) ? { note: u.note, at: u.at } : null;
}

/**
 * Take the last confirmed scan back out: new items deleted (or retired if an event
 * already lists them), topped-up items set back, pictures put back as they were.
 */
export async function undoScan(): Promise<{ removed: number; retired: number; restored: number }> {
  const u = await readSetting<UndoRecord | null>(UNDO_KEY, null);
  if (!u) return { removed: 0, retired: 0, restored: 0 };
  const photoMap = await getSupplyPhotos();
  let removed = 0;
  let retired = 0;
  for (const p of [...u.photos].reverse()) {
    if (p.previous) photoMap[p.id] = p.previous;
    else delete photoMap[p.id];
  }
  await deleteStoredFiles(u.photos.map((p) => p.added)).catch(() => undefined);
  for (const id of u.created) {
    const used = await prisma.eventSupply.count({ where: { supplyItemId: id } });
    if (used) {
      await prisma.supplyItem.update({ where: { id }, data: { active: false } }).catch(() => undefined);
      retired++;
    } else {
      await prisma.supplyItem.delete({ where: { id } }).catch(() => undefined);
      delete photoMap[id];
      removed++;
    }
  }
  for (const prev of u.updated) {
    await prisma.supplyItem
      .update({ where: { id: prev.id }, data: { onHand: prev.onHand, unitCost: prev.unitCost, vendor: prev.vendor, reorderUrl: prev.reorderUrl, notes: prev.notes } })
      .catch(() => undefined);
  }
  await writeSetting(PHOTO_KEY, photoMap);
  await writeSetting(UNDO_KEY, null);
  return { removed, retired, restored: u.updated.length };
}
