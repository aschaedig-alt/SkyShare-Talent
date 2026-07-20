import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { extractPilotMetrics } from "@/lib/extraction/pilot-metrics";
import { extractFileText } from "@/lib/files/pdf-text";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { extractPaycomApplication, looksLikePaycomApplication, isPaycomExtractConfigured } from "@/lib/extraction/paycom-application";
import { normalizeEmail, normalizePhone } from "@/lib/candidates/normalize";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Self-heal: extract text now for any of this candidate's files that are missing it.
    const needsText = await prisma.candidateFile.findMany({
      where: { candidateId: id, storageKey: { not: null }, extractedText: null },
      select: { id: true, storageKey: true, mimeType: true, displayFilename: true, originalFilename: true }
    });
    if (needsText.length > 0) {
      const storage = getFileStorageAdapter();
      for (const f of needsText) {
        try {
          const { bytes } = await storage.read(f.storageKey!);
          const text = await extractFileText(Buffer.from(bytes), f.mimeType, f.displayFilename || f.originalFilename);
          if (text) {
            await prisma.candidateFile.update({
              where: { id: f.id },
              data: { extractedText: text, textExtractedAt: new Date() }
            });
          }
        } catch (e) {
          console.error(`Self-heal extraction failed for ${f.displayFilename}:`, e);
        }
      }
    }

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
      // Don't resurrect values the user already confirmed or rejected.
      if (existing?.status === "CONFIRMED" || existing?.status === "DISMISSED") continue;

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

    // Paycom application: pull the candidate Paycom person id + any MISSING
    // identity/contact fields from the application text, and fill only BLANKS —
    // never overwrite anything already entered. Reuses the doc text extracted above.
    const paycomFilled: string[] = [];
    if (isPaycomExtractConfigured()) {
      const cand = await prisma.candidate.findUnique({
        where: { id },
        select: { paycomPersonId: true, firstName: true, lastName: true, primaryEmail: true, primaryPhone: true }
      });
      const appFile = (
        await prisma.candidateFile.findMany({
          where: { candidateId: id, extractedText: { not: null } },
          orderBy: { uploadedAt: "desc" },
          select: { extractedText: true, displayFilename: true, originalFilename: true }
        })
      ).find((f) => looksLikePaycomApplication(f.displayFilename ?? f.originalFilename, f.extractedText ?? ""));

      if (cand && appFile) {
        try {
          const ex = await extractPaycomApplication(appFile.extractedText ?? "");
          const data: Record<string, string> = {};
          if (ex.paycomPersonId && !cand.paycomPersonId) {
            data.paycomPersonId = ex.paycomPersonId;
            paycomFilled.push("Paycom ID");
          }
          if (ex.email && !cand.primaryEmail) {
            data.primaryEmail = ex.email;
            const n = normalizeEmail(ex.email);
            if (n) data.normalizedEmail = n;
            paycomFilled.push("email");
          }
          if (ex.phone && !cand.primaryPhone) {
            data.primaryPhone = ex.phone;
            const n = normalizePhone(ex.phone);
            if (n) data.normalizedPhone = n;
            paycomFilled.push("phone");
          }
          if (ex.firstName && !cand.firstName) {
            data.firstName = ex.firstName;
            paycomFilled.push("first name");
          }
          if (ex.lastName && !cand.lastName) {
            data.lastName = ex.lastName;
            paycomFilled.push("last name");
          }
          if (Object.keys(data).length > 0) {
            await prisma.candidate.update({ where: { id }, data });
          }
        } catch (e) {
          console.error("Paycom application extraction failed:", e);
        }
      }
    }

    const metrics = await prisma.candidateMetric.findMany({
      where: { candidateId: id, status: { not: "DISMISSED" } },
      orderBy: { createdAt: "asc" }
    });

    const parts = [files.length === 0 ? "No document text to scan yet." : `Scanned ${files.length} document(s).`];
    if (paycomFilled.length > 0) parts.push(`Paycom application: filled ${paycomFilled.join(", ")}.`);

    return NextResponse.json({
      ok: true,
      scannedFiles: files.length,
      suggested,
      paycomFilled,
      message: parts.join(" "),
      metrics
    });
  } catch (error) {
    console.error("Metric extraction error:", error);
    return NextResponse.json({ message: "Unable to scan documents." }, { status: 500 });
  }
}
