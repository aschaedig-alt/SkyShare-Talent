"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, CheckCircle2, Eye, EyeOff, Loader2, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import type { SerializedJobPost } from "@/lib/types";
import { getFieldSourceStates, type FieldSourceState } from "@/lib/blocks/content-source";
import { formatDateForInput } from "@/lib/formatting/text";
import { type JobFormValues, jobFormSchema } from "@/lib/validation/job";

type JobDataEditorProps = {
  jobs: SerializedJobPost[];
  selectedJob: SerializedJobPost;
  selectedJobId: string;
  onSelectJob: (jobId: string) => void;
  onLiveChange: (values: Partial<JobFormValues>) => void;
  onSave: (values: JobFormValues) => Promise<SerializedJobPost>;
  onSaveStatusChange?: (status: JobSaveStatus) => void;
  jobListView: JobListView;
  jobCounts: Record<JobListView, number>;
  onJobListViewChange: (view: JobListView) => void;
  onBulkStatusUpdate: (jobIds: string[], status: SerializedJobPost["status"]) => Promise<void>;
};

export type JobSaveStatus = {
  state: "idle" | "saving" | "saved" | "error";
  message: string;
};

type JobListView = "active" | "archived" | "all";

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

function toFormValues(job: SerializedJobPost): JobFormValues {
  return {
    title: job.title ?? "",
    internalName: job.internalName ?? "",
    department: job.department ?? "",
    category: job.category ?? "",
    location: job.location ?? "",
    secondaryLocation: job.secondaryLocation ?? "",
    positionType: job.positionType ?? "",
    salaryRange: job.salaryRange ?? "",
    reportsTo: job.reportsTo ?? "",
    positionCode: job.positionCode ?? "",
    seatCode: job.seatCode ?? "",
    travelPercentage: job.travelPercentage ?? "",
    educationLevel: job.educationLevel ?? "",
    workSchedule: job.workSchedule ?? "",
    summary: job.summary ?? "",
    keyResponsibilities: job.keyResponsibilities ?? "",
    qualificationsText: job.qualificationsText ?? "",
    benefitsText: job.benefitsText ?? "",
    postedDate: formatDateForInput(job.postedDate),
    status: job.status,
    paycom: {
      workflow: job.paycom?.workflow ?? "",
      externalApplication: job.paycom?.externalApplication ?? "",
      externalKnockout: job.paycom?.externalKnockout ?? "",
      externalGlobal: job.paycom?.externalGlobal ?? "",
      externalJobLevel: job.paycom?.externalJobLevel ?? "",
      externalFollowUps: job.paycom?.externalFollowUps ?? "",
      internalApplication: job.paycom?.internalApplication ?? "",
      internalKnockout: job.paycom?.internalKnockout ?? "",
      internalGlobal: job.paycom?.internalGlobal ?? "",
      internalJobLevel: job.paycom?.internalJobLevel ?? ""
    }
  };
}

function EditableStatus() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-brand-sweet/45 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Editable
    </span>
  );
}

type FieldRowProps = {
  label: string;
  note?: string;
  source?: FieldSourceState;
  children: React.ReactNode;
};

