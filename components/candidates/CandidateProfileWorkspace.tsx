"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { FileText, Briefcase, StickyNote, CalendarClock } from "lucide-react";
import { CandidateDocuments } from "@/components/candidates/CandidateDocuments";
import type { CandidateProfileData } from "@/lib/data/candidates";

type CandidateProfileWorkspaceProps = {
  candidate: CandidateProfileData;
};

type ProfileTab = "documents" | "applications" | "notes" | "interviews";

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
    <div className="rounded-lg border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm">
      <div className="font-semibold text-brand-lea">{title}</div>
      <p className="mt-1 text-brand-grey">{detail}</p>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20";
const labelClass = "text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey";

export function CandidateProfileWorkspace({ candidate: initialCandidate }: CandidateProfileWorkspaceProps) {
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
    { id: "interviews", label: "Interviews", icon: CalendarClock, count: candidate.interviews.length }
  ];

  const statusActive = candidate.status === "ACTIVE";

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      {error && <div className="rounded border border-red-500/30 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded border border-green-500/30 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {/* Header */}
      <section className="rounded-xl bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <Link href="/candidates" className="text-xs font-semibold text-brand-eden hover:text-brand-lea">
          ← Back to candidates
        </Link>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-sweet/25 text-lg font-semibold text-brand-lea">
            {initials(candidate.displayName) || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-brand-lea">{candidate.displayName}</h1>
            <p className="mt-1 text-sm text-brand-grey">
              {[candidate.currentTitle, candidate.stage].filter(Boolean).join(" · ") || "No title recorded"}
            </p>
            {candidate.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {candidate.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-brand-sweet/60 bg-brand-sweet/18 px-2.5 py-1 text-[11px] font-semibold text-brand-lea"
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
                "rounded-full px-3 py-1 text-xs font-semibold",
                statusActive ? "bg-emerald-100 text-emerald-800" : "bg-brand-cloudDancer text-brand-grey"
              )}
            >
              {candidate.status}
            </span>
            <button
              onClick={() => (isEditing ? handleCancel() : setIsEditing(true))}
              disabled={isSaving}
              className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50"
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
          </div>
        </div>
      </section>

      {isEditing ? (
        /* Edit form */
        <section className="rounded-xl bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
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
            <button onClick={handleSave} disabled={isSaving} className="rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white hover:bg-brand-eden disabled:opacity-50">
              {isSaving ? "Saving…" : "Save changes"}
            </button>
            <button onClick={handleCancel} disabled={isSaving} className="rounded-lg border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea hover:bg-brand-cloudDancer/30">
              Cancel
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Profile tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-brand-lea/15">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition",
                    active ? "border-brand-lea text-brand-lea" : "border-transparent text-brand-grey hover:text-brand-lea"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  <span className="rounded-full bg-brand-cloudDancer/70 px-1.5 py-0.5 text-[10px] font-bold text-brand-grey">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Documents tab */}
          {activeTab === "documents" && (
            <section className="grid gap-4 xl:grid-cols-[240px_1fr]">
              <aside className="space-y-3">
                <div className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Contact</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div>
                      <div className={labelClass}>Email</div>
                      <div className="mt-0.5 break-words text-brand-lea">{candidate.primaryEmail ?? "No email"}</div>
                    </div>
                    <div>
                      <div className={labelClass}>Phone</div>
                      <div className="mt-0.5 text-brand-lea">{candidate.primaryPhone ?? "No phone"}</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Record</p>
                  <div className="mt-3 space-y-1.5 text-sm text-brand-grey">
                    <div>Owner: {candidate.owner ?? "Unassigned"}</div>
                    <div>Source: {candidate.source ?? "Not recorded"}</div>
                    <div>Created: {formatDate(candidate.createdAt)}</div>
                    <div>Updated: {formatDate(candidate.updatedAt)}</div>
                  </div>
                </div>
              </aside>

              <CandidateDocuments candidateId={candidate.id} files={candidate.files} />
            </section>
          )}

          {/* Applications tab */}
          {activeTab === "applications" && (
            <section className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
              <div className="space-y-2">
                {candidate.applications.length > 0 ? (
                  candidate.applications.map((application) => (
                    <div key={application.id} className="rounded-lg border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          {application.job ? (
                            <Link href={`/recruiting-jobs?id=${application.job.id}`} className="font-semibold text-brand-lea hover:text-brand-eden">
                              {application.job.title}
                            </Link>
                          ) : (
                            <div className="font-semibold text-brand-lea">Unlinked job</div>
                          )}
                          <div className="mt-1 text-xs text-brand-grey">
                            {[application.stage, application.status, application.job?.location].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {application.pilotRequirement ? (
                          <Link href={`/pilot-requirements?id=${application.pilotRequirement.id}`} className="rounded-full bg-brand-sweet/25 px-2 py-1 text-[11px] font-semibold text-brand-lea">
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
          {activeTab === "notes" && (
            <section className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
              <div className="space-y-2">
                {candidate.notes.length > 0 ? (
                  candidate.notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                      <p className="text-sm leading-6 text-brand-black/78">{note.body}</p>
                      <div className="mt-2 text-xs text-brand-grey">{note.source ?? "No source"} · {formatDate(note.createdAt)}</div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No notes yet" detail="Candidate notes will appear here." />
                )}
              </div>
            </section>
          )}

          {/* Interviews tab */}
          {activeTab === "interviews" && (
            <section className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
              <div className="space-y-2">
                {candidate.interviews.length > 0 ? (
                  candidate.interviews.map((interview) => (
                    <div key={interview.id} className="rounded-lg border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                      <div className="font-semibold text-brand-lea">{interview.title}</div>
                      <div className="mt-1 text-xs text-brand-grey">{formatDateTime(interview.startDateTime)} · {interview.status}</div>
                      <div className="mt-1 text-xs text-brand-grey">{[interview.interviewer, interview.location].filter(Boolean).join(" · ")}</div>
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
