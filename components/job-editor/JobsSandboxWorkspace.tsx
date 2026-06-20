"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  Boxes,
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Lock,
  Plane,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { ContentSourceMap } from "@/components/job-editor/ContentSourceMap";
import { JobBlockAssembly } from "@/components/job-editor/JobBlockAssembly";
import { FormattedJobPost } from "@/components/job-preview/FormattedJobPost";
import { JobExportMenu } from "@/components/job-preview/JobExportMenu";
import { ReadinessCard } from "@/components/job-preview/ReadinessCard";
import { getBlockSourceLabel, getFieldSourceStates, getReusablePublishingBlocks } from "@/lib/blocks/content-source";
import { getInstanceTitle, isInstanceOutdated } from "@/lib/blocks/sections";
import type { SerializedContentBlock, SerializedJobPost, SerializedPaycomConfig } from "@/lib/types";
import { getJobWarnings } from "@/lib/validation/warnings";

type JobsSandboxWorkspaceProps = {
  initialJobs: SerializedJobPost[];
  initialBlocks: SerializedContentBlock[];
  mode?: "live" | "sandbox";
};

type JobListView = "active" | "archived" | "all";
type DrawerKey = "summary" | "responsibilities" | "qualifications" | "benefits";
type FieldGroupKey = "public" | "internal" | "offer" | "paycom" | "aviation";
type SupplementalFieldKey =
  | "hiringManager"
  | "recruiterOwner"
  | "costCenter"
  | "jobBoardLink"
  | "sourceReference"
  | "flsaStatus"
  | "payType"
  | "payFrequency"
  | "targetStartDate"
  | "offerExpirationDate"
  | "signOnBonus"
  | "relocationAssistance"
  | "trainingAgreement"
  | "benefitsEligibilityDate"
  | "ptoPolicy"
  | "employmentClass"
  | "workAuthorizationRequired"
  | "backgroundCheckRequired"
  | "drugScreenRequired"
  | "offerLetterManager"
  | "legalEmployer"
  | "aircraftType"
  | "seatRole"
  | "requiredRatings"
  | "requiredFlightHours"
  | "baseAirport"
  | "homeBasedAllowed"
  | "commuteRequirement"
  | "rotationPattern"
  | "operatingRules"
  | "medicalCertificate"
  | "passportRequired"
  | "atpRequired";
type ExtraJobField = {
  id: string;
  label: string;
  value: string;
  purpose: "offer" | "internal";
};

const drawerLabels: Record<DrawerKey, string> = {
  summary: "Summary",
  responsibilities: "Responsibilities",
  qualifications: "Qualifications",
  benefits: "Benefits"
};

const inputClass =
  "w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition placeholder:text-brand-grey/70 focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100";
const templateInputClass =
  "w-full rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-xs text-brand-black outline-none transition placeholder:text-[11px] placeholder:text-brand-grey/65 focus:border-brand-eden focus:ring-2 focus:ring-brand-sweet/35 disabled:bg-brand-cloudDancer/50 disabled:text-brand-grey dark:border-white/10 dark:bg-[#10243a] dark:text-slate-400";

type SandboxTemplateField = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  purpose: string;
  helper?: string;
  placeholder?: string;
  type?: string;
  options?: Array<{ label: string; value: string }>;
};

function FieldPurposePill({ label, isEnabled }: { label: string; isEnabled: boolean }) {
  const toneClass =
    label === "public post" && isEnabled
      ? "bg-emerald-50 text-emerald-800"
      : isEnabled
        ? "bg-brand-cloudDancer text-brand-eden dark:bg-white/5"
        : "bg-brand-cloudDancer/70 text-brand-grey dark:bg-white/5 dark:text-slate-400";

  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${toneClass}`}>
      {label}
    </span>
  );
}

function TemplateFieldControl({ field, isEnabled }: { field: SandboxTemplateField; isEnabled: boolean }) {
  if (field.options) {
    return (
      <select
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
        className={templateInputClass}
        disabled={!isEnabled}
      >
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={field.type ?? "text"}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      className={templateInputClass}
      placeholder={field.placeholder}
      disabled={!isEnabled}
    />
  );
}

function SortableTemplateField({
  field,
  isEnabled,
  onToggle
}: {
  field: SandboxTemplateField;
  isEnabled: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded border p-2 transition ${
        isDragging
          ? "border-brand-gold bg-white shadow-lg dark:bg-[#10243a]"
          : isEnabled
            ? "border-brand-lea/10 bg-white dark:border-white/10 dark:bg-[#10243a]"
            : "border-brand-lea/8 bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-5 inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded border border-brand-lea/10 bg-white text-brand-grey hover:border-brand-eden hover:text-brand-eden active:cursor-grabbing dark:border-white/10 dark:bg-[#10243a] dark:text-slate-400"
          aria-label={`Drag ${field.label}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <label className="mt-5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-brand-lea/10 bg-white dark:border-white/10 dark:bg-[#10243a]">
          <input type="checkbox" checked={isEnabled} onChange={onToggle} className="h-3.5 w-3.5 accent-brand-lea" />
          <span className="sr-only">Include {field.label}</span>
        </label>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${isEnabled ? "text-brand-eden" : "text-brand-grey dark:text-slate-400"}`}>
              {field.label}
            </span>
            <FieldPurposePill label={isEnabled ? field.purpose : "disabled"} isEnabled={isEnabled} />
          </div>
          <TemplateFieldControl field={field} isEnabled={isEnabled} />
          {field.helper && (
            <p className={`mt-1 text-[10px] font-semibold leading-4 ${isEnabled ? "text-brand-grey dark:text-slate-400" : "text-brand-grey/75"}`}>
              {field.helper}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function statusLabel(status: SerializedJobPost["status"]) {
  return status === "RETIRED" ? "Archived" : formatEnum(status);
}

function jobIsVisibleForView(job: SerializedJobPost, view: JobListView) {
  if (view === "archived") {
    return job.status === "RETIRED";
  }

  if (view === "active") {
    return job.status !== "RETIRED";
  }

  return true;
}

function SourcePill({ label, tone = "field" }: { label: string; tone?: "field" | "block" | "neutral" | "warning" }) {
  const toneClass = {
    field: "bg-emerald-50 text-emerald-800",
    block: "bg-brand-sweet/40 text-brand-lea dark:text-slate-100",
    neutral: "bg-brand-cloudDancer text-brand-eden dark:bg-white/5",
    warning: "bg-brand-gold/25 text-brand-lea dark:text-slate-100"
  }[tone];

  return (
    <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${toneClass}`}>
      {label}
    </span>
  );
}

