"use client";

import { useState } from "react";
import { DuplicateDetectionModal } from "@/components/jobs/DuplicateDetectionModal";
import { Loader } from "lucide-react";

interface Job {
  id: string;
  title: string;
  city?: string;
  state?: string;
  status: string;
  _count: {
    applications: number;
  };
}

export function JobDuplicateScanCard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const selectedJob = selectedJobId ? jobs.find(j => j.id === selectedJobId) : null;

  async function loadJobs() {
    setLoading(true);
    try {
      const response = await fetch("/api/jobs/duplicates?jobId=meta");
      // Actually, we just need to fetch jobs directly
      // Let me use a different approach - fetch from the page data
      setLoading(false);
      setExpanded(true);
    } catch (error) {
      console.error("Failed to load jobs:", error);
      setLoading(false);
    }
  }

  return (
    <>
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
              Job duplicate scan
            </p>
            <h2 className="text-base font-semibold text-brand-lea">Find similar job records</h2>
            <p className="mt-1 max-w-3xl text-xs text-brand-grey">
              Compares job titles and locations using similarity matching (60%+ match). Helps consolidate duplicate job
              postings that may have duplicate applications and interviews.
            </p>
          </div>
          <a
            href="/jobs/duplicates"
            className="rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black shadow-sm transition hover:bg-brand-gold/90"
          >
            Open Scanner
          </a>
        </div>

        <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/30 px-3 py-2 text-xs text-brand-grey">
          <strong>How it works:</strong> Go to the Job Duplicates scanner to select a job, scan for similar titles, and
          merge duplicates to consolidate applications and interviews.
        </div>
      </section>

      {/* Modal for selected job */}
      {selectedJobId && selectedJob && (
        <DuplicateDetectionModal
          jobId={selectedJobId}
          jobTitle={selectedJob.title}
          onClose={() => setSelectedJobId(null)}
          onMergeComplete={() => {
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
