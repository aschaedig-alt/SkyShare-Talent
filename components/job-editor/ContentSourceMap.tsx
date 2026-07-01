"use client";

import { Eye, EyeOff, Layers3, MapPinned } from "lucide-react";
import type { SerializedJobPost } from "@/lib/types";
import { getBlockSourceLabel, getFieldSourceStates, getReusablePublishingBlocks, placementDefinitions } from "@/lib/blocks/content-source";
import { getInstanceTitle, getSectionStatuses, isInstanceOutdated } from "@/lib/blocks/sections";

type ContentSourceMapProps = {
  job: SerializedJobPost;
};

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function SourceBadge({ label, tone = "block" }: { label: string; tone?: "block" | "field" | "hidden" | "warning" }) {
  const toneClass = {
    block: "bg-brand-sweet/40 text-brand-lea dark:text-slate-100",
    field: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    hidden: "bg-brand-grey/12 text-brand-grey dark:text-slate-400",
    warning: "bg-brand-gold/22 text-brand-lea dark:text-slate-100"
  }[tone];

  return (
    <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${toneClass}`}>
      {label}
    </span>
  );
}

export function ContentSourceMap({ job }: ContentSourceMapProps) {
  const publishingBlocks = getReusablePublishingBlocks(job);
  const fieldSources = getFieldSourceStates(job);
  const missingRequiredSections = getSectionStatuses(job).filter((section) => section.required && !section.instances.length);
  const hiddenFieldCount = fieldSources.filter((source) => source.isHiddenByBlock).length;

  return (
    <section className="rounded border border-brand-lea/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-brand-panel">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-eden">
            <MapPinned className="h-4 w-4" />
            Content Source Map
          </p>
          <h3 className="mt-1 text-base font-bold text-brand-lea dark:text-slate-100">What will publish for this job</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <SourceBadge label={`${publishingBlocks.length} blocks`} />
          <SourceBadge label={`${fieldSources.length - hiddenFieldCount} fields`} tone="field" />
          {hiddenFieldCount > 0 && <SourceBadge label={`${hiddenFieldCount} hidden`} tone="hidden" />}
          {missingRequiredSections.length > 0 && (
            <SourceBadge label={`${missingRequiredSections.length} missing`} tone="warning" />
          )}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
        {placementDefinitions.map((placement) => {
          const blocks = publishingBlocks.filter((instance) => instance.contentBlock?.placement === placement.key);

          return (
            <div key={placement.key} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-2 dark:border-white/10 dark:bg-white/5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-lea dark:text-slate-100">{placement.label}</div>
                  <p className="mt-1 text-[11px] leading-4 text-brand-grey dark:text-slate-400">{placement.description}</p>
                </div>
                <span className="rounded bg-white px-2 py-1 text-[10px] font-bold text-brand-eden dark:bg-brand-panel">
                  {blocks.length}
                </span>
              </div>

              <div className="space-y-1.5">
                {blocks.map((instance) => {
                  const outdated = isInstanceOutdated(instance);

                  return (
                    <div key={instance.id} className="rounded border border-brand-lea/8 bg-white px-2 py-2 dark:border-white/10 dark:bg-brand-panel">
                      <div className="text-xs font-bold leading-5 text-brand-lea dark:text-slate-100">{getInstanceTitle(instance)}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <SourceBadge label={getBlockSourceLabel(instance)} tone={instance.mode === "FORKED_CUSTOM" ? "warning" : "block"} />
                        <SourceBadge label={formatEnum(instance.contentBlock?.category ?? "CUSTOM")} tone="hidden" />
                        {outdated && <SourceBadge label="Older Version" tone="warning" />}
                      </div>
                    </div>
                  );
                })}

                {!blocks.length && (
                  <div className="rounded border border-dashed border-brand-lea/15 bg-white/70 px-2 py-3 text-center text-xs font-semibold leading-5 text-brand-grey dark:border-white/10 dark:text-slate-400">
                    No attached blocks in this lane.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/35 p-2 dark:border-white/10 dark:bg-white/5">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-eden">
          <Layers3 className="h-4 w-4" />
          Field Fallbacks
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {fieldSources.map((source) => (
            <div
              key={source.key}
              className={`rounded border px-2.5 py-2 ${
                source.isHiddenByBlock ? "border-brand-grey/18 bg-white/70" : "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/65 dark:bg-emerald-500/15"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-brand-lea dark:text-slate-100">{source.label}</div>
                  <p className="mt-1 text-[11px] leading-4 text-brand-grey dark:text-slate-400">{source.detail}</p>
                </div>
                {source.isHiddenByBlock ? (
                  <EyeOff className="h-4 w-4 shrink-0 text-brand-grey dark:text-slate-400" />
                ) : (
                  <Eye className="h-4 w-4 shrink-0 text-emerald-700" />
                )}
              </div>
              <div className="mt-2">
                <SourceBadge label={source.sourceLabel} tone={source.isHiddenByBlock ? "hidden" : "field"} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

