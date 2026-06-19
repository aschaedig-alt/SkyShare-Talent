"use client";

import { useMemo, useState } from "react";
import { Code2, FileText } from "lucide-react";
import type { SerializedJobPost } from "@/lib/types";
import type { ValidationWarning } from "@/lib/validation/warnings";
import { buildJobPostHtml } from "@/lib/formatting/job-post-code";
import { FormattedJobPost } from "@/components/job-preview/FormattedJobPost";
import { ReadinessCard } from "@/components/job-preview/ReadinessCard";

type JobPreviewProps = {
  job: SerializedJobPost;
  warnings: ValidationWarning[];
  view?: "preview" | "code";
  onViewChange?: (view: "preview" | "code") => void;
};

function statusLabel(status: SerializedJobPost["status"]) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function JobPreview({ job, warnings, view: controlledView, onViewChange }: JobPreviewProps) {
  const [internalView, setInternalView] = useState<"preview" | "code">("preview");
  const view = controlledView ?? internalView;
  const jobBoardCode = useMemo(() => buildJobPostHtml(job), [job]);

  function setView(nextView: "preview" | "code") {
    setInternalView(nextView);
    onViewChange?.(nextView);
  }

  return (
    <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
      <div className="border-b border-brand-lea/10 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
              3. Job Posting Preview
            </p>
            <h2 className="mt-1 text-xl font-semibold text-brand-lea">Formatted and ready to publish</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="rounded bg-brand-sweet/45 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-lea">
              {statusLabel(job.status)}
            </div>
            <div className="flex rounded border border-brand-lea/10 bg-brand-cloudDancer/70 p-1">
              {[
                { key: "preview", label: "Preview" },
                { key: "code", label: "Limited HTML" }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setView(item.key as "preview" | "code")}
                  className={`rounded px-2.5 py-1.5 text-xs font-bold uppercase tracking-[0.08em] transition hover:shadow-glow ${
                    view === item.key ? "bg-white text-brand-lea shadow-sm" : "text-brand-eden hover:text-brand-lea"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <ReadinessCard job={job} warnings={warnings} />

        {view === "code" ? (
          <div className="overflow-hidden rounded border border-brand-lea/12 bg-brand-cloudDancer/55 shadow-sm">
            <div className="border-b border-brand-lea/10 bg-white px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-brand-lea">
                  <Code2 className="h-4 w-4 text-brand-eden" />
                  Limited job board HTML
                </div>
                <p className="mt-1 text-xs font-medium text-brand-grey">
                  Use step 4 Export to copy this for job boards that only allow simple code.
                </p>
              </div>
            </div>
            <textarea
              readOnly
              value={jobBoardCode}
              className="min-h-[720px] w-full resize-y border-0 bg-white px-4 py-4 text-xs leading-5 text-brand-black outline-none"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-brand-lea/12 bg-brand-cloudDancer/55 shadow-sm">
            <div className="border-b border-brand-lea/10 bg-white px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-brand-lea">
                  <FileText className="h-4 w-4 text-brand-eden" />
                  Formatted posting preview
                </div>
                <p className="mt-1 text-xs font-medium text-brand-grey">
                  Use step 4 Export for PDF, basic HTML, or fully formatted colored text.
                </p>
              </div>
            </div>
            <div className="p-3">
              <FormattedJobPost job={job} showVersionBadges />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
