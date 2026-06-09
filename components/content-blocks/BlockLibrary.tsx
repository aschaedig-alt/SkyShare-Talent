"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Blocks,
  CheckCircle2,
  Copy,
  Edit3,
  GitBranch,
  History,
  LayoutGrid,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  X
} from "lucide-react";
import type {
  BlockBodyFormat,
  BlockCategory,
  BlockPlacement,
  BlockScope,
  BlockTextColor,
  BlockTextWeight,
  SerializedContentBlock,
  SerializedJobPost
} from "@/lib/types";
import { BlockTemplateBoard } from "@/components/content-blocks/BlockTemplateBoard";
import { RichText, RichTextParagraphs } from "@/components/shared/RichText";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { inlineTextColorOptions } from "@/lib/formatting/rich-text";
import { splitCleanLines } from "@/lib/formatting/text";

type BlockLibraryProps = {
  blocks: SerializedContentBlock[];
  jobs: SerializedJobPost[];
};

type EditorMode = "detail" | "edit" | "create";
type ViewMode = "library" | "board";
type AdoptionMode = "NEW_VERSION_ONLY" | "ALL_LINKED_JOBS" | "SELECTED_JOBS";
type RetirementAction = "ARCHIVE" | "DELETE";

const categories: BlockCategory[] = [
  "ABOUT",
  "ROLE",
  "MISSION",
  "VALUES",
  "RESPONSIBILITIES",
  "QUALIFICATIONS",
  "SKILLS",
  "BENEFITS",
  "LOCATION",
  "PAYCOM",
  "CTA",
  "CUSTOM"
];

const scopes: BlockScope[] = ["GLOBAL", "DEPARTMENT", "ROLE", "JOB_SPECIFIC"];
const placements: Array<{ value: BlockPlacement; label: string }> = [
  { value: "REQUIRED", label: "Required" },
  { value: "DEPARTMENT_SPECIFIC", label: "Department Specific" },
  { value: "ROLE_SPECIFIC", label: "Role Specific" },
  { value: "OPTIONAL", label: "Optional" }
];
const bodyFormats: Array<{ value: BlockBodyFormat; label: string }> = [
  { value: "BULLET_LIST", label: "Bullet points" },
  { value: "PARAGRAPH", label: "No bullets" }
];
const textWeights: Array<{ value: BlockTextWeight; label: string }> = [
  { value: "NORMAL", label: "Normal" },
  { value: "SEMIBOLD", label: "Semi-bold" },
  { value: "BOLD", label: "Bold" }
];
const textColors: Array<{ value: BlockTextColor; label: string; swatch: string }> = inlineTextColorOptions.map(
  (color) => ({
    value: color.key,
    label: color.label,
    swatch: color.value
  })
);

const emptyForm = {
  name: "",
  description: "",
  category: "CUSTOM" as BlockCategory,
  scope: "GLOBAL" as BlockScope,
  placement: "OPTIONAL" as BlockPlacement,
  title: "",
  body: "",
  bodyFormat: "BULLET_LIST" as BlockBodyFormat,
  textWeight: "NORMAL" as BlockTextWeight,
  textColor: "BLACK" as BlockTextColor,
  changeNote: "",
  adoption: "NEW_VERSION_ONLY" as AdoptionMode,
  selectedJobIds: [] as string[]
};

const emptyRetirementForm = {
  migrateJobs: false,
  replacementBlockId: ""
};

const emptyApplyForm = {
  applyToAll: true,
  selectedJobIds: [] as string[]
};

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function versionLabel(block: SerializedContentBlock) {
  return `v${block.currentVersion?.versionNumber ?? 1}`;
}

function getBlockCoverage(block: SerializedContentBlock, jobs: SerializedJobPost[]) {
  const usedJobIds = new Set((block.usedByJobs ?? []).map((job) => job.id));
  const activeJobs = jobs.filter((job) => job.status !== "RETIRED");
  const totalJobs = jobs.length;
  const totalActiveJobs = activeJobs.length;
  const usedAllJobsCount = usedJobIds.size;
  const usedActiveJobsCount = activeJobs.filter((job) => usedJobIds.has(job.id)).length;

  return {
    totalJobs,
    totalActiveJobs,
    usedAllJobsCount,
    usedActiveJobsCount,
    missingAllJobsCount: Math.max(totalJobs - usedAllJobsCount, 0),
    missingActiveJobsCount: Math.max(totalActiveJobs - usedActiveJobsCount, 0),
    isInAllJobs: totalJobs > 0 && usedAllJobsCount >= totalJobs,
    isInAllActiveJobs: totalActiveJobs > 0 && usedActiveJobsCount >= totalActiveJobs
  };
}

