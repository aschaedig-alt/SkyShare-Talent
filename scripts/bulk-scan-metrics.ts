/**
 * Bulk "Scan docs" — run the flight-metric extraction across many candidates at
 * once, instead of clicking the button on one profile at a time.
 *
 * WHY: a candidate with no CandidateMetric rows has no structured evidence, so
 * the matchboard holds them back as unverified rather than ranking them. On the
 * G450 & GV Captain role, 23 of 30 active applicants had zero metrics — their
 * documents were already read into text, nobody had ever pressed the button.
 *
 * This mirrors POST /api/candidates/[id]/extract-metrics deliberately, importing
 * the SAME extraction modules the route uses so the two cannot drift in what
 * they read. It makes the same three writes the button makes:
 *
 *   - CandidateFile.extractedText  self-heal, local parse, NO API call
 *   - CandidateMetric             upsert as SUGGESTED; CONFIRMED and DISMISSED
 *                                 rows are left strictly alone
 *   - Candidate                   Paycom application backfill, BLANK fields only
 *
 * DRY RUN BY DEFAULT. --apply is required to write, and every write is recorded
 * to an undo file so the run is reversible.
 *
 *   npx tsx scripts/bulk-scan-metrics.ts                        # dry run, all
 *   npx tsx scripts/bulk-scan-metrics.ts --limit 3 --apply      # small batch
 *   npx tsx scripts/bulk-scan-metrics.ts --apply                # the rest
 *   npx tsx scripts/bulk-scan-metrics.ts --job <jobId> --apply  # one role only
 *   npx tsx scripts/bulk-scan-metrics.ts --model claude-opus-5  # override model
 *   npx tsx scripts/bulk-scan-metrics.ts --forms-only --apply   # FREE re-read
 *   npx tsx scripts/bulk-scan-metrics.ts --forms-only --keys certificates   # dry run, one metric
 *   npx tsx scripts/bulk-scan-metrics.ts --undo <file>          # reverse a run
 *
 * --forms-only inverts the target: instead of people with NO metrics, it takes
 * people who already have them and re-reads their documents by layout only. No
 * model call, so it costs nothing, and the signed application's values replace
 * whatever the model read off the flattened text. Its dry run reads the forms
 * too (S3 reads only) and writes every before/after to the review file.
 *
 * --keys limits which metric keys a run may write, e.g. --keys certificates.
 *
 * CERTIFICATES follow their own rule, shared with the Scan docs route through
 * planCertificatesFromForm (lib/candidates/certificates.ts): the ticked boxes on
 * the signed Pilot Application decide the lines the form asks about, even on a
 * value a person already confirmed or dismissed. A marked value whose list
 * would change goes back to SUGGESTED with its old value on the evidence line;
 * the undo file records the old value AND status. Every other metric keeps the
 * rule of never overwriting a person's decision.
 */
import { config } from "dotenv";
// .env.local first so it wins: it holds ANTHROPIC_API_KEY and the S3 credentials,
// while .env holds only DATABASE_URL. dotenv does not overwrite what is already set.
config({ path: ".env.local" });
config({ path: ".env" });

import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { extractFileText } from "../lib/files/pdf-text";
import { getFileStorageAdapter } from "../lib/files/storage-adapter";
import { extractPilotMetrics, METRIC_DEFS } from "../lib/extraction/pilot-metrics";
import { extractPilotMetricsLlm, dropImpossible } from "../lib/extraction/pilot-metrics-llm";
import { normalizeAircraft, timeInTypeKey } from "../lib/fleet/aircraft-normalize";
import {
  extractPaycomRegex,
  extractPaycomApplication,
  mergePaycomExtract,
  looksLikePaycomApplication,
  isPaycomExtractConfigured
} from "../lib/extraction/paycom-application";
import { normalizeEmail, normalizePhone } from "../lib/candidates/normalize";
import { metricsFromForms } from "../lib/extraction/form-metrics";
import { planCertificatesFromForm, splitCertificates, type CertificatesOutcome } from "../lib/candidates/certificates";

const LLM_METRIC_LABEL = new Map(METRIC_DEFS.map((d) => [d.key, d.label]));

// List prices, USD per 1M tokens. Cache reads bill at ~0.1x input, writes ~1.25x.
const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-4-5": { in: 1.0, out: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-sonnet-5": { in: 3.0, out: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-opus-5": { in: 5.0, out: 25.0, cacheRead: 0.5, cacheWrite: 6.25 }
};

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

