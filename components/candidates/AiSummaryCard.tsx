"use client";

import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import type { CandidateProfileData } from "@/lib/data/candidates";
import { formatMomentDate } from "@/lib/dates/display";

type AiSummaryCardProps = {
  candidateId: string;
  summary: CandidateProfileData["aiSummary"];
  isHistorical: boolean;
  canEdit?: boolean;
};

function formatDate(value: string) {
  return formatMomentDate(value);
}

// Displays the AI-generated candidate narrative and (for editors) a Generate /
// Regenerate control. Generation runs on demand against the Claude API; when no
// API key is configured the control reports that clearly instead of failing.
export function AiSummaryCard({ candidateId, summary: initialSummary, isHistorical, canEdit = false }: AiSummaryCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/ai-summary`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSummary({ summary: data.summary, generatedAt: data.generatedAt });
      } else if (data.notConfigured) {
        setNotice("AI summaries aren't switched on yet — an ANTHROPIC_API_KEY is needed to generate them.");
      } else {
        setNotice(data.message || "Couldn't generate a summary.");
      }
    } catch {
      setNotice("Couldn't reach the summary service.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-gold" />
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">AI summary</p>
        </div>
        {canEdit && (
          <button
            onClick={generate}
            disabled={busy}
            className="flex items-center gap-1.5 rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Generating…" : summary ? "Regenerate" : "Generate"}
          </button>
        )}
      </div>

      {summary ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-brand-lea dark:text-slate-100">{summary.summary}</p>
          <p className="mt-3 text-[11px] text-brand-grey dark:text-slate-500">
            Generated {formatDate(summary.generatedAt)} · regenerates when new history is imported
          </p>
        </>
      ) : (
        <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm dark:border-white/10 dark:bg-white/5">
          <div className="font-semibold text-brand-lea dark:text-slate-100">No summary yet</div>
          <p className="mt-1 text-brand-grey dark:text-slate-400">
            {isHistorical
              ? "Generate a narrative summary of this candidate's full history, or it will be created automatically once AI summaries are switched on."
              : "AI summaries are generated for candidates with recruiting history (applications, interviews, notes)."}
          </p>
        </div>
      )}

      {notice && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{notice}</p>}
    </section>
  );
}
