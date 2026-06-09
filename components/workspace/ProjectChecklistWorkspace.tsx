"use client";

import { useState } from "react";
import { ChevronDown, Check, Clock, AlertCircle } from "lucide-react";
import { clsx } from "clsx";

interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
  status: "completed" | "in-progress" | "upcoming";
  completedDate?: string;
}

interface ChecklistSection {
  phase: string;
  title: string;
  description: string;
  status: "completed" | "in-progress" | "upcoming";
  items: ChecklistItem[];
}

const sections: ChecklistSection[] = [
  {
    phase: "Phase 1",
    title: "Critical Fixes",
    description: "Essential bugs and missing features from prior session",
    status: "completed",
    items: [
      { id: "p1-1", label: "Candidate CSV import reliability", status: "completed", completedDate: "Jun 8" },
      { id: "p1-2", label: "Remove 'prisma-backed' UI text", status: "completed", completedDate: "Jun 8" },
      { id: "p1-3", label: "Candidate inline editing", status: "completed", completedDate: "Jun 8" },
    ]
  },
  {
    phase: "Phase 4.2",
    title: "User Access Controls (RBAC)",
    description: "Role-based access with 4 roles and permission matrix",
    status: "completed",
    items: [
      { id: "p42-1", label: "Define 4 roles: ADMIN, RECRUITER, HIRING_MANAGER, VIEWER", status: "completed", completedDate: "Jun 9" },
      { id: "p42-2", label: "Create permission matrix system", status: "completed", completedDate: "Jun 9" },
      { id: "p42-3", label: "Module access policies", status: "completed", completedDate: "Jun 9" },
      { id: "p42-4", label: "Settings page (users management)", status: "completed", completedDate: "Jun 9" },
      { id: "p42-5", label: "Change user roles API endpoint", status: "completed", completedDate: "Jun 9" },
      { id: "p42-6", label: "Role hierarchy system (ROLE_RANK)", status: "completed", completedDate: "Jun 9" },
      { id: "p42-7", label: "Fix new user default role to VIEWER", status: "completed", completedDate: "Jun 9" },
    ]
  },
  {
    phase: "Phase 4.3",
    title: "User Statistics Dashboard",
    description: "Activity tracking and team analytics",
    status: "completed",
    items: [
      { id: "p43-1", label: "Activity logging system", status: "completed", completedDate: "Jun 9" },
      { id: "p43-2", label: "Activity types (15 event types)", status: "completed", completedDate: "Jun 9" },
      { id: "p43-3", label: "Activity dashboard page", status: "completed", completedDate: "Jun 9" },
      { id: "p43-4", label: "Team contribution analytics", status: "completed", completedDate: "Jun 9" },
      { id: "p43-5", label: "Recent activity feed with filters", status: "completed", completedDate: "Jun 9" },
      { id: "p43-6", label: "Settings navigation tabs", status: "completed", completedDate: "Jun 9" },
    ]
  },
  {
    phase: "Bug Fixes",
    title: "Critical Fixes (Jun 9)",
    description: "Production issues resolved",
    status: "completed",
    items: [
      { id: "bf-1", label: "Google OAuth environment variables", status: "completed", completedDate: "Jun 9", description: "All env vars were empty on Vercel—fixed with CLI" },
      { id: "bf-2", label: "Settings pages serialization errors", status: "completed", completedDate: "Jun 9", description: "Date objects can't pass to client—converted to ISO strings" },
      { id: "bf-3", label: "Database schema sync", status: "completed", completedDate: "Jun 9", description: "UserPermission/ActivityLog tables missing—ran prisma db push" },
      { id: "bf-4", label: "API endpoint URL fix", status: "completed", completedDate: "Jun 9", description: "/api/admin/users/{id}/role → /api/admin/users/{id}" },
      { id: "bf-5", label: "Activity dashboard empty state crashes", status: "completed", completedDate: "Jun 9", description: "Division by zero and missing null checks" },
    ]
  },
  {
    phase: "Phase 5",
    title: "Data & Compliance",
    description: "Database migrations, backups, audit logging",
    status: "upcoming",
    items: [
      { id: "p5-1", label: "Database migration strategy (SQLite → PostgreSQL)", status: "upcoming" },
      { id: "p5-2", label: "Backup and recovery procedures", status: "upcoming" },
      { id: "p5-3", label: "Audit logging for compliance", status: "upcoming" },
      { id: "p5-4", label: "Data export/download features", status: "upcoming" },
    ]
  },
  {
    phase: "Phase 6",
    title: "Advanced Features",
    description: "Performance, search, reporting",
    status: "upcoming",
    items: [
      { id: "p6-1", label: "Advanced filtering & saved searches", status: "upcoming" },
      { id: "p6-2", label: "Custom reporting dashboard", status: "upcoming" },
      { id: "p6-3", label: "Bulk operations (edit, delete, export)", status: "upcoming" },
      { id: "p6-4", label: "Performance optimization", status: "upcoming" },
    ]
  },
];

