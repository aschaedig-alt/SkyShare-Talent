const MAX_CHARS = 500_000;

/** Collapse whitespace so stored text is compact and searchable. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
}

function looksLikePdf(mimeType: string | null, filename: string): boolean {
  return (mimeType ?? "").includes("pdf") || filename.toLowerCase().endsWith(".pdf");
}

function looksLikeText(mimeType: string | null, filename: string): boolean {
  if ((mimeType ?? "").startsWith("text/")) return true;
  return /\.(txt|csv|md|rtf)$/i.test(filename);
}

/**
 * Extract searchable text from a file's bytes.
 * - PDFs: parsed via pdf-parse (text-based PDFs only; scanned/image PDFs need OCR, later).
 * - Plain text: decoded directly.
 * - Everything else: returns "" (no inline text available yet).
 * Never throws — returns "" on failure so uploads are never blocked.
 */
export async function extractFileText(
  bytes: Buffer | Uint8Array,
  mimeType: string | null,
  filename: string
): Promise<string> {
  try {
    if (looksLikePdf(mimeType, filename)) {
      // unpdf ships a serverless-friendly pdfjs build that runs on Vercel.
      // Lazy-loaded so any failure degrades to "" rather than crashing the route.
      const { extractText, getDocumentProxy } = await import("unpdf");
      const data = new Uint8Array(bytes);
      const pdf = await getDocumentProxy(data);
      const { text } = await extractText(pdf, { mergePages: true });
      return normalize(Array.isArray(text) ? text.join(" ") : text ?? "");
    }
    if (looksLikeText(mimeType, filename)) {
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      return normalize(buffer.toString("utf8"));
    }
    return "";
  } catch (error) {
    console.error(`Text extraction failed for ${filename}:`, error);
    return "";
  }
}