const APPLY = has("--apply");
const UNDO_FILE = val("--undo");
// A bulk run must NOT quietly write regex-derived metrics. The regex extractor
// misreads hours badly (it read "PART 91" as 91 hours for a third of the people
// it touched), and when the LLM call 400s the route's fallback would spray that
// across the whole roster unnoticed. Skip instead, unless explicitly asked.
const ALLOW_REGEX = has("--allow-regex-fallback");
// Layout pass only: no model call, no cost. Targets candidates who ALREADY have
// metrics, so an improved template can correct values the model read from
// flattened text. Never removes a metric it cannot see — it only overwrites.
const FORMS_ONLY = has("--forms-only");
const MODEL = val("--model") ?? "claude-haiku-4-5";
const LIMIT = Number(val("--limit") ?? "0") || 0;
const JOB = val("--job");
const CONCURRENCY = Number(val("--concurrency") ?? "4") || 4;
const OUT = val("--out") ?? "scripts/out";
// Which metric keys this run may write. Unset means every key the scan finds.
const KEYS = val("--keys")?.split(",").map((k) => k.trim()).filter(Boolean) ?? null;
const inScope = (key: string) => !KEYS || KEYS.includes(key);

// Certificates outcomes across the run, and a few marked-row examples, for the review file.
const certTally: Record<string, number> = {};
const markedExamples: string[] = [];

type Found = {
  label: string;
  valueNumber?: number;
  valueText?: string;
  unit?: string;
  snippet: string;
  sourceFileId: string;
};

const usageTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function costOf(u: typeof usageTotal, model: string): number {
  const p = PRICES[model];
  if (!p) return NaN;
  return (
    (u.input * p.in + u.output * p.out + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) /
    1_000_000
  );
}

