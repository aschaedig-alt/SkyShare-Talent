import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { extractPilotMetrics } from "@/lib/extraction/pilot-metrics";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const files = await prisma.candidateFile.findMany({
      where: { candidateId: id, extractedText: { not: null } },
      orderBy: { uploadedAt: "asc" },
      select: { id: true, extractedText: true }
    });

    // Walk files in order; first file to yield a given metric is its source.
    const found = new Map<string, { label: string; valueNumber?: number; valueText?: string; unit?: string; snippet: string; sourceFileId: string }>();
    for (const file of files) {
      const metrics = extractPilotMetrics(file.extractedText ?? "");
      for (const m of metrics) {
        if (!found.has(m.key)) {
          found.set(m.key, { ...m, sourceFileId: file.id });
        }
      }
    }

    // Upsert as SUGGESTED, but never overwrite a CONFIRMED value.
    let suggested = 0;
    for (const [key, m] of found) {
      const existing = await prisma.candidateMetric.findUnique({
        where: { candidateId_key: { candidateId: id, key } }
      });
      if (existing?.status === "CONFIRMED") continue;

      await prisma.candidateMetric.upsert({
        where: { candidateId_key: { candidateId: id, key } },
        create: {
          candidateId: id,
          key,
          label: m.label,
          valueNumber: m.valueNumber ?? null,
          valueText: m.valueText ?? null,
          unit: m.unit ?? null,
          status: "SUGGESTED",
          sourceFileId: m.sourceFileId,
          sourceSnippet: m.snippet
        },
        update: {
          label: m.label,
          valueNumber: m.valueNumber ?? null,
          valueText: m.valueText ?? null,
          unit: m.unit ?? null,
          status: "SUGGESTED",
          sourceFileId: m.sourceFileId,
          sourceSnippet: m.snippet
        }
      });
      suggested += 1;
    }

    const metrics = await prisma.candidateMetric.findMany({
      where: { candidateId: id, status: { not: "DISMISSED" } },
      orderBy: { createdAt: "asc" }
    });

    return NextResponse.json({
      ok: true,
      scannedFiles: files.length,
      suggested,
      message: files.length === 0 ? "No document text to scan yet." : `Scanned ${files.length} document(s).`,
      metrics
    });
  } catch (error) {
    console.error("Metric extraction error:", error);
    return NextResponse.json({ message: "Unable to scan documents." }, { status: 500 });
  }
}
