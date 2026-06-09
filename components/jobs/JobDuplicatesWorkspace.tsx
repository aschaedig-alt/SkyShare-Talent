"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader, Check } from "lucide-react";
import type { DuplicateCluster } from "@/lib/jobs/duplicate-detection";

interface JobDuplicatesWorkspaceProps {
  clusters: DuplicateCluster[];
}

type ClusterJob = DuplicateCluster["jobs"][number];

export function JobDuplicatesWorkspace({ clusters }: JobDuplicatesWorkspaceProps) {
  const totalDuplicates = clusters.reduce((sum, c) => sum + (c.jobs.length - 1), 0);

  return (
    <div className="space-y-6 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Job Management</p>
        <h1 className="text-2xl font-semibold text-brand-lea">Duplicate Jobs</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          All duplicate job clusters across the system. Each cluster shares an identical or highly similar title.
          Pick the job to keep, then merge the rest into it — applications and interviews move automatically.
        </p>
      </section>

      {/* Summary */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">Duplicate Clusters</div>
          <div className="mt-1 text-2xl font-semibold text-brand-lea">{clusters.length}</div>
        </div>
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">Redundant Jobs</div>
          <div className="mt-1 text-2xl font-semibold text-brand-lea">{totalDuplicates}</div>
        </div>
        <div className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">Exact Matches</div>
          <div className="mt-1 text-2xl font-semibold text-brand-lea">
            {clusters.filter((c) => c.matchType === "exact").length}
          </div>
        </div>
      </section>

      {/* Clusters */}
      {clusters.length === 0 ? (
        <section className="rounded bg-white p-8 shadow-panel ring-1 ring-brand-lea/10 text-center">
          <Check className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-3 font-medium text-brand-lea">No duplicate jobs found</p>
          <p className="mt-1 text-sm text-brand-grey">All your jobs appear to be unique.</p>
        </section>
      ) : (
        <div className="space-y-4">
          {clusters.map((cluster) => (
            <ClusterCard key={cluster.key} cluster={cluster} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: DuplicateCluster }) {
  // Default: keep the job with the most applications + interviews
  const sortedByActivity = [...cluster.jobs].sort(
    (a, b) => b.applications + b.interviews - (a.applications + a.interviews)
  );
  const [primaryId, setPrimaryId] = useState<string>(sortedByActivity[0].id);
  const [merging, setMerging] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const secondaries = cluster.jobs.filter((j) => j.id !== primaryId);

  async function handleMergeAll() {
    setMerging(true);
    setMessage(null);

    let merged = 0;
    let movedApps = 0;
    let movedInterviews = 0;

    for (const secondary of secondaries) {
      try {
        const response = await fetch("/api/jobs/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primaryJobId: primaryId,
            secondaryJobId: secondary.id,
          }),
        });
        const result = await response.json();
        if (result.success) {
          merged += 1;
          movedApps += result.affectedRecords?.applications ?? 0;
          movedInterviews += result.affectedRecords?.interviews ?? 0;
        }
      } catch {
        // continue with the rest
      }
    }

    setMerging(false);

    if (merged === secondaries.length) {
      setDone(true);
      setMessage({
        type: "success",
        text: `Merged ${merged} job${merged === 1 ? "" : "s"} (${movedApps} applications, ${movedInterviews} interviews moved). Reloading…`,
      });
      setTimeout(() => window.location.reload(), 1800);
    } else {
      setMessage({
        type: "error",
        text: `Merged ${merged} of ${secondaries.length}. Some merges failed — please retry.`,
      });
    }
  }

  return (
    <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-lea/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
              cluster.matchType === "exact"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {cluster.matchType === "exact" ? "Exact" : "Similar"}
          </span>
          <h2 className="font-semibold text-brand-lea">{cluster.title}</h2>
          <span className="text-xs text-brand-grey">{cluster.jobs.length} jobs</span>
        </div>

        <button
          onClick={handleMergeAll}
          disabled={merging || done}
          className="flex items-center gap-2 rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {merging && <Loader className="h-4 w-4 animate-spin" />}
          {done ? "Merged ✓" : merging ? "Merging…" : `Merge ${secondaries.length} into selected`}
        </button>
      </div>

      {message && (
        <div
          className={`mx-5 mt-3 rounded p-3 text-sm ${
            message.type === "success"
              ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="divide-y divide-brand-lea/10 p-2">
        {cluster.jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            isPrimary={job.id === primaryId}
            onSetPrimary={() => setPrimaryId(job.id)}
            disabled={merging || done}
          />
        ))}
      </div>

      <div className="border-t border-brand-lea/10 px-5 py-2 text-xs text-brand-grey">
        The job marked <span className="font-semibold text-brand-lea">Keep</span> stays; all others merge into it.
      </div>
    </section>
  );
}

function JobRow({
  job,
  isPrimary,
  onSetPrimary,
  disabled,
}: {
  job: ClusterJob;
  isPrimary: boolean;
  onSetPrimary: () => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded px-3 py-2 ${
        isPrimary ? "bg-emerald-50" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onSetPrimary}
          disabled={disabled}
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
            isPrimary
              ? "border-emerald-500 bg-emerald-500"
              : "border-brand-lea/30 hover:border-brand-gold"
          } disabled:opacity-50`}
          title={isPrimary ? "This job will be kept" : "Keep this job instead"}
        >
          {isPrimary && <Check className="h-3 w-3 text-white" />}
        </button>
        <div>
          <div className="text-sm font-medium text-brand-lea">
            {job.title}
            {isPrimary && (
              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                Keep
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-brand-grey">
            {[job.city && `${job.city}, ${job.state}`, job.department, job.status]
              .filter(Boolean)
              .join(" • ")}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-brand-grey">
        <span>{job.applications} apps</span>
        <span>{job.interviews} interviews</span>
        <Link
          href={`/recruiting-jobs?id=${job.id}`}
          className="text-brand-lea underline hover:text-brand-gold"
        >
          View
        </Link>
      </div>
    </div>
  );
}
