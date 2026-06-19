"use client";

import { useState } from "react";
import { ChevronDown, Check, Clock, Circle } from "lucide-react";
import { clsx } from "clsx";
import { parseRoadmap, type ItemStatus } from "@/lib/roadmap/parse";

const roadmap = parseRoadmap();

const StatusBadge = ({ status }: { status: ItemStatus }) => {
  if (status === "completed") {
    return (
      <div className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-1">
        <Check className="h-3 w-3 text-emerald-700" />
        <span className="text-xs font-semibold text-emerald-700">Complete</span>
      </div>
    );
  }
  if (status === "in-progress") {
    return (
      <div className="flex items-center gap-1 rounded bg-amber-100 px-2 py-1">
        <Clock className="h-3 w-3 text-amber-700" />
        <span className="text-xs font-semibold text-amber-700">In Progress</span>
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
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Project Progress</p>
            <h2 className="text-2xl font-semibold text-brand-lea">Development Roadmap</h2>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-brand-lea">{roadmap.progressPercent}%</div>
            <div className="text-xs text-brand-grey">
              {roadmap.completedItems} of {roadmap.totalItems} items
            </div>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-brand-cloudDancer/30">
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
            <section key={section.id} className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 transition hover:bg-brand-cloudDancer/10"
              >
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-brand-lea">{section.title}</h3>
                  {section.description && <p className="mt-1 text-xs text-brand-grey">{section.description}</p>}
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-semibold text-brand-lea">{sectionPercent}%</div>
                    <div className="text-xs text-brand-grey">
                      {completedCount}/{section.items.length}
                    </div>
                  </div>

                  <StatusBadge status={section.status} />

                  <ChevronDown
                    className={clsx("h-5 w-5 text-brand-grey transition-transform", isExpanded && "rotate-180")}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="space-y-2 border-t border-brand-lea/10 px-5 py-4">
                  {section.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 text-sm">
                      <div className="mt-0.5 flex-shrink-0">
                        {item.status === "completed" ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100">
                            <Check className="h-3 w-3 text-emerald-700" />
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
                              item.status === "completed" && "text-emerald-700",
                              item.status === "in-progress" && "text-amber-700",
                              item.status === "upcoming" && "text-slate-600"
                            )}
                          >
                            {item.label}
                          </span>
                          {item.date && <span className="shrink-0 text-xs text-brand-grey">{item.date}</span>}
                        </div>
                        {item.note && <p className="mt-1 text-xs text-brand-grey">{item.note}</p>}
                      </div>
                    </div>
                  ))}
                  {section.items.length === 0 && (
                    <p className="text-xs italic text-brand-grey">No items yet.</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Edit hint */}
      <section className="rounded border border-brand-gold/30 bg-brand-gold/10 p-4 text-sm text-brand-grey">
        <span className="font-semibold text-brand-lea">Want to add or change items?</span> Edit{" "}
        <code className="rounded bg-white px-1 text-xs">lib/roadmap/roadmap.ts</code> — use{" "}
        <code className="rounded bg-white px-1 text-xs">- [x]</code> for done,{" "}
        <code className="rounded bg-white px-1 text-xs">- [~]</code> for in progress,{" "}
        <code className="rounded bg-white px-1 text-xs">- [ ]</code> for to-do. Or just jot items in and ask Claude to
        tidy it up.
      </section>
    </div>
  );
}
