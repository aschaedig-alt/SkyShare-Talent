"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader, Check, ChevronDown } from "lucide-react";
import type { DuplicateCluster, DuplicateClusterJob } from "@/lib/jobs/duplicate-detection";

interface JobDuplicateClustersProps {
  initialClusters?: DuplicateCluster[] | null;
}

export function JobDuplicateClusters({ initialClusters = null }: JobDuplicateClustersProps) {
  const [clusters, setClusters] = useState<DuplicateCluster[] | null>(initialClusters);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/duplicates/clusters");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to scan job duplicates.");
      setClusters(data.clusters ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to scan job duplicates.");
    } finally {
      setScanning(false);
    }
  }, []);

  const totalDuplicates = clusters?.reduce((sum, c) => sum + (c.jobs.length - 1), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-brand-grey dark:text-slate-400">
          {clusters === null
            ? "Run a scan to group jobs into duplicate clusters."
            : clusters.length === 0
              ? "No duplicate clusters found."
              : `${clusters.length} clusters • ${totalDuplicates} redundant jobs`}
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          className="flex items-center gap-2 rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-lea/90 disabled:cursor-wait disabled:opacity-70"
        >
          {scanning && <Loader className="h-4 w-4 animate-spin" />}
          {scanning ? "Scanning…" : clusters === null ? "Scan job duplicates" : "Re-scan"}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-900 dark:text-red-300">
          {error}
        </div>
      )}

      {clusters && clusters.length === 0 && (
        <div className="rounded border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 p-4 text-center text-sm text-emerald-900 dark:text-emerald-300">
          <Check className="mx-auto h-6 w-6" />
          <p className="mt-1 font-medium">All jobs look unique — nothing to merge.</p>
        </div>
      )}

      {clusters &&
        clusters.map((cluster) => (
          <ClusterCard key={cluster.key} cluster={cluster} onMerged={scan} />
        ))}
    </div>
  );
}

