"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseJobPdfText, diagnoseJobPdf, type ParsedJobPdfRow } from "@/lib/imports/job-pdf-parser";

type ImportResult = {
  message?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  warnings?: number;
  files?: number;
  /** Per-file outcome; skippedReason explains any PDF that yielded no rows. */
  parsedFiles?: Array<{ filename: string; rows: number; extractedCharacters: number; skippedReason?: string | null }>;
};

type PresignedFileUpload = {
  rowNumber: number;
  originalFilename: string;
  displayFilename: string;
  storageKey: string;
  sizeBytes: number | null;
  mimeType: string | null;
  uploadUrl: string;
};

type ImportActionCardProps = {
  eyebrow: string;
  title: string;
  detail: string;
  accept: string;
  multiple?: boolean;
  endpoint: string;
  idleLabel: string;
  busyLabel: string;
  busyDetail: string;
  maxFileMb?: number;
};

type PdfJsTextItem = {
  str?: string;
  transform?: number[];
};

type PdfJsPage = {
  getTextContent: () => Promise<{ items: PdfJsTextItem[] }>;
  cleanup?: () => void;
};

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy?: () => Promise<void>;
};

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> };
};

async function readImportResponse(response: Response): Promise<ImportResult> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as ImportResult;
  }

  const text = await response.text();
  const cleaned = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return {
    message: cleaned
      ? `Server returned ${response.status}: ${cleaned.slice(0, 180)}`
      : `Server returned ${response.status}. Try a smaller file or try again.`
  };
}

