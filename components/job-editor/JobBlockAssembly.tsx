"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Blocks,
  CheckCircle2,
  Eye,
  GripVertical,
  Link2,
  Loader2,
  Pencil,
  Pin,
  Plus,
  RotateCw,
  Save,
  Trash2,
  X
} from "lucide-react";
import type { SerializedContentBlock, SerializedJobBlockInstance, SerializedJobPost } from "@/lib/types";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { FormattedJobPost } from "@/components/job-preview/FormattedJobPost";
import { ContentSourceMap } from "@/components/job-editor/ContentSourceMap";
import {
  getInstanceBody,
  getInstanceTitle,
  isInstanceOutdated
} from "@/lib/blocks/sections";

type InstanceUpdatePayload = {
  mode?: "LINKED" | "PINNED_VERSION" | "FORKED_CUSTOM";
  blockVersionId?: string | null;
  customTitle?: string | null;
  customBody?: string | null;
};

type JobBlockAssemblyProps = {
  job: SerializedJobPost;
  availableBlocks: SerializedContentBlock[];
  onJobUpdated: (job: SerializedJobPost) => void;
};

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function DraggableLibraryBlock({ block, isBusy }: { block: SerializedContentBlock; isBusy: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library:${block.id}`,
    disabled: isBusy
  });
  const style = {
    transform: CSS.Translate.toString(transform)
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded border border-brand-lea/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#10243a] ${
        isDragging ? "opacity-70 ring-2 ring-brand-gold" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab rounded border border-brand-lea/10 p-1.5 text-brand-grey active:cursor-grabbing dark:border-white/10 dark:text-slate-400"
          aria-label="Drag block into job post"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-5 text-brand-lea dark:text-slate-100">{block.name}</div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-brand-grey dark:text-slate-400">{block.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-brand-lea px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
              {formatEnum(block.category)}
            </span>
            <span className="rounded bg-brand-sweet/35 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
              {formatEnum(block.placement)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobCanvas({ children, isEmpty }: { children: ReactNode; isEmpty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "job-canvas"
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[220px] rounded border border-dashed p-3 transition ${
        isOver ? "border-brand-gold bg-brand-gold/10" : "border-brand-lea/18 bg-brand-cloudDancer/45 dark:border-white/10 dark:bg-white/5"
      }`}
    >
      {children}
      {isEmpty && (
        <div className="flex min-h-36 items-center justify-center rounded bg-white/70 px-4 py-8 text-center text-sm font-semibold text-brand-grey dark:text-slate-400">
          Drag reusable blocks here to build this job post.
        </div>
      )}
    </div>
  );
}

