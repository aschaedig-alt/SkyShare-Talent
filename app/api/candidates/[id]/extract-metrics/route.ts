import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";
import { extractPilotMetrics, METRIC_DEFS } from "@/lib/extraction/pilot-metrics";
import { extractPilotMetricsLlm, dropImpossible } from "@/lib/extraction/pilot-metrics-llm";
import { normalizeAircraft, timeInTypeKey } from "@/lib/fleet/aircraft-normalize";

const LLM_METRIC_LABEL = new Map(METRIC_DEFS.map((d) => [d.key, d.label]));
import { extractFileText } from "@/lib/files/pdf-text";
import { metricsFromForms } from "@/lib/extraction/form-metrics";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { extractPaycomRegex, extractPaycomApplication, mergePaycomExtract, looksLikePaycomApplication, isPaycomExtractConfigured } from "@/lib/extraction/paycom-application";
import { normalizeEmail, normalizePhone } from "@/lib/candidates/normalize";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Already covered by candidates:write, which no allowlistable role holds.
  // Worth having regardless: this is the route that reads every one of a
  // candidate's document files and hands their text back as metrics, so it is
  // the widest read on the profile even though it is filed as a write.
  if (!isCandidateVisible(auth.user.viewer, id)) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

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

    // Read the documents with the LLM extractor. The old regex could not tell
    // an hour count from a number that merely sat near the right word — it read
    // "PREVIOUS PART 91 EXPERIENCE?" as 91 instrument hours for a third of
    // everyone it touched, and aircraft designators (CE-525, MU-300) as PIC
    // time. It stays below purely as a fallback when no API key is configured.
    const llm = await extractPilotMetricsLlm(
      files.map((f) => f.extractedText ?? "").join("\n\n")
    );
    const firstFileId = files[0]?.id ?? "";

    if (llm.metrics) {
      const { metrics } = dropImpossible(llm.metrics);
      for (const h of metrics.hours) {
        found.set(h.key, {
          label: LLM_METRIC_LABEL.get(h.key) ?? h.key,
          valueNumber: h.value,
          unit: "hrs",
          snippet: h.evidence,
          sourceFileId: firstFileId
        });
      }
      // One row per aircraft, plus the largest as the bare key so there is
      // something to show in a single column.
      const ranked = [...metrics.time_in_type].sort((a, b) => b.hours - a.hours);
      for (const t of ranked) {
        // Canonicalise the airframe: scoring looks time-in-type up BY AIRCRAFT,
        // so "PC12" filed against a "Pilatus PC-12 NG" requirement would miss.
        const name = normalizeAircraft(t.aircraft).canonical;
        found.set(timeInTypeKey(t.aircraft), {
          label: `Time in Type — ${name}`,
          valueNumber: t.hours,
          unit: "hrs",
          snippet: t.evidence,
          sourceFileId: firstFileId
        });
        if (t.pic_hours > 0) {
          found.set(timeInTypeKey(t.aircraft, true), {
            label: `PIC Time in Type — ${name}`,
            valueNumber: t.pic_hours,
            unit: "hrs",
            snippet: t.evidence,
            sourceFileId: firstFileId
          });
        }
      }
      if (ranked[0]) {
        const top = normalizeAircraft(ranked[0].aircraft).canonical;
        found.set("time_in_type", {
          label: `Time in Type — ${top}`,
          valueNumber: ranked[0].hours,
          valueText: top,
          unit: "hrs",
          snippet: ranked[0].evidence,
          sourceFileId: firstFileId
        });
        const bestPic = ranked.find((t) => t.pic_hours > 0);
        if (bestPic) {
          const pic = normalizeAircraft(bestPic.aircraft).canonical;
          found.set("pic_time_in_type", {
            label: `PIC Time in Type — ${pic}`,
            valueNumber: bestPic.pic_hours,
            valueText: pic,
            unit: "hrs",
            snippet: bestPic.evidence,
            sourceFileId: firstFileId
          });
        }
      }
      for (const key of ["type_ratings", "certificates"] as const) {
        const list = metrics[key];
        if (list.length) {
          found.set(key, {
            label: key === "type_ratings" ? "Type Ratings" : "Certificates",
            valueText: list.join(", "),
            snippet: "",
            sourceFileId: firstFileId
          });
        }
      }
      if (metrics.medical_class) {
        found.set("medical_class", {
          label: "Medical",
          valueText: metrics.medical_class,
          snippet: "",
          sourceFileId: firstFileId
        });
      }
    } else {
      // No API key, or the call failed — fall back rather than returning nothing.
      for (const file of files) {
        for (const m of extractPilotMetrics(file.extractedText ?? "")) {
          if (!found.has(m.key)) found.set(m.key, { ...m, sourceFileId: file.id });
        }
      }
    }

    // Read the same documents as FORMS, by layout, and let those values win.
    // The flattened text fuses a completed intake form into one unsplittable run
    // of digits, which is why the model returns nothing for candidates whose only
    // document is a Pilot Application — their hours are present but unreadable.
    // The coordinate parser pairs each label with the value beside it: no
    // inference, no API cost, and nothing to guess. It only covers the templated
    // fields, so everything above (time in type, ratings, certificates) stands.
    const formFiles = await prisma.candidateFile.findMany({
      where: { candidateId: id, storageKey: { not: null } },
      orderBy: { uploadedAt: "asc" },
      select: { id: true, storageKey: true, mimeType: true, displayFilename: true, originalFilename: true }
    });
    const form = await metricsFromForms(formFiles);
    for (const [key, m] of form.metrics) {
      found.set(key, {
        label: m.label,
        valueNumber: m.valueNumber,
        valueText: m.valueText,
        unit: m.unit,
        snippet: m.snippet,
        sourceFileId: m.sourceFileId
      });
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
    // identity/contact fields, filling only BLANKS (never overwrites). The Paycom
    // template is cleanly labelled, so regex handles it WITH NO API KEY; the LLM is
    // only a fallback for a non-standard layout when a key is configured.
    const paycomFilled: string[] = [];
    let paycomAppFound = false;
    {
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
        paycomAppFound = true;
        try {
          const text = appFile.extractedText ?? "";
          let ex = extractPaycomRegex(text);
          // Only reach for the LLM when the template regex missed something.
          if (isPaycomExtractConfigured() && (!ex.paycomPersonId || !ex.email || !ex.phone || !ex.firstName)) {
            try {
              ex = mergePaycomExtract(ex, await extractPaycomApplication(text));
            } catch (e) {
              console.error("Paycom LLM fallback failed:", e);
            }
          }
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
    if (form.parsed.length > 0) {
      parts.push(`Read ${form.parsed.length} form(s) by layout (${form.metrics.size} field(s)).`);
    }
    if (paycomFilled.length > 0) parts.push(`Paycom application: filled ${paycomFilled.join(", ")}.`);
    else if (paycomAppFound) parts.push("Paycom application scanned — nothing new to fill.");

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