function ImportActionCard({
  eyebrow,
  title,
  detail,
  accept,
  multiple = false,
  endpoint,
  idleLabel,
  busyLabel,
  busyDetail,
  maxFileMb
}: ImportActionCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError(null);

    const files = Array.from(inputRef.current?.files ?? []);
    if (!files.length) {
      setError("Choose a file first.");
      return;
    }

    if (maxFileMb) {
      const oversized = files.find((file) => file.size > maxFileMb * 1024 * 1024);
      if (oversized) {
        setError(`${oversized.name} is larger than ${maxFileMb} MB. Split it into smaller files and try again.`);
        return;
      }
    }

    const body = new FormData();
    files.forEach((file) => body.append(multiple ? "files" : "file", file));

    startTransition(async () => {
      try {
        const response = await fetch(endpoint, { method: "POST", body });
        const payload = await readImportResponse(response);
        if (!response.ok) {
          throw new Error(payload.message ?? "Import failed.");
        }

        setResult(payload);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        router.refresh();
      } catch (importError) {
        setError(importError instanceof Error ? importError.message : "Import failed.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex min-h-[190px] flex-col justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">{eyebrow}</p>
          <h2 className="mt-2 text-base font-semibold text-brand-lea dark:text-slate-100">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-brand-grey dark:text-slate-400">{detail}</p>
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            className="w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:file:text-slate-300"
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-wait disabled:opacity-60"
          >
            {isPending ? busyLabel : idleLabel}
          </button>
          {isPending ? (
            <div role="status" aria-live="polite" className="rounded border border-brand-sweet/50 bg-brand-sweet/20 p-2 text-xs font-semibold text-brand-lea dark:text-slate-100">
              {busyDetail}
            </div>
          ) : null}
          {result ? (
            <div role="status" aria-live="polite" className="rounded border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 p-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              {result.message} Created {result.created ?? result.files ?? 0}, updated {result.updated ?? 0}, skipped {result.skipped ?? 0}.
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 p-2 text-xs font-semibold text-red-800 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export function ResumeFileUploadImportCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function uploadThroughServer(files: File[]) {
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    const response = await fetch("/api/imports/files", { method: "POST", body });
    const payload = await readImportResponse(response);
    if (!response.ok) throw new Error(payload.message ?? "Server upload failed.");
    return payload;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError(null);
    setProgress(null);

    const files = Array.from(inputRef.current?.files ?? []);
    if (!files.length) {
      setError("Choose at least one file first.");
      return;
    }

    startTransition(async () => {
      const completed: PresignedFileUpload[] = [];
      const failed: Array<{ filename: string; message: string }> = [];
      let batchId: string | null = null;

      try {
        setProgress(`Preparing secure upload for ${files.length} file${files.length === 1 ? "" : "s"}...`);
        const presignResponse = await fetch("/api/imports/files/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: files.map((file) => ({ name: file.name, size: file.size, type: file.type || "application/octet-stream" }))
          })
        });
        const presignPayload = (await readImportResponse(presignResponse)) as ImportResult & { batchId?: string; uploads?: PresignedFileUpload[] };
        if (!presignResponse.ok || !presignPayload.batchId || !presignPayload.uploads) {
          throw new Error(presignPayload.message ?? "Could not prepare secure upload.");
        }
        batchId = presignPayload.batchId;

        for (const upload of presignPayload.uploads) {
          const file = files.find((candidate) => candidate.name === upload.originalFilename && candidate.size === upload.sizeBytes)
            ?? files[upload.rowNumber - 1];
          if (!file) {
            failed.push({ filename: upload.originalFilename, message: "Selected file was not found before upload." });
            continue;
          }

          try {
            setProgress(`Uploading ${upload.rowNumber} of ${presignPayload.uploads.length}: ${upload.originalFilename}`);
            const uploadResponse = await fetch(upload.uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": upload.mimeType || "application/octet-stream" },
              body: file
            });
            if (!uploadResponse.ok) {
              throw new Error(`S3 returned ${uploadResponse.status}.`);
            }
            completed.push(upload);
          } catch (uploadError) {
            failed.push({
              filename: upload.originalFilename,
              message: uploadError instanceof Error ? uploadError.message : "Upload failed."
            });
          }
        }

        setProgress("Saving uploaded file records...");
        const completeResponse = await fetch("/api/imports/files/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId, uploads: completed, failed })
        });
        const completePayload = await readImportResponse(completeResponse);
        if (!completeResponse.ok) throw new Error(completePayload.message ?? "Could not save uploaded file records.");

        setResult(completePayload);
        setProgress(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch (uploadError) {
        if (batchId) {
          await fetch("/api/imports/files/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              batchId,
              uploads: completed,
              failed: failed.length ? failed : files.map((file) => ({ filename: file.name, message: "Upload was interrupted." }))
            })
          }).catch(() => null);
        }

        try {
          setProgress("Direct upload was unavailable. Trying secure server upload for this selection...");
          const fallbackPayload = await uploadThroughServer(files);
          setResult(fallbackPayload);
          setProgress(null);
          setError(null);
          if (inputRef.current) inputRef.current.value = "";
          router.refresh();
          return;
        } catch (fallbackError) {
          const primaryMessage = uploadError instanceof Error ? uploadError.message : "Direct upload failed.";
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Server upload failed.";
          setError(`${primaryMessage} Fallback also failed: ${fallbackMessage}`);
        }

        setProgress(null);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex min-h-[190px] flex-col justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Active upload</p>
          <h2 className="mt-2 text-base font-semibold text-brand-lea dark:text-slate-100">Resume / file uploads</h2>
          <p className="mt-2 text-sm leading-6 text-brand-grey dark:text-slate-400">
            Upload resumes and documents directly to private storage, then link them to candidates when ready.
          </p>
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.gif,.webp,.tif,.tiff,.bmp,.html,.htm,.doc,.docx,.txt,.rtf,.csv,.xls,.xlsx"
            multiple
            className="w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:file:text-slate-300"
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-wait disabled:opacity-60"
          >
            {isPending ? "Uploading files..." : "Upload files"}
          </button>
          {isPending || progress ? (
            <div role="status" aria-live="polite" className="rounded border border-brand-sweet/50 bg-brand-sweet/20 p-2 text-xs font-semibold text-brand-lea dark:text-slate-100">
              {progress ?? "Uploading files to private storage..."}
            </div>
          ) : null}
          {result ? (
            <div role="status" aria-live="polite" className="rounded border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 p-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              {result.message} Uploaded {result.files ?? 0}, skipped {result.skipped ?? 0}.
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 p-2 text-xs font-semibold text-red-800 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export function JobsCsvImportCard() {
  return (
    <ImportActionCard
      eyebrow="Active import"
      title="Jobs CSV import"
      detail="Import historical job rows, preserve source columns, and create pilot requirement drafts when pilot roles are detected."
      accept=".csv,text/csv"
      endpoint="/api/imports/jobs"
      idleLabel="Import jobs CSV"
      busyLabel="Importing jobs..."
      busyDetail="Reading job rows, preserving source data, and extracting pilot requirement drafts."
    />
  );
}

export function JobPdfImportCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function loadPdfJs() {
    // @ts-expect-error Public PDF.js bundle is served from /public/vendor for browser-only extraction.
    const pdfjsLib = (await import(/* webpackIgnore: true */ "/vendor/pdfjs/pdf.min.mjs")) as PdfJsModule;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    return pdfjsLib;
  }

  function textItemsToLines(items: PdfJsTextItem[]) {
    const rows = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of items || []) {
      const text = String(item.str || "").trim();
      if (!text) continue;
      const y = Math.round((item.transform?.[5] || 0) / 3) * 3;
      const row = rows.get(y) || [];
      row.push({ x: item.transform?.[4] || 0, text });
      rows.set(y, row);
    }
    return Array.from(rows.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  async function extractPdfText(file: File) {
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setProgress(`Extracting ${file.name}: page ${pageNumber} of ${pdf.numPages}`);
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(textItemsToLines(content.items));
        page.cleanup?.();
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    } finally {
      await pdf.destroy?.();
    }
    return pages.join("\n").replace(/\u0000/g, "").trim();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError(null);
    setProgress(null);

    const files = Array.from(inputRef.current?.files ?? []);
    if (!files.length) {
      setError("Choose a PDF file first.");
      return;
    }

    startTransition(async () => {
      try {
        const parsedFiles: Array<{
          filename: string;
          parser: string;
          extractedCharacters: number;
          records: ParsedJobPdfRow[];
          skippedReason: string | null;
        }> = [];

        for (const [index, file] of files.entries()) {
          setProgress(`Reading PDF ${index + 1} of ${files.length}: ${file.name}`);
          const text = await extractPdfText(file);
          setProgress(`Parsing job rows from ${file.name}`);
          const parsed = parseJobPdfText(text, file.name);
          parsedFiles.push({
            filename: file.name,
            parser: parsed.parser,
            extractedCharacters: text.length,
            records: parsed.records,
            // Work out WHY there are no rows here, where the extracted text still
            // exists — the server only ever sees the parsed rows.
            skippedReason: diagnoseJobPdf(text, parsed.records.length)
          });
        }

        setProgress("Saving parsed job rows...");
        const response = await fetch("/api/imports/job-pdfs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: parsedFiles })
        });
        const payload = await readImportResponse(response);
        if (!response.ok) throw new Error(payload.message ?? "Import failed.");

        setResult(payload);
        setProgress(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch (importError) {
        setProgress(null);
        setError(importError instanceof Error ? importError.message : "Import failed.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex min-h-[190px] flex-col justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Active import</p>
          <h2 className="mt-2 text-base font-semibold text-brand-lea dark:text-slate-100">Job PDF import</h2>
          <p className="mt-2 text-sm leading-6 text-brand-grey dark:text-slate-400">
            Extract job posts in your browser, then save parsed job rows and pilot requirement drafts.
          </p>
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:file:text-slate-300"
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:cursor-wait disabled:opacity-60"
          >
            {isPending ? "Extracting PDFs..." : "Import job PDFs"}
          </button>
          {isPending || progress ? (
            <div role="status" aria-live="polite" className="rounded border border-brand-sweet/50 bg-brand-sweet/20 p-2 text-xs font-semibold text-brand-lea dark:text-slate-100">
              {progress ?? "Extracting PDF text and preparing job rows..."}
            </div>
          ) : null}
          {result ? (
            (() => {
              // "Imported 0, skipped 1" on its own tells you nothing you can act on.
              // When a PDF produced no rows, show the reason instead of a green tick.
              const unread = (result.parsedFiles ?? []).filter((f) => f.skippedReason);
              const nothingLanded = (result.created ?? 0) + (result.updated ?? 0) === 0;
              return (
                <div
                  role="status"
                  aria-live="polite"
                  className={
                    nothingLanded
                      ? "rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
                      : "rounded border border-emerald-200 bg-emerald-50 p-2 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                  }
                >
                  <p className="font-semibold">
                    {result.message}
                    {nothingLanded ? "" : ` Created ${result.created ?? 0}, updated ${result.updated ?? 0}, skipped ${result.skipped ?? 0}.`}
                  </p>
                  {unread.map((f) => (
                    <p key={f.filename} className="mt-1.5 font-normal leading-5">
                      <span className="font-semibold">{f.filename}</span> — {f.skippedReason}
                    </p>
                  ))}
                </div>
              );
            })()
          ) : null}
          {error ? (
            <div role="alert" className="rounded border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 p-2 text-xs font-semibold text-red-800 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export function RequirementCatalogImportCard() {
  return (
    <ImportActionCard
      eyebrow="Active import"
      title="Requirement catalog import"
      detail="Update reusable pilot gates from a CSV catalog without changing existing candidate records."
      accept=".csv,text/csv"
      endpoint="/api/imports/requirements"
      idleLabel="Import catalog CSV"
      busyLabel="Importing catalog..."
      busyDetail="Validating requirement rows and updating the reusable pilot gate catalog."
    />
  );
}
