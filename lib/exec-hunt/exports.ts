import "server-only";
import QRCode from "qrcode";
import { zipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { EXEC_HUNT_TITLE, EXEC_HUNT_TOTAL, execHuntScanPath } from "@/lib/exec-hunt/constants";
import { ensureExecHuntSeeded, execHuntOrigin, getExecHuntStats } from "@/lib/exec-hunt/server";

// Printable assets. Every URL comes from execHuntOrigin(), which never returns
// localhost - a card printed from a laptop must still open on a guest's phone.

const NAVY = rgb(13 / 255, 44 / 255, 67 / 255);
const GOLD = rgb(234 / 255, 170 / 255, 0);
const RED = rgb(200 / 255, 16 / 255, 46 / 255);
const GREEN = rgb(15 / 255, 81 / 255, 50 / 255);
const GREY = rgb(0.4, 0.4, 0.4);

export async function loadPrintablePictures() {
  await ensureExecHuntSeeded();
  const origin = execHuntOrigin();
  const pictures = await prisma.execHuntPicture.findMany({
    include: { executive: true },
    orderBy: [{ executive: { sortOrder: "asc" } }, { number: "asc" }]
  });
  return pictures.map((p) => ({
    slug: p.slug,
    label: `${p.executive.name} ${p.number}`,
    executive: p.executive,
    number: p.number,
    url: `${origin}${execHuntScanPath(p.publicKey)}`
  }));
}

export type PrintablePicture = Awaited<ReturnType<typeof loadPrintablePictures>>[number];

export function qrPng(url: string, width = 1024) {
  // Dark on white: phone cameras read that most reliably. H correction survives a
  // crumpled or partly covered card in a hangar.
  return QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 2,
    width,
    color: { dark: "#0d2c43", light: "#ffffff" }
  });
}

export async function qrZip() {
  const pictures = await loadPrintablePictures();
  const files: Record<string, Uint8Array> = {};
  for (const p of pictures) {
    files[`exec-hunt-${p.slug}.png`] = new Uint8Array(await qrPng(p.url));
  }
  files["README.txt"] = new TextEncoder().encode(
    pictures.map((p) => `${p.label}\t${p.url}`).join("\r\n") + "\r\n"
  );
  return zipSync(files, { level: 0 });
}

/** pdf-lib's standard fonts are WinAnsi: keep text to plain ASCII. */
function ascii(text: string) {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e]/g, "");
}

function centered(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, y: number, color = NAVY) {
  const clean = ascii(text);
  page.drawText(clean, { x: cx - font.widthOfTextAtSize(clean, size) / 2, y, size, font, color });
}

async function loadPhotos(pdf: PDFDocument, pictures: PrintablePicture[]) {
  const photos = new Map<string, PDFImage>();
  const storage = getFileStorageAdapter();
  for (const p of pictures) {
    const exec = p.executive;
    if (!exec.photoKey || photos.has(exec.slug)) continue;
    try {
      const file = await storage.read(exec.photoKey);
      const type = exec.photoContentType ?? file.contentType ?? "";
      photos.set(exec.slug, type.includes("png") ? await pdf.embedPng(file.bytes) : await pdf.embedJpg(file.bytes));
    } catch (error) {
      // A missing photo prints the placeholder rather than failing the whole PDF.
      console.error(`Exec hunt PDF: photo for ${exec.slug} unreadable`, error);
    }
  }
  return photos;
}

function drawPlaceholder(page: PDFPage, bold: PDFFont, name: string, x: number, y: number, size: number) {
  page.drawRectangle({ x, y, width: size, height: size, color: RED, borderColor: GOLD, borderWidth: 3 });
  centered(page, name.charAt(0), bold, size * 0.45, x + size / 2, y + size * 0.4, rgb(1, 1, 1));
  centered(page, name.toUpperCase(), bold, size * 0.1, x + size / 2, y + size * 0.15, rgb(1, 1, 1));
}

function drawPhoto(page: PDFPage, image: PDFImage, x: number, y: number, size: number) {
  // Fit the whole photo inside the gold square, centred (pdf-lib has no clipping,
  // so a cover-crop is not available here).
  const scale = Math.min(size / image.width, size / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1), borderColor: GOLD, borderWidth: 3 });
  page.drawImage(image, { x: x + (size - w) / 2, y: y + (size - h) / 2, width: w, height: h });
}

const LETTER: [number, number] = [612, 792];