function SortableBlockRow({
  instance,
  onRemove,
  onAdoptCurrent,
  onUpdate,
  isBusy
}: {
  instance: SerializedJobBlockInstance;
  onRemove: (instanceId: string) => void;
  onAdoptCurrent: (instanceId: string) => void;
  onUpdate: (instanceId: string, payload: InstanceUpdatePayload, successMessage: string) => void;
  isBusy: boolean;
}) {
  const [isEditingCustom, setIsEditingCustom] = useState(instance.mode === "FORKED_CUSTOM");
  const [customTitle, setCustomTitle] = useState(getInstanceTitle(instance));
  const [customBody, setCustomBody] = useState(getInstanceBody(instance));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  const outdated = isInstanceOutdated(instance);

  useEffect(() => {
    setCustomTitle(getInstanceTitle(instance));
    setCustomBody(getInstanceBody(instance));
    setIsEditingCustom(instance.mode === "FORKED_CUSTOM");
  }, [instance]);

  function forkForJob() {
    setCustomTitle(getInstanceTitle(instance));
    setCustomBody(getInstanceBody(instance));
    setIsEditingCustom(true);
  }

  function saveCustom() {
    onUpdate(
      instance.id,
      {
        mode: "FORKED_CUSTOM",
        customTitle,
        customBody
      },
      "Custom job-specific content saved."
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded border border-brand-lea/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#10243a] ${
        isDragging ? "opacity-70 ring-2 ring-brand-gold" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-0.5 cursor-grab rounded border border-brand-lea/10 p-1.5 text-brand-grey active:cursor-grabbing dark:border-white/10 dark:text-slate-400"
          aria-label="Drag to reorder block"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-bold text-brand-lea dark:text-slate-100">{getInstanceTitle(instance)}</div>
            <span className="rounded bg-brand-sweet/35 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
              {formatEnum(instance.mode)}
            </span>
            <span className="rounded bg-brand-cloudDancer px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-eden dark:bg-white/5">
              v{instance.blockVersion?.versionNumber ?? 1}
            </span>
            {outdated && (
              <span className="rounded bg-brand-gold/25 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
                Outdated
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-brand-grey dark:text-slate-400">
            {instance.contentBlock?.name ?? "Custom content"} - {formatEnum(instance.contentBlock?.category ?? "CUSTOM")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-brand-cloudDancer px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-eden dark:bg-white/5">
              {formatEnum(instance.contentBlock?.placement ?? "OPTIONAL")}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAdoptCurrent(instance.id)}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded border border-brand-lea/12 px-2.5 py-1.5 text-xs font-bold text-brand-lea hover:bg-brand-cloudDancer disabled:opacity-60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
              title="Use the current reusable block version"
            >
              <Link2 className="h-3.5 w-3.5" />
              Use linked
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdate(
                  instance.id,
                  {
                    mode: "PINNED_VERSION",
                    blockVersionId: instance.blockVersionId
                  },
                  "This job is pinned to the selected block version."
                )
              }
              disabled={isBusy || !instance.blockVersionId}
              className="inline-flex items-center gap-1.5 rounded border border-brand-lea/12 px-2.5 py-1.5 text-xs font-bold text-brand-lea hover:bg-brand-cloudDancer disabled:opacity-60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
              title="Keep this job on this exact block version"
            >
              <Pin className="h-3.5 w-3.5" />
              Pin version
            </button>
            <button
              type="button"
              onClick={forkForJob}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded border border-brand-lea/12 px-2.5 py-1.5 text-xs font-bold text-brand-lea hover:bg-brand-cloudDancer disabled:opacity-60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
              title="Make a custom copy for this job only"
            >
              <Pencil className="h-3.5 w-3.5" />
              Fork for job
            </button>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {outdated && (
            <button
              type="button"
              onClick={() => onAdoptCurrent(instance.id)}
              disabled={isBusy}
              className="rounded border border-brand-gold/45 bg-brand-gold/12 p-2 text-brand-lea hover:bg-brand-gold/25 disabled:opacity-60 dark:text-slate-100"
              title="Adopt current block version"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(instance.id)}
            disabled={isBusy}
            className="rounded border border-brand-red/20 p-2 text-brand-red hover:bg-brand-red/8 disabled:opacity-60"
            title="Remove block from this job"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isEditingCustom && (
        <div className="mt-3 rounded border border-brand-gold/40 bg-brand-gold/10 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-lea dark:text-slate-100">
              Custom content for this job only
            </div>
            {instance.mode !== "FORKED_CUSTOM" && (
              <button
                type="button"
                onClick={() => setIsEditingCustom(false)}
                className="rounded p-1 text-brand-grey hover:bg-white dark:text-slate-400 dark:bg-[#10243a]"
                aria-label="Cancel custom edit"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <input
            value={customTitle}
            onChange={(event) => setCustomTitle(event.target.value)}
            className="mb-2 w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm outline-none focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-[#10243a]"
            placeholder="Custom section title"
          />
          <RichTextEditor
            value={customBody}
            onChange={setCustomBody}
            minHeightClassName="min-h-28"
            placeholder="Custom body for this job"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={saveCustom}
              disabled={isBusy || !customTitle.trim() || !customBody.trim()}
              className="inline-flex items-center gap-2 rounded bg-brand-lea px-3 py-2 text-xs font-bold text-white hover:bg-brand-eden disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              Save custom
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function JobBlockAssembly({ job, availableBlocks, onJobUpdated }: JobBlockAssemblyProps) {
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [blockQuery, setBlockQuery] = useState("");
  const [localInstances, setLocalInstances] = useState(job.blockInstances);
  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewJob = useMemo(
    () => ({
      ...job,
      blockInstances: localInstances
    }),
    [job, localInstances]
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    setLocalInstances(job.blockInstances);
  }, [job.blockInstances]);

  useEffect(() => {
    setMessage(null);
    setError(null);
    setBusyMessage(null);
  }, [job.id]);

  const attachedBlockIds = new Set(localInstances.map((instance) => instance.contentBlockId).filter(Boolean));
  const normalizedBlockQuery = blockQuery.trim().toLowerCase();
  const attachableBlocks = availableBlocks.filter((block) => {
    if (block.archivedAt || attachedBlockIds.has(block.id)) {
      return false;
    }

    if (!normalizedBlockQuery) {
      return true;
    }

    return [block.name, block.description, block.category, block.scope, block.placement]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedBlockQuery);
  });
  const groupedAttachableBlocks = [
    "REQUIRED",
    "DEPARTMENT_SPECIFIC",
    "ROLE_SPECIFIC",
    "OPTIONAL"
  ].map((placement) => ({
    placement,
    blocks: attachableBlocks.filter((block) => block.placement === placement)
  }));

  async function syncJob(response: Response, successMessage: string) {
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? "Unable to update content blocks.");
    }

    const updatedJob = (await response.json()) as SerializedJobPost;
    setLocalInstances(updatedJob.blockInstances);
    onJobUpdated(updatedJob);
    setMessage(successMessage);
    setError(null);
    setBusyMessage(null);
  }

  async function attachBlock(blockId = selectedBlockId, insertBeforeInstanceId?: string) {
    if (!blockId) {
      return;
    }

    setIsBusy(true);
    setBusyMessage("Saving block to this job...");
    setMessage(null);
    setError(null);
    try {
      await syncJob(
        await fetch(`/api/jobs/${job.id}/blocks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentBlockId: blockId, insertBeforeInstanceId, mode: "LINKED" })
        }),
        "Block attached to this job."
      );
      if (blockId === selectedBlockId) {
        setSelectedBlockId("");
      }
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : "Unable to attach block.");
      setBusyMessage(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function removeBlock(instanceId: string) {
    setIsBusy(true);
    setBusyMessage("Removing block...");
    setMessage(null);
    setError(null);
    try {
      await syncJob(
        await fetch(`/api/job-block-instances/${instanceId}`, {
          method: "DELETE"
        }),
        "Block removed from this job."
      );
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove block.");
      setBusyMessage(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function adoptCurrent(instanceId: string) {
    setIsBusy(true);
    setBusyMessage("Saving linked version...");
    setMessage(null);
    setError(null);
    try {
      await syncJob(
        await fetch(`/api/job-block-instances/${instanceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "LINKED" })
        }),
        "This job now uses the current block version."
      );
    } catch (adoptError) {
      setError(adoptError instanceof Error ? adoptError.message : "Unable to adopt current version.");
      setBusyMessage(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function updateInstance(instanceId: string, payload: InstanceUpdatePayload, successMessage: string) {
    setIsBusy(true);
    setBusyMessage("Saving block changes...");
    setMessage(null);
    setError(null);
    try {
      await syncJob(
        await fetch(`/api/job-block-instances/${instanceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }),
        successMessage
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update block instance.");
      setBusyMessage(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("library:")) {
      const blockId = activeId.replace("library:", "");
      const insertBeforeInstanceId = overId !== "job-canvas" && !overId.startsWith("library:") ? overId : undefined;
      await attachBlock(blockId, insertBeforeInstanceId);
      return;
    }

    if (active.id === over.id || overId === "job-canvas") {
      return;
    }

    const oldIndex = localInstances.findIndex((instance) => instance.id === active.id);
    const newIndex = localInstances.findIndex((instance) => instance.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const nextInstances = arrayMove(localInstances, oldIndex, newIndex);
    setLocalInstances(nextInstances);
    setIsBusy(true);
    setBusyMessage("Saving new block order...");
    setMessage(null);
    setError(null);

    try {
      await syncJob(
        await fetch(`/api/jobs/${job.id}/blocks`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instanceIds: nextInstances.map((instance) => instance.id) })
        }),
        "Block order updated."
      );
    } catch (reorderError) {
      setLocalInstances(job.blockInstances);
      setError(reorderError instanceof Error ? reorderError.message : "Unable to reorder blocks.");
      setBusyMessage(null);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
              Job Section Composer
            </p>
            <h2 className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">Reusable sections and custom forks</h2>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-brand-gold/20 text-brand-lea dark:text-slate-100">
            <Blocks className="h-4.5 w-4.5" />
          </div>
        </div>
      </div>

      <div
        className={`mx-4 mt-4 flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold ${
          isBusy
            ? "border-brand-gold/35 bg-brand-gold/12 text-brand-lea dark:text-slate-100"
            : error
              ? "border-brand-red/25 bg-brand-red/8 text-brand-red"
              : message
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-brand-lea/10 bg-brand-cloudDancer/55 text-brand-eden dark:border-white/10 dark:bg-white/5"
        }`}
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : message ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {isBusy ? busyMessage ?? "Saving..." : error ?? message ?? "Block builder ready. Changes will show here when saved."}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid gap-4 p-4 xl:min-h-[calc(100vh-110px)] xl:grid-cols-[minmax(270px,0.78fr)_minmax(380px,1fr)_minmax(440px,1.1fr)]">
          <aside className="flex min-h-[900px] flex-col rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 xl:min-h-0 dark:border-white/10 dark:bg-white/5">
            <div className="mb-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-eden">
                Drag Block Library
              </p>
              <h3 className="mt-1 text-base font-bold text-brand-lea dark:text-slate-100">Available reusable blocks</h3>
            </div>
            <input
              value={blockQuery}
              onChange={(event) => setBlockQuery(event.target.value)}
              className="mb-3 w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm outline-none focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-[#10243a]"
              placeholder="Search blocks..."
            />
            <div className="mb-3 rounded border border-brand-lea/10 bg-white p-2 dark:border-white/10 dark:bg-[#10243a]">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-brand-eden">
                Quick add
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedBlockId}
                  onChange={(event) => setSelectedBlockId(event.target.value)}
                  className="min-w-0 flex-1 rounded border border-brand-lea/15 bg-white px-2 py-2 text-xs text-brand-lea outline-none focus:border-brand-eden focus:ring-4 focus:ring-brand-sweet/35 dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100"
                >
                  <option value="">Choose...</option>
                  {attachableBlocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => attachBlock()}
                  disabled={!selectedBlockId || isBusy}
                  className="inline-flex items-center gap-1 rounded bg-brand-lea px-2.5 py-2 text-xs font-bold text-white hover:bg-brand-eden disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
              {groupedAttachableBlocks.map((group) =>
                group.blocks.length ? (
                  <div key={group.placement}>
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden">
                      {formatEnum(group.placement)}
                    </div>
                    <div className="space-y-2">
                      {group.blocks.map((block) => (
                        <DraggableLibraryBlock key={block.id} block={block} isBusy={isBusy} />
                      ))}
                    </div>
                  </div>
                ) : null
              )}
              {!attachableBlocks.length && (
                <div className="rounded border border-dashed border-brand-lea/20 bg-white px-3 py-5 text-center text-sm font-semibold text-brand-grey dark:border-white/10 dark:bg-[#10243a] dark:text-slate-400">
                  No more matching blocks to add.
                </div>
              )}
            </div>
          </aside>

          <div className="space-y-4">
            <ContentSourceMap job={previewJob} />

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-eden">Job Canvas</p>
                  <h3 className="mt-1 text-base font-bold text-brand-lea dark:text-slate-100">Drag to set the posting order</h3>
                </div>
                <span className="rounded bg-brand-cloudDancer px-2 py-1 text-xs font-bold text-brand-eden dark:bg-white/5">
                  {localInstances.length} block{localInstances.length === 1 ? "" : "s"}
                </span>
              </div>
              <JobCanvas isEmpty={!localInstances.length}>
                <SortableContext
                  items={localInstances.map((instance) => instance.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {localInstances.map((instance) => (
                      <SortableBlockRow
                        key={instance.id}
                        instance={instance}
                        onRemove={removeBlock}
                        onAdoptCurrent={adoptCurrent}
                        onUpdate={updateInstance}
                        isBusy={isBusy}
                      />
                    ))}
                  </div>
                </SortableContext>
              </JobCanvas>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-brand-grey dark:text-slate-400">
              <Link2 className="h-3.5 w-3.5" />
              Drag from the library into the job. Each block keeps its Required, Department Specific, Role Specific, or Optional lane.
            </div>
          </div>

          <aside className="flex min-h-[900px] flex-col rounded border border-brand-lea/10 bg-white p-3 xl:min-h-0 dark:border-white/10 dark:bg-[#10243a]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-eden">
                  Live Builder Preview
                </p>
                <h3 className="mt-1 text-base font-bold text-brand-lea dark:text-slate-100">Preview after block order changes</h3>
              </div>
              <div className="rounded bg-brand-sweet/35 p-2 text-brand-lea dark:text-slate-100">
                <Eye className="h-4 w-4" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-2 dark:border-white/10 dark:bg-white/5">
              <FormattedJobPost job={previewJob} showVersionBadges={false} showSourceBadges />
            </div>
          </aside>
        </div>
      </DndContext>
    </section>
  );
}
