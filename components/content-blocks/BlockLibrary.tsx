"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  GitBranch,
  History,
  LayoutGrid,
  Loader2,
  Plus,
  Save,
  Search,
  Users
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
import { RichText, RichTextParagraphs, RichTextMixed } from "@/components/shared/RichText";
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
  { value: "BULLET_LIST", label: "All bullet points" },
  { value: "PARAGRAPH", label: "All paragraphs (no bullets)" },
  { value: "MIXED", label: "Bullets + text (mix per line)" }
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

type GroupDim = "CATEGORY" | "SCOPE" | "PLACEMENT";
type SortKey = "NAME" | "USAGE" | "UPDATED";

const groupDims: Array<{ value: GroupDim; label: string }> = [
  { value: "CATEGORY", label: "Category" },
  { value: "SCOPE", label: "Scope" },
  { value: "PLACEMENT", label: "Placement" }
];

const sortKeys: Array<{ value: SortKey; label: string }> = [
  { value: "NAME", label: "Name (A–Z)" },
  { value: "USAGE", label: "Most used" },
  { value: "UPDATED", label: "Recently updated" }
];

function dimValue(block: SerializedContentBlock, dim: GroupDim): string {
  return dim === "CATEGORY" ? block.category : dim === "SCOPE" ? block.scope : block.placement;
}

function dimOrder(dim: GroupDim): string[] {
  return dim === "CATEGORY" ? categories : dim === "SCOPE" ? scopes : placements.map((p) => p.value);
}

function dimLabel(dim: GroupDim, value: string): string {
  if (dim === "PLACEMENT") {
    return placements.find((p) => p.value === value)?.label ?? formatEnum(value);
  }
  return formatEnum(value);
}

function sortBlocks(list: SerializedContentBlock[], key: SortKey): SerializedContentBlock[] {
  const copy = [...list];
  if (key === "USAGE") {
    copy.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0));
  } else if (key === "UPDATED") {
    copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } else {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  }
  return copy;
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
            ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
            : "bg-brand-cloudDancer text-brand-eden dark:bg-white/5"
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
            ? "bg-brand-sweet/45 text-brand-lea dark:text-slate-100"
            : "bg-brand-gold/25 text-brand-lea dark:text-slate-100"
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
  "w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-black outline-none transition placeholder:text-brand-grey/70 focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-brand-eden";