const StatusBadge = ({ status }: { status: "completed" | "in-progress" | "upcoming" }) => {
  if (status === "completed") {
    return (
      <div className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1">
        <Check className="h-3 w-3 text-emerald-700" />
        <span className="text-xs font-semibold text-emerald-700">Complete</span>
      </div>
    );
  }
  if (status === "in-progress") {
    return (
      <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1">
        <Clock className="h-3 w-3 text-amber-700" />
        <span className="text-xs font-semibold text-amber-700">In Progress</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
      <AlertCircle className="h-3 w-3 text-slate-600" />
      <span className="text-xs font-semibold text-slate-600">Upcoming</span>
    </div>
  );
};

export function ProjectChecklistWorkspace() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.filter(s => s.status !== "upcoming").map(s => s.phase))
  );

  const toggleSection = (phase: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(phase)) {
      newExpanded.delete(phase);
    } else {
      newExpanded.add(phase);
    }
    setExpandedSections(newExpanded);
  };

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const completedItems = sections.reduce(
    (sum, s) => sum + s.items.filter(i => i.status === "completed").length,
    0
  );
  const progressPercent = Math.round((completedItems / totalItems) * 100);

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
            <div className="text-3xl font-bold text-brand-lea">{progressPercent}%</div>
            <div className="text-xs text-brand-grey">{completedItems} of {totalItems} items</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 rounded-full bg-brand-cloudDancer/30 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="mt-3 text-sm text-brand-grey">
          Last updated: June 9, 2026 • Google OAuth fixed • Settings pages working • RBAC & Activity dashboard complete
        </p>
      </section>

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((section) => {
          const isExpanded = expandedSections.has(section.phase);
          const completedCount = section.items.filter(i => i.status === "completed").length;
          const sectionPercent = Math.round((completedCount / section.items.length) * 100);

          return (
            <section key={section.phase} className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
              <button
                onClick={() => toggleSection(section.phase)}
                className="w-full px-5 py-4 hover:bg-brand-cloudDancer/10 transition flex items-center justify-between gap-4"
              >
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-3">
                    <div>
                      <h3 className="font-semibold text-brand-lea">{section.phase}: {section.title}</h3>
                      <p className="mt-1 text-xs text-brand-grey">{section.description}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold text-brand-lea">{sectionPercent}%</div>
                    <div className="text-xs text-brand-grey">{completedCount}/{section.items.length}</div>
                  </div>

                  <StatusBadge status={section.status} />

                  <ChevronDown
                    className={clsx(
                      "h-5 w-5 text-brand-grey transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-brand-lea/10 px-5 py-4 space-y-2">
                  {section.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 text-sm">
                      <div className="flex-shrink-0 mt-0.5">
                        {item.status === "completed" ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100">
                            <Check className="h-3 w-3 text-emerald-700" />
                          </div>
                        ) : item.status === "in-progress" ? (
                          <div className="h-5 w-5 rounded border-2 border-amber-400 border-dashed" />
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
                          {item.completedDate && (
                            <span className="text-xs text-brand-grey">{item.completedDate}</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-1 text-xs text-brand-grey">{item.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Key Notes */}
      <section className="rounded bg-brand-gold/10 border border-brand-gold/30 p-4">
        <h3 className="font-semibold text-brand-lea mb-2">📋 Important Notes</h3>
        <ul className="space-y-1 text-sm text-brand-grey">
          <li>• <strong>Google Auth:</strong> Use Vercel CLI for env vars, not web UI</li>
          <li>• <strong>Database:</strong> Run <code className="bg-white px-1 rounded text-xs">prisma db push</code> after schema changes</li>
          <li>• <strong>Roles:</strong> New users default to VIEWER (read-only)—admins must grant access</li>
          <li>• <strong>Issues:</strong> See FIXES_AND_LESSONS.md for troubleshooting tips</li>
        </ul>
      </section>
    </div>
  );
}
