"use client";

import { useState } from "react";
import { ChevronDown, Check, Clock, Circle } from "lucide-react";
import { clsx } from "clsx";
import { parseRoadmap, type ItemStatus } from "@/lib/roadmap/parse";

const roadmap = parseRoadmap();

const StatusBadge = ({ status }: { status: ItemStatus }) => {
  if (status === "completed") {
    return (
      <div className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 dark:bg-emerald-500/15">
        <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Complete</span>
      </div>
    );
  }
  if (status === "in-progress") {
    return (
      <div className="flex items-center gap-1 rounded bg-amber-100 px-2 py-1 dark:bg-amber-500/15">
        <Clock className="h-3 w-3 text-amber-700 dark:text-amber-300" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">In Progress</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1">
      <Circle className="h-3 w-3 text-slate-500" />
      <span className="text-xs font-semibold text-slate-600">Upcoming</span>
    </div>
  );
};

export function ProjectChecklistWorkspace() {
  // Expand everything that still needs attention; collapse finished sections.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(roadmap.sections.filter((s) => s.status !== "completed").map((s) => s.id))
  );

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Project Progress</p>
            <h2 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Development Roadmap</h2>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-brand-lea dark:text-slate-100">{roadmap.progressPercent}%</div>
            <div className="text-xs text-brand-grey dark:text-slate-400">
              {roadmap.completedItems} of {roadmap.totalItems} items
            </div>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-brand-cloudDancer/30 dark:bg-white/5">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${roadmap.progressPercent}%` }}
          />
        </div>
      </section>

      {/* Sections */}
      <div className="space-y-3">
        {roadmap.sections.map((section) => {
          const isExpanded = expandedSections.has(section.id);
          const completedCount = section.items.filter((i) => i.status === "completed").length;
          const sectionPercent =
            section.items.length === 0 ? 0 : Math.round((completedCount / section.items.length) * 100);

          return (
            <section key={section.id} className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between gap-4 rounded px-5 py-4 transition-shadow hover:shadow-glow dark:bg-white/5"
              >
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-brand-lea dark:text-slate-100">{section.title}</h3>
                  {section.description && <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">{section.description}</p>}
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{sectionPercent}%</div>
                    <div className="text-xs text-brand-grey dark:text-slate-400">
                      {completedCount}/{section.items.length}
                    </div>
                  </div>

                  <StatusBadge status={section.status} />

                  <ChevronDown
                    className={clsx("h-5 w-5 text-brand-grey transition-transform dark:text-slate-400", isExpanded && "rotate-180")}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="space-y-2 border-t border-brand-lea/10 px-5 py-4 dark:border-white/10">
                  {section.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 text-sm">
                      <div className="mt-0.5 flex-shrink-0">
                        {item.status === "completed" ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 dark:bg-emerald-500/15">
                            <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-300" />
                          </div>
                        ) : item.status === "in-progress" ? (
                          <div className="h-5 w-5 rounded border-2 border-dashed border-amber-400" />
                        ) : (
                          <div className="h-5 w-5 rounded border-2 border-slate-300" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={clsx(
                              "font-medium",
                              item.status === "completed" && "text-emerald-700 dark:text-emerald-300",
                              item.status === "in-progress" && "text-amber-700 dark:text-amber-300",
                              item.status === "upcoming" && "text-slate-600 dark:text-slate-400"
                            )}
                          >
                            {item.label}
                          </span>
                          {item.date && <span className="shrink-0 text-xs text-brand-grey dark:text-slate-400">{item.date}</span>}
                        </div>
                        {item.note && <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">{item.note}</p>}
                      </div>
                    </div>
                  ))}
                  {section.items.length === 0 && (
                    <p className="text-xs italic text-brand-grey dark:text-slate-400">No items yet.</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Edit hint */}
      <section className="rounded border border-brand-gold/30 bg-brand-gold/10 p-4 text-sm text-brand-grey dark:text-slate-400">
        <span className="font-semibold text-brand-lea dark:text-slate-100">Want to add or change items?</span> Edit{" "}
        <code className="rounded bg-white px-1 text-xs dark:bg-brand-panel">lib/roadmap/roadmap.ts</code> — use{" "}
        <code className="rounded bg-white px-1 text-xs dark:bg-brand-panel">- [x]</code> for done,{" "}
        <code className="rounded bg-white px-1 text-xs dark:bg-brand-panel">- [~]</code> for in progress,{" "}
        <code className="rounded bg-white px-1 text-xs dark:bg-brand-panel">- [ ]</code> for to-do. Or just jot items in and ask Claude to
        tidy it up.
      </section>
    </div>
  );
}
