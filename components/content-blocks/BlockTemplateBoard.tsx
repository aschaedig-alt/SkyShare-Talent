"use client";

import type { ReactNode } from "react";
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, Layers3, Lock, Users } from "lucide-react";
import type { BlockPlacement, SerializedContentBlock, SerializedJobPost } from "@/lib/types";

type BlockTemplateBoardProps = {
  blocks: SerializedContentBlock[];
  jobs: SerializedJobPost[];
  selectedBlockId: string;
  onSelectBlock: (blockId: string) => void;
  onPlacementChange: (blockId: string, placement: BlockPlacement) => Promise<void>;
};

type PlacementDefinition = {
  key: BlockPlacement;
  label: string;
  description: string;
  tone: string;
};

const placements: PlacementDefinition[] = [
  {
    key: "REQUIRED",
    label: "Required",
    description: "Core sections every job should include.",
    tone: "border-brand-red/25 bg-brand-red/6"
  },
  {
    key: "DEPARTMENT_SPECIFIC",
    label: "Department Specific",
    description: "Blocks shared by teams like FBO, Sales, or Maintenance.",
    tone: "border-brand-eden/25 bg-brand-sweet/24"
  },
  {
    key: "ROLE_SPECIFIC",
    label: "Role Specific",
    description: "Blocks for pilots, technicians, managers, and other roles.",
    tone: "border-brand-lea/18 bg-brand-cloudDancer/70 dark:border-white/10 dark:bg-white/5"
  },
  {
    key: "OPTIONAL",
    label: "Optional",
    description: "Add-ons like perks, notes, and special role language.",
    tone: "border-brand-gold/35 bg-brand-gold/10"
  }
];

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function getBlockCoverage(block: SerializedContentBlock, jobs: SerializedJobPost[]) {
  const usedJobIds = new Set((block.usedByJobs ?? []).map((job) => job.id));
  const activeJobs = jobs.filter((job) => job.status !== "RETIRED");
  const missingAllJobsCount = Math.max(jobs.length - usedJobIds.size, 0);
  const missingActiveJobsCount = Math.max(activeJobs.length - activeJobs.filter((job) => usedJobIds.has(job.id)).length, 0);

  return {
    isInAllJobs: jobs.length > 0 && missingAllJobsCount === 0,
    isInAllActiveJobs: activeJobs.length > 0 && missingActiveJobsCount === 0,
    missingAllJobsCount,
    missingActiveJobsCount
  };
}

function CoverageBadge({ block, jobs }: { block: SerializedContentBlock; jobs: SerializedJobPost[] }) {
  const coverage = getBlockCoverage(block, jobs);

  if (coverage.isInAllJobs) {
    return (
      <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-800">
        All jobs
      </span>
    );
  }

  if (coverage.isInAllActiveJobs) {
    return (
      <span className="rounded bg-brand-sweet/45 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
        All active
      </span>
    );
  }

  return (
    <span className="rounded bg-brand-gold/25 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
      {coverage.missingActiveJobsCount} active missing
    </span>
  );
}