function BlockCoverageBadges({ block, jobs }: { block: SerializedContentBlock; jobs: SerializedJobPost[] }) {
  const coverage = getBlockCoverage(block, jobs);

  return (
    <>
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
          coverage.isInAllJobs
            ? "bg-emerald-50 text-emerald-800"
            : "bg-brand-cloudDancer text-brand-eden"
        }`}
        title={
          coverage.isInAllJobs
            ? "This block is used on every job in the system."
            : `Missing from ${coverage.missingAllJobsCount} of ${coverage.totalJobs} jobs.`
        }
      >
        {coverage.isInAllJobs ? <CheckCircle2 className="h-3 w-3" /> : <Users className="h-3 w-3" />}
        {coverage.isInAllJobs ? "All jobs" : `${coverage.missingAllJobsCount} missing`}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
          coverage.isInAllActiveJobs
            ? "bg-brand-sweet/45 text-brand-lea"
            : "bg-brand-gold/25 text-brand-lea"
        }`}
        title={
          coverage.isInAllActiveJobs
            ? "This block is used on every active job."
            : `Missing from ${coverage.missingActiveJobsCount} of ${coverage.totalActiveJobs} active jobs.`
        }
      >
        {coverage.isInAllActiveJobs ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        {coverage.isInAllActiveJobs ? "All active" : `${coverage.missingActiveJobsCount} active missing`}
      </span>
    </>
  );
}

const inputClass =
  "w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition placeholder:text-brand-grey/70 focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35";

const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-brand-eden";

const blockColorClasses: Record<BlockTextColor, string> = {
  BLACK: "text-brand-black/82",
  LEA: "text-brand-lea",
  EDEN: "text-brand-eden",
  GREY: "text-brand-grey",
  GOLD: "text-brand-gold",
  RED: "text-brand-red",
  SWEET: "text-brand-sweet",
  CLOUD_DANCER: "text-brand-cloudDancer"
};

const blockWeightClasses: Record<BlockTextWeight, string> = {
  NORMAL: "font-normal",
  SEMIBOLD: "font-semibold",
  BOLD: "font-bold"
};