function ClusterCard({ cluster, onMerged }: { cluster: DuplicateCluster; onMerged: () => void }) {
  // Default "keep": the job with the most activity (apps + interviews).
  const sortedByActivity = [...cluster.jobs].sort(
    (a, b) => b.applications + b.interviews - (a.applications + a.interviews)
  );
  const defaultPrimary = sortedByActivity[0].id;

  const [primaryId, setPrimaryId] = useState<string>(defaultPrimary);
  // Exact clusters: pre-select all others to merge. Similar: select none (user decides).
  const [toMerge, setToMerge] = useState<Set<string>>(() => {
    if (cluster.matchType === "exact") {
      return new Set(cluster.jobs.filter((j) => j.id !== defaultPrimary).map((j) => j.id));
    }
    return new Set();
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const busy = merging || dismissing;

  function allPairs(ids: string[]): [string, string][] {
    const pairs: [string, string][] = [];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        pairs.push([ids[i], ids[j]]);
      }
    }
    return pairs;
  }

  async function dismissPairs(pairs: [string, string][], label: string) {
    setDismissing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/jobs/duplicates/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "Failed to dismiss.");
      setMessage({ type: "success", text: `${label} Refreshing…` });
      setTimeout(onMerged, 900);
    } catch (e) {
      setDismissing(false);
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to dismiss." });
    }
  }

  function handleDismissCluster() {
    dismissPairs(allPairs(cluster.jobs.map((j) => j.id)), "Marked the whole group as not duplicates.");
  }

  function handleDismissJob(jobId: string) {
    const others = cluster.jobs.filter((j) => j.id !== jobId).map((j) => j.id);
    dismissPairs(
      others.map((o) => [jobId, o] as [string, string]),
      "Removed that job from the cluster."
    );
  }

  function setPrimary(id: string) {
    setPrimaryId(id);
    // The new primary can't also be a merge target.
    setToMerge((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleMerge(id: string) {
    setToMerge((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedIds = [...toMerge].filter((id) => id !== primaryId);

  async function handleMergeSelected() {
    if (selectedIds.length === 0) return;
    setMerging(true);
    setMessage(null);

    let merged = 0;
    let movedApps = 0;
    let movedInterviews = 0;

    for (const secondaryId of selectedIds) {
      try {
        const response = await fetch("/api/jobs/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ primaryJobId: primaryId, secondaryJobId: secondaryId }),
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

    if (merged === selectedIds.length) {
      setMessage({
        type: "success",
        text: `Merged ${merged} job${merged === 1 ? "" : "s"} (${movedApps} applications, ${movedInterviews} interviews moved). Refreshing…`,
      });
      setTimeout(onMerged, 1200);
    } else {
      setMessage({
        type: "error",
        text: `Merged ${merged} of ${selectedIds.length}. Some merges failed — please re-scan and retry.`,
      });
      setTimeout(onMerged, 1500);
    }
  }

  return (
    <section className="rounded border border-brand-lea/10 bg-white dark:border-white/10 dark:bg-brand-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span
            className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${
              cluster.matchType === "exact" ? "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300" : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
            }`}
          >
            {cluster.matchType === "exact" ? "Exact" : "Similar"}
          </span>
          <h3 className="font-semibold text-brand-lea dark:text-slate-100">{cluster.title}</h3>
          <span className="text-xs text-brand-grey dark:text-slate-400">{cluster.jobs.length} jobs</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDismissCluster}
            disabled={busy}
            className="flex items-center gap-2 rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/30 hover:text-brand-lea disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:bg-white/5"
            title="These are all different jobs — stop showing this group"
          >
            {dismissing && <Loader className="h-4 w-4 animate-spin" />}
            Not duplicates
          </button>
          <button
            onClick={handleMergeSelected}
            disabled={busy || selectedIds.length === 0}
            className="flex items-center gap-2 rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100"
          >
            {merging && <Loader className="h-4 w-4 animate-spin" />}
            {merging ? "Merging…" : `Merge ${selectedIds.length} selected`}
          </button>
        </div>
      </div>

      {cluster.matchType === "similar" && (
        <div className="border-b border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/15 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
          These are <strong>similar</strong> titles, not guaranteed duplicates. Check the boxes only for the jobs that
          are truly the same role.
        </div>
      )}

      {message && (
        <div
          className={`mx-4 mt-3 rounded p-3 text-sm ${
            message.type === "success"
              ? "border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="divide-y divide-brand-lea/10 p-2 dark:divide-white/10">
        {cluster.jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            isPrimary={job.id === primaryId}
            isChecked={toMerge.has(job.id)}
            isExpanded={expanded.has(job.id)}
            disabled={busy}
            canRemove={cluster.jobs.length > 2}
            onSetPrimary={() => setPrimary(job.id)}
            onToggleMerge={() => toggleMerge(job.id)}
            onToggleExpand={() => toggleExpand(job.id)}
            onDismiss={() => handleDismissJob(job.id)}
          />
        ))}
      </div>

      <div className="border-t border-brand-lea/10 px-4 py-2 text-xs text-brand-grey dark:border-white/10 dark:text-slate-400">
        Select <span className="font-semibold text-brand-lea dark:text-slate-100">Keep</span> for the job that survives, then check the
        boxes for the jobs to merge into it. Use <span className="font-semibold text-brand-lea dark:text-slate-100">Not a dup</span> to
        drop a single job, or <span className="font-semibold text-brand-lea dark:text-slate-100">Not duplicates</span> to dismiss the whole
        group.
      </div>
    </section>
  );
}

function JobRow({
  job,
  isPrimary,
  isChecked,
  isExpanded,
  disabled,
  canRemove,
  onSetPrimary,
  onToggleMerge,
  onToggleExpand,
  onDismiss,
}: {
  job: DuplicateClusterJob;
  isPrimary: boolean;
  isChecked: boolean;
  isExpanded: boolean;
  disabled: boolean;
  canRemove: boolean;
  onSetPrimary: () => void;
  onToggleMerge: () => void;
  onToggleExpand: () => void;
  onDismiss: () => void;
}) {
  const metaLine = [
    job.baseLocation || (job.city && `${job.city}${job.state ? `, ${job.state}` : ""}`),
    job.roleCategory,
    job.pilotSeat,
    job.status,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className={`rounded ${isPrimary ? "bg-emerald-50 dark:bg-emerald-500/15" : ""}`}>
      <div className="flex items-center justify-between gap-3 px-2 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* Keep radio */}
          <button
            onClick={onSetPrimary}
            disabled={disabled}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition hover:shadow-glow ${
              isPrimary ? "border-emerald-500 bg-emerald-500" : "border-brand-lea/30 hover:border-emerald-400 dark:border-white/10"
            } disabled:opacity-50`}
            title={isPrimary ? "This job will be kept" : "Keep this job instead"}
          >
            {isPrimary && <Check className="h-3 w-3 text-white" />}
          </button>

          {/* Merge checkbox (hidden for the primary) */}
          {isPrimary ? (
            <span className="w-4 shrink-0" />
          ) : (
            <input
              type="checkbox"
              checked={isChecked}
              onChange={onToggleMerge}
              disabled={disabled}
              className="h-4 w-4 shrink-0 rounded border-brand-lea/30 dark:border-white/10"
              title="Merge this job into the kept job"
            />
          )}

          <button onClick={onToggleExpand} className="min-w-0 text-left transition hover:shadow-glow">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-lea dark:text-slate-100">
              <span className="truncate">{job.title}</span>
              {isPrimary && (
                <span className="rounded bg-emerald-100 dark:bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  Keep
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-brand-grey transition-transform dark:text-slate-400 ${isExpanded ? "rotate-180" : ""}`}
              />
            </div>
            {metaLine && <div className="mt-0.5 truncate text-xs text-brand-grey dark:text-slate-400">{metaLine}</div>}
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-4 text-xs text-brand-grey dark:text-slate-400">
          <span>{job.applications} apps</span>
          <span>{job.interviews} interviews</span>
          <Link
            href={`/recruiting-jobs?id=${job.id}`}
            target="_blank"
            className="text-brand-lea underline hover:text-brand-gold transition hover:shadow-glow dark:text-slate-100"
          >
            Open
          </Link>
          {canRemove && (
            <button
              onClick={onDismiss}
              disabled={disabled}
              className="rounded border border-brand-lea/15 px-2 py-1 font-semibold text-brand-grey transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-white/10 dark:text-slate-400"
              title="This job is not a duplicate of the others — remove it from this cluster"
            >
              Not a dup
            </button>
          )}
        </div>
      </div>

      {isExpanded && <JobDetails job={job} />}
    </div>
  );
}

function JobDetails({ job }: { job: DuplicateClusterJob }) {
  const facts: Array<[string, string | undefined]> = [
    ["Recruiter", job.recruiter],
    ["Job Req ID", job.jobReqId],
    ["Source", job.source],
    ["Opened", job.openedDate ? new Date(job.openedDate).toLocaleDateString() : undefined],
    ["Base", job.baseLocation],
    ["Seat", job.pilotSeat],
    ["Category", job.roleCategory],
    ["Pay", job.paySummary],
    ["Schedule", job.scheduleSummary],
  ];
  const shownFacts = facts.filter(([, v]) => Boolean(v));

  return (
    <div className="mx-2 mb-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3 text-xs dark:border-white/10 dark:bg-white/5">
      {shownFacts.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shownFacts.map(([label, value]) => (
            <div key={label}>
              <div className="font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">{label}</div>
              <div className="mt-0.5 text-brand-lea dark:text-slate-100">{value}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-brand-grey dark:text-slate-400">No extra structured details on this job.</p>
      )}

      {job.jobDescriptionText && (
        <div className="mt-3">
          <div className="font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">Description</div>
          <p className="mt-1 whitespace-pre-wrap text-brand-lea line-clamp-6 dark:text-slate-100">
            {job.jobDescriptionText.slice(0, 600)}
            {job.jobDescriptionText.length > 600 ? "…" : ""}
          </p>
        </div>
      )}

      {job.rawMinimumRequirements && (
        <div className="mt-3">
          <div className="font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">Minimum Requirements</div>
          <p className="mt-1 whitespace-pre-wrap text-brand-lea line-clamp-6 dark:text-slate-100">
            {job.rawMinimumRequirements.slice(0, 600)}
            {job.rawMinimumRequirements.length > 600 ? "…" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