/** One page, all 15 codes, a 3 x 5 grid - the reference sheet. */
export async function qrSheetPdf() {
  const pictures = await loadPrintablePictures();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${EXEC_HUNT_TITLE} - all ${EXEC_HUNT_TOTAL} QR codes`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage(LETTER);
  const [W, H] = LETTER;
  centered(page, `${EXEC_HUNT_TITLE} - all ${EXEC_HUNT_TOTAL} QR codes`, bold, 16, W / 2, H - 40);
  centered(page, "Each code is permanent and belongs to ONE hidden picture. Match the label to the picture.", font, 9, W / 2, H - 56, GREY);

  const cols = 3;
  const margin = 36;
  const top = H - 72;
  const cellW = (W - margin * 2) / cols;
  const cellH = (top - margin) / 5;
  const qrSize = Math.min(cellW, cellH) - 34;

  for (const [index, p] of pictures.entries()) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = margin + col * cellW;
    const y = top - (row + 1) * cellH;
    page.drawRectangle({ x: x + 3, y: y + 3, width: cellW - 6, height: cellH - 6, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
    const png = await pdf.embedPng(await qrPng(p.url, 600));
    page.drawImage(png, { x: x + (cellW - qrSize) / 2, y: y + 26, width: qrSize, height: qrSize });
    centered(page, p.label, bold, 12, x + cellW / 2, y + 14, RED);
    centered(page, p.url.replace(/^https?:\/\//, ""), font, 5.5, x + cellW / 2, y + 7, GREY);
  }
  return pdf.save();
}

/** Two cards per letter page, one per hidden picture, cut along the middle line. */
export async function qrCardsPdf() {
  const pictures = await loadPrintablePictures();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${EXEC_HUNT_TITLE} - printable cards`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const photos = await loadPhotos(pdf, pictures);
  const [W, H] = LETTER;
  const half = H / 2;

  let page: PDFPage | null = null;
  for (const [index, p] of pictures.entries()) {
    if (index % 2 === 0) {
      page = pdf.addPage(LETTER);
      // Cut line
      page.drawLine({ start: { x: 18, y: half }, end: { x: W - 18, y: half }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7), dashArray: [4, 4] });
    }
    const pg = page!;
    const y0 = index % 2 === 0 ? half : 0;
    const inset = 28;

    // Frame: green border with a red inner line.
    pg.drawRectangle({ x: inset, y: y0 + inset, width: W - inset * 2, height: half - inset * 2, borderColor: GREEN, borderWidth: 6 });
    pg.drawRectangle({ x: inset + 9, y: y0 + inset + 9, width: W - inset * 2 - 18, height: half - inset * 2 - 18, borderColor: RED, borderWidth: 1.5 });

    centered(pg, "SKYSHARE CHRISTMAS PARTY", bold, 10, W / 2, y0 + half - inset - 30, GOLD);
    centered(pg, EXEC_HUNT_TITLE, bold, 26, W / 2, y0 + half - inset - 60, GREEN);

    const block = 190;
    const gap = 30;
    const left = (W - block * 2 - gap) / 2;
    const blockY = y0 + inset + 62;
    const photo = photos.get(p.executive.slug);
    if (photo) drawPhoto(pg, photo, left, blockY, block);
    else drawPlaceholder(pg, bold, p.executive.name, left, blockY, block);
    const png = await pdf.embedPng(await qrPng(p.url, 900));
    pg.drawImage(png, { x: left + block + gap, y: blockY, width: block, height: block });

    centered(pg, p.label, bold, 20, W / 2, y0 + inset + 36, RED);
    centered(pg, "Scan to claim your discovery!", font, 13, W / 2, y0 + inset + 20, NAVY);
  }
  return pdf.save();
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formula injection from a guest-typed name.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function resultsCsv(kind: "leaderboard" | "discoveries") {
  const stats = await getExecHuntStats();
  const rows: unknown[][] = [];
  if (kind === "leaderboard") {
    const slugs = stats.executives.flatMap((e) => e.pictures.map((p) => p.slug));
    rows.push(["Rank", "Guest name", "Guest id", "Unique discoveries", "Completion %", "First discovery", "Last discovery", ...slugs]);
    stats.guests.forEach((g, i) => {
      const have = new Set(g.pictureSlugs);
      rows.push([
        i + 1,
        g.name,
        g.shortId,
        g.found,
        Math.round((g.found / stats.total) * 100),
        g.firstAt?.toISOString() ?? "",
        g.lastAt?.toISOString() ?? "",
        ...slugs.map((s) => (have.has(s) ? "Y" : ""))
      ]);
    });
  } else {
    rows.push(["Time (UTC)", "Guest name", "Guest id", "Picture"]);
    for (const a of stats.activity) rows.push([a.createdAt.toISOString(), a.guestName, a.guestShortId, a.pictureLabel]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
