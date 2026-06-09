import { NextResponse } from "next/server";
import { scanCandidateDuplicates } from "@/lib/duplicates/candidate-scan";

export async function POST() {
  try {
    const result = await scanCandidateDuplicates();
    return NextResponse.json({
      ok: true,
      message: `Scanned ${result.scannedCandidates} candidates and added ${result.newReviewItems} review items.`,
      ...result
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to scan candidate duplicates." }, { status: 500 });
  }
}