function DrawerShell({
  title,
  subtitle,
  badge,
  isOpen,
  onToggle,
  children
}: {
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded border border-brand-lea/10 bg-white dark:border-white/10 dark:bg-[#10243a]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-brand-cloudDancer/55 dark:bg-white/5"
      >
        {isOpen ? <ChevronDown className="h-4 w-4 text-brand-eden" /> : <ChevronRight className="h-4 w-4 text-brand-eden" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-brand-lea dark:text-slate-100">{title}</div>
          <div className="mt-0.5 text-xs font-semibold leading-5 text-brand-grey dark:text-slate-400">{subtitle}</div>
        </div>
        {badge}
      </button>
      {isOpen && <div className="border-t border-brand-lea/8 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">{children}</div>}
    </div>
  );
}

function buildJobPayload(job: SerializedJobPost) {
  return {
    title: job.title,
    internalName: job.internalName,
    department: job.department,
    category: job.category,
    location: job.location,
    secondaryLocation: job.secondaryLocation,
    positionType: job.positionType,
    salaryRange: job.salaryRange,
    reportsTo: job.reportsTo,
    positionCode: job.positionCode,
    seatCode: job.seatCode,
    travelPercentage: job.travelPercentage,
    educationLevel: job.educationLevel,
    workSchedule: job.workSchedule,
    summary: job.summary,
    keyResponsibilities: job.keyResponsibilities,
    qualificationsText: job.qualificationsText,
    benefitsText: job.benefitsText,
    postedDate: job.postedDate ? job.postedDate.slice(0, 10) : null,
    status: job.status,
    paycom: job.paycom
      ? {
          workflow: job.paycom.workflow,
          externalApplication: job.paycom.externalApplication,
          externalKnockout: job.paycom.externalKnockout,
          externalGlobal: job.paycom.externalGlobal,
          externalJobLevel: job.paycom.externalJobLevel,
          externalFollowUps: job.paycom.externalFollowUps,
          internalApplication: job.paycom.internalApplication,
          internalKnockout: job.paycom.internalKnockout,
          internalGlobal: job.paycom.internalGlobal,
          internalJobLevel: job.paycom.internalJobLevel
        }
      : null
  };
}

export function JobsSandboxWorkspace({ initialJobs, initialBlocks, mode = "sandbox" }: JobsSandboxWorkspaceProps) {
  const isLive = mode === "live";
  const defaultJob =
    initialJobs.find((job) => job.title.includes("Gulfstream G450") && job.status !== "RETIRED") ??
    initialJobs.find((job) => job.status !== "RETIRED") ??
    initialJobs[0];
  const [jobs, setJobs] = useState(initialJobs);
  const [selectedJobId, setSelectedJobId] = useState(defaultJob?.id ?? "");
  const [jobListView, setJobListView] = useState<JobListView>("active");
  const [query, setQuery] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedBulkJobIds, setSelectedBulkJobIds] = useState<string[]>([]);
  const [openDrawers, setOpenDrawers] = useState<Record<DrawerKey, boolean>>({
    summary: true,
    responsibilities: false,
    qualifications: false,
    benefits: false
  });
  const [openFieldGroups, setOpenFieldGroups] = useState<Record<FieldGroupKey, boolean>>({
    public: false,
    internal: false,
    offer: false,
    paycom: false,
    aviation: false
  });
  const [fieldOrderByGroup, setFieldOrderByGroup] = useState<Partial<Record<FieldGroupKey, string[]>>>({});
  const [disabledFieldIdsByGroup, setDisabledFieldIdsByGroup] = useState<Partial<Record<FieldGroupKey, string[]>>>({});
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [archiveReferenceOpen, setArchiveReferenceOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState(isLive ? "Ready to save" : "Sandbox preview only");
  const [isSaving, setIsSaving] = useState(false);
  const [plannerLoaded, setPlannerLoaded] = useState(false);
  const [supplementalFieldsByJobId, setSupplementalFieldsByJobId] = useState<Record<string, Partial<Record<SupplementalFieldKey, string>>>>({});
  const [extraFieldsByJobId, setExtraFieldsByJobId] = useState<Record<string, ExtraJobField[]>>({});
  const plannerStorageKey = `skyshare-job-field-planner-${mode}-v1`;

  const counts = useMemo(
    () => ({
      active: jobs.filter((job) => job.status !== "RETIRED").length,
      archived: jobs.filter((job) => job.status === "RETIRED").length,
      all: jobs.length
    }),
    [jobs]
  );
  const visibleJobs = useMemo(() => jobs.filter((job) => jobIsVisibleForView(job, jobListView)), [jobs, jobListView]);
  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return visibleJobs;
    }

    return visibleJobs.filter((job) =>
      [job.title, job.department, job.location, job.category].filter(Boolean).join(" ").toLowerCase().includes(normalized)
    );
  }, [query, visibleJobs]);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? jobs[0];
  const warnings = selectedJob ? getJobWarnings(selectedJob) : [];
  const fieldSources = selectedJob ? getFieldSourceStates(selectedJob) : [];
  const fieldSourceByKey = Object.fromEntries(fieldSources.map((source) => [source.key, source]));
  const publishingBlocks = selectedJob ? getReusablePublishingBlocks(selectedJob) : [];
  const availableBlocks = initialBlocks.filter((block) => !block.archivedAt && !publishingBlocks.some((instance) => instance.contentBlockId === block.id));
  const bulkEligibleJobs = filteredJobs.filter((job) => (jobListView === "archived" ? job.status === "RETIRED" : job.status !== "RETIRED"));
  const allEligibleSelected =
    bulkEligibleJobs.length > 0 && bulkEligibleJobs.every((job) => selectedBulkJobIds.includes(job.id));
  const extraFields = selectedJob ? (extraFieldsByJobId[selectedJob.id] ?? []) : [];
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    })
  );

  useEffect(() => {
    try {
      const savedPlanner = window.localStorage.getItem(plannerStorageKey);
      if (savedPlanner) {
        const parsed = JSON.parse(savedPlanner) as {
          fieldOrderByGroup?: Partial<Record<FieldGroupKey, string[]>>;
          disabledFieldIdsByGroup?: Partial<Record<FieldGroupKey, string[]>>;
          supplementalFieldsByJobId?: Record<string, Partial<Record<SupplementalFieldKey, string>>>;
          extraFieldsByJobId?: Record<string, ExtraJobField[]>;
        };

        setFieldOrderByGroup(parsed.fieldOrderByGroup ?? {});
        setDisabledFieldIdsByGroup(parsed.disabledFieldIdsByGroup ?? {});
        setSupplementalFieldsByJobId(parsed.supplementalFieldsByJobId ?? {});
        setExtraFieldsByJobId(parsed.extraFieldsByJobId ?? {});
      }
    } catch {
      window.localStorage.removeItem(plannerStorageKey);
    } finally {
      setPlannerLoaded(true);
    }
  }, [plannerStorageKey]);

  useEffect(() => {
    if (!plannerLoaded) {
      return;
    }

    window.localStorage.setItem(
      plannerStorageKey,
      JSON.stringify({
        fieldOrderByGroup,
        disabledFieldIdsByGroup,
        supplementalFieldsByJobId,
        extraFieldsByJobId
      })
    );
  }, [
    disabledFieldIdsByGroup,
    extraFieldsByJobId,
    fieldOrderByGroup,
    plannerLoaded,
    plannerStorageKey,
    supplementalFieldsByJobId
  ]);

  function updateSelectedJob(values: Partial<SerializedJobPost>) {
    setJobs((current) => current.map((job) => (job.id === selectedJob.id ? { ...job, ...values } : job)));
  }

  async function saveSelectedJob(message = "Saving draft...") {
    if (!isLive) {
      setCopyMessage("Sandbox: changes are temporary");
      return;
    }

    setIsSaving(true);
    setCopyMessage(message);

    try {
      const response = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildJobPayload(selectedJob))
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Unable to save job.");
      }

      const updatedJob = (await response.json()) as SerializedJobPost;
      setJobs((current) => current.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
      setSelectedJobId(updatedJob.id);
      setJobListView(updatedJob.status === "RETIRED" ? "archived" : "active");
      setCopyMessage("Draft saved to database");
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "Unable to save job.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateCurrentJobStatus(nextStatus: SerializedJobPost["status"]) {
    const nextJob = { ...selectedJob, status: nextStatus };
    const archiving = nextStatus === "RETIRED";

    if (!isLive) {
      updateSelectedJob({ status: nextStatus });
      setJobListView(archiving ? "archived" : "active");
      setCopyMessage(archiving ? "Sandbox: role archived locally" : "Sandbox: role restored locally");
      return;
    }

    setIsSaving(true);
    setCopyMessage(archiving ? "Archiving role..." : "Restoring role...");

    try {
      const response = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildJobPayload(nextJob))
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Unable to update job status.");
      }

      const updatedJob = (await response.json()) as SerializedJobPost;
      setJobs((current) => current.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
      setSelectedJobId(updatedJob.id);
      setJobListView(archiving ? "archived" : "active");
      setCopyMessage(archiving ? "Role archived for reference" : "Role restored to active list");
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "Unable to update job status.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleJobUpdated(updatedJob: SerializedJobPost) {
    setJobs((current) => current.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
    setSelectedJobId(updatedJob.id);
    setCopyMessage("Block changes saved");
  }

  function getSupplementalField(key: SupplementalFieldKey, fallback = "") {
    return supplementalFieldsByJobId[selectedJob.id]?.[key] ?? fallback;
  }

  function updateSupplementalField(key: SupplementalFieldKey, value: string) {
    setSupplementalFieldsByJobId((current) => ({
      ...current,
      [selectedJob.id]: {
        ...(current[selectedJob.id] ?? {}),
        [key]: value
      }
    }));
  }

  function getPaycomField(key: keyof Omit<SerializedPaycomConfig, "id">) {
    return selectedJob.paycom?.[key] ?? "";
  }

  function updatePaycomField(key: keyof Omit<SerializedPaycomConfig, "id">, value: string) {
    const currentPaycom = selectedJob.paycom;

    updateSelectedJob({
      paycom: {
        id: currentPaycom?.id ?? `sandbox-paycom-${selectedJob.id}`,
        workflow: currentPaycom?.workflow ?? null,
        externalApplication: currentPaycom?.externalApplication ?? null,
        externalKnockout: currentPaycom?.externalKnockout ?? null,
        externalGlobal: currentPaycom?.externalGlobal ?? null,
        externalJobLevel: currentPaycom?.externalJobLevel ?? null,
        externalFollowUps: currentPaycom?.externalFollowUps ?? null,
        internalApplication: currentPaycom?.internalApplication ?? null,
        internalKnockout: currentPaycom?.internalKnockout ?? null,
        internalGlobal: currentPaycom?.internalGlobal ?? null,
        internalJobLevel: currentPaycom?.internalJobLevel ?? null,
        [key]: value
      }
    });
  }

  function toggleFieldGroup(key: FieldGroupKey) {
    setOpenFieldGroups((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleFieldEnabled(groupKey: FieldGroupKey, fieldId: string) {
    setDisabledFieldIdsByGroup((current) => {
      const disabledIds = current[groupKey] ?? [];
      const nextDisabledIds = disabledIds.includes(fieldId)
        ? disabledIds.filter((id) => id !== fieldId)
        : [...disabledIds, fieldId];

      return {
        ...current,
        [groupKey]: nextDisabledIds
      };
    });
  }

  function getOrderedFields(groupKey: FieldGroupKey, fields: SandboxTemplateField[]) {
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const storedOrder = fieldOrderByGroup[groupKey] ?? [];
    const orderedFromStored = storedOrder
      .map((fieldId) => fieldById.get(fieldId))
      .filter((field): field is SandboxTemplateField => Boolean(field));
    const missingFromStored = fields.filter((field) => !storedOrder.includes(field.id));

    return [...orderedFromStored, ...missingFromStored];
  }

  function handleFieldDragEnd(groupKey: FieldGroupKey, fields: SandboxTemplateField[], event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const orderedFields = getOrderedFields(groupKey, fields);
    const oldIndex = orderedFields.findIndex((field) => field.id === active.id);
    const newIndex = orderedFields.findIndex((field) => field.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    setFieldOrderByGroup((current) => ({
      ...current,
      [groupKey]: arrayMove(orderedFields, oldIndex, newIndex).map((field) => field.id)
    }));
    setCopyMessage(isLive ? "Template field order updated on this screen" : "Sandbox: field order updated locally");
  }

  function addExtraField() {
    const field: ExtraJobField = {
      id: `extra-${Date.now()}`,
      label: "New field",
      value: "",
      purpose: "offer"
    };

    setExtraFieldsByJobId((current) => ({
      ...current,
      [selectedJob.id]: [...(current[selectedJob.id] ?? []), field]
    }));
    setCopyMessage(isLive ? "Custom planning field added on this screen" : "Sandbox: custom field added locally");
  }

  function updateExtraField(fieldId: string, values: Partial<ExtraJobField>) {
    setExtraFieldsByJobId((current) => ({
      ...current,
      [selectedJob.id]: (current[selectedJob.id] ?? []).map((field) =>
        field.id === fieldId ? { ...field, ...values } : field
      )
    }));
  }

  function removeExtraField(fieldId: string) {
    setExtraFieldsByJobId((current) => ({
      ...current,
      [selectedJob.id]: (current[selectedJob.id] ?? []).filter((field) => field.id !== fieldId)
    }));
    setCopyMessage(isLive ? "Custom planning field removed on this screen" : "Sandbox: custom field removed locally");
  }

  function toggleDrawer(key: DrawerKey) {
    setOpenDrawers((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleBulkJob(jobId: string) {
    setSelectedBulkJobIds((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]
    );
  }

  function toggleAllBulkJobs() {
    setSelectedBulkJobIds(allEligibleSelected ? [] : bulkEligibleJobs.map((job) => job.id));
  }

  async function runBulkArchivePreview() {
    const nextStatus = jobListView === "archived" ? "ACTIVE" : "RETIRED";
    const archiving = nextStatus === "RETIRED";

    if (isLive) {
      setIsSaving(true);
      setCopyMessage(archiving ? `Archiving ${selectedBulkJobIds.length} roles...` : `Restoring ${selectedBulkJobIds.length} roles...`);

      try {
        const response = await fetch("/api/jobs/bulk-status", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ jobIds: selectedBulkJobIds, status: nextStatus })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.message ?? "Unable to update selected jobs.");
        }

        const updatedJobs = (await response.json()) as SerializedJobPost[];
        const updatedById = new Map(updatedJobs.map((job) => [job.id, job]));
        setJobs((current) => current.map((job) => updatedById.get(job.id) ?? job));
        setSelectedBulkJobIds([]);
        setJobListView("active");
        setCopyMessage(
          archiving
            ? `${updatedJobs.length} role${updatedJobs.length === 1 ? "" : "s"} archived for reference`
            : `${updatedJobs.length} role${updatedJobs.length === 1 ? "" : "s"} restored to active list`
        );
      } catch (error) {
        setCopyMessage(error instanceof Error ? error.message : "Unable to update selected jobs.");
      } finally {
        setIsSaving(false);
      }

      return;
    }

    setJobs((current) =>
      current.map((job) => (selectedBulkJobIds.includes(job.id) ? { ...job, status: nextStatus } : job))
    );
    setSelectedBulkJobIds([]);
    setJobListView("active");
    setCopyMessage(nextStatus === "RETIRED" ? "Sandbox: selected roles archived locally" : "Sandbox: selected roles restored locally");
  }

  if (!selectedJob) {
    return (
      <div className="p-8">
        <div className="rounded bg-white p-8 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">No jobs available.</div>
      </div>
    );
  }

  const publicPostingFields: SandboxTemplateField[] = [
    {
      id: "title",
      label: "Job title",
      value: selectedJob.title,
      onChange: (value) => updateSelectedJob({ title: value }),
      purpose: "public post",
      helper: "Main title shown on job boards and the formatted preview."
    },
    {
      id: "department",
      label: "Department",
      value: selectedJob.department ?? "",
      onChange: (value) => updateSelectedJob({ department: value }),
      purpose: "public post"
    },
    {
      id: "category",
      label: "Category",
      value: selectedJob.category ?? "",
      onChange: (value) => updateSelectedJob({ category: value }),
      purpose: "public post"
    },
    {
      id: "location",
      label: "Location",
      value: selectedJob.location ?? "",
      onChange: (value) => updateSelectedJob({ location: value }),
      purpose: "public post"
    },
    {
      id: "secondaryLocation",
      label: "Secondary location",
      value: selectedJob.secondaryLocation ?? "",
      onChange: (value) => updateSelectedJob({ secondaryLocation: value }),
      purpose: "public post"
    },
    {
      id: "positionType",
      label: "Job type",
      value: selectedJob.positionType ?? "",
      onChange: (value) => updateSelectedJob({ positionType: value }),
      purpose: "public post",
      placeholder: "Full Time"
    },
    {
      id: "salaryRange",
      label: "Pay range",
      value: selectedJob.salaryRange ?? "",
      onChange: (value) => updateSelectedJob({ salaryRange: value }),
      purpose: "public post"
    },
    {
      id: "workSchedule",
      label: "Work schedule",
      value: selectedJob.workSchedule ?? "",
      onChange: (value) => updateSelectedJob({ workSchedule: value }),
      purpose: "public post"
    },
    {
      id: "postedDate",
      label: "Posted date",
      value: selectedJob.postedDate ? selectedJob.postedDate.slice(0, 10) : "",
      onChange: (value) => updateSelectedJob({ postedDate: value || null }),
      purpose: "public post",
      type: "date"
    },
    {
      id: "travelPercentage",
      label: "Travel percentage",
      value: selectedJob.travelPercentage ?? "",
      onChange: (value) => updateSelectedJob({ travelPercentage: value }),
      purpose: "public post"
    },
    {
      id: "educationLevel",
      label: "Education level",
      value: selectedJob.educationLevel ?? "",
      onChange: (value) => updateSelectedJob({ educationLevel: value }),
      purpose: "public post"
    }
  ];

  const internalRoleFields: SandboxTemplateField[] = [
    {
      id: "internalName",
      label: "Internal job name",
      value: selectedJob.internalName ?? "",
      onChange: (value) => updateSelectedJob({ internalName: value }),
      purpose: "internal",
      placeholder: "G450/GV Captain - Home Based"
    },
    {
      id: "status",
      label: "Posting status",
      value: selectedJob.status,
      onChange: (value) => updateSelectedJob({ status: value as SerializedJobPost["status"] }),
      purpose: "internal",
      options: (["ACTIVE", "DRAFT", "NEEDS_REVIEW", "RETIRED"] as const).map((status) => ({
        value: status,
        label: statusLabel(status)
      }))
    },
    {
      id: "reportsTo",
      label: "Reports to",
      value: selectedJob.reportsTo ?? "",
      onChange: (value) => updateSelectedJob({ reportsTo: value }),
      purpose: "internal"
    },
    {
      id: "positionCode",
      label: "Position code",
      value: selectedJob.positionCode ?? "",
      onChange: (value) => updateSelectedJob({ positionCode: value }),
      purpose: "internal"
    },
    {
      id: "seatCode",
      label: "Seat code",
      value: selectedJob.seatCode ?? "",
      onChange: (value) => updateSelectedJob({ seatCode: value }),
      purpose: "internal"
    },
    {
      id: "hiringManager",
      label: "Hiring team",
      value: getSupplementalField("hiringManager", selectedJob.reportsTo ?? "Chief Pilot"),
      onChange: (value) => updateSupplementalField("hiringManager", value),
      purpose: "internal"
    },
    {
      id: "recruiterOwner",
      label: "Recruiter / owner",
      value: getSupplementalField("recruiterOwner", "Recruiting Team"),
      onChange: (value) => updateSupplementalField("recruiterOwner", value),
      purpose: "internal"
    },
    {
      id: "costCenter",
      label: "Cost center",
      value: getSupplementalField("costCenter", selectedJob.department ?? ""),
      onChange: (value) => updateSupplementalField("costCenter", value),
      purpose: "internal"
    },
    {
      id: "jobBoardLink",
      label: "Job board link",
      value: getSupplementalField("jobBoardLink"),
      onChange: (value) => updateSupplementalField("jobBoardLink", value),
      purpose: "internal",
      placeholder: "https://..."
    },
    {
      id: "sourceReference",
      label: "Source PDF / original posting",
      value: getSupplementalField("sourceReference", "Website-Job-Postings-All-2026.05.26.pdf"),
      onChange: (value) => updateSupplementalField("sourceReference", value),
      purpose: "internal"
    }
  ];

  const offerLetterFields: SandboxTemplateField[] = [
    {
      id: "flsaStatus",
      label: "FLSA status",
      value: getSupplementalField("flsaStatus", "Exempt"),
      onChange: (value) => updateSupplementalField("flsaStatus", value),
      purpose: "offer letter"
    },
    {
      id: "payType",
      label: "Pay type",
      value: getSupplementalField("payType", selectedJob.salaryRange?.toLowerCase().includes("hour") ? "Hourly" : "Salary"),
      onChange: (value) => updateSupplementalField("payType", value),
      purpose: "offer letter"
    },
    {
      id: "payFrequency",
      label: "Pay frequency",
      value: getSupplementalField("payFrequency", "Biweekly"),
      onChange: (value) => updateSupplementalField("payFrequency", value),
      purpose: "offer letter"
    },
    {
      id: "targetStartDate",
      label: "Target start date",
      value: getSupplementalField("targetStartDate"),
      onChange: (value) => updateSupplementalField("targetStartDate", value),
      purpose: "offer letter",
      type: "date"
    },
    {
      id: "offerExpirationDate",
      label: "Offer expiration date",
      value: getSupplementalField("offerExpirationDate"),
      onChange: (value) => updateSupplementalField("offerExpirationDate", value),
      purpose: "offer letter",
      type: "date"
    },
    {
      id: "signOnBonus",
      label: "Sign-on bonus",
      value: getSupplementalField("signOnBonus"),
      onChange: (value) => updateSupplementalField("signOnBonus", value),
      purpose: "offer letter"
    },
    {
      id: "relocationAssistance",
      label: "Relocation assistance",
      value: getSupplementalField("relocationAssistance", "Not included"),
      onChange: (value) => updateSupplementalField("relocationAssistance", value),
      purpose: "offer letter"
    },
    {
      id: "trainingAgreement",
      label: "Training agreement",
      value: getSupplementalField("trainingAgreement", "18-month repayment agreement when applicable"),
      onChange: (value) => updateSupplementalField("trainingAgreement", value),
      purpose: "offer letter"
    },
    {
      id: "benefitsEligibilityDate",
      label: "Benefits eligibility date",
      value: getSupplementalField("benefitsEligibilityDate", "First of month after hire"),
      onChange: (value) => updateSupplementalField("benefitsEligibilityDate", value),
      purpose: "offer letter"
    },
    {
      id: "ptoPolicy",
      label: "PTO / time off policy",
      value: getSupplementalField("ptoPolicy", "Per company policy"),
      onChange: (value) => updateSupplementalField("ptoPolicy", value),
      purpose: "offer letter"
    },
    {
      id: "employmentClass",
      label: "Employment class",
      value: getSupplementalField("employmentClass", selectedJob.positionType ?? "Full Time"),
      onChange: (value) => updateSupplementalField("employmentClass", value),
      purpose: "offer letter"
    },
    {
      id: "workAuthorizationRequired",
      label: "Work authorization required",
      value: getSupplementalField("workAuthorizationRequired", "Yes"),
      onChange: (value) => updateSupplementalField("workAuthorizationRequired", value),
      purpose: "offer letter"
    },
    {
      id: "backgroundCheckRequired",
      label: "Background check required",
      value: getSupplementalField("backgroundCheckRequired", "Yes"),
      onChange: (value) => updateSupplementalField("backgroundCheckRequired", value),
      purpose: "offer letter"
    },
    {
      id: "drugScreenRequired",
      label: "Drug screen required",
      value: getSupplementalField("drugScreenRequired", "Role dependent"),
      onChange: (value) => updateSupplementalField("drugScreenRequired", value),
      purpose: "offer letter"
    },
    {
      id: "offerLetterManager",
      label: "Manager for offer letter",
      value: getSupplementalField("offerLetterManager", selectedJob.reportsTo ?? ""),
      onChange: (value) => updateSupplementalField("offerLetterManager", value),
      purpose: "offer letter"
    },
    {
      id: "legalEmployer",
      label: "Legal employer / payroll entity",
      value: getSupplementalField("legalEmployer", "SkyShare"),
      onChange: (value) => updateSupplementalField("legalEmployer", value),
      purpose: "offer letter"
    }
  ];

  const paycomFields: SandboxTemplateField[] = [
    {
      id: "workflow",
      label: "Workflow",
      value: getPaycomField("workflow"),
      onChange: (value) => updatePaycomField("workflow", value),
      purpose: "paycom"
    },
    {
      id: "externalApplication",
      label: "External application template",
      value: getPaycomField("externalApplication"),
      onChange: (value) => updatePaycomField("externalApplication", value),
      purpose: "paycom"
    },
    {
      id: "externalKnockout",
      label: "External knockout template",
      value: getPaycomField("externalKnockout"),
      onChange: (value) => updatePaycomField("externalKnockout", value),
      purpose: "paycom"
    },
    {
      id: "externalGlobal",
      label: "External global template",
      value: getPaycomField("externalGlobal"),
      onChange: (value) => updatePaycomField("externalGlobal", value),
      purpose: "paycom"
    },
    {
      id: "externalJobLevel",
      label: "External job level template",
      value: getPaycomField("externalJobLevel"),
      onChange: (value) => updatePaycomField("externalJobLevel", value),
      purpose: "paycom"
    },
    {
      id: "externalFollowUps",
      label: "External follow-up templates",
      value: getPaycomField("externalFollowUps"),
      onChange: (value) => updatePaycomField("externalFollowUps", value),
      purpose: "paycom"
    },
    {
      id: "internalApplication",
      label: "Internal application template",
      value: getPaycomField("internalApplication"),
      onChange: (value) => updatePaycomField("internalApplication", value),
      purpose: "paycom"
    },
    {
      id: "internalKnockout",
      label: "Internal knockout template",
      value: getPaycomField("internalKnockout"),
      onChange: (value) => updatePaycomField("internalKnockout", value),
      purpose: "paycom"
    },
    {
      id: "internalGlobal",
      label: "Internal global template",
      value: getPaycomField("internalGlobal"),
      onChange: (value) => updatePaycomField("internalGlobal", value),
      purpose: "paycom"
    },
    {
      id: "internalJobLevel",
      label: "Internal job level template",
      value: getPaycomField("internalJobLevel"),
      onChange: (value) => updatePaycomField("internalJobLevel", value),
      purpose: "paycom"
    }
  ];

  const aviationFields: SandboxTemplateField[] = [
    {
      id: "aircraftType",
      label: "Aircraft type",
      value: getSupplementalField("aircraftType", selectedJob.title.includes("Gulfstream") ? "Gulfstream G450 / GV" : ""),
      onChange: (value) => updateSupplementalField("aircraftType", value),
      purpose: "aviation"
    },
    {
      id: "seatRole",
      label: "Seat role",
      value: getSupplementalField("seatRole", selectedJob.seatCode ?? "PIC"),
      onChange: (value) => updateSupplementalField("seatRole", value),
      purpose: "aviation"
    },
    {
      id: "requiredRatings",
      label: "Required ratings",
      value: getSupplementalField("requiredRatings", "ATP, appropriate category/class, type rating when required"),
      onChange: (value) => updateSupplementalField("requiredRatings", value),
      purpose: "aviation"
    },
    {
      id: "requiredFlightHours",
      label: "Required flight hours",
      value: getSupplementalField("requiredFlightHours", "Total 5,000; PIC 3,000"),
      onChange: (value) => updateSupplementalField("requiredFlightHours", value),
      purpose: "aviation"
    },
    {
      id: "baseAirport",
      label: "Base airport",
      value: getSupplementalField("baseAirport", selectedJob.location ?? "SLC"),
      onChange: (value) => updateSupplementalField("baseAirport", value),
      purpose: "aviation"
    },
    {
      id: "homeBasedAllowed",
      label: "Home-based allowed",
      value: getSupplementalField("homeBasedAllowed", selectedJob.secondaryLocation?.toLowerCase().includes("home") ? "Yes" : "No"),
      onChange: (value) => updateSupplementalField("homeBasedAllowed", value),
      purpose: "aviation"
    },
    {
      id: "commuteRequirement",
      label: "Commute requirement",
      value: getSupplementalField("commuteRequirement", "Must be able to report as scheduled"),
      onChange: (value) => updateSupplementalField("commuteRequirement", value),
      purpose: "aviation"
    },
    {
      id: "rotationPattern",
      label: "Rotation pattern",
      value: getSupplementalField("rotationPattern", selectedJob.workSchedule ?? "15/13 rotation"),
      onChange: (value) => updateSupplementalField("rotationPattern", value),
      purpose: "aviation"
    },
    {
      id: "operatingRules",
      label: "Part 91 / Part 135 / other",
      value: getSupplementalField("operatingRules", "Part 135"),
      onChange: (value) => updateSupplementalField("operatingRules", value),
      purpose: "aviation"
    },
    {
      id: "medicalCertificate",
      label: "Medical certificate requirement",
      value: getSupplementalField("medicalCertificate", "FAA First Class Medical Certificate"),
      onChange: (value) => updateSupplementalField("medicalCertificate", value),
      purpose: "aviation"
    },
    {
      id: "passportRequired",
      label: "Passport required",
      value: getSupplementalField("passportRequired", "Yes"),
      onChange: (value) => updateSupplementalField("passportRequired", value),
      purpose: "aviation"
    },
    {
      id: "atpRequired",
      label: "ATP / type rating required",
      value: getSupplementalField("atpRequired", selectedJob.educationLevel ?? "ATP certificate"),
      onChange: (value) => updateSupplementalField("atpRequired", value),
      purpose: "aviation"
    }
  ];

  const fieldGroups: Array<{
    key: FieldGroupKey;
    title: string;
    subtitle: string;
    badge: string;
    fields: SandboxTemplateField[];
  }> = [
    {
      key: "public",
      title: "Public posting fields",
      subtitle: "Safe to publish in the job board copy and formatted preview.",
      badge: `${publicPostingFields.length} fields`,
      fields: publicPostingFields
    },
    {
      key: "internal",
      title: "Internal role tracking",
      subtitle: "Used by recruiting, hiring team, approvals, and source tracking.",
      badge: `${internalRoleFields.length} fields`,
      fields: internalRoleFields
    },
    {
      key: "offer",
      title: "Offer letter / HR fields",
      subtitle: "Important later for offer letters, onboarding, payroll, and compliance.",
      badge: `${offerLetterFields.length} fields`,
      fields: offerLetterFields
    },
    {
      key: "paycom",
      title: "Paycom setup fields",
      subtitle: "Workflow and application template fields that keep Paycom setup consistent.",
      badge: `${paycomFields.length} fields`,
      fields: paycomFields
    },
    {
      key: "aviation",
      title: "Aviation requirement fields",
      subtitle: "Pilot and aircraft-specific details that are easy to miss in normal job templates.",
      badge: `${aviationFields.length} fields`,
      fields: aviationFields
    }
  ];
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
                {isLive ? "Job Posting System" : "Sandbox layout"}
              </div>
              <h1 className="truncate text-xl font-semibold">
                {isLive ? "SkyShare Job Post Builder" : "Clean Job Posts Preview"}
              </h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 xl:flex">
            {["Edit", "Build", "Preview", "Export"].map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-lea dark:bg-[#10243a] dark:text-slate-100">
                  {index + 1}
                </div>
                <span className="text-sm font-medium text-white/82">{step}</span>
                {index < 3 && <div className="h-px w-8 bg-white/18" />}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-lea dark:text-slate-100">
              <Lock className="h-3.5 w-3.5" />
              Template Locked
            </span>
            <span className="rounded bg-white/10 px-3 py-2 text-xs font-bold text-white/85">{copyMessage}</span>
            {isLive && (
              <>
                <button
                  type="button"
                  onClick={() => saveSelectedJob()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded bg-white px-3.5 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer disabled:opacity-70 dark:bg-[#10243a] dark:text-slate-100"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Save Draft"}
                </button>
                {selectedJob.status === "RETIRED" ? (
                  <button
                    type="button"
                    onClick={() => updateCurrentJobStatus("ACTIVE")}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded border border-white/20 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-70"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restore Role
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateCurrentJobStatus("RETIRED")}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded border border-white/20 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-70"
                  >
                    <Archive className="h-4 w-4" />
                    Archive Role
                  </button>
                )}
              </>
            )}
            <JobExportMenu
              job={selectedJob}
              onStatusChange={(message) => setCopyMessage(message || (isLive ? "Ready to save" : "Sandbox preview only"))}
            />
          </div>
        </div>
      </header>

      <div className="px-5 py-5 lg:px-8">
        {!isLive && (
          <div className="mb-4 rounded border border-brand-gold/35 bg-brand-gold/12 px-4 py-3 text-sm font-semibold leading-6 text-brand-lea dark:text-slate-100">
            Sandbox only: edits, archive actions, and bulk changes on this page are temporary browser-state previews.
            The real Job Posts page and database are unchanged.
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.72fr)_minmax(560px,1.28fr)]">
          <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
            <div className="border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">1. Edit Job Data</p>
              <h2 className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{selectedJob.title}</h2>
              <p className="mt-1 text-xs font-semibold text-brand-grey dark:text-slate-400">
                {statusLabel(selectedJob.status)} - {selectedJob.department ?? "Department pending"} -{" "}
                {selectedJob.location ?? "Location pending"}
              </p>
            </div>

            <div className="border-b border-brand-lea/10 p-4 dark:border-white/10">
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  { key: "active", label: "Active", count: counts.active },
                  { key: "archived", label: "Archived", count: counts.archived },
                  { key: "all", label: "All", count: counts.all }
                ].map((item) => {
                  const active = jobListView === item.key;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setJobListView(item.key as JobListView)}
                      className={`rounded px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] transition hover:shadow-glow ${
                        active
                          ? "bg-brand-lea text-white shadow-sm"
                          : "border border-brand-lea/10 bg-white text-brand-lea hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100"
                      }`}
                    >
                      {item.label} ({item.count})
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-brand-grey dark:text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className={`${inputClass} pl-9`}
                  placeholder="Search jobs..."
                />
              </div>
              <select
                value={selectedJob.id}
                onChange={(event) => setSelectedJobId(event.target.value)}
                className="mt-3 w-full rounded border border-brand-lea/15 bg-white px-3 py-2.5 text-sm font-semibold text-brand-lea outline-none focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100"
              >
                {filteredJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} {job.status === "RETIRED" ? "(Archived)" : ""}
                  </option>
                ))}
              </select>

              <div className="mt-4 overflow-hidden rounded border border-brand-lea/10 bg-brand-cloudDancer/45 dark:border-white/10 dark:bg-white/5">
                <button
                  type="button"
                  onClick={() => setBulkOpen((current) => !current)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/55"
                >
                  {bulkOpen ? <ChevronDown className="h-4 w-4 text-brand-eden" /> : <ChevronRight className="h-4 w-4 text-brand-eden" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-eden">Bulk actions</div>
                    <div className="mt-1 text-xs font-semibold text-brand-grey dark:text-slate-400">
                      Archive inactive roles or restore archived roles.
                    </div>
                  </div>
                  <SourcePill label={`${selectedBulkJobIds.length} selected`} tone="neutral" />
                </button>
                {bulkOpen && (
                  <div className="border-t border-brand-lea/8 bg-white p-3 dark:border-white/10 dark:bg-[#10243a]">
                    <div className="mb-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={toggleAllBulkJobs}
                        className="rounded border border-brand-lea/12 bg-white px-2.5 py-1.5 text-xs font-bold text-brand-lea hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100"
                      >
                        {allEligibleSelected ? "Clear visible" : "Select visible"}
                      </button>
                      <button
                        type="button"
                        onClick={runBulkArchivePreview}
                        disabled={!selectedBulkJobIds.length}
                        className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-eden disabled:opacity-60"
                      >
                        {jobListView === "archived" ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        {jobListView === "archived" ? "Restore selected" : "Archive selected"}
                      </button>
                    </div>
                    <div className="max-h-48 space-y-1.5 overflow-auto pr-1">
                      {bulkEligibleJobs.map((job) => (
                        <label
                          key={`${jobListView}-${job.id}`}
                          className="flex cursor-pointer items-start gap-2 rounded border border-brand-lea/8 bg-white px-2.5 py-2 text-sm hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-[#10243a]"
                        >
                          <input
                            type="checkbox"
                            checked={selectedBulkJobIds.includes(job.id)}
                            onChange={() => toggleBulkJob(job.id)}
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
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/35 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-eden">
                      Job template field map
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-brand-grey dark:text-slate-400">
                      Fields are grouped by where the information is used, so new team members know what publishes and what stays internal.
                    </p>
                  </div>
                  <SourcePill label={isLive ? "editable" : "sandbox editable"} tone="field" />
                </div>
              </div>

              {fieldGroups.map((group) => (
                <DrawerShell
                  key={group.key}
                  title={group.title}
                  subtitle={group.subtitle}
                  badge={<SourcePill label={group.badge} tone={group.key === "public" ? "field" : "neutral"} />}
                  isOpen={openFieldGroups[group.key]}
                  onToggle={() => toggleFieldGroup(group.key)}
                >
                  {(() => {
                    const orderedFields = getOrderedFields(group.key, group.fields);
                    const disabledIds = disabledFieldIdsByGroup[group.key] ?? [];
                    const enabledCount = orderedFields.length - disabledIds.length;

                    return (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-brand-lea/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#10243a]">
                          <p className="text-[11px] font-semibold leading-5 text-brand-grey dark:text-slate-400">
                            Drag fields into the order you want. Uncheck fields you do not want in the final template.
                          </p>
                          <SourcePill label={`${enabledCount}/${orderedFields.length} enabled`} tone={enabledCount === orderedFields.length ? "field" : "warning"} />
                        </div>
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleFieldDragEnd(group.key, group.fields, event)}
                        >
                          <SortableContext items={orderedFields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
                            <div className="grid gap-2">
                              {orderedFields.map((field) => (
                                <SortableTemplateField
                                  key={field.id}
                                  field={field}
                                  isEnabled={!disabledIds.includes(field.id)}
                                  onToggle={() => toggleFieldEnabled(group.key, field.id)}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      </div>
                    );
                  })()}

                  {group.key === "offer" && (
                    <div className="mt-3 rounded border border-brand-lea/10 bg-white p-3 dark:border-white/10 dark:bg-[#10243a]">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-eden">
                            Manual extra fields
                          </div>
                          <p className="mt-1 text-xs font-semibold leading-5 text-brand-grey dark:text-slate-400">
                            Add anything this template does not account for yet. These stay out of the public preview.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addExtraField}
                          className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-3 py-2 text-xs font-bold text-white hover:bg-brand-eden"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add field
                        </button>
                      </div>

                      {extraFields.length === 0 ? (
                        <div className="rounded border border-dashed border-brand-lea/18 bg-brand-cloudDancer/35 px-3 py-4 text-sm font-semibold leading-6 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                          No custom fields yet. This is where one-off offer letter or internal tracking fields would go.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {extraFields.map((field) => (
                            <div
                              key={field.id}
                              className="grid gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/25 p-2 md:grid-cols-[1fr_1.4fr_120px_auto] dark:border-white/10 dark:bg-white/5"
                            >
                              <input
                                value={field.label}
                                onChange={(event) => updateExtraField(field.id, { label: event.target.value })}
                                className={templateInputClass}
                                aria-label="Custom field label"
                              />
                              <input
                                value={field.value}
                                onChange={(event) => updateExtraField(field.id, { value: event.target.value })}
                                className={templateInputClass}
                                aria-label="Custom field value"
                              />
                              <select
                                value={field.purpose}
                                onChange={(event) =>
                                  updateExtraField(field.id, { purpose: event.target.value as ExtraJobField["purpose"] })
                                }
                                className={templateInputClass}
                                aria-label="Custom field purpose"
                              >
                                <option value="offer">Offer letter</option>
                                <option value="internal">Internal</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => removeExtraField(field.id)}
                                className="inline-flex h-10 items-center justify-center rounded border border-brand-red/20 px-3 text-brand-red hover:bg-brand-red/10"
                                aria-label={`Remove ${field.label || "custom field"}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </DrawerShell>
              ))}

              {(["summary", "responsibilities", "qualifications", "benefits"] as DrawerKey[]).map((key) => {
                const source = fieldSourceByKey[key];
                const value =
                  key === "summary"
                    ? selectedJob.summary
                    : key === "responsibilities"
                      ? selectedJob.keyResponsibilities
                      : key === "qualifications"
                        ? selectedJob.qualificationsText
                        : selectedJob.benefitsText;

                return (
                  <DrawerShell
                    key={key}
                    title={drawerLabels[key]}
                    subtitle={source?.detail ?? "Click to expand and edit this field."}
                    badge={
                      source ? (
                        <SourcePill label={source.sourceLabel} tone={source.isHiddenByBlock ? "neutral" : "field"} />
                      ) : null
                    }
                    isOpen={openDrawers[key]}
                    onToggle={() => toggleDrawer(key)}
                  >
                    <textarea
                      value={value ?? ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        if (key === "summary") updateSelectedJob({ summary: nextValue });
                        if (key === "responsibilities") updateSelectedJob({ keyResponsibilities: nextValue });
                        if (key === "qualifications") updateSelectedJob({ qualificationsText: nextValue });
                        if (key === "benefits") updateSelectedJob({ benefitsText: nextValue });
                      }}
                      className={`${inputClass} min-h-28 resize-y`}
                    />
                  </DrawerShell>
                );
              })}

            </div>
          </section>

          <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
            <div className="border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">3. Job Posting Preview</p>
                  <h2 className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">Formatted and ready to publish</h2>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <ReadinessCard job={selectedJob} warnings={warnings} />
              <FormattedJobPost job={selectedJob} showVersionBadges />
            </div>
          </section>
        </div>

        {isLive ? (
          <div className="mt-5">
            <JobBlockAssembly job={selectedJob} availableBlocks={initialBlocks} onJobUpdated={handleJobUpdated} />
          </div>
        ) : (
        <section className="mt-5 rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <div className="flex w-full items-center gap-3 border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
            <button
              type="button"
              onClick={() => setSectionsOpen((current) => !current)}
              className="rounded p-1 text-brand-eden hover:bg-brand-cloudDancer dark:bg-white/5"
              aria-label={sectionsOpen ? "Collapse section builder" : "Expand section builder"}
            >
              {sectionsOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => setSectionsOpen((current) => !current)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">Section Builder</p>
              <h2 className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{publishingBlocks.length} shared blocks attached</h2>
              <p className="mt-1 text-xs font-semibold text-brand-grey dark:text-slate-400">
                Collapsed by default. Expand to manage order, sections, custom copies, and source mapping.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setSectionsOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded bg-brand-lea px-3 py-2 text-xs font-bold text-white hover:bg-brand-eden"
            >
              <Boxes className="h-4 w-4" />
              Manage Sections
            </button>
          </div>

          {!sectionsOpen && (
            <div className="flex flex-wrap gap-3 p-4">
              {publishingBlocks.slice(0, 5).map((instance) => (
                <div key={instance.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <div className="text-sm font-bold text-brand-lea dark:text-slate-100">{getInstanceTitle(instance)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <SourcePill label={getBlockSourceLabel(instance)} tone="block" />
                    <SourcePill label={formatEnum(instance.contentBlock?.placement ?? "OPTIONAL")} tone="neutral" />
                  </div>
                </div>
              ))}
              {publishingBlocks.length > 5 && (
                <div className="rounded border border-brand-lea/10 bg-white px-3 py-2 text-sm font-bold text-brand-eden dark:border-white/10 dark:bg-[#10243a]">
                  +{publishingBlocks.length - 5} more
                </div>
              )}
            </div>
          )}

          {sectionsOpen && (
            <div className="grid gap-4 p-4 xl:grid-cols-[minmax(260px,0.72fr)_minmax(400px,1fr)_minmax(420px,1fr)]">
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/50 p-3 dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-eden">Available blocks</p>
                <input className={`${inputClass} mt-3`} placeholder="Search shared blocks..." />
                <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
                  {availableBlocks.slice(0, 12).map((block) => (
                    <div key={block.id} className="rounded border border-brand-lea/10 bg-white p-3 dark:border-white/10 dark:bg-[#10243a]">
                      <div className="text-sm font-bold text-brand-lea dark:text-slate-100">{block.name}</div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-brand-grey dark:text-slate-400">{block.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <SourcePill label={formatEnum(block.category)} tone="neutral" />
                        <SourcePill label={formatEnum(block.placement)} tone="block" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded border border-brand-lea/10 bg-white p-3 dark:border-white/10 dark:bg-[#10243a]">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-eden">Job sections</p>
                <h3 className="mt-1 text-base font-bold text-brand-lea dark:text-slate-100">Plain-language block controls</h3>
                <div className="mt-3 max-h-[620px] space-y-2 overflow-auto pr-1">
                  {publishingBlocks.map((instance) => {
                    const outdated = isInstanceOutdated(instance);

                    return (
                      <div key={instance.id} className="rounded border border-brand-lea/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#10243a]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-brand-lea dark:text-slate-100">{getInstanceTitle(instance)}</div>
                            <p className="mt-1 text-xs leading-5 text-brand-grey dark:text-slate-400">
                              {instance.contentBlock?.name ?? "Custom content"} - {formatEnum(instance.contentBlock?.category ?? "CUSTOM")}
                            </p>
                          </div>
                          <SourcePill label={`v${instance.blockVersion?.versionNumber ?? 1}`} tone={outdated ? "warning" : "neutral"} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <SourcePill label={getBlockSourceLabel(instance)} tone={instance.mode === "FORKED_CUSTOM" ? "warning" : "block"} />
                          <SourcePill label={formatEnum(instance.contentBlock?.placement ?? "OPTIONAL")} tone="neutral" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="rounded bg-brand-lea px-3 py-2 text-xs font-bold text-white">
                            Customize for this job
                          </button>
                          <button className="rounded border border-brand-lea/12 px-3 py-2 text-xs font-bold text-brand-lea dark:border-white/10 dark:text-slate-100">
                            Version details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <ContentSourceMap job={selectedJob} />
            </div>
          )}
        </section>
        )}

        <section className="mt-5 rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <button
            type="button"
            onClick={() => setArchiveReferenceOpen((current) => !current)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-brand-cloudDancer/45 dark:bg-white/5"
          >
            {archiveReferenceOpen ? <ChevronDown className="h-5 w-5 text-brand-eden" /> : <ChevronRight className="h-5 w-5 text-brand-eden" />}
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">Archive reference drawer</p>
              <h2 className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">Archived jobs stay available for lookup</h2>
            </div>
          </button>
          {archiveReferenceOpen && (
            <div className="grid gap-3 border-t border-brand-lea/10 p-4 md:grid-cols-3 dark:border-white/10">
              {jobs
                .filter((job) => job.status === "RETIRED")
                .slice(0, 9)
                .map((job) => (
                  <button
                    key={`archive-ref-${job.id}`}
                    type="button"
                    onClick={() => {
                      setSelectedJobId(job.id);
                      setJobListView("archived");
                    }}
                    className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 text-left hover:bg-brand-sweet/30 transition hover:shadow-glow dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="text-sm font-bold text-brand-lea dark:text-slate-100">{job.title}</div>
                    <div className="mt-1 text-xs font-semibold text-brand-grey dark:text-slate-400">{job.department ?? "Department pending"}</div>
                  </button>
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