const blockColorClasses: Record<BlockTextColor, string> = {
  BLACK: "text-brand-black/82 dark:text-slate-300",
  LEA: "text-brand-lea dark:text-slate-100",
  EDEN: "text-brand-eden",
  GREY: "text-brand-grey dark:text-slate-400",
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
    return <p className="text-sm italic text-brand-grey dark:text-slate-400">No clean text entered yet.</p>;
  }

  if (bodyFormat === "MIXED") {
    return <RichTextMixed value={value} textClass={textClass} />;
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
  const [groupBy, setGroupBy] = useState<GroupDim>("CATEGORY");
  const [sortBy, setSortBy] = useState<SortKey>("NAME");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedBlockId, setSelectedBlockId] = useState(initialBlocks[0]?.id ?? "");
  const [mode, setMode] = useState<EditorMode>("edit");
  const [form, setForm] = useState(emptyForm);
  const [applyForm, setApplyForm] = useState(emptyApplyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

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
  const isWorking = isSaving || isDuplicating || isApplying;
  const activityMessage = isSaving
    ? "Saving block changes..."
    : isDuplicating
      ? "Duplicating block..."
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
    setMode("edit");
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
      setMode("edit");
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

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const block of filteredBlocks) {
      const value = dimValue(block, groupBy);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const order = dimOrder(groupBy);
    return [...counts.keys()]
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map((value) => ({ value, label: dimLabel(groupBy, value), count: counts.get(value) ?? 0 }));
  }, [filteredBlocks, groupBy]);

  const groupedBlocks = useMemo(() => {
    const visible = activeFilter
      ? filteredBlocks.filter((block) => dimValue(block, groupBy) === activeFilter)
      : filteredBlocks;
    const groups = new Map<string, SerializedContentBlock[]>();
    for (const block of visible) {
      const value = dimValue(block, groupBy);
      const existing = groups.get(value);
      if (existing) {
        existing.push(block);
      } else {
        groups.set(value, [block]);
      }
    }
    const order = dimOrder(groupBy);
    return [...groups.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([value, list]) => ({
        key: `${groupBy}:${value}`,
        value,
        label: dimLabel(groupBy, value),
        blocks: sortBlocks(list, sortBy)
      }));
  }, [filteredBlocks, groupBy, sortBy, activeFilter]);

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function blockButton(block: SerializedContentBlock) {
    return (
      <button
        key={block.id}
        type="button"
        onClick={() => selectBlock(block.id)}
        className={`w-full px-4 py-4 text-left transition hover:shadow-glow ${
          selectedBlock?.id === block.id && mode !== "create" ? "bg-brand-sweet/35" : "hover:bg-brand-cloudDancer/70 dark:bg-white/5"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-bold text-brand-lea dark:text-slate-100">{block.name}</div>
              {block.archivedAt && (
                <span className="rounded bg-brand-grey/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-grey dark:text-slate-400">
                  Archived
                </span>
              )}
            </div>
            <div className="mt-1 text-xs leading-5 text-brand-grey dark:text-slate-400">{block.description}</div>
          </div>
          <div className="rounded bg-brand-cloudDancer px-2 py-1 text-xs font-bold text-brand-lea dark:bg-white/5 dark:text-slate-100">
            {versionLabel(block)}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-brand-lea px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
            {formatEnum(block.category)}
          </span>
          <span className="rounded bg-brand-gold/22 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
            {formatEnum(block.scope)}
          </span>
          <span className="rounded bg-brand-sweet/35 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
            {formatEnum(block.placement)}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-brand-cloudDancer px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-eden dark:bg-white/5">
            <Users className="h-3 w-3" />
            {block.usageCount ?? 0} jobs
          </span>
          <BlockCoverageBadges block={block} jobs={jobs} />
        </div>
      </button>
    );
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
            <Button variant="toolbar" onClick={duplicateBlock} disabled={!selectedBlock || isDuplicating}>
              <Copy className="h-4 w-4" />
              {isDuplicating ? "Duplicating..." : "Duplicate"}
            </Button>
            <Button variant="gold" onClick={() => setMode("create")}>
              <Plus className="h-4 w-4" />
              Create New Block
            </Button>
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
              className={`inline-flex items-center gap-2 rounded px-3.5 py-2 text-sm font-bold transition hover:shadow-glow ${
                active
                  ? "bg-brand-lea text-white shadow-sm"
                  : "border border-brand-lea/10 bg-white text-brand-lea hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
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
              ? "border-brand-gold/35 bg-brand-gold/12 text-brand-lea dark:text-slate-100"
              : error
                ? "border-brand-red/25 bg-brand-red/8 text-brand-red"
                : "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
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
      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="border-b border-brand-lea/10 p-4 dark:border-white/10">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
              Find reusable content
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-brand-grey dark:text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="Search name, category, scope, placement..."
              />
            </div>
          </div>

          <div className="space-y-3 border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Group</span>
              <select
                value={groupBy}
                onChange={(event) => {
                  setGroupBy(event.target.value as GroupDim);
                  setActiveFilter(null);
                }}
                className="rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-xs font-semibold text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              >
                {groupDims.map((dim) => (
                  <option key={dim.value} value={dim.value}>
                    {dim.label}
                  </option>
                ))}
              </select>
              <span className="ml-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Sort</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortKey)}
                className="rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-xs font-semibold text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              >
                {sortKeys.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {sort.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveFilter(null)}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition hover:shadow-glow ${
                  activeFilter === null ? "bg-brand-lea text-white" : "bg-brand-cloudDancer text-brand-grey hover:bg-brand-cloudDancer/70 dark:bg-white/5 dark:text-slate-400"
                }`}
              >
                All · {filteredBlocks.length}
              </button>
              {chips.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setActiveFilter(activeFilter === chip.value ? null : chip.value)}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold transition hover:shadow-glow ${
                    activeFilter === chip.value ? "bg-brand-lea text-white" : "bg-brand-cloudDancer text-brand-grey hover:bg-brand-cloudDancer/70 dark:bg-white/5 dark:text-slate-400"
                  }`}
                >
                  {chip.label} · {chip.count}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[640px] overflow-y-auto">
            {groupedBlocks.length === 0 ? (
              <div className="px-4 py-6 text-sm text-brand-grey dark:text-slate-400">No blocks match.</div>
            ) : (
              groupedBlocks.map((group) => {
                const collapsed = collapsedGroups.has(group.key);
                return (
                  <div key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="sticky top-0 z-10 flex w-full items-center justify-between bg-brand-cloudDancer/85 px-4 py-2.5 text-left backdrop-blur transition hover:bg-brand-cloudDancer hover:shadow-glow dark:bg-white/5"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-lea dark:text-slate-100">
                        {group.label} <span className="text-brand-grey dark:text-slate-400">· {group.blocks.length}</span>
                      </span>
                      {collapsed ? (
                        <ChevronRight className="h-4 w-4 text-brand-grey dark:text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-brand-grey dark:text-slate-400" />
                      )}
                    </button>
                    {!collapsed && <div className="divide-y divide-brand-lea/8 dark:divide-white/10">{group.blocks.map(blockButton)}</div>}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          {selectedBlock || mode === "create" ? (
            <div className={mode === "create" ? "" : "grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,1fr)]"}>
              <div className="min-w-0">
              <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-brand-lea/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-brand-panel">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
                    {mode === "create" ? "Create block" : "Edit block"}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-brand-lea dark:text-slate-100">
                    {mode === "create" ? "New reusable content block" : selectedBlock?.name}
                  </h2>
                  {mode !== "create" && selectedBlock ? (
                    <a
                      href="/settings/content-blocks"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400"
                    >
                      Used by {selectedBlock.usageCount ?? 0} jobs · manage ›
                    </a>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveBlock}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded bg-brand-lea px-4 py-2 text-sm font-bold text-white hover:bg-brand-eden disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : mode === "create" ? "Create" : "Save"}
                  </button>
                </div>
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
                    enableBulletLine={form.bodyFormat === "MIXED"}
                  />
                  {form.bodyFormat === "MIXED" && (
                    <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-400">
                      Start a line with <span className="font-semibold">-</span> to make it a bullet; other lines stay as
                      paragraphs. Mix freely in one block.
                    </p>
                  )}
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
                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-eden">
                    Formatting preview
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded bg-white px-2 py-1 text-xs font-bold text-brand-lea dark:bg-brand-panel dark:text-slate-100">
                      {bodyFormats.find((format) => format.value === form.bodyFormat)?.label}
                    </span>
                    <span className="rounded bg-white px-2 py-1 text-xs font-bold text-brand-lea dark:bg-brand-panel dark:text-slate-100">
                      {textWeights.find((weight) => weight.value === form.textWeight)?.label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded bg-white px-2 py-1 text-xs font-bold text-brand-lea dark:bg-brand-panel dark:text-slate-100">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: textColors.find((color) => color.value === form.textColor)?.swatch }}
                      />
                      {textColors.find((color) => color.value === form.textColor)?.label}
                    </span>
                  </div>
                  <div className="mt-3 rounded border border-white/70 bg-white px-3 py-3 dark:bg-brand-panel">
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
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea dark:text-slate-100">
                      <GitBranch className="h-4 w-4" />
                      Apply this version
                    </h3>
                    <div className="space-y-2">
                      {[
                        ["NEW_VERSION_ONLY", "Save as a new version only"],
                        ["ALL_LINKED_JOBS", `Apply to all jobs using this block (${selectedBlock.usageCount ?? 0})`],
                        ["SELECTED_JOBS", "Update selected jobs only"]
                      ].map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2 text-sm font-medium text-brand-black/78 dark:text-slate-300">
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
                      <div className="mt-4 max-h-56 overflow-auto rounded border border-brand-lea/10 bg-white dark:border-white/10 dark:bg-brand-panel">
                        {selectedBlock.usedByJobs?.map((job) => (
                          <label
                            key={job.id}
                            className="flex items-center justify-between gap-3 border-b border-brand-lea/8 px-3 py-2 last:border-b-0 dark:border-white/10"
                          >
                            <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{job.title}</span>
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
                      <div className="mt-4 max-h-44 overflow-auto rounded border border-brand-lea/10 bg-white dark:border-white/10 dark:bg-brand-panel">
                        <div className="border-b border-brand-lea/8 bg-brand-cloudDancer/55 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand-eden dark:border-white/10 dark:bg-white/5">
                          Jobs to review before applying
                        </div>
                        {selectedBlock.usedByJobs?.map((job) => (
                          <div
                            key={`${job.id}-apply-all-review`}
                            className="flex items-center justify-between gap-3 border-b border-brand-lea/8 px-3 py-2 last:border-b-0 dark:border-white/10"
                          >
                            <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{job.title}</span>
                            <span className="rounded bg-brand-cloudDancer px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-eden dark:bg-white/5">
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
                  <div className="flex items-center gap-2 rounded bg-emerald-50 dark:bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
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
            {mode !== "create" && selectedBlock ? (
              <aside className="space-y-5 border-t border-brand-lea/10 p-5 xl:border-l xl:border-t-0 dark:border-white/10">

                <div className="rounded border border-brand-lea/10 bg-white p-4 dark:border-white/10 dark:bg-brand-panel">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea dark:text-slate-100">
                        <Users className="h-4 w-4 text-brand-eden" />
                        Apply this block to jobs
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-brand-black/68 dark:text-slate-300">
                        Add this reusable block to every job, or choose specific jobs. Existing jobs that already use it are skipped.
                      </p>
                    </div>
                    <span className="rounded bg-brand-sweet/35 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
                      {formatEnum(selectedBlock.placement)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-brand-black/78 dark:text-slate-300">
                      <input
                        type="radio"
                        name="apply-jobs"
                        checked={applyForm.applyToAll}
                        onChange={() => setApplyForm({ applyToAll: true, selectedJobIds: [] })}
                        disabled={isApplying || Boolean(selectedBlock.archivedAt)}
                      />
                      Apply to all jobs in the system ({jobs.length})
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-brand-black/78 dark:text-slate-300">
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
                    <div className="mt-4 max-h-56 overflow-auto rounded border border-brand-lea/10 dark:border-white/10">
                      {jobs.map((job) => {
                        const alreadyUsesBlock = job.blockInstances.some(
                          (instance) => instance.contentBlockId === selectedBlock.id
                        );

                        return (
                          <label
                            key={`${selectedBlock.id}-apply-${job.id}`}
                            className={`flex items-center justify-between gap-3 border-b border-brand-lea/8 px-3 py-2 last:border-b-0 dark:border-white/10 ${
                              alreadyUsesBlock ? "bg-brand-cloudDancer/45" : "bg-white dark:bg-brand-panel"
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-semibold text-brand-lea dark:text-slate-100">{job.title}</span>
                              <span className="text-xs text-brand-grey dark:text-slate-400">
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
                    <p className="mt-3 text-xs font-semibold text-brand-grey dark:text-slate-400">
                      Archived blocks cannot be applied to new jobs.
                    </p>
                  )}
                </div>


                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea dark:text-slate-100">
                    <History className="h-4 w-4 text-brand-eden" />
                    Version history
                  </h3>
                  <div className="space-y-2">
                    {selectedBlock.versions?.map((version) => (
                      <div key={version.id} className="rounded border border-brand-lea/10 px-3 py-2 dark:border-white/10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-bold text-brand-lea dark:text-slate-100">
                            v{version.versionNumber} - {version.title}
                          </div>
                          {version.id === selectedBlock.currentVersionId && (
                            <span className="rounded bg-brand-gold/22 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
                              Current
                            </span>
                          )}
                        </div>
                        {version.changeNote && (
                          <div className="mt-1 text-xs font-medium text-brand-grey dark:text-slate-400">{version.changeNote}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            ) : null}
            </div>
          ) : (
            <div className="p-8 text-sm text-brand-grey dark:text-slate-400">No reusable blocks found.</div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}
