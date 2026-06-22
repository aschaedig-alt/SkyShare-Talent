"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { FileText, Briefcase, StickyNote, CalendarClock, History, Plane } from "lucide-react";
import { CandidateDocuments } from "@/components/candidates/CandidateDocuments";
import { DocumentChecklist } from "@/components/candidates/DocumentChecklist";
import { CurrencyPanel } from "@/components/candidates/CurrencyPanel";
import { ProConPanel } from "@/components/candidates/ProConPanel";
import { CandidateNotes } from "@/components/candidates/CandidateNotes";
import { CandidateActivityTimeline } from "@/components/candidates/CandidateActivityTimeline";
import { FlightProfilePanel } from "@/components/candidates/FlightProfilePanel";
import { EditableGrid, type GridItem } from "@/components/shared/EditableGrid";
import { TravelPanel } from "@/components/travel/TravelPanel";
import type { WidgetInstance } from "@/lib/data/page-layout";
import type { CandidateProfileData } from "@/lib/data/candidates";
import type { TravelTripView, TravelerLoyalty } from "@/lib/data/travel";

type CandidateProfileWorkspaceProps = {
  candidate: CandidateProfileData;
  canEdit?: boolean;
  savedLayout?: GridItem[] | null;
  savedWidgets?: WidgetInstance[] | null;
  travelTrips?: TravelTripView[];
  travelLoyalty?: TravelerLoyalty;
};

// Default arrangement of the Documents-tab boxes (mirrors the current 240px
// sidebar + wide document viewer); admins can drag/resize from here.
const PROFILE_DEFAULT_LAYOUT: GridItem[] = [
  { i: "doc-viewer", x: 3, y: 0, w: 9, h: 34 },
  { i: "flight", x: 0, y: 0, w: 3, h: 8 },
  { i: "checklist", x: 0, y: 8, w: 3, h: 7 },
  { i: "currency", x: 0, y: 15, w: 3, h: 6 },
  { i: "proscons", x: 0, y: 21, w: 3, h: 7 },
  { i: "contact", x: 0, y: 28, w: 3, h: 4 },
  { i: "record", x: 0, y: 32, w: 3, h: 5 }
];

type ProfileTab = "documents" | "applications" | "notes" | "interviews" | "activity" | "travel";

