"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, FileText, Lock, Plane, RotateCcw, Save } from "lucide-react";
import { JobDataEditor, type JobSaveStatus } from "@/components/job-editor/JobDataEditor";
import { TemplateTokensPanel } from "@/components/template-tokens/TemplateTokensPanel";
import { JobPreview } from "@/components/job-preview/JobPreview";
import { JobExportMenu } from "@/components/job-preview/JobExportMenu";
import { JobBlockAssembly } from "@/components/job-editor/JobBlockAssembly";
import type { JobFormValues } from "@/lib/validation/job";
import { getJobWarnings } from "@/lib/validation/warnings";
import type { SerializedContentBlock, SerializedJobPost } from "@/lib/types";

type JobsWorkspaceProps = {
  initialJobs: SerializedJobPost[];
  initialBlocks: SerializedContentBlock[];
};

type JobListView = "active" | "archived" | "all";

function jobIsVisibleForView(job: SerializedJobPost, view: JobListView) {
  if (view === "archived") {
    return job.status === "RETIRED";
  }

  if (view === "active") {
    return job.status !== "RETIRED";
  }

  return true;
}

function statusLabel(status: SerializedJobPost["status"]) {
  if (status === "RETIRED") {
    return "Archived";
  }

  return status
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function mergeDraft(job: SerializedJobPost, values: Partial<JobFormValues>): SerializedJobPost {
  return {
    ...job,
    ...values,
    title: values.title ?? job.title,
    location: values.location ?? job.location,
    positionType: values.positionType ?? job.positionType,
    paycom: values.paycom
      ? {
          id: job.paycom?.id ?? "draft-paycom",
          workflow: values.paycom.workflow ?? null,
          externalApplication: values.paycom.externalApplication ?? null,
          externalKnockout: values.paycom.externalKnockout ?? null,
          externalGlobal: values.paycom.externalGlobal ?? null,
          externalJobLevel: values.paycom.externalJobLevel ?? null,
          externalFollowUps: values.paycom.externalFollowUps ?? null,
          internalApplication: values.paycom.internalApplication ?? null,
          internalKnockout: values.paycom.internalKnockout ?? null,
          internalGlobal: values.paycom.internalGlobal ?? null,
          internalJobLevel: values.paycom.internalJobLevel ?? null
        }
      : job.paycom
  };
}

export function JobsWorkspace({ initialJobs, initialBlocks }: JobsWorkspaceProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [selectedJobId, setSelectedJobId] = useState(initialJobs[0]?.id ?? "");
  const [saveStatus, setSaveStatus] = useState<JobSaveStatus>({
    state: "idle",
    message: "Ready to save"
  });
  const [previewMode, setPreviewMode] = useState<"preview" | "code">("preview");
  const [jobListView, setJobListView] = useState<JobListView>("active");
  const [exportStatus, setExportStatus] = useState<{
    state: "idle" | "copying" | "copied" | "error";
    message: string;
  }>({ state: "idle", message: "" });
  const visibleJobs = useMemo(
    () => jobs.filter((job) => jobIsVisibleForView(job, jobListView)),
    [jobs, jobListView]
  );
  const jobCounts = useMemo(
    () => ({
      active: jobs.filter((job) => job.status !== "RETIRED").length,
      archived: jobs.filter((job) => job.status === "RETIRED").length,
      all: jobs.length
    }),
    [jobs]
  );
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? visibleJobs[0] ?? jobs[0],
    [jobs, selectedJobId, visibleJobs]
  );
  const [draftJob, setDraftJob] = useState<SerializedJobPost | null>(selectedJob ?? null);
  const activeJob = draftJob ?? selectedJob;
  const warnings = activeJob ? getJobWarnings(activeJob) : [];

  useEffect(() => {
    if (!visibleJobs.length || visibleJobs.some((job) => job.id === selectedJobId)) {
      return;
    }

    setSelectedJobId(visibleJobs[0].id);
    setDraftJob(visibleJobs[0]);
    setSaveStatus({ state: "idle", message: "Ready to save" });
  }, [selectedJobId, visibleJobs]);

  function handleSelectJob(jobId: string) {
    const nextJob = jobs.find((job) => job.id === jobId);
    setSelectedJobId(jobId);
    setDraftJob(nextJob ?? null);
    setSaveStatus({ state: "idle", message: "Ready to save" });
  }

  function handleJobListViewChange(view: JobListView) {
    setJobListView(view);
  }

  function handleLiveChange(values: Partial<JobFormValues>) {
    if (!selectedJob) {
      return;
    }

    setDraftJob(mergeDraft(selectedJob, values));
  }

  async function handleSave(values: JobFormValues) {
    const response = await fetch(`/api/jobs/${selectedJob.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(values)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? "Unable to save job.");
    }

    const updatedJob = (await response.json()) as SerializedJobPost;
    setJobs((current) => current.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
    setDraftJob(updatedJob);
    setJobListView(updatedJob.status === "RETIRED" ? "archived" : "active");
    return updatedJob;
  }

  function handleJobUpdated(updatedJob: SerializedJobPost) {
    setJobs((current) => current.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
    setDraftJob((current) => (current?.id === updatedJob.id ? { ...current, blockInstances: updatedJob.blockInstances } : updatedJob));
  }

  async function updateJobStatus(nextStatus: SerializedJobPost["status"]) {
    if (!activeJob) {
      return;
    }

    const archiving = nextStatus === "RETIRED";
    setSaveStatus({ state: "saving", message: archiving ? "Archiving role..." : "Restoring role..." });

    try {
      const response = await fetch(`/api/jobs/${activeJob.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: nextStatus })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Unable to update job status.");
      }

      const updatedJob = (await response.json()) as SerializedJobPost;
      setJobs((current) => current.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
      setSelectedJobId(updatedJob.id);
      setDraftJob(updatedJob);
      setJobListView(archiving ? "archived" : "active");
      setSaveStatus({
        state: "saved",
        message: archiving ? "Role archived for reference." : "Role restored to active list."
      });
    } catch (statusError) {
      setSaveStatus({
        state: "error",
        message: statusError instanceof Error ? statusError.message : "Unable to update job status."
      });
    }
  }

  async function updateJobsStatus(jobIds: string[], nextStatus: SerializedJobPost["status"]) {
    if (!jobIds.length) {
      return;
    }

    const archiving = nextStatus === "RETIRED";
    setSaveStatus({
      state: "saving",
      message: archiving ? `Archiving ${jobIds.length} roles...` : `Restoring ${jobIds.length} roles...`
    });

    try {
      const response = await fetch("/api/jobs/bulk-status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ jobIds, status: nextStatus })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Unable to update selected jobs.");
      }

      const updatedJobs = (await response.json()) as SerializedJobPost[];
      const updatedById = new Map(updatedJobs.map((job) => [job.id, job]));
      setJobs((current) => current.map((job) => updatedById.get(job.id) ?? job));

      if (activeJob && updatedById.has(activeJob.id)) {
        setDraftJob(updatedById.get(activeJob.id) ?? null);
      }

      setJobListView("active");
      setSaveStatus({
        state: "saved",
        message: archiving
          ? `${updatedJobs.length} role${updatedJobs.length === 1 ? "" : "s"} archived for reference.`
          : `${updatedJobs.length} role${updatedJobs.length === 1 ? "" : "s"} restored to active list.`
      });
    } catch (statusError) {
      setSaveStatus({
        state: "error",
        message: statusError instanceof Error ? statusError.message : "Unable to update selected jobs."
      });
      throw statusError;
    }
  }

  if (!activeJob) {
    return (
      <div className="px-6 py-6">
        <div className="rounded bg-white p-8 shadow-panel ring-1 ring-brand-lea/10">
          No seeded jobs found. Run <code>npm.cmd run db:seed</code> to load starter data.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-brand-lea text-white shadow-lg shadow-brand-lea/15">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white/10">
              <Plane className="h-5 w-5 text-brand-gold" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-sweet">
                <FileText className="h-3.5 w-3.5" />
                Job Posting System
              </div>
              <h1 className="truncate text-xl font-semibold">SkyShare Job Post Builder</h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 xl:flex">
            {["Edit Job Data", "Template Locked", "Preview", "Export"].map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-lea">
                  {index + 1}
                </div>
                <span className="text-sm font-medium text-white/82">{step}</span>
                {index < 3 && <div className="h-px w-8 bg-white/18" />}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-lea">
              <Lock className="h-3.5 w-3.5" />
              Template Locked
            </span>
            <span
              className={`hidden rounded px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] lg:inline-flex ${
                activeJob.status === "RETIRED"
                  ? "bg-brand-grey/30 text-white"
                  : activeJob.status === "ACTIVE"
                    ? "bg-emerald-100 text-emerald-950"
                    : "bg-white/10 text-white/78"
              }`}
            >
              {statusLabel(activeJob.status)}
            </span>
            <span
              className={`hidden rounded px-3 py-2 text-xs font-bold lg:inline-flex ${
                saveStatus.state === "saving"
                  ? "bg-brand-gold/18 text-brand-gold"
                  : saveStatus.state === "error"
                    ? "bg-brand-red text-white"
                    : saveStatus.state === "saved"
                      ? "bg-emerald-100 text-emerald-950"
                      : "bg-white/10 text-white/78"
              }`}
            >
              {saveStatus.message}
            </span>
            {exportStatus.state !== "idle" && (
              <span
                className={`hidden rounded px-3 py-2 text-xs font-bold lg:inline-flex ${
                  exportStatus.state === "copying"
                    ? "bg-brand-gold/18 text-brand-gold"
                    : exportStatus.state === "error"
                      ? "bg-brand-red text-white"
                      : "bg-emerald-100 text-emerald-950"
                }`}
              >
                {exportStatus.message}
              </span>
            )}
            <button
              type="submit"
              form="job-data-form"
              disabled={saveStatus.state === "saving"}
              className="inline-flex items-center gap-2 rounded bg-white px-3.5 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer"
            >
              <Save className="h-4 w-4" />
              {saveStatus.state === "saving" ? "Saving Draft..." : "Save Draft"}
            </button>
            {activeJob.status === "RETIRED" ? (
              <button
                type="button"
                onClick={() => updateJobStatus("ACTIVE")}
                className="inline-flex items-center gap-2 rounded border border-white/20 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                title="Move this archived role back into the active list"
              >
                <RotateCcw className="h-4 w-4" />
                Restore Role
              </button>
            ) : (
              <button
                type="button"
                onClick={() => updateJobStatus("RETIRED")}
                className="inline-flex items-center gap-2 rounded border border-white/20 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                title="Archive this inactive role but keep it available for reference"
              >
                <Archive className="h-4 w-4" />
                Archive Role
              </button>
            )}
            <JobExportMenu
              job={activeJob}
              onStatusChange={(message, state) => {
                setPreviewMode("preview");
                setExportStatus({
                  state:
                    state === "working"
                      ? "copying"
                      : state === "done"
                        ? "copied"
                        : state === "error"
                          ? "error"
                          : "idle",
                  message
                });
              }}
            />
          </div>
        </div>
      </header>

      <div className="grid gap-5 px-5 py-5 lg:px-8 xl:grid-cols-[minmax(340px,0.95fr)_minmax(300px,0.72fr)_minmax(440px,1.2fr)]">
        <JobDataEditor
          jobs={visibleJobs}
          selectedJob={selectedJob}
          selectedJobId={selectedJobId}
          onSelectJob={handleSelectJob}
          onLiveChange={handleLiveChange}
          onSave={handleSave}
          onSaveStatusChange={setSaveStatus}
          jobListView={jobListView}
          jobCounts={jobCounts}
          onJobListViewChange={handleJobListViewChange}
          onBulkStatusUpdate={updateJobsStatus}
        />
        <TemplateTokensPanel />
        <div id="job-preview-panel">
          <JobPreview job={activeJob} warnings={warnings} view={previewMode} onViewChange={setPreviewMode} />
        </div>
      </div>

      <div className="px-5 pb-6 lg:px-8">
        <JobBlockAssembly job={activeJob} availableBlocks={initialBlocks} onJobUpdated={handleJobUpdated} />
      </div>
    </div>
  );
}
