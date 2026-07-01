"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clipboard, Code2, Copy, FileText, Search, ShieldCheck } from "lucide-react";
import { FormattedJobPost } from "@/components/job-preview/FormattedJobPost";
import { ReadinessCard } from "@/components/job-preview/ReadinessCard";
import { buildJobPostHtml, buildJobPostPlainText } from "@/lib/formatting/job-post-code";
import { getJobWarnings } from "@/lib/validation/warnings";
import type { SerializedJobPost } from "@/lib/types";

type FinalReviewWorkspaceProps = {
  jobs: SerializedJobPost[];
};

type ExportMode = "html" | "plain";

const inputClass =
  "w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition placeholder:text-brand-grey/70 focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

function statusLabel(status: SerializedJobPost["status"]) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function FinalReviewWorkspace({ jobs }: FinalReviewWorkspaceProps) {
  const [selectedJobId, setSelectedJobId] = useState(jobs[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [exportMode, setExportMode] = useState<ExportMode>("html");
  const [copied, setCopied] = useState<ExportMode | null>(null);

  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return jobs;
    }

    return jobs.filter((job) =>
      [job.title, job.department, job.location, job.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [jobs, query]);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? jobs[0];
  const warnings = selectedJob ? getJobWarnings(selectedJob) : [];
  const htmlCode = useMemo(() => (selectedJob ? buildJobPostHtml(selectedJob) : ""), [selectedJob]);
  const plainText = useMemo(() => (selectedJob ? buildJobPostPlainText(selectedJob) : ""), [selectedJob]);
  const exportValue = exportMode === "html" ? htmlCode : plainText;
  const requiredWarnings = warnings.filter((warning) => warning.severity === "required");
  const readyToPublish = warnings.length === 0;
  const canPublishWithReview = requiredWarnings.length === 0;

  async function copyExport(mode: ExportMode) {
    const value = mode === "html" ? htmlCode : plainText;
    await navigator.clipboard.writeText(value);
    setCopied(mode);
    window.setTimeout(() => setCopied(null), 1600);
  }

  if (!selectedJob) {
    return (
      <div className="px-6 py-6">
        <div className="rounded bg-white p-8 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          No seeded jobs found. Run <code>npm.cmd run db:seed</code> to load starter data.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-brand-lea text-white shadow-lg shadow-brand-lea/15">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white/10">
              <ShieldCheck className="h-5 w-5 text-brand-gold" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-sweet">
                Final Review
              </div>
              <h1 className="truncate text-2xl font-semibold">Publish-ready job post export</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-lea dark:text-slate-100">
              Template Locked
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] ${
                readyToPublish
                  ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-300"
                  : canPublishWithReview
                    ? "bg-white text-brand-lea dark:bg-brand-panel dark:text-slate-100"
                    : "bg-brand-red text-white"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {readyToPublish ? "Ready" : canPublishWithReview ? "Review Recommended" : "Needs Required Fixes"}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-5 px-5 py-5 lg:px-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <main className="space-y-5">
          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(260px,1.3fr)_auto] md:items-end">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                  Search jobs
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-brand-grey dark:text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className={`${inputClass} pl-9`}
                    placeholder="Search title, department, location..."
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                  Job to review
                </label>
                <select
                  value={selectedJob.id}
                  onChange={(event) => setSelectedJobId(event.target.value)}
                  className="w-full rounded border border-brand-lea/15 bg-white px-3 py-2.5 text-sm font-semibold text-brand-lea outline-none focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                >
                  {filteredJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded bg-brand-cloudDancer px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-brand-lea dark:bg-white/5 dark:text-slate-100">
                {statusLabel(selectedJob.status)}
              </div>
            </div>
          </section>

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
                  Full formatted preview
                </p>
                <h2 className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{selectedJob.title}</h2>
              </div>
              <div className="rounded bg-brand-sweet/45 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-lea dark:text-slate-100">
                Final layout
              </div>
            </div>
            <FormattedJobPost job={selectedJob} showVersionBadges={false} />
          </section>
        </main>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="mb-3">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
                Publish readiness
              </p>
              <h2 className="mt-1 text-lg font-semibold text-brand-lea dark:text-slate-100">Checklist before copying</h2>
            </div>
            <ReadinessCard job={selectedJob} warnings={warnings} compact />
          </section>

          <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="border-b border-brand-lea/10 p-4 dark:border-white/10">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
                Export
              </p>
              <h2 className="mt-1 text-lg font-semibold text-brand-lea dark:text-slate-100">Copy for job boards</h2>
              <p className="mt-2 text-xs leading-5 text-brand-grey dark:text-slate-400">
                Limited HTML keeps only <code>&lt;b&gt;</code> labels, plain text, hyphen bullets, and blank lines.
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExportMode("html")}
                  className={`inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-bold transition hover:shadow-glow ${
                    exportMode === "html"
                      ? "bg-brand-lea text-white"
                      : "border border-brand-lea/12 bg-white text-brand-lea hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                  }`}
                >
                  <Code2 className="h-4 w-4" />
                  Limited HTML
                </button>
                <button
                  type="button"
                  onClick={() => setExportMode("plain")}
                  className={`inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-bold transition hover:shadow-glow ${
                    exportMode === "plain"
                      ? "bg-brand-lea text-white"
                      : "border border-brand-lea/12 bg-white text-brand-lea hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Plain Text
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyExport("html")}
                  className="inline-flex items-center justify-center gap-2 rounded bg-brand-gold px-3 py-2 text-xs font-bold text-brand-lea hover:bg-brand-gold/90 dark:text-slate-100"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied === "html" ? "Copied HTML" : "Copy Limited HTML"}
                </button>
                <button
                  type="button"
                  onClick={() => copyExport("plain")}
                  className="inline-flex items-center justify-center gap-2 rounded border border-brand-lea/12 bg-white px-3 py-2 text-xs font-bold text-brand-lea hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  {copied === "plain" ? "Copied Text" : "Copy Text"}
                </button>
              </div>

              <textarea
                readOnly
                value={exportValue}
                className="min-h-[460px] w-full resize-y rounded border border-brand-lea/12 bg-brand-cloudDancer/35 px-3 py-3 text-xs leading-5 text-brand-black outline-none focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/30 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                spellCheck={false}
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
