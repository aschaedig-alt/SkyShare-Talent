"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { FileText, Upload } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SUPPLY_CATEGORIES } from "@/lib/events/constants";
import { SCAN_FILE_TYPES, SCAN_MAX_TOTAL_BYTES, type ScanResult, type ScannedItem } from "@/lib/events/invoice-scan-shared";

// Scan a supplier invoice into the stock room (Aimee's feedback cmwwjnqfj). Choose
// the invoice and its mock-ups; the server reads them (nothing is saved); this
// dialog crops each item's picture out of the page it is on and lists what it
// found, every field editable; "Add to the stock room" saves only the ticked rows.
// Rules and her naming rule: lib/events/invoice-scan-shared.ts.
//
// THE PICTURES ARE CROPPED HERE, in the browser, from a render of the page made with
// react-pdf's pdf.js (as the PDF viewer does) - the server never renders a PDF.

type Row = ScannedItem & { include: boolean; qtyText: string; costText: string; usePicture: boolean };

const FIELD =
  "w-full rounded border border-brand-lea/20 bg-white px-2 py-1.5 text-sm text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const LABEL = "text-[11px] font-semibold text-brand-grey dark:text-slate-400";
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// pdf.js from /public/vendor, loaded outside the bundle - the way the PDF import
// screen does it (components/imports/ImportActionCards.tsx). Importing react-pdf
// on demand here failed in the browser ("Object.defineProperty called on
// non-object"), so the pictures never drew.
type PdfJsViewport = { width: number; height: number };
type PdfJsPage = {
  getViewport: (opts: { scale: number }) => PdfJsViewport;
  render: (opts: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: PdfJsViewport }) => { promise: Promise<void> };
};
type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<{ getPage: (n: number) => Promise<PdfJsPage> }> };
};
async function loadPdfJs(): Promise<PdfJsModule> {
  // @ts-expect-error Public PDF.js bundle is served from /public/vendor for browser-only rendering.
  const pdfjsLib = (await import(/* webpackIgnore: true */ "/vendor/pdfjs/pdf.min.mjs")) as PdfJsModule;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  return pdfjsLib;
}

