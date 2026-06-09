"use client";

import { useState } from "react";
import Link from "next/link";
import { DuplicateDetectionModal } from "@/components/jobs/DuplicateDetectionModal";

interface Job {
  id: string;
  title: string;
  city?: string;
  state?: string;
  status: string;
  createdAt: Date;
  _count: {
    applications: number;
    interviews: number;
  };
}

interface JobDuplicatesWorkspaceProps {
  jobs: Job[];
}

export function JobDuplicatesWorkspace({ jobs }: JobDuplicatesWorkspaceProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectedJob = selectedJobId ? jobs.find(j => j.id === selectedJobId) : null;

  return (
    <div className="space-y-6 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Job Management</p>
        <h1 className="text-2xl font-semibold text-brand-lea">Duplicate Detection</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          Scan for duplicate jobs by title and location, then merge duplicates to consolidate applications and interviews.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Job List */}
        <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 h-fit max-h-[calc(100vh-200px)] overflow-y-auto">
          <div className="sticky top-0 border-b border-brand-lea/10 bg-white px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-grey">
              Jobs ({jobs.length})
            </div>
          </div>

          <div className="space-y-1 p-2">
            {jobs.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-brand-grey">
                No jobs found
              </div>
            ) : (
              jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full rounded px-3 py-2 text-left transition ${
                    selectedJobId === job.id
                      ? "bg-brand-gold/20 ring-1 ring-brand-gold"
                      : "hover:bg-brand-cloudDancer/30"
                  }`}
                >
                  <div className="text-sm font-medium text-brand-lea truncate">{job.title}</div>
                  {job.city && (
                    <div className="mt-1 text-xs text-brand-grey">
                      {job.city}, {job.state}
                    </div>
                  )}
                  <div className="mt-1 flex gap-2 text-xs text-brand-grey">
                    <span>{job._count.applications} apps</span>
                    <span>•</span>
                    <span>{job._count.interviews} interviews</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Details */}
        <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 p-5">
          {selectedJob ? (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">Job Details</p>
                <h2 className="text-xl font-semibold text-brand-lea mt-2">{selectedJob.title}</h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-grey">Location</div>
                  <div className="mt-1 font-medium text-brand-lea">
                    {selectedJob.city && selectedJob.state ? `${selectedJob.city}, ${selectedJob.state}` : "N/A"}
                  </div>
                </div>

                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-grey">Status</div>
                  <div className="mt-1 font-medium text-brand-lea">{selectedJob.status}</div>
                </div>

                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-grey">Applications</div>
                  <div className="mt-1 text-2xl font-bold text-brand-lea">{selectedJob._count.applications}</div>
                </div>

                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-grey">Interviews</div>
                  <div className="mt-1 text-2xl font-bold text-brand-lea">{selectedJob._count.interviews}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedJobId(selectedJob.id)}
                  className="flex-1 rounded bg-brand-gold px-4 py-2 font-semibold text-brand-black hover:bg-brand-gold/90 transition"
                >
                  🔍 Scan for Duplicates
                </button>
                <Link
                  href={`/recruiting-jobs?id=${selectedJob.id}`}
                  className="flex-1 rounded border border-brand-lea/20 px-4 py-2 font-semibold text-brand-lea hover:bg-brand-cloudDancer/20 transition text-center"
                >
                  View Job
                </Link>
              </div>

              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3 text-sm text-brand-grey">
                <p className="font-medium text-brand-lea mb-2">How it works:</p>
                <ol className="space-y-1 list-decimal list-inside text-xs">
                  <li>Select a job from the list</li>
                  <li>Click &quot;Scan for Duplicates&quot;</li>
                  <li>Review similar jobs (75%+ title match)</li>
                  <li>Preview impact (apps, interviews, posts)</li>
                  <li>Confirm merge to combine into one job</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-4xl mb-3">👈</div>
              <p className="font-medium text-brand-lea">Select a job to scan</p>
              <p className="mt-1 text-sm text-brand-grey">Choose a job from the list to find duplicates</p>
            </div>
          )}
        </section>
      </div>

      {/* Modal */}
      {selectedJobId && selectedJob && (
        <DuplicateDetectionModal
          jobId={selectedJobId}
          jobTitle={selectedJob.title}
          onClose={() => setSelectedJobId(null)}
          onMergeComplete={() => {
            // Refresh the page to update job list
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