type CandidateEditForm = {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  currentTitle: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  status: string;
  stage: string | null;
  source: string | null;
  owner: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm dark:border-white/10 dark:bg-white/5">
      <div className="font-semibold text-brand-lea dark:text-slate-100">{title}</div>
      <p className="mt-1 text-brand-grey dark:text-slate-400">{detail}</p>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100";
const labelClass = "text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400";

export function CandidateProfileWorkspace({
  candidate: initialCandidate,
  canEdit = false,
  savedLayout = null,
  savedWidgets = null,
  travelTrips = [],
  travelLoyalty
}: CandidateProfileWorkspaceProps) {
  const [candidate, setCandidate] = useState<CandidateProfileData>(initialCandidate);
  const [activeTab, setActiveTab] = useState<ProfileTab>("documents");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<CandidateEditForm>(() => ({
    displayName: initialCandidate.displayName,
    firstName: initialCandidate.firstName,
    lastName: initialCandidate.lastName,
    currentTitle: initialCandidate.currentTitle,
    primaryEmail: initialCandidate.primaryEmail,
    primaryPhone: initialCandidate.primaryPhone,
    status: initialCandidate.status,
    stage: initialCandidate.stage,
    source: initialCandidate.source,
    owner: initialCandidate.owner
  }));

  // Sync local state when server data refreshes (e.g. after a document add/delete)
  useEffect(() => {
    setCandidate(initialCandidate);
  }, [initialCandidate]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/candidates/${initialCandidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to update candidate");
      }
      const updated = await response.json();
      setCandidate(updated);
      setIsEditing(false);
      setSuccess("Candidate updated.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      displayName: candidate.displayName,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      currentTitle: candidate.currentTitle,
      primaryEmail: candidate.primaryEmail,
      primaryPhone: candidate.primaryPhone,
      status: candidate.status,
      stage: candidate.stage,
      source: candidate.source,
      owner: candidate.owner
    });
    setIsEditing(false);
    setError(null);
  };

  const tabs: Array<{ id: ProfileTab; label: string; icon: typeof FileText; count: number }> = [
    { id: "documents", label: "Documents", icon: FileText, count: candidate.files.length },
    { id: "applications", label: "Applications", icon: Briefcase, count: candidate.applications.length },
    { id: "notes", label: "Notes", icon: StickyNote, count: candidate.notes.length },
    { id: "interviews", label: "Interviews", icon: CalendarClock, count: candidate.interviews.length },
    { id: "travel", label: "Travel", icon: Plane, count: travelTrips.length },
    { id: "activity", label: "Activity", icon: History, count: candidate.activity.length }
  ];

  const statusActive = candidate.status === "ACTIVE";

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      {error && <div className="rounded border border-red-500/30 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded border border-green-500/30 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {/* Header */}
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <Link href="/candidates" className="text-xs font-semibold text-brand-eden hover:text-brand-lea dark:text-slate-100">
          ← Back to candidates
        </Link>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-sweet/25 text-lg font-semibold text-brand-lea dark:text-slate-100">
            {initials(candidate.displayName) || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">{candidate.displayName}</h1>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              {[candidate.currentTitle, candidate.stage].filter(Boolean).join(" · ") || "No title recorded"}
            </p>
            {candidate.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {candidate.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-brand-sweet/60 bg-brand-sweet/18 px-2.5 py-1 text-[11px] font-semibold text-brand-lea dark:text-slate-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                "rounded px-3 py-1 text-xs font-semibold",
                statusActive ? "bg-emerald-100 text-emerald-800" : "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
              )}
            >
              {candidate.status}
            </span>
            <button
              onClick={() => (isEditing ? handleCancel() : setIsEditing(true))}
              disabled={isSaving}
              className="rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50 dark:text-slate-100"
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
          </div>
        </div>
      </section>

      {isEditing ? (
        /* Edit form */
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Edit candidate</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Display name</label>
              <input value={formData.displayName} onChange={(e) => setFormData({ ...formData, displayName: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Current title</label>
              <input value={formData.currentTitle ?? ""} onChange={(e) => setFormData({ ...formData, currentTitle: e.target.value || null })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>First name</label>
              <input value={formData.firstName ?? ""} onChange={(e) => setFormData({ ...formData, firstName: e.target.value || null })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Last name</label>
              <input value={formData.lastName ?? ""} onChange={(e) => setFormData({ ...formData, lastName: e.target.value || null })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={formData.primaryEmail ?? ""} onChange={(e) => setFormData({ ...formData, primaryEmail: e.target.value || null })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input type="tel" value={formData.primaryPhone ?? ""} onChange={(e) => setFormData({ ...formData, primaryPhone: e.target.value || null })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className={inputClass}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Stage</label>
              <input value={formData.stage ?? ""} onChange={(e) => setFormData({ ...formData, stage: e.target.value || null })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Owner</label>
              <input value={formData.owner ?? ""} onChange={(e) => setFormData({ ...formData, owner: e.target.value || null })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Source</label>
              <input value={formData.source ?? ""} onChange={(e) => setFormData({ ...formData, source: e.target.value || null })} className={inputClass} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSave} disabled={isSaving} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white hover:bg-brand-eden disabled:opacity-50">
              {isSaving ? "Saving…" : "Save changes"}
            </button>
            <button onClick={handleCancel} disabled={isSaving} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
              Cancel
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Profile tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-brand-lea/15 dark:border-white/10">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition hover:shadow-glow",
                    active ? "border-brand-lea text-brand-lea" : "border-transparent text-brand-grey hover:text-brand-lea dark:text-slate-400"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  <span className="rounded bg-brand-cloudDancer/70 px-1.5 py-0.5 text-[10px] font-bold text-brand-grey dark:bg-white/5 dark:text-slate-400">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Documents tab — the same boxes as before, now a resizable board (Edit layout) */}
          {activeTab === "documents" && (
            <EditableGrid
              pageKey="candidate-profile"
              canEdit={canEdit}
              savedLayout={savedLayout}
              savedWidgets={savedWidgets}
              defaultLayout={PROFILE_DEFAULT_LAYOUT}
              panels={[
                {
                  id: "doc-viewer",
                  title: "Documents",
                  node: (
                    <div className="h-full overflow-auto [&>*]:min-h-full">
                      <CandidateDocuments candidateId={candidate.id} files={candidate.files} />
                    </div>
                  )
                },
                {
                  id: "flight",
                  title: "Flight profile",
                  node: (
                    <div className="h-full overflow-auto [&>*]:min-h-full">
                      <FlightProfilePanel candidateId={candidate.id} metrics={candidate.metrics} hasDocuments={candidate.files.length > 0} />
                    </div>
                  )
                },
                {
                  id: "checklist",
                  title: "Document checklist",
                  node: (
                    <div className="h-full overflow-auto [&>*]:min-h-full">
                      <DocumentChecklist files={candidate.files} />
                    </div>
                  )
                },
                {
                  id: "currency",
                  title: "Currency",
                  node: (
                    <div className="h-full overflow-auto [&>*]:min-h-full">
                      <CurrencyPanel files={candidate.files} />
                    </div>
                  )
                },
                {
                  id: "proscons",
                  title: "Pros & cons",
                  node: (
                    <div className="h-full overflow-auto [&>*]:min-h-full">
                      <ProConPanel candidateId={candidate.id} initialPros={candidate.pros} initialCons={candidate.cons} />
                    </div>
                  )
                },
                {
                  id: "contact",
                  title: "Contact",
                  node: (
                    <div className="h-full overflow-auto rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Contact</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div>
                          <div className={labelClass}>Email</div>
                          <div className="mt-0.5 break-words text-brand-lea dark:text-slate-100">{candidate.primaryEmail ?? "No email"}</div>
                        </div>
                        <div>
                          <div className={labelClass}>Phone</div>
                          <div className="mt-0.5 text-brand-lea dark:text-slate-100">{candidate.primaryPhone ?? "No phone"}</div>
                        </div>
                      </div>
                    </div>
                  )
                },
                {
                  id: "record",
                  title: "Record",
                  node: (
                    <div className="h-full overflow-auto rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Record</p>
                      <div className="mt-3 space-y-1.5 text-sm text-brand-grey dark:text-slate-400">
                        <div>Owner: {candidate.owner ?? "Unassigned"}</div>
                        <div>Source: {candidate.source ?? "Not recorded"}</div>
                        <div>Created: {formatDate(candidate.createdAt)}</div>
                        <div>Updated: {formatDate(candidate.updatedAt)}</div>
                      </div>
                    </div>
                  )
                }
              ]}
            />
          )}

          {/* Applications tab */}
          {activeTab === "applications" && (
            <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
              <div className="space-y-2">
                {candidate.applications.length > 0 ? (
                  candidate.applications.map((application) => (
                    <div key={application.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          {application.job ? (
                            <Link href={`/recruiting-jobs?id=${application.job.id}`} className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100">
                              {application.job.title}
                            </Link>
                          ) : (
                            <div className="font-semibold text-brand-lea dark:text-slate-100">Unlinked job</div>
                          )}
                          <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                            {[application.stage, application.status, application.job?.location].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {application.pilotRequirement ? (
                          <Link href={`/pilot-requirements?id=${application.pilotRequirement.id}`} className="rounded bg-brand-sweet/25 px-2 py-1 text-[11px] font-semibold text-brand-lea dark:text-slate-100">
                            {application.pilotRequirement.title}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No applications yet" detail="Application history appears here after imports or manual linking." />
                )}
              </div>
            </section>
          )}

          {/* Notes tab */}
          {activeTab === "notes" && <CandidateNotes candidateId={candidate.id} initialNotes={candidate.notes} />}

          {/* Travel tab — pre-hire fly-outs and any other travel for this candidate */}
          {activeTab === "travel" && (
            <TravelPanel subjectType="candidate" subjectId={candidate.id} initialTrips={travelTrips} loyalty={travelLoyalty} />
          )}

          {/* Activity tab */}
          {activeTab === "activity" && <CandidateActivityTimeline items={candidate.activity} />}

          {/* Interviews tab */}
          {activeTab === "interviews" && (
            <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
              <div className="space-y-2">
                {candidate.interviews.length > 0 ? (
                  candidate.interviews.map((interview) => (
                    <div key={interview.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                      <div className="font-semibold text-brand-lea dark:text-slate-100">{interview.title}</div>
                      <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{formatDateTime(interview.startDateTime)} · {interview.status}</div>
                      <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{[interview.interviewer, interview.location].filter(Boolean).join(" · ")}</div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No interviews scheduled" detail="Scheduled interviews will appear here." />
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