/** The first page of a PDF, or a picture, drawn onto a canvas about 1600px wide. */
async function renderFirstPage(file: File): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw pictures.");
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, 1600 / base.width) });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    return canvas;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not open ${file.name}.`));
      el.src = url;
    });
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Cut the box out of the page, at most 1000px on its long side, as a JPEG. */
function crop(page: HTMLCanvasElement, raw: { x: number; y: number; w: number; h: number }): Promise<Blob | null> {
  // A little margin: the boxes come back snug, and on the samples they clipped a
  // keychain's ring and the plane's tail (checked Nov 25 2026).
  const pad = 0.03;
  const x = Math.max(0, raw.x - pad);
  const y = Math.max(0, raw.y - pad);
  const box = { x, y, w: Math.min(1 - x, raw.w + 2 * pad), h: Math.min(1 - y, raw.h + 2 * pad) };
  const sx = Math.round(box.x * page.width);
  const sy = Math.round(box.y * page.height);
  const sw = Math.max(1, Math.round(box.w * page.width));
  const sh = Math.max(1, Math.round(box.h * page.height));
  const scale = Math.min(1, 1000 / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(page, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/jpeg", 0.86));
}

export function InvoiceScanModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [pictures, setPictures] = useState<Record<number, { blob: Blob; url: string }>>({});
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const total = files.reduce((n, f) => n + f.size, 0);

  // Object URLs are freed when the pictures change or the dialog closes.
  useEffect(() => () => Object.values(pictures).forEach((p) => URL.revokeObjectURL(p.url)), [pictures]);

  async function read() {
    setBusy("read");
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const res = await fetch("/api/events/supply-items/scan", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { message?: string; result?: ScanResult };
      if (!res.ok || !data.result) throw new Error(data.message || "Could not read those files.");
      setResult(data.result);
      setRows(
        data.result.items.map((it) => ({
          ...it,
          include: true,
          qtyText: it.quantity !== null ? String(it.quantity) : "",
          costText: it.unitPrice !== null ? String(it.unitPrice) : "",
          usePicture: true
        }))
      );
      // The pictures: one render per file, one crop per item.
      const pages = new Map<number, HTMLCanvasElement | null>();
      const pics: Record<number, { blob: Blob; url: string }> = {};
      const drawErrors: string[] = [];
      for (const [i, it] of data.result.items.entries()) {
        if (it.pictureFile === null || !it.pictureBox) continue;
        if (!pages.has(it.pictureFile)) {
          const file = files[it.pictureFile];
          pages.set(
            it.pictureFile,
            await renderFirstPage(file).catch((err: unknown) => {
              drawErrors.push(`The picture in ${file.name} could not be drawn (${err instanceof Error ? err.message : "unknown error"}).`);
              return null;
            })
          );
        }
        const page = pages.get(it.pictureFile);
        if (!page) continue;
        const blob = await crop(page, it.pictureBox);
        if (blob) pics[i] = { blob, url: URL.createObjectURL(blob) };
      }
      setPictures(pics);
      if (drawErrors.length) setResult({ ...data.result, notes: [...data.result.notes, ...drawErrors] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read those files.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!result) return;
    setBusy("save");
    setError(null);
    try {
      const form = new FormData();
      form.append("action", "apply");
      const items = rows.map((r, i) => {
        const pic = r.usePicture ? pictures[i] : undefined;
        if (pic) form.append(`photo_${i}`, pic.blob, `item-${i}.jpg`);
        return {
          include: r.include,
          name: r.name,
          category: r.category,
          quantity: Number.parseInt(r.qtyText, 10) || 0,
          unitCost: r.costText.trim() ? Number.parseFloat(r.costText) : null,
          itemNumber: r.itemNumber,
          color: r.color,
          details: r.details,
          setupFee: r.setupFee,
          existingId: r.existingId,
          photoField: pic ? `photo_${i}` : null
        };
      });
      form.append("payload", JSON.stringify({ items, supplier: result.supplier, invoiceDate: result.invoiceDate }));
      const res = await fetch("/api/events/supply-items/scan", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { message?: string; created?: number; updated?: number; photos?: number };
      if (!res.ok) throw new Error(data.message || "Could not add them.");
      onDone(`Added ${data.created ?? 0} new ${data.created === 1 ? "item" : "items"}${data.updated ? `, topped up ${data.updated}` : ""}, with ${data.photos ?? 0} ${data.photos === 1 ? "picture" : "pictures"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add them.");
    } finally {
      setBusy(null);
    }
  }

  const patch = (i: number, p: Partial<Row>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const ticked = useMemo(() => rows.filter((r) => r.include).length, [rows]);

  return (
    <Modal open onClose={onClose} busy={Boolean(busy)} maxWidth="max-w-3xl" title="Scan an invoice">
      <div className="p-5 text-left">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Scan an invoice into the stock room</h2>
        <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
          Choose the invoice and the mock-ups that came with it (PDFs or pictures, up to 4 MB together). Each item is named exactly as the invoice line says, and its
          picture comes from the mock-up that shows it. Nothing is added until you check the list and click Add.
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={SCAN_FILE_TYPES}
          className="sr-only"
          onChange={(e) => {
            setFiles([...files, ...Array.from(e.target.files ?? [])]);
            setResult(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:shadow-glow disabled:opacity-50 dark:border-white/10 dark:text-slate-100"
          >
            <Upload className="h-4 w-4" aria-hidden /> Choose files
          </button>
          {files.length ? (
            <button type="button" onClick={() => { setFiles([]); setResult(null); }} disabled={Boolean(busy)} className="text-xs font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
              Clear
            </button>
          ) : null}
        </div>
        {files.length ? (
          <ul className="mt-2 space-y-0.5 text-xs text-brand-lea dark:text-slate-200">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex min-w-0 items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 shrink-0 text-brand-grey" aria-hidden />
                <span className="min-w-0 break-words">{f.name}</span>
                <span className="shrink-0 text-brand-grey dark:text-slate-400">{kb(f.size)}</span>
              </li>
            ))}
            <li className={clsx("pt-1", total > SCAN_MAX_TOTAL_BYTES ? "font-semibold text-red-700 dark:text-red-300" : "text-brand-grey dark:text-slate-400")}>
              {kb(total)} together{total > SCAN_MAX_TOTAL_BYTES ? " - over 4 MB, scan fewer at a time" : ""}
            </li>
          </ul>
        ) : null}
        {!result ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void read()}
              disabled={!files.length || total > SCAN_MAX_TOTAL_BYTES || Boolean(busy)}
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow disabled:opacity-50"
            >
              {busy === "read" ? "Reading - this takes a minute…" : "Read the files"}
            </button>
          </div>
        ) : null}

        {result ? (
          <>
            <div className="mt-4 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-3 text-xs text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <b>{result.supplier.name ?? "Supplier not found"}</b>
              {result.supplier.website ? ` · ${result.supplier.website}` : ""}
              {result.supplier.email ? ` · ${result.supplier.email}` : ""}
              {result.invoiceDate ? ` · invoice ${result.invoiceDate}` : ""}
              {result.notes.length ? (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-amber-800 dark:text-amber-300">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            {rows.length === 0 ? <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">No items found in those files.</p> : null}
            <ul className="mt-3 space-y-3">
              {rows.map((r, i) => {
                const pic = pictures[i];
                return (
                  <li key={i} className={clsx("rounded border p-3", r.include ? "border-brand-lea/15 dark:border-white/10" : "border-dashed border-brand-lea/15 opacity-60 dark:border-white/10")}>
                    <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded bg-white ring-1 ring-brand-lea/10 dark:ring-white/10">
                          {pic && r.usePicture ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, not a remote image
                            <img src={pic.url} alt={`Picture of ${r.name}`} className="max-h-28 max-w-full object-contain" />
                          ) : (
                            <span className="px-2 text-center text-[11px] text-brand-grey">No picture</span>
                          )}
                        </div>
                        {pic ? (
                          <label className="inline-flex items-center gap-1 text-[11px] text-brand-grey dark:text-slate-400">
                            <input type="checkbox" checked={r.usePicture} onChange={(e) => patch(i, { usePicture: e.target.checked })} className="h-3.5 w-3.5" />
                            Use this picture
                          </label>
                        ) : null}
                      </div>
                      <div className="min-w-0 space-y-2">
                        <label className="flex items-start gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
                          <input type="checkbox" checked={r.include} onChange={(e) => patch(i, { include: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="min-w-0">{r.existingId ? `Add to ${r.existingName}` : "Add as a new item"}</span>
                        </label>
                        <label className="grid gap-0.5">
                          <span className={LABEL}>Name (as on the invoice)</span>
                          <input className={FIELD} value={r.name} onChange={(e) => patch(i, { name: e.target.value })} disabled={Boolean(r.existingId)} />
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <label className="grid gap-0.5">
                            <span className={LABEL}>{r.existingId ? "Add to on hand" : "On hand"}</span>
                            <input className={FIELD} inputMode="numeric" value={r.qtyText} onChange={(e) => patch(i, { qtyText: e.target.value.replace(/[^\d]/g, "") })} />
                          </label>
                          <label className="grid gap-0.5">
                            <span className={LABEL}>Unit cost ($)</span>
                            <input className={FIELD} inputMode="decimal" value={r.costText} onChange={(e) => patch(i, { costText: e.target.value.replace(/[^\d.]/g, "") })} />
                          </label>
                          <label className="col-span-2 grid gap-0.5 sm:col-span-1">
                            <span className={LABEL}>Category</span>
                            <select className={FIELD} value={r.category} onChange={(e) => patch(i, { category: e.target.value })} disabled={Boolean(r.existingId)}>
                              {SUPPLY_CATEGORIES.map((c) => (
                                <option key={c.value} value={c.value}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <p className="break-words text-[11px] text-brand-grey dark:text-slate-400">
                          {[
                            r.itemNumber ? `Item # ${r.itemNumber}` : null,
                            r.color ? `Color: ${r.color}` : null,
                            r.details ? `Imprint: ${r.details}` : null,
                            r.setupFee ? `Setup fee $${r.setupFee.toFixed(2)}` : null,
                            r.lineTotal !== null ? `Line total $${r.lineTotal.toFixed(2)}` : null
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No other details"}
                          . Saved in the item&apos;s notes.
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={Boolean(busy)} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
            Cancel
          </button>
          {result && rows.length ? (
            <button
              type="button"
              onClick={() => void save()}
              disabled={!ticked || Boolean(busy)}
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow disabled:opacity-50"
            >
              {busy === "save" ? "Adding…" : `Add ${ticked} to the stock room`}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
