/**
 * Metrics read from a document's LAYOUT instead of its flattened text.
 *
 * WHY THIS EXISTS. lib/files/pdf-text.ts flattens a PDF to one string, which is
 * right for search and wrong for a form: every label prints first and every
 * value prints afterwards, so a completed Pilot Application flattens to
 *
 *   ...NE250010/20266810642002675205014615561200460272044444444
 *
 * with the address, phone and every hour figure run together. Neither a regex
 * nor a model can split that — and the model is right not to try. The bulk scan
 * on 2026-08-26 produced ZERO metrics for 76 active candidates for exactly this
 * reason, while their hours sat in the text the whole time.
 *
 * lib/files/pdf-form.ts already solves it: it keeps each text item's x/y, groups
 * them into visual rows, and pairs a label with the value to its right. Its
 * FieldSpec.metricKey values are already CandidateMetric keys. All that was
 * missing was this bridge from parsed field to stored metric.
 *
 * Layout-parsed values BEAT model-read ones wherever both exist. There is no
 * inference here and no per-candidate cost — as pdf-form's own header puts it,
 * more accurate than a model because there is nothing to guess. The model still
 * covers what the templates do not: time in type, type ratings, certificates.
 *
 * SERVER ONLY — reads file bytes and dynamically imports unpdf underneath.
 */
import { parsePdfForm, SOURCE_PRECEDENCE } from "@/lib/files/pdf-form";
import { METRIC_DEFS } from "@/lib/extraction/pilot-metrics";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";

const LABEL = new Map(METRIC_DEFS.map((d) => [d.key, d.label]));
const UNIT = new Map(METRIC_DEFS.map((d) => [d.key, d.unit]));

export type FormMetric = {
  key: string;
  label: string;
  valueNumber?: number;
  valueText?: string;
  unit?: string;
  snippet: string;
  sourceFileId: string;
  /** Which template it came from, so a caller can explain the winner. */
  templateId: string;
};

export type FormScanFile = {
  id: string;
  storageKey: string | null;
  mimeType: string | null;
  displayFilename: string | null;
  originalFilename: string | null;
};

export type FormScanResult = {
  metrics: Map<string, FormMetric>;
  /** One entry per document that matched a template — for the run log. */
  parsed: Array<{ fileId: string; filename: string; templateId: string; fieldCount: number }>;
};

function looksLikePdf(mimeType: string | null, filename: string): boolean {
  return (mimeType ?? "").includes("pdf") || filename.toLowerCase().endsWith(".pdf");
}

/**
 * Parse every form-shaped PDF a candidate has and return one metric per key.
 *
 * When two documents disagree — and they routinely do, these numbers are all
 * self-reported — SOURCE_PRECEDENCE decides, which is the order the user set on
 * 2026-07-28: signed Pilot Application, then resume table, then Paycom.
 *
 * Never throws: a document that fails to parse is skipped, because a partial
 * read is worth more here than none.
 */
export async function metricsFromForms(files: FormScanFile[]): Promise<FormScanResult> {
  const metrics = new Map<string, FormMetric>();
  const parsed: FormScanResult["parsed"] = [];
  const rankOf = (templateId: string) => {
    const i = SOURCE_PRECEDENCE.indexOf(templateId);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const winningRank = new Map<string, number>();

  const storage = getFileStorageAdapter();
  for (const file of files) {
    const filename = file.displayFilename || file.originalFilename || "";
    if (!file.storageKey || !looksLikePdf(file.mimeType, filename)) continue;

    try {
      const { bytes } = await storage.read(file.storageKey);
      const form = await parsePdfForm(new Uint8Array(bytes));
      if (!form.template || form.fields.length === 0) continue;

      const templateId = form.template.id;
      const rank = rankOf(templateId);
      parsed.push({ fileId: file.id, filename, templateId, fieldCount: form.fields.length });

      for (const field of form.fields) {
        const held = winningRank.get(field.metricKey);
        // Lower rank wins. Equal rank keeps the first document seen.
        if (held !== undefined && held <= rank) continue;

        const isNumber = typeof field.value === "number";
        metrics.set(field.metricKey, {
          key: field.metricKey,
          label: LABEL.get(field.metricKey) ?? field.metricKey,
          valueNumber: isNumber ? (field.value as number) : undefined,
          valueText: isNumber ? undefined : String(field.value),
          unit: isNumber ? UNIT.get(field.metricKey) ?? "hrs" : undefined,
          snippet: field.evidence,
          sourceFileId: file.id,
          templateId
        });
        winningRank.set(field.metricKey, rank);
      }
    } catch (e) {
      console.error(`Form parse failed for ${filename}:`, e);
    }
  }

  return { metrics, parsed };
}