function DroppableLane({
  placement,
  children
}: {
  placement: PlacementDefinition;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `placement:${placement.key}`
  });

  return (
    <section
      ref={setNodeRef}
      className={`min-h-[360px] rounded border p-3 transition ${placement.tone} ${
        isOver ? "ring-2 ring-brand-gold" : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-brand-lea dark:text-slate-100">{placement.label}</h3>
          <p className="mt-1 text-xs leading-5 text-brand-grey dark:text-slate-400">{placement.description}</p>
        </div>
        <Lock className="h-4 w-4 shrink-0 text-brand-eden" />
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DraggableBlockCard({
  block,
  jobs,
  selected,
  onSelect
}: {
  block: SerializedContentBlock;
  jobs: SerializedJobPost[];
  selected: boolean;
  onSelect: (blockId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `block:${block.id}`
  });
  const style = {
    transform: CSS.Translate.toString(transform)
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(block.id)}
      style={style}
      className={`w-full rounded border bg-white p-3 text-left shadow-sm transition hover:shadow-glow dark:bg-[#10243a] ${
        selected ? "border-brand-gold ring-2 ring-brand-gold/30" : "border-brand-lea/10 hover:border-brand-eden/40 dark:border-white/10"
      } ${isDragging ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 cursor-grab rounded border border-brand-lea/10 p-1 text-brand-grey active:cursor-grabbing dark:border-white/10 dark:text-slate-400"
          aria-label="Drag block to another section"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-bold leading-5 text-brand-lea dark:text-slate-100">{block.name}</div>
            <span className="rounded bg-brand-cloudDancer px-1.5 py-0.5 text-[10px] font-bold text-brand-lea dark:bg-white/5 dark:text-slate-100">
              v{block.currentVersion?.versionNumber ?? 1}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-brand-grey dark:text-slate-400">{block.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-brand-lea px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
              {formatEnum(block.category)}
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-brand-cloudDancer px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-eden dark:bg-white/5">
              <Users className="h-3 w-3" />
              {block.usageCount ?? 0}
            </span>
            <CoverageBadge block={block} jobs={jobs} />
            {block.archivedAt && (
              <span className="rounded bg-brand-grey/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-grey dark:text-slate-400">
                Archived
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export function BlockTemplateBoard({
  blocks,
  jobs,
  selectedBlockId,
  onSelectBlock,
  onPlacementChange
}: BlockTemplateBoardProps) {
  const blocksById = new Map(blocks.map((block) => [block.id, block]));

  async function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";

    if (!activeId.startsWith("block:") || !overId.startsWith("placement:")) {
      return;
    }

    const blockId = activeId.replace("block:", "");
    const placement = overId.replace("placement:", "") as BlockPlacement;
    const block = blocksById.get(blockId);

    if (!block || block.placement === placement) {
      return;
    }

    await onPlacementChange(blockId, placement);
  }

  return (
    <div className="space-y-5">
      <div className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
              Template Board
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-brand-lea dark:text-slate-100">Organize reusable blocks by purpose</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-brand-black/68">
              Drag blocks between lanes to decide whether they are required, department specific, role specific, or optional.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded bg-brand-gold/20 px-3 py-2 text-sm font-bold text-brand-lea dark:text-slate-100">
            <Layers3 className="h-4 w-4" />
            {blocks.length} reusable blocks
          </div>
        </div>

        <DndContext onDragEnd={handleDragEnd}>
          <div className="grid gap-4 xl:grid-cols-4">
            {placements.map((placement) => {
              const laneBlocks = blocks.filter((block) => block.placement === placement.key);

              return (
                <DroppableLane key={placement.key} placement={placement}>
                  {laneBlocks.map((block) => (
                    <DraggableBlockCard
                      key={block.id}
                      block={block}
                      jobs={jobs}
                      selected={block.id === selectedBlockId}
                      onSelect={onSelectBlock}
                    />
                  ))}
                  {!laneBlocks.length && (
                    <div className="rounded border border-dashed border-brand-lea/18 bg-white/65 px-3 py-5 text-center text-xs font-semibold text-brand-grey dark:border-white/10 dark:text-slate-400">
                      Drop blocks here
                    </div>
                  )}
                </DroppableLane>
              );
            })}
          </div>
        </DndContext>
      </div>

      <div className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
              Job Coverage Matrix
            </p>
            <h2 className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">See which jobs have which block types</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded bg-brand-cloudDancer px-2.5 py-1.5 text-xs font-bold text-brand-eden dark:bg-white/5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Required lane highlights missing jobs
          </span>
        </div>

        <div className="overflow-auto rounded border border-brand-lea/10 dark:border-white/10">
          <table className="min-w-[820px] w-full border-collapse bg-white text-sm dark:bg-[#10243a]">
            <thead className="bg-brand-cloudDancer/80 text-left text-xs font-bold uppercase tracking-[0.12em] text-brand-eden dark:bg-white/5">
              <tr>
                <th className="px-3 py-3">Job</th>
                <th className="px-3 py-3">Department</th>
                {placements.map((placement) => (
                  <th key={placement.key} className="px-3 py-3">
                    {placement.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-lea/8 dark:divide-white/10">
              {jobs.map((job) => {
                const counts = placements.map((placement) => {
                  const count = job.blockInstances.filter((instance) => {
                    const blockId = instance.contentBlockId;
                    return blockId ? blocksById.get(blockId)?.placement === placement.key : false;
                  }).length;
                  return { placement, count };
                });

                return (
                  <tr key={job.id} className="align-top">
                    <td className="px-3 py-3 font-semibold text-brand-lea dark:text-slate-100">{job.title}</td>
                    <td className="px-3 py-3 text-brand-grey dark:text-slate-400">{job.department ?? "Unassigned"}</td>
                    {counts.map(({ placement, count }) => {
                      const missingRequired = placement.key === "REQUIRED" && count === 0;
                      return (
                        <td key={`${job.id}-${placement.key}`} className="px-3 py-3">
                          <span
                            className={`inline-flex min-w-20 justify-center rounded px-2 py-1 text-xs font-bold uppercase tracking-[0.08em] ${
                              missingRequired
                                ? "bg-brand-red/10 text-brand-red"
                                : count
                                  ? "bg-brand-sweet/45 text-brand-lea dark:text-slate-100"
                                  : "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
                            }`}
                          >
                            {missingRequired ? "Missing" : `${count} block${count === 1 ? "" : "s"}`}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