/** One candidate: mirrors the route body. Returns a line for the review file. */
async function scanOne(id: string, name: string, undoPath: string): Promise<string> {
  // 1. Self-heal missing text. Local parse, no API.
  const needsText = await prisma.candidateFile.findMany({
    where: { candidateId: id, storageKey: { not: null }, extractedText: null },
    select: { id: true, storageKey: true, mimeType: true, displayFilename: true, originalFilename: true }
  });
  let healed = 0;
  // Not under --keys: that limits a run to the named metrics, and this write is
  // neither one of them nor in the undo file.
  if (needsText.length > 0 && APPLY && !KEYS) {
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
          healed += 1;
        }
      } catch (e) {
        console.error(`  ${name}: text self-heal failed for ${f.displayFilename}:`, e);
      }
    }
  }

  const files = await prisma.candidateFile.findMany({
    where: { candidateId: id, extractedText: { not: null } },
    orderBy: { uploadedAt: "asc" },
    select: { id: true, extractedText: true }
  });
  if (files.length === 0) return `${name}: no document text — skipped`;

  const found = new Map<string, Found>();
  const firstFileId = files[0]?.id ?? "";
  const joined = files.map((f) => f.extractedText ?? "").join("\n\n");

  if (!APPLY && !FORMS_ONLY) {
    // Dry run: report only. Nothing is sent to the API and nothing is written.
    return `${name}: would scan ${files.length} doc(s), ${joined.length.toLocaleString()} chars (~${Math.round(joined.length / 4).toLocaleString()} tok)`;
  }
  // A --forms-only dry run carries on: it reads the forms (S3 reads — no model,
  // no cost) so the review file can show every before/after. Every write below
  // sits behind APPLY.

  // --forms-only skips the model entirely, so this pass costs NOTHING. That is
  // what makes it the right way to re-apply the layout templates over people the
  // model already read: their signed application should win, and re-billing the
  // whole roster to discover that would be silly.
  let llmMissed: string | null = null;
  if (!FORMS_ONLY) {
  const llm = await extractPilotMetricsLlm(joined, MODEL);
  usageTotal.input += llm.usage.input;
  usageTotal.output += llm.usage.output;
  usageTotal.cacheRead += llm.usage.cacheRead;
  usageTotal.cacheWrite += llm.usage.cacheWrite;
  if (!llm.metrics) llmMissed = llm.error ?? "unknown";

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
    const ranked = [...metrics.time_in_type].sort((a, b) => b.hours - a.hours);
    for (const t of ranked) {
      const nm = normalizeAircraft(t.aircraft).canonical;
      found.set(timeInTypeKey(t.aircraft), {
        label: `Time in Type — ${nm}`,
        valueNumber: t.hours,
        unit: "hrs",
        snippet: t.evidence,
        sourceFileId: firstFileId
      });
      if (t.pic_hours > 0) {
        found.set(timeInTypeKey(t.aircraft, true), {
          label: `PIC Time in Type — ${nm}`,
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
  } else if (ALLOW_REGEX) {
    // Same fallback the route uses. Off by default here — see ALLOW_REGEX above.
    for (const file of files) {
      for (const m of extractPilotMetrics(file.extractedText ?? "")) {
        if (!found.has(m.key)) found.set(m.key, { ...m, sourceFileId: file.id });
      }
    }
  } else {
    return `${name}: LLM MISS (${llm.error ?? "unknown"}) — SKIPPED, nothing written`;
  }
  }

  // Layout pass — same as the route. These win over model-read values.
  const formFiles = await prisma.candidateFile.findMany({
    where: { candidateId: id, storageKey: { not: null } },
    orderBy: { uploadedAt: "asc" },
    select: { id: true, storageKey: true, mimeType: true, displayFilename: true, originalFilename: true }
  });
  const form = await metricsFromForms(formFiles);
  // The certificate boxes follow their own rule (see the header), written below.
  const formCertificates = form.metrics.get("certificates");
  const scanCertificates = formCertificates ? found.get("certificates") : undefined;
  if (formCertificates) found.delete("certificates");
  for (const [key, m] of form.metrics) {
    if (key === "certificates") continue;
    found.set(key, {
      label: m.label,
      valueNumber: m.valueNumber,
      valueText: m.valueText,
      unit: m.unit,
      snippet: m.snippet,
      sourceFileId: m.sourceFileId
    });
  }

  let suggested = 0;
  let wouldWrite = 0;
  for (const [key, m] of found) {
    if (!inScope(key)) continue;
    const existing = await prisma.candidateMetric.findUnique({
      where: { candidateId_key: { candidateId: id, key } }
    });
    if (existing?.status === "CONFIRMED" || existing?.status === "DISMISSED") continue;
    if (!APPLY) {
      wouldWrite += 1;
      continue;
    }

    // Record the BEFORE state so the run can be undone. The previous VALUES are
    // captured too, not just whether the row existed: --forms-only overwrites
    // metrics the model already wrote, and "reversible" has to mean restoring
    // what was there, not merely deleting what replaced it.
    appendFileSync(
      undoPath,
      JSON.stringify({
        t: "metric",
        candidateId: id,
        key,
        existed: Boolean(existing),
        prev: existing
          ? {
              label: existing.label,
              valueNumber: existing.valueNumber,
              valueText: existing.valueText,
              unit: existing.unit,
              status: existing.status,
              sourceFileId: existing.sourceFileId,
              sourceSnippet: existing.sourceSnippet
            }
          : null
      }) + "\n"
    );

    await prisma.candidateMetric.upsert({
      where: { candidateId_key: { candidateId: id, key } },
      create: {
        candidateId: id, key, label: m.label,
        valueNumber: m.valueNumber ?? null, valueText: m.valueText ?? null,
        unit: m.unit ?? null, status: "SUGGESTED",
        sourceFileId: m.sourceFileId, sourceSnippet: m.snippet
      },
      update: {
        label: m.label,
        valueNumber: m.valueNumber ?? null, valueText: m.valueText ?? null,
        unit: m.unit ?? null, status: "SUGGESTED",
        sourceFileId: m.sourceFileId, sourceSnippet: m.snippet
      }
    });
    suggested += 1;
  }

  // Certificates from the signed Pilot Application: the one value this run may
  // reopen after a person marked it. Same rule as the Scan docs route.
  let certNote = "";
  if (formCertificates && inScope("certificates")) {
    const existing = await prisma.candidateMetric.findUnique({
      where: { candidateId_key: { candidateId: id, key: "certificates" } }
    });
    const plan = planCertificatesFromForm(
      splitCertificates(formCertificates.valueText),
      scanCertificates?.valueText ?? null,
      existing
    );
    const outcome: CertificatesOutcome = plan.outcome;
    certTally[outcome] = (certTally[outcome] ?? 0) + 1;
    const before = existing?.valueText ?? "(none)";
    certNote = plan.write ? `certificates ${outcome}: "${before}" → "${plan.valueText}"` : `certificates ${outcome}: "${before}"`;
    if (plan.write && (outcome === "reopen-confirmed" || outcome === "reopen-dismissed")) {
      markedExamples.push(`${name} (${id}) — was ${existing?.status}\n    before: ${before}\n    after:  ${plan.valueText}`);
    }
    if (plan.write && !APPLY) wouldWrite += 1;
    if (plan.write && APPLY) {
      // The old value AND status, so --undo puts a reopened confirmed value back exactly.
      appendFileSync(
        undoPath,
        JSON.stringify({
          t: "metric",
          candidateId: id,
          key: "certificates",
          existed: Boolean(existing),
          prev: existing
            ? {
                label: existing.label,
                valueNumber: existing.valueNumber,
                valueText: existing.valueText,
                unit: existing.unit,
                status: existing.status,
                sourceFileId: existing.sourceFileId,
                sourceSnippet: existing.sourceSnippet
              }
            : null
        }) + "\n"
      );
      const data = {
        label: formCertificates.label,
        valueNumber: null,
        valueText: plan.valueText,
        unit: null,
        status: "SUGGESTED",
        sourceFileId: formCertificates.sourceFileId,
        sourceSnippet: plan.sourceSnippet
      };
      await prisma.candidateMetric.upsert({
        where: { candidateId_key: { candidateId: id, key: "certificates" } },
        create: { candidateId: id, key: "certificates", ...data },
        update: data
      });
      suggested += 1;
    }
  } else if (inScope("certificates")) {
    const readForm = form.parsed.some((p) => p.templateId === "pilot-application-v4");
    const outcome = readForm ? "no-boxes" : "no-pilot-application";
    certTally[outcome] = (certTally[outcome] ?? 0) + 1;
    if (readForm) certNote = "certificates no-boxes: Pilot Application read, but not its certificate boxes (missing, partial or nothing ticked) — left as it is";
  }

  // Paycom application: fill BLANK identity fields only. Regex first; the LLM is
  // only reached when the template regex missed something.
  // Skipped entirely under --forms-only: its LLM fallback fires whenever the
  // regex misses a field, which would put a per-candidate charge on a pass whose
  // whole point is that it is free.
  const paycomFilled: string[] = [];
  const cand = FORMS_ONLY ? null : await prisma.candidate.findUnique({
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
      const text = appFile.extractedText ?? "";
      let ex = extractPaycomRegex(text);
      if (isPaycomExtractConfigured() && (!ex.paycomPersonId || !ex.email || !ex.phone || !ex.firstName)) {
        try {
          ex = mergePaycomExtract(ex, await extractPaycomApplication(text));
        } catch (e) {
          console.error(`  ${name}: Paycom LLM fallback failed:`, e);
        }
      }
      const data: Record<string, string> = {};
      if (ex.paycomPersonId && !cand.paycomPersonId) { data.paycomPersonId = ex.paycomPersonId; paycomFilled.push("Paycom ID"); }
      if (ex.email && !cand.primaryEmail) {
        data.primaryEmail = ex.email;
        const n = normalizeEmail(ex.email); if (n) data.normalizedEmail = n;
        paycomFilled.push("email");
      }
      if (ex.phone && !cand.primaryPhone) {
        data.primaryPhone = ex.phone;
        const n = normalizePhone(ex.phone); if (n) data.normalizedPhone = n;
        paycomFilled.push("phone");
      }
      if (ex.firstName && !cand.firstName) { data.firstName = ex.firstName; paycomFilled.push("first name"); }
      if (ex.lastName && !cand.lastName) { data.lastName = ex.lastName; paycomFilled.push("last name"); }
      if (Object.keys(data).length > 0) {
        appendFileSync(undoPath, JSON.stringify({ t: "candidate", candidateId: id, fields: Object.keys(data) }) + "\n");
        await prisma.candidate.update({ where: { id }, data });
      }
    } catch (e) {
      console.error(`  ${name}: Paycom extraction failed:`, e);
    }
  }

  const bits = [APPLY ? `${suggested} metric(s)` : `would write ${wouldWrite} metric(s)`];
  if (form.parsed.length) {
    bits.push(`form: ${form.parsed.map((p) => p.templateId).join("+")} → ${form.metrics.size} field(s)`);
  }
  if (certNote) bits.push(certNote);
  if (healed) bits.push(`${healed} text self-heal`);
  if (paycomFilled.length) bits.push(`Paycom: ${paycomFilled.join(", ")}`);
  if (llmMissed) bits.push(`LLM MISS (${llmMissed}) — regex fallback`);
  return `${name}: ${bits.join(", ")}`;
}

/**
 * Reverse a previous --apply run from its undo file. Metrics this run CREATED are
 * deleted; metrics it OVERWROTE are restored to the values recorded before the
 * write. Candidate fields it filled are set back to NULL — it only filled blanks.
 *
 * Undo files written before the prev-value change carry no `prev`; those rows are
 * left alone and counted separately rather than guessed at.
 */
async function undoRun(file: string) {
  const entries = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  let deleted = 0, cleared = 0, restored = 0, kept = 0;
  for (const e of entries) {
    if (e.t === "metric") {
      if (e.existed) {
        if (!e.prev) { kept += 1; continue; }
        await prisma.candidateMetric.update({
          where: { candidateId_key: { candidateId: e.candidateId, key: e.key } },
          data: {
            label: e.prev.label,
            valueNumber: e.prev.valueNumber,
            valueText: e.prev.valueText,
            unit: e.prev.unit,
            status: e.prev.status,
            sourceFileId: e.prev.sourceFileId,
            sourceSnippet: e.prev.sourceSnippet
          }
        });
        restored += 1;
        continue;
      }
      await prisma.candidateMetric.deleteMany({ where: { candidateId: e.candidateId, key: e.key } });
      deleted += 1;
    } else if (e.t === "candidate") {
      const data: Record<string, null> = {};
      for (const f of e.fields as string[]) data[f] = null;
      await prisma.candidate.update({ where: { id: e.candidateId }, data });
      cleared += 1;
    }
  }
  console.log(`undo: deleted ${deleted} created metric(s), restored ${restored} overwritten metric(s), cleared ${cleared} candidate field-set(s), left ${kept} unrecoverable (no prev recorded)`);
  await prisma.$disconnect();
}

async function main() {
  if (UNDO_FILE) return undoRun(UNDO_FILE);
  if (APPLY && !FORMS_ONLY && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — the run would silently fall back to the");
    console.error("regex extractor, which is known to misread hours. Aborting.");
    process.exit(1);
  }

  const targets = await prisma.candidate.findMany({
    where: {
      status: "ACTIVE",
      // The default run is for people with nothing. --forms-only is the opposite:
      // it re-reads people who already have metrics so the layout values win.
      ...(FORMS_ONLY ? { metrics: { some: {} } } : { metrics: { none: {} } }),
      files: { some: { AND: [{ extractedText: { not: null } }, { extractedText: { not: "" } }] } },
      ...(JOB ? { applications: { some: { jobId: JOB } } } : {})
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
    ...(LIMIT ? { take: LIMIT } : {})
  });

  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reviewPath = path.join(OUT, `bulk-scan-${stamp}.txt`);
  const undoPath = path.join(OUT, `bulk-scan-${stamp}.undo.jsonl`);

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${FORMS_ONLY ? "FORMS ONLY (no model call, no cost)" : `model=${MODEL}`} concurrency=${CONCURRENCY}`);
  console.log(`${targets.length} candidate(s): ACTIVE, ${FORMS_ONLY ? "already have metrics" : "zero metrics"}, has document text${JOB ? `, job=${JOB}` : ""}\n`);
  if (targets.length === 0) { await prisma.$disconnect(); return; }

  const lines: string[] = [];
  let done = 0;
  let queue = 0;
  async function worker() {
    while (queue < targets.length) {
      const i = queue++;
      const t = targets[i];
      try {
        const line = await scanOne(t.id, t.displayName, undoPath);
        lines.push(line);
      } catch (e) {
        lines.push(`${t.displayName}: FAILED — ${e instanceof Error ? e.message : String(e)}`);
      }
      done += 1;
      if (done % 10 === 0 || done === targets.length) {
        const spend = APPLY ? `  spend so far $${costOf(usageTotal, MODEL).toFixed(2)}` : "";
        console.log(`  ${done}/${targets.length}${spend}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  lines.sort();
  // The certificates summary leads the review, marked values first: those are
  // the rows a person already decided, which this run would reopen.
  const header: string[] = [];
  if (Object.keys(certTally).length > 0) {
    const tally = Object.entries(certTally).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} ${n}`).join(" · ");
    header.push(`${APPLY ? "APPLIED" : "DRY RUN"} — certificates: ${tally}`);
    if (markedExamples.length > 0) header.push("", `Marked values ${APPLY ? "reopened" : "that would reopen"} (${markedExamples.length}):`, ...markedExamples.sort());
    header.push("", "---", "");
  }
  writeFileSync(reviewPath, [...header, ...lines].join("\n") + "\n", "utf8");
  if (header.length > 0) {
    console.log(`\n${header[0]}`);
    markedExamples.slice(0, 5).forEach((example) => console.log(example));
  }
  console.log(`\nreview: ${reviewPath}`);
  if (APPLY) {
    console.log(`undo:   ${undoPath}`);
    console.log(
      `\ntokens  in=${usageTotal.input.toLocaleString()} out=${usageTotal.output.toLocaleString()} ` +
      `cacheRead=${usageTotal.cacheRead.toLocaleString()} cacheWrite=${usageTotal.cacheWrite.toLocaleString()}`
    );
    console.log(`ACTUAL COST (${MODEL}): $${costOf(usageTotal, MODEL).toFixed(2)}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