function FieldSourceBadge({ source }: { source: FieldSourceState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
        source.isHiddenByBlock ? "bg-brand-grey/12 text-brand-grey dark:text-slate-400" : "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
      }`}
    >
      {source.isHiddenByBlock ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {source.sourceLabel}
    </span>
  );
}

function FieldRow({ label, note, source, children }: FieldRowProps) {
  return (
    <div className="border-b border-brand-lea/8 px-4 py-3 last:border-b-0 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-xs font-bold uppercase tracking-[0.12em] text-brand-eden dark:text-[#8fb3d6]">{label}</label>
        <div className="flex flex-wrap justify-end gap-1.5">
          {source && <FieldSourceBadge source={source} />}
          <EditableStatus />
        </div>
      </div>
      {source && <p className="mb-2 text-xs font-semibold leading-5 text-brand-grey dark:text-slate-400">{source.detail}</p>}
      {note && <p className="mb-2 text-xs font-semibold leading-5 text-brand-grey dark:text-slate-400">{note}</p>}
      <div>{children}</div>
    </div>
  );
}

const inputClass =
  "w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition placeholder:text-brand-grey/70 focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

export function JobDataEditor({
  jobs,
  selectedJob,
  selectedJobId,
  onSelectJob,
  onLiveChange,
  onSave,
  onSaveStatusChange,
  jobListView,
  jobCounts,
  onJobListViewChange,
  onBulkStatusUpdate
}: JobDataEditorProps) {
  const [query, setQuery] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedBulkJobIds, setSelectedBulkJobIds] = useState<string[]>([]);
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const previousJobId = useRef<string | null>(null);
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
  const selectorJobs = useMemo(() => {
    if (filteredJobs.some((job) => job.id === selectedJobId)) {
      return filteredJobs;
    }

    return [selectedJob, ...filteredJobs.filter((job) => job.id !== selectedJob.id)];
  }, [filteredJobs, selectedJob, selectedJobId]);
  const bulkEligibleJobs = useMemo(
    () =>
      filteredJobs.filter((job) =>
        jobListView === "archived" ? job.status === "RETIRED" : job.status !== "RETIRED"
      ),
    [filteredJobs, jobListView]
  );
  const allEligibleSelected =
    bulkEligibleJobs.length > 0 && bulkEligibleJobs.every((job) => selectedBulkJobIds.includes(job.id));
  const fieldSources = useMemo(() => {
    const states = getFieldSourceStates(selectedJob);
    return Object.fromEntries(states.map((source) => [source.key, source])) as Record<
      FieldSourceState["key"],
      FieldSourceState
    >;
  }, [selectedJob]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: toFormValues(selectedJob),
    mode: "onChange"
  });

  useEffect(() => {
    if (previousJobId.current === selectedJobId) {
      return;
    }

    previousJobId.current = selectedJobId;
    reset(toFormValues(selectedJob));
    setSaveMessage(null);
    setSaveError(null);
    onSaveStatusChange?.({ state: "idle", message: "Ready to save" });
  }, [selectedJob, selectedJobId, reset, onSaveStatusChange]);

  useEffect(() => {
    const subscription = watch((values) => {
      onLiveChange(values as Partial<JobFormValues>);
    });

    return () => subscription.unsubscribe();
  }, [watch, onLiveChange]);

  useEffect(() => {
    const eligibleIds = new Set(bulkEligibleJobs.map((job) => job.id));
    setSelectedBulkJobIds((current) => current.filter((jobId) => eligibleIds.has(jobId)));
  }, [bulkEligibleJobs]);

  function toggleBulkJob(jobId: string) {
    setBulkMessage(null);
    setSelectedBulkJobIds((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]
    );
  }

  function toggleAllBulkJobs() {
    setBulkMessage(null);
    setSelectedBulkJobIds(allEligibleSelected ? [] : bulkEligibleJobs.map((job) => job.id));
  }

  async function runBulkStatusUpdate() {
    if (!selectedBulkJobIds.length) {
      return;
    }

    const restoring = jobListView === "archived";
    setIsBulkWorking(true);
    setBulkMessage(null);

    try {
      await onBulkStatusUpdate(selectedBulkJobIds, restoring ? "ACTIVE" : "RETIRED");
      setBulkMessage(
        restoring
          ? `${selectedBulkJobIds.length} role${selectedBulkJobIds.length === 1 ? "" : "s"} restored.`
          : `${selectedBulkJobIds.length} role${selectedBulkJobIds.length === 1 ? "" : "s"} archived.`
      );
      setSelectedBulkJobIds([]);
    } catch (bulkError) {
      setBulkMessage(bulkError instanceof Error ? bulkError.message : "Unable to update selected jobs.");
    } finally {
      setIsBulkWorking(false);
    }
  }

  async function submit(values: JobFormValues) {
    setSaveError(null);
    setSaveMessage(null);
    onSaveStatusChange?.({ state: "saving", message: "Saving draft..." });

    try {
      const updatedJob = await onSave(values);
      reset(toFormValues(updatedJob));
      setSaveMessage("Draft saved locally.");
      onSaveStatusChange?.({ state: "saved", message: "Draft saved locally." });
    } catch (submitError) {
      const nextMessage = submitError instanceof Error ? submitError.message : "Unable to save draft.";
      setSaveError(nextMessage);
      onSaveStatusChange?.({ state: "error", message: nextMessage });
    }
  }

  return (
    <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden dark:text-[#8fb3d6]">
              1. Edit Job Data
            </p>
            <h2 className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">All fields are editable</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(isSubmitting || saveMessage || saveError) && (
              <span
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-bold ${
                  isSubmitting
                    ? "bg-brand-gold/20 text-brand-lea dark:text-slate-100"
                    : saveError
                      ? "bg-brand-red/10 text-brand-red dark:text-red-300"
                      : "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                }`}
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {isSubmitting ? "Saving..." : saveError ?? saveMessage}
              </span>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded bg-brand-sweet/40 text-brand-lea dark:text-slate-100">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-brand-lea/10 p-4 dark:border-white/10">
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            { key: "active", label: "Active" },
            { key: "archived", label: "Archived" },
            { key: "all", label: "All" }
          ].map((item) => {
            const active = jobListView === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onJobListViewChange(item.key as JobListView)}
                className={`rounded px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] transition hover:shadow-glow ${
                  active
                    ? "bg-brand-lea text-white shadow-sm"
                    : "border border-brand-lea/10 bg-white text-brand-lea hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-brand-panel dark:text-slate-100 dark:hover:bg-white/10"
                }`}
              >
                {item.label} ({jobCounts[item.key as JobListView]})
              </button>
            );
          })}
        </div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
          Searchable job selector
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
        <select
          value={selectedJobId}
          onChange={(event) => onSelectJob(event.target.value)}
          className="mt-3 w-full rounded border border-brand-lea/15 bg-white px-3 py-2.5 text-sm font-semibold text-brand-lea outline-none focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
        >
          {selectorJobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} {job.status === "RETIRED" ? "(Archived)" : ""}
            </option>
          ))}
        </select>
        {jobListView === "archived" && (
          <p className="mt-2 text-xs font-semibold leading-5 text-brand-grey dark:text-slate-400">
            Archived roles are hidden from the Active list but remain available here for reference or restoring.
          </p>
        )}
        <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-[#8fb3d6]">
                Bulk status actions
              </div>
              <p className="mt-1 text-xs font-semibold leading-5 text-brand-grey dark:text-slate-400">
                {jobListView === "archived"
                  ? "Restore archived roles back to the active list."
                  : "Archive inactive roles while keeping them available for reference."}
              </p>
            </div>
            <span className="rounded bg-white px-2 py-1 text-xs font-bold text-brand-lea dark:bg-brand-panel dark:text-slate-100">
              {selectedBulkJobIds.length} selected
            </span>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleAllBulkJobs}
              disabled={!bulkEligibleJobs.length || isBulkWorking}
              className="rounded border border-brand-lea/12 bg-white px-2.5 py-1.5 text-xs font-bold text-brand-lea hover:bg-brand-cloudDancer disabled:opacity-60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100 dark:hover:bg-white/10"
            >
              {allEligibleSelected ? "Clear visible" : "Select visible"}
            </button>
            <button
              type="button"
              onClick={runBulkStatusUpdate}
              disabled={!selectedBulkJobIds.length || isBulkWorking}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60 ${
                jobListView === "archived" ? "bg-brand-eden hover:bg-brand-lea" : "bg-brand-lea hover:bg-brand-eden"
              }`}
            >
              {isBulkWorking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : jobListView === "archived" ? (
                <RotateCcw className="h-3.5 w-3.5" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              {isBulkWorking
                ? "Working..."
                : jobListView === "archived"
                  ? "Restore selected"
                  : "Archive selected"}
            </button>
          </div>

          <div className="max-h-52 space-y-1.5 overflow-auto pr-1">
            {bulkEligibleJobs.map((job) => (
              <label
                key={`${jobListView}-bulk-${job.id}`}
                className="flex cursor-pointer items-start gap-2 rounded border border-brand-lea/8 bg-white px-2.5 py-2 text-sm hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-brand-panel dark:hover:bg-white/10"
              >
                <input
                  type="checkbox"
                  checked={selectedBulkJobIds.includes(job.id)}
                  onChange={() => toggleBulkJob(job.id)}
                  disabled={isBulkWorking}
                  className="mt-1 h-4 w-4 accent-brand-lea"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-brand-lea dark:text-slate-100">{job.title}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-brand-grey dark:text-slate-400">
                    {statusLabel(job.status)}{job.department ? ` - ${job.department}` : ""}
                  </span>
                </span>
              </label>
            ))}
            {!bulkEligibleJobs.length && (
              <div className="rounded border border-dashed border-brand-lea/15 bg-white px-3 py-4 text-center text-xs font-semibold leading-5 text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">
                No matching jobs available for this bulk action.
              </div>
            )}
          </div>

          {bulkMessage && (
            <div className="mt-3 rounded bg-white px-3 py-2 text-xs font-bold text-brand-lea dark:bg-brand-panel dark:text-slate-100">{bulkMessage}</div>
          )}
        </div>
      </div>

      <form id="job-data-form" onSubmit={handleSubmit(submit)}>
        <div className="grid grid-cols-[118px_minmax(0,1fr)_88px] border-b border-brand-lea/10 bg-brand-cloudDancer/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:border-white/10 dark:bg-white/5 dark:text-[#8fb3d6]">
          <div>Field</div>
          <div>Your Input</div>
          <div className="text-right">Status</div>
        </div>

        <FieldRow label="Job Title">
          <input {...register("title")} className={inputClass} />
          {errors.title && <p className="mt-1 text-xs font-semibold text-brand-red dark:text-red-300">{errors.title.message}</p>}
        </FieldRow>
        <FieldRow label="Department">
          <input {...register("department")} className={inputClass} />
        </FieldRow>
        <FieldRow label="Location" source={fieldSources.location}>
          <input {...register("location")} className={inputClass} />
          {errors.location && (
            <p className="mt-1 text-xs font-semibold text-brand-red dark:text-red-300">{errors.location.message}</p>
          )}
        </FieldRow>
        <FieldRow label="Reports To">
          <input {...register("reportsTo")} className={inputClass} />
        </FieldRow>
        <FieldRow label="Summary" source={fieldSources.summary}>
          <Controller
            control={control}
            name="summary"
            render={({ field }) => (
              <RichTextEditor
                value={field.value ?? ""}
                onChange={field.onChange}
                placeholder="Write a role summary. Use Enter twice for a paragraph break."
              />
            )}
          />
        </FieldRow>
        <FieldRow label="Responsibilities" source={fieldSources.responsibilities}>
          <Controller
            control={control}
            name="keyResponsibilities"
            render={({ field }) => (
              <RichTextEditor
                value={field.value ?? ""}
                onChange={field.onChange}
                placeholder="One responsibility per line"
              />
            )}
          />
        </FieldRow>
        <FieldRow label="Qualifications" source={fieldSources.qualifications}>
          <Controller
            control={control}
            name="qualificationsText"
            render={({ field }) => (
              <RichTextEditor
                value={field.value ?? ""}
                onChange={field.onChange}
                placeholder="One qualification per line"
              />
            )}
          />
        </FieldRow>
        <FieldRow label="Benefits" source={fieldSources.benefits}>
          <Controller
            control={control}
            name="benefitsText"
            render={({ field }) => (
              <RichTextEditor value={field.value ?? ""} onChange={field.onChange} placeholder="One benefit per line" />
            )}
          />
        </FieldRow>
        <FieldRow label="Pay Range">
          <input {...register("salaryRange")} className={inputClass} />
        </FieldRow>
        <FieldRow label="Job Type">
          <input {...register("positionType")} className={inputClass} />
          {errors.positionType && (
            <p className="mt-1 text-xs font-semibold text-brand-red dark:text-red-300">{errors.positionType.message}</p>
          )}
        </FieldRow>
        <FieldRow label="Posting Status">
          <select {...register("status")} className={inputClass}>
            {(["ACTIVE", "DRAFT", "NEEDS_REVIEW", "RETIRED"] as const).map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs font-semibold leading-5 text-brand-grey dark:text-slate-400">
            Archived posts stay in the system but are hidden from the default Active list.
          </p>
        </FieldRow>
        <FieldRow label="Posted Date">
          <input {...register("postedDate")} type="date" className={inputClass} />
        </FieldRow>
        <FieldRow label="Paycom">
          <div className="grid gap-2">
            <input {...register("paycom.workflow")} className={inputClass} placeholder="Workflow" />
            <input
              {...register("paycom.externalApplication")}
              className={inputClass}
              placeholder="External application template"
            />
            <input
              {...register("paycom.externalKnockout")}
              className={inputClass}
              placeholder="External knockout template"
            />
            <input
              {...register("paycom.externalGlobal")}
              className={inputClass}
              placeholder="External global template"
            />
            <input
              {...register("paycom.externalJobLevel")}
              className={inputClass}
              placeholder="External job level template"
            />
            <input
              {...register("paycom.externalFollowUps")}
              className={inputClass}
              placeholder="External follow-up templates"
            />
          </div>
        </FieldRow>
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <p className="text-xs font-medium text-brand-grey dark:text-slate-400">
            Text stays structured. Partial bold and color use approved SkyShare formatting only.
          </p>
          <div
            className={`text-sm font-semibold ${
              saveError ? "text-brand-red dark:text-red-300" : isSubmitting ? "text-brand-lea dark:text-slate-100" : "text-brand-eden dark:text-[#8fb3d6]"
            }`}
          >
            {isSubmitting ? "Saving..." : saveError ?? saveMessage}
          </div>
        </div>
      </form>
    </section>
  );
}
