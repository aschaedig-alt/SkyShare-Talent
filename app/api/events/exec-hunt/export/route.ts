import { NextResponse } from "next/server";
import { authFailureResponse, requireApiPermission } from "@/lib/auth/route-auth";
import { qrCardsPdf, qrPng, qrSheetPdf, qrZip, loadPrintablePictures, resultsCsv } from "@/lib/exec-hunt/exports";

// ADMIN - every download the hunt offers, by ?kind=:
//   qr&slug=cory-1   one QR code PNG
//   qr-zip           all 15 PNGs in one ZIP
//   sheet            one-page PDF with all 15 codes labelled
//   cards            printable cards PDF (2 per page, photo + code + instruction)
//   leaderboard-csv  one row per guest, with a Y per picture found
//   discoveries-csv  every claim, newest first
export const dynamic = "force-dynamic";

function file(bytes: Uint8Array | Buffer | string, type: string, filename: string) {
  const body = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
  return new NextResponse(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store"
    }
  });
}

export async function GET(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return authFailureResponse(auth);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  switch (kind) {
    case "qr": {
      const slug = url.searchParams.get("slug");
      const picture = (await loadPrintablePictures()).find((p) => p.slug === slug);
      if (!picture) return NextResponse.json({ message: "No such picture." }, { status: 404 });
      return file(await qrPng(picture.url), "image/png", `exec-hunt-${picture.slug}.png`);
    }
    case "qr-zip":
      return file(await qrZip(), "application/zip", "exec-hunt-qr-codes.zip");
    case "sheet":
      return file(await qrSheetPdf(), "application/pdf", "exec-hunt-all-qr-codes.pdf");
    case "cards":
      return file(await qrCardsPdf(), "application/pdf", "exec-hunt-cards.pdf");
    case "leaderboard-csv":
      return file(await resultsCsv("leaderboard"), "text/csv; charset=utf-8", "exec-hunt-leaderboard.csv");
    case "discoveries-csv":
      return file(await resultsCsv("discoveries"), "text/csv; charset=utf-8", "exec-hunt-discoveries.csv");
    default:
      return NextResponse.json({ message: "Unknown export." }, { status: 400 });
  }
}