function BlockBodyPreview({
  value,
  bodyFormat,
  textWeight,
  textColor
}: {
  value?: string | null;
  bodyFormat: BlockBodyFormat;
  textWeight: BlockTextWeight;
  textColor: BlockTextColor;
}) {
  const lines = splitCleanLines(value);
  const textClass = `${blockColorClasses[textColor]} ${blockWeightClasses[textWeight]}`;

  if (!lines.length) {
    return <p className="text-sm italic text-brand-grey">No clean text entered yet.</p>;
  }

  if (bodyFormat === "PARAGRAPH") {
    return (
      <RichTextParagraphs
        value={value}
        className="space-y-3"
        paragraphClassName={`text-sm leading-6 ${textClass}`}
      />
    );
  }

  return (
    <ul className={`space-y-2 text-sm leading-6 ${textClass}`}>
      {lines.map((line, index) => (
        <li key={`${line}-${index}`} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-eden" />
          <span>
            <RichText value={line} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function BlockLibrary({ blocks: initialBlocks, jobs }: BlockLibraryProps) {
  const [blocks, setBlocks] = useState(initialBlocks);
  const [view, setView] = useState<ViewMode>("library");
  const [query, setQuery] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState(initialBlocks[0]?.id ?? "");
  const [mode, setMode] = useState<EditorMode>("detail");
  const [form, setForm] = useState(emptyForm);
  const [applyForm, setApplyForm] = useState(emptyApplyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isRetiring, setIsRetiring] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [retirementForm, setRetirementForm] = useState(emptyRetirementForm);

  const filteredBlocks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return blocks;
    }

    return blocks.filter((block) =>
      [block.name, block.description, block.category, block.scope, block.placement]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [blocks, query]);

  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? filteredBlocks[0] ?? blocks[0];
  const replacementBlocks = blocks.filter((block) => block.id !== selectedBlock?.id && !block.archivedAt);
  const selectedBlockUsageCount = selectedBlock?.usedByJobs?.length ?? selectedBlock?.usageCount ?? 0;
  const deleteNeedsReplacement = selectedBlockUsageCount > 0 && !retirementForm.migrateJobs;
  const replacementRequired = retirementForm.migrateJobs && !retirementForm.replacementBlockId;
  const isWorking = isSaving || isDuplicating || isRetiring || isApplying;
  const activityMessage = isSaving
    ? "Saving block changes..."
    : isDuplicating
      ? "Duplicating block..."
      : isRetiring
        ? "Updating block archive/delete..."
        : isApplying
          ? "Applying block to jobs..."
          : error ?? message;

  useEffect(() => {
    if (mode === "edit" && selectedBlock) {
      setForm({
        name: selectedBlock.name,
        description: selectedBlock.description ?? "",
        category: selectedBlock.category,
        scope: selectedBlock.scope,
        placement: selectedBlock.placement,
        title: selectedBlock.currentVersion?.title ?? selectedBlock.name,
        body: selectedBlock.currentVersion?.body ?? "",
        bodyFormat: selectedBlock.currentVersion?.bodyFormat ?? "BULLET_LIST",
        textWeight: selectedBlock.currentVersion?.textWeight ?? "NORMAL",
        textColor: selectedBlock.currentVersion?.textColor ?? "BLACK",
        changeNote: "",
        adoption: "NEW_VERSION_ONLY",
        selectedJobIds: []
      });
    }

    if (mode === "create") {
      setForm(emptyForm);
    }
  }, [mode, selectedBlock]);

  function selectBlock(blockId: string) {
    setSelectedBlockId(blockId);
    setMode("detail");
    setRetirementForm(emptyRetirementForm);
    setApplyForm(emptyApplyForm);
    setMessage(null);
    setError(null);
  }

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleSelectedJob(jobId: string) {
    setForm((current) => ({
      ...current,
      selectedJobIds: current.selectedJobIds.includes(jobId)
        ? current.selectedJobIds.filter((id) => id !== jobId)
        : [...current.selectedJobIds, jobId]
    }));
  }

  async function saveBlock() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response =
        mode === "create"
          ? await fetch("/api/blocks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: form.name,
                description: form.description,
                category: form.category,
                scope: form.scope,
                placement: form.placement,
                title: form.title,
                body: form.body,
                bodyFormat: form.bodyFormat,
                textWeight: form.textWeight,
                textColor: form.textColor,
                changeNote: form.changeNote
              })
            })
          : await fetch(`/api/blocks/${selectedBlock.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: form.name,
                description: form.description,
                category: form.category,
                scope: form.scope,
                placement: form.placement,
                title: form.title,
                body: form.body,
                bodyFormat: form.bodyFormat,
                textWeight: form.textWeight,
                textColor: form.textColor,
                changeNote: form.changeNote,
                adoption: form.adoption,
                selectedJobIds: form.selectedJobIds
              })
            });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Unable to save block.");
      }

      const savedBlock = (await response.json()) as SerializedContentBlock;
      setBlocks((current) => {
        const exists = current.some((block) => block.id === savedBlock.id);
        return exists
          ? current.map((block) => (block.id === savedBlock.id ? savedBlock : block))
          : [savedBlock, ...current];
      });
      setSelectedBlockId(savedBlock.id);
      setMode("detail");
      setMessage(mode === "create" ? "Block created." : "Block details and new version saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save block.");
    } finally {
      setIsSaving(false);
    }
  }

  async function duplicateBlock() {
    if (!selectedBlock) {
      return;
    }

    setIsDuplicating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/blocks/${selectedBlock.id}/duplicate`, {
        method: "POST"
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Unable to duplicate block.");
      }

      const duplicatedBlock = (await response.json()) as SerializedContentBlock;
      setBlocks((current) => [duplicatedBlock, ...current]);
      setSelectedBlockId(duplicatedBlock.id);
      setMode("edit");
      setMessage("Block duplicated. Rename it and save when ready.");
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Unable to duplicate block.");
    } finally {
      setIsDuplicating(false);
    }
  }

  async function retireBlock(action: RetirementAction) {
    if (!selectedBlock) {
      return;
    }

    if (retirementForm.migrateJobs && !retirementForm.replacementBlockId) {
      setError("Choose a replacement block before updating jobs.");
      return;
    }

    setIsRetiring(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/blocks/${selectedBlock.id}/retire`, {
        method: action === "ARCHIVE" ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          migrateJobs: retirementForm.migrateJobs,
          replacementBlockId: retirementForm.replacementBlockId || null
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? `Unable to ${action === "ARCHIVE" ? "archive" : "delete"} block.`);
      }

      if (action === "DELETE") {
        const payload = (await response.json()) as { deletedId: string };
        setBlocks((current) => current.filter((block) => block.id !== payload.deletedId));
        const nextBlock = blocks.find((block) => block.id !== payload.deletedId);
        setSelectedBlockId(nextBlock?.id ?? "");
        setMessage("Block deleted.");
      } else {
        const archivedBlock = (await response.json()) as SerializedContentBlock;
        setBlocks((current) => current.map((block) => (block.id === archivedBlock.id ? archivedBlock : block)));
        setSelectedBlockId(archivedBlock.id);
        setMessage("Block archived.");
      }

      setRetirementForm(emptyRetirementForm);
      setMode("detail");
    } catch (retireError) {
      setError(retireError instanceof Error ? retireError.message : "Unable to retire block.");
    } finally {
      setIsRetiring(false);
    }
  }

  function toggleApplyJob(jobId: string) {
    setApplyForm((current) => ({
      ...current,
      selectedJobIds: current.selectedJobIds.includes(jobId)
        ? current.selectedJobIds.filter((id) => id !== jobId)
        : [...current.selectedJobIds, jobId]
    }));
  }

  async function applyBlockToJobs() {
    if (!selectedBlock) {
      return;
    }

    setIsApplying(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/blocks/${selectedBlock.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applyToAll: applyForm.applyToAll,
          jobIds: applyForm.applyToAll ? [] : applyForm.selectedJobIds
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Unable to apply block to jobs.");
      }

      const payload = (await response.json()) as {
        block: SerializedContentBlock;
        appliedCount: number;
        skippedCount: number;
      };
      setBlocks((current) => current.map((block) => (block.id === payload.block.id ? payload.block : block)));
      setSelectedBlockId(payload.block.id);
      setMessage(
        `Block applied to ${payload.appliedCount} job${payload.appliedCount === 1 ? "" : "s"}. ${payload.skippedCount} already had it.`
      );
      setApplyForm(emptyApplyForm);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Unable to apply block to jobs.");
    } finally {
      setIsApplying(false);
    }
  }

  async function updateBlockPlacement(blockId: string, placement: BlockPlacement) {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/blocks/${blockId}/placement`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placement })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const errorMessage = payload?.message ?? "Unable to update block placement.";
        setError(errorMessage);
        throw new Error(errorMessage);
      }

      const updatedBlock = (await response.json()) as SerializedContentBlock;
      setBlocks((current) => current.map((block) => (block.id === updatedBlock.id ? updatedBlock : block)));
      setSelectedBlockId(updatedBlock.id);
      setMessage(`${updatedBlock.name} moved to ${formatEnum(updatedBlock.placement)}.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="px-5 py-5 lg:px-8">
      <div className="mb-5 rounded bg-brand-lea px-6 py-5 text-white shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10">
              <Blocks className="h-5 w-5 text-brand-gold" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-sweet">
                Content Blocks
              </p>
              <h1 className="text-2xl font-semibold">Reusable block library</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => selectedBlock && setMode("edit")}
              className="inline-flex items-center gap-2 rounded border border-white/20 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Edit3 className="h-4 w-4" />
              Edit Block
            </button>
            <button
              type="button"
              onClick={duplicateBlock}
              disabled={!selectedBlock || isDuplicating}
              className="inline-flex items-center gap-2 rounded border border-white/20 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
            >
              <Copy className="h-4 w-4" />
              {isDuplicating ? "Duplicating..." : "Duplicate"}
            </button>
            <button
              type="button"
              onClick={() => setMode("create")}
              className="inline-flex items-center gap-2 rounded bg-brand-gold px-3.5 py-2 text-sm font-bold text-brand-lea hover:bg-brand-gold/90"
            >
              <Plus className="h-4 w-4" />
              Create New Block
            </button>
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { key: "library", label: "Block Library", icon: Blocks },
          { key: "board", label: "Template Board", icon: LayoutGrid }
        ].map((item) => {
          const Icon = item.icon;
          const active = view === item.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key as ViewMode)}
              className={`inline-flex items-center gap-2 rounded px-3.5 py-2 text-sm font-bold transition ${
                active
                  ? "bg-brand-lea text-white shadow-sm"
                  : "border border-brand-lea/10 bg-white text-brand-lea hover:bg-brand-cloudDancer"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {(isWorking || error || message) && (
        <div
          className={`mb-5 flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold ${
            isWorking
              ? "border-brand-gold/35 bg-brand-gold/12 text-brand-lea"
              : error
                ? "border-brand-red/25 bg-brand-red/8 text-brand-red"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {isWorking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : error ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {activityMessage}
        </div>
      )}

      {view === "board" ? (
        <BlockTemplateBoard
          blocks={blocks}
          jobs={jobs}
          selectedBlockId={selectedBlock?.id ?? ""}
          onSelectBlock={(blockId) => {
            selectBlock(blockId);
            setView("library");
          }}
          onPlacementChange={updateBlockPlacement}
        />
      ) : (
      <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.95fr)_minmax(430px,1.05fr)]">
        <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
          <div className="border-b border-brand-lea/10 p-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-brand-grey">
              Find reusable content
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-brand-grey" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="Search name, category, scope, placement..."
              />
            </div>
          </div>

          <div className="divide-y divide-brand-lea/8">
            {filteredBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => selectBlock(block.id)}
                className={`w-full px-4 py-4 text-left transition ${
                  selectedBlock?.id === block.id && mode !== "create"
                    ? "bg-brand-sweet/35"
                    : "hover:bg-brand-cloudDancer/70"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-bold text-brand-lea">{block.name}</div>
                      {block.archivedAt && (
                        <span className="rounded bg-brand-grey/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-grey">
                          Archived
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-brand-grey">{block.description}</div>
                  </div>
                  <div className="rounded bg-brand-cloudDancer px-2 py-1 text-xs font-bold text-brand-lea">
                    {versionLabel(block)}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-brand-lea px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
                    {formatEnum(block.category)}
                  </span>
                  <span className="rounded bg-brand-gold/22 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea">
                    {formatEnum(block.scope)}
                  </span>
                  <span className="rounded bg-brand-sweet/35 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea">
                    {formatEnum(block.placement)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-brand-cloudDancer px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-eden">
                    <Users className="h-3 w-3" />
                    {block.usageCount ?? 0} jobs
                  </span>
                  <BlockCoverageBadges block={block} jobs={jobs} />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
          {mode === "edit" || mode === "create" ? (
            <div>
              <div className="flex items-start justify-between gap-4 border-b border-brand-lea/10 px-5 py-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
                    {mode === "create" ? "Create block" : "Edit block"}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-brand-lea">
                    {mode === "create" ? "New reusable content block" : selectedBlock?.name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMode("detail")}
                  className="rounded border border-brand-lea/10 p-2 text-brand-grey hover:bg-brand-cloudDancer"
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClass}>Block Name</label>
                    <input
                      value={form.name}
                      onChange={(event) => updateForm("name", event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Description</label>
                    <input
                      value={form.description}
                      onChange={(event) => updateForm("description", event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Category</label>
                    <select
                      value={form.category}
                      onChange={(event) => updateForm("category", event.target.value as BlockCategory)}
                      className={inputClass}
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {formatEnum(category)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Scope</label>
                    <select
                      value={form.scope}
                      onChange={(event) => updateForm("scope", event.target.value as BlockScope)}
                      className={inputClass}
                    >
                      {scopes.map((scope) => (
                        <option key={scope} value={scope}>
                          {formatEnum(scope)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>Template Board Section</label>
                    <select
                      value={form.placement}
                      onChange={(event) => updateForm("placement", event.target.value as BlockPlacement)}
                      className={inputClass}
                    >
                      {placements.map((placement) => (
                        <option key={placement.value} value={placement.value}>
                          {placement.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Version Title</label>
                  <input
                    value={form.title}
                    onChange={(event) => updateForm("title", event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Block Content</label>
                  <RichTextEditor
                    value={form.body}
                    onChange={(value) => updateForm("body", value)}
                    minHeightClassName="min-h-48"
                    placeholder="One clean line per bullet, or a short paragraph."
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className={labelClass}>Bullets</label>
                    <select
                      value={form.bodyFormat}
                      onChange={(event) => updateForm("bodyFormat", event.target.value as BlockBodyFormat)}
                      className={inputClass}
                    >
                      {bodyFormats.map((format) => (
                        <option key={format.value} value={format.value}>
                          {format.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Boldness</label>
                    <select
                      value={form.textWeight}
                      onChange={(event) => updateForm("textWeight", event.target.value as BlockTextWeight)}
                      className={inputClass}
                    >
                      {textWeights.map((weight) => (
                        <option key={weight.value} value={weight.value}>
                          {weight.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Text Color</label>
                    <select
                      value={form.textColor}
                      onChange={(event) => updateForm("textColor", event.target.value as BlockTextColor)}
                      className={inputClass}
                    >
                      {textColors.map((color) => (
                        <option key={color.value} value={color.value}>
                          {color.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-eden">
                    Formatting preview
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded bg-white px-2 py-1 text-xs font-bold text-brand-lea">
                      {bodyFormats.find((format) => format.value === form.bodyFormat)?.label}
                    </span>
                    <span className="rounded bg-white px-2 py-1 text-xs font-bold text-brand-lea">
                      {textWeights.find((weight) => weight.value === form.textWeight)?.label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded bg-white px-2 py-1 text-xs font-bold text-brand-lea">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: textColors.find((color) => color.value === form.textColor)?.swatch }}
                      />
                      {textColors.find((color) => color.value === form.textColor)?.label}
                    </span>
                  </div>
                  <div className="mt-3 rounded border border-white/70 bg-white px-3 py-3">
                    <BlockBodyPreview
                      value={form.body}
                      bodyFormat={form.bodyFormat}
                      textWeight={form.textWeight}
                      textColor={form.textColor}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Change Note</label>
                  <input
                    value={form.changeNote}
                    onChange={(event) => updateForm("changeNote", event.target.value)}
                    className={inputClass}
                    placeholder="Why this changed"
                  />
                </div>

                {mode === "edit" && selectedBlock && (
                  <div className="rounded border border-brand-gold/45 bg-brand-gold/12 p-4">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea">
                      <GitBranch className="h-4 w-4" />
                      Apply this version
                    </h3>
                    <div className="space-y-2">
                      {[
                        ["NEW_VERSION_ONLY", "Save as a new version only"],
                        ["ALL_LINKED_JOBS", `Apply to all jobs using this block (${selectedBlock.usageCount ?? 0})`],
                        ["SELECTED_JOBS", "Update selected jobs only"]
                      ].map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2 text-sm font-medium text-brand-black/78">
                          <input
                            type="radio"
                            name="adoption"
                            checked={form.adoption === value}
                            onChange={() => updateForm("adoption", value as AdoptionMode)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {form.adoption === "SELECTED_JOBS" && (
                      <div className="mt-4 max-h-56 overflow-auto rounded border border-brand-lea/10 bg-white">
                        {selectedBlock.usedByJobs?.map((job) => (
                          <label
                            key={job.id}
                            className="flex items-center justify-between gap-3 border-b border-brand-lea/8 px-3 py-2 last:border-b-0"
                          >
                            <span className="text-sm font-semibold text-brand-lea">{job.title}</span>
                            <input
                              type="checkbox"
                              checked={form.selectedJobIds.includes(job.id)}
                              onChange={() => toggleSelectedJob(job.id)}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    {form.adoption === "ALL_LINKED_JOBS" && Boolean(selectedBlock.usedByJobs?.length) && (
                      <div className="mt-4 max-h-44 overflow-auto rounded border border-brand-lea/10 bg-white">
                        <div className="border-b border-brand-lea/8 bg-brand-cloudDancer/55 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-eden">
                          Jobs to review before applying
                        </div>
                        {selectedBlock.usedByJobs?.map((job) => (
                          <div
                            key={`${job.id}-apply-all-review`}
                            className="flex items-center justify-between gap-3 border-b border-brand-lea/8 px-3 py-2 last:border-b-0"
                          >
                            <span className="text-sm font-semibold text-brand-lea">{job.title}</span>
                            <span className="rounded bg-brand-cloudDancer px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-eden">
                              {formatEnum(job.status)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-3 text-xs font-semibold text-brand-eden">
                      Safest default: save as a new version. Apply to all updates linked and pinned jobs; custom forks stay custom.
                    </p>
                  </div>
                )}

                {error && <div className="rounded bg-brand-red/10 px-3 py-2 text-sm font-semibold text-brand-red">{error}</div>}
                {message && (
                  <div className="flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    {message}
                  </div>
                )}

                <button
                  type="button"
                  onClick={saveBlock}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded bg-brand-lea px-4 py-2 text-sm font-bold text-white hover:bg-brand-eden disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : mode === "create" ? "Create Block" : "Save Block Changes"}
                </button>
              </div>
            </div>
          ) : selectedBlock ? (
            <>
              <div className="border-b border-brand-lea/10 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
                  Block detail
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-brand-lea">{selectedBlock.name}</h2>
                <p className="mt-2 text-sm leading-6 text-brand-black/68">{selectedBlock.description}</p>
                {selectedBlock.archivedAt && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded bg-brand-grey/12 px-3 py-2 text-sm font-semibold text-brand-grey">
                    <Archive className="h-4 w-4" />
                    Archived blocks stay visible for history but cannot be attached to new jobs.
                  </div>
                )}
                {message && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    {message}
                  </div>
                )}
              </div>

              <div className="space-y-6 p-5">
                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-brand-lea">
                      Current Version
                    </h3>
                    <span className="rounded bg-brand-gold/25 px-2 py-1 text-xs font-bold text-brand-lea">
                      {versionLabel(selectedBlock)}
                    </span>
                  </div>
                  <div className="text-base font-bold text-brand-lea">{selectedBlock.currentVersion?.title}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-eden">
                      {selectedBlock.currentVersion?.bodyFormat === "PARAGRAPH" ? "No bullets" : "Bullet points"}
                    </span>
                    <span className="rounded bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-eden">
                      {selectedBlock.currentVersion?.textWeight?.toLowerCase() ?? "normal"}
                    </span>
                    <span className="rounded bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-eden">
                      {selectedBlock.currentVersion?.textColor?.toLowerCase() ?? "black"}
                    </span>
                  </div>
                  <div className="mt-3">
                    <BlockBodyPreview
                      value={selectedBlock.currentVersion?.body}
                      bodyFormat={selectedBlock.currentVersion?.bodyFormat ?? "BULLET_LIST"}
                      textWeight={selectedBlock.currentVersion?.textWeight ?? "NORMAL"}
                      textColor={selectedBlock.currentVersion?.textColor ?? "BLACK"}
                    />
                  </div>
                </div>

                <div className="rounded border border-brand-lea/10 bg-white p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea">
                        <Users className="h-4 w-4 text-brand-eden" />
                        Apply this block to jobs
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-brand-black/68">
                        Add this reusable block to every job, or choose specific jobs. Existing jobs that already use it are skipped.
                      </p>
                    </div>
                    <span className="rounded bg-brand-sweet/35 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea">
                      {formatEnum(selectedBlock.placement)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-brand-black/78">
                      <input
                        type="radio"
                        name="apply-jobs"
                        checked={applyForm.applyToAll}
                        onChange={() => setApplyForm({ applyToAll: true, selectedJobIds: [] })}
                        disabled={isApplying || Boolean(selectedBlock.archivedAt)}
                      />
                      Apply to all jobs in the system ({jobs.length})
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-brand-black/78">
                      <input
                        type="radio"
                        name="apply-jobs"
                        checked={!applyForm.applyToAll}
                        onChange={() => setApplyForm((current) => ({ ...current, applyToAll: false }))}
                        disabled={isApplying || Boolean(selectedBlock.archivedAt)}
                      />
                      Apply to selected jobs only
                    </label>
                  </div>

                  {!applyForm.applyToAll && (
                    <div className="mt-4 max-h-56 overflow-auto rounded border border-brand-lea/10">
                      {jobs.map((job) => {
                        const alreadyUsesBlock = job.blockInstances.some(
                          (instance) => instance.contentBlockId === selectedBlock.id
                        );

                        return (
                          <label
                            key={`${selectedBlock.id}-apply-${job.id}`}
                            className={`flex items-center justify-between gap-3 border-b border-brand-lea/8 px-3 py-2 last:border-b-0 ${
                              alreadyUsesBlock ? "bg-brand-cloudDancer/45" : "bg-white"
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-semibold text-brand-lea">{job.title}</span>
                              <span className="text-xs text-brand-grey">
                                {alreadyUsesBlock ? "Already using this block" : job.department ?? "No department"}
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              checked={applyForm.selectedJobIds.includes(job.id)}
                              onChange={() => toggleApplyJob(job.id)}
                              disabled={isApplying || alreadyUsesBlock}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={applyBlockToJobs}
                    disabled={
                      isApplying ||
                      Boolean(selectedBlock.archivedAt) ||
                      (!applyForm.applyToAll && !applyForm.selectedJobIds.length)
                    }
                    className="mt-4 inline-flex items-center gap-2 rounded bg-brand-lea px-3 py-2 text-sm font-bold text-white hover:bg-brand-eden disabled:opacity-50"
                  >
                    <Users className="h-4 w-4" />
                    {isApplying ? "Applying..." : applyForm.applyToAll ? "Apply to All Jobs" : "Apply to Selected Jobs"}
                  </button>

                  {selectedBlock.archivedAt && (
                    <p className="mt-3 text-xs font-semibold text-brand-grey">
                      Archived blocks cannot be applied to new jobs.
                    </p>
                  )}
                </div>

                <div className="rounded border border-brand-red/20 bg-brand-red/6 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea">
                        <Archive className="h-4 w-4 text-brand-red" />
                        Archive or delete this block
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-brand-black/70">
                        {selectedBlockUsageCount > 0
                          ? `${selectedBlockUsageCount} job${selectedBlockUsageCount === 1 ? "" : "s"} currently use this block. Review them before archiving or deleting.`
                          : "No jobs currently use this block."}
                      </p>
                    </div>
                    {selectedBlockUsageCount > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded bg-brand-gold/25 px-2 py-1 text-xs font-bold text-brand-lea">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        In use
                      </span>
                    )}
                  </div>

                  {selectedBlockUsageCount > 0 && (
                    <div className="mb-4 max-h-40 overflow-auto rounded border border-brand-lea/10 bg-white">
                      {selectedBlock.usedByJobs?.map((job) => (
                        <div
                          key={`${selectedBlock.id}-retire-${job.id}`}
                          className="flex items-center justify-between gap-3 border-b border-brand-lea/8 px-3 py-2 last:border-b-0"
                        >
                          <span className="text-sm font-semibold text-brand-lea">{job.title}</span>
                          <span className="rounded bg-brand-cloudDancer px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-eden">
                            {formatEnum(job.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex items-start gap-2 text-sm font-semibold text-brand-black/78">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={retirementForm.migrateJobs}
                      onChange={(event) =>
                        setRetirementForm((current) => ({
                          ...current,
                          migrateJobs: event.target.checked
                        }))
                      }
                      disabled={!selectedBlockUsageCount || isRetiring}
                    />
                    Update jobs using this block to a replacement block first
                  </label>

                  <div className="mt-3">
                    <label className={labelClass}>Replacement Block</label>
                    <select
                      value={retirementForm.replacementBlockId}
                      onChange={(event) =>
                        setRetirementForm((current) => ({
                          ...current,
                          replacementBlockId: event.target.value
                        }))
                      }
                      disabled={!retirementForm.migrateJobs || isRetiring}
                      className={inputClass}
                    >
                      <option value="">Choose replacement block...</option>
                      {replacementBlocks.map((block) => (
                        <option key={block.id} value={block.id}>
                          {block.name} - {formatEnum(block.category)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => retireBlock("ARCHIVE")}
                      disabled={isRetiring || Boolean(selectedBlock.archivedAt) || replacementRequired}
                      className="inline-flex items-center gap-2 rounded bg-brand-lea px-3 py-2 text-sm font-bold text-white hover:bg-brand-eden disabled:opacity-50"
                    >
                      <Archive className="h-4 w-4" />
                      {isRetiring ? "Working..." : "Archive Block"}
                    </button>
                    <button
                      type="button"
                      onClick={() => retireBlock("DELETE")}
                      disabled={isRetiring || deleteNeedsReplacement || replacementRequired}
                      className="inline-flex items-center gap-2 rounded border border-brand-red/25 bg-white px-3 py-2 text-sm font-bold text-brand-red hover:bg-brand-red/8 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Block
                    </button>
                  </div>

                  {deleteNeedsReplacement && (
                    <p className="mt-3 text-xs font-semibold text-brand-red">
                      Delete is locked while jobs still use this block. Choose a replacement and update those jobs first,
                      or archive instead.
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea">
                    <Users className="h-4 w-4 text-brand-eden" />
                    Jobs using this block
                  </h3>
                  <div className="divide-y divide-brand-lea/8 overflow-hidden rounded border border-brand-lea/10">
                    {selectedBlock.usedByJobs?.length ? (
                      selectedBlock.usedByJobs.map((job) => (
                        <div
                          key={`${selectedBlock.id}-${job.id}`}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="text-sm font-semibold text-brand-lea">{job.title}</div>
                          <div className="rounded bg-brand-cloudDancer px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-eden">
                            {formatEnum(job.status)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-sm text-brand-grey">No jobs use this block yet.</div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea">
                    <History className="h-4 w-4 text-brand-eden" />
                    Version history
                  </h3>
                  <div className="space-y-2">
                    {selectedBlock.versions?.map((version) => (
                      <div key={version.id} className="rounded border border-brand-lea/10 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-bold text-brand-lea">
                            v{version.versionNumber} - {version.title}
                          </div>
                          {version.id === selectedBlock.currentVersionId && (
                            <span className="rounded bg-brand-gold/22 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea">
                              Current
                            </span>
                          )}
                        </div>
                        {version.changeNote && (
                          <div className="mt-1 text-xs font-medium text-brand-grey">{version.changeNote}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-sm text-brand-grey">No reusable blocks found.</div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}
