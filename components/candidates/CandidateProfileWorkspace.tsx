"use client";

import Link from "next/link";
import { useState } from "react";
import { CandidateFileUploadButton } from "@/components/candidates/CandidateFileUploadButton";
import type { CandidateProfileData } from "@/lib/data/candidates";

type CandidateProfileWorkspaceProps = {
  candidate: CandidateProfileData;
};

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
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBytes(value: number | null) {
  if (!value) {
    return "Size not stored";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm">
      <div className="font-semibold text-brand-lea">{title}</div>
      <p className="mt-1 text-brand-grey">{detail}</p>
    </div>
  );
}

export function CandidateProfileWorkspace({ candidate: initialCandidate }: CandidateProfileWorkspaceProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<CandidateProfileData>(initialCandidate);
  const [formData, setFormData] = useState<CandidateEditForm>({
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
  });

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
      setSuccess("Candidate updated successfully.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
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

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      {error && (
        <div className="rounded border border-red-500/30 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded border border-green-500/30 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/candidates" className="text-xs font-semibold text-brand-eden hover:text-brand-lea">
              Back to candidates
            </Link>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
              Candidate profile
            </p>
            {isEditing ? (
              <div className="mt-3 space-y-3">
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Display name"
                  className="w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-3xl font-semibold text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                />
              </div>
            ) : (
              <h1 className="text-3xl font-semibold text-brand-lea">{candidate.displayName}</h1>
            )}
            <p className="mt-1 text-sm text-brand-grey">
              {[candidate.currentTitle, candidate.stage, candidate.status].filter(Boolean).join(" - ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {candidate.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-brand-sweet/60 bg-brand-sweet/18 px-2.5 py-1 text-[11px] font-semibold text-brand-lea"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              disabled={isSaving}
              className="rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50"
            >
              {isEditing ? "Cancel Edit" : "Edit Candidate"}
            </button>
            <div className="grid min-w-full grid-cols-2 gap-2 text-sm sm:min-w-[460px] sm:grid-cols-4">
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Files</div>
                <div className="mt-1 text-lg font-semibold text-brand-lea">{candidate.files.length}</div>
              </div>
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Notes</div>
                <div className="mt-1 text-lg font-semibold text-brand-lea">{candidate.notes.length}</div>
              </div>
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Applications</div>
                <div className="mt-1 text-lg font-semibold text-brand-lea">{candidate.applications.length}</div>
              </div>
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Interviews</div>
                <div className="mt-1 text-lg font-semibold text-brand-lea">{candidate.interviews.length}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
                  Resume / files
                </p>
                <h2 className="text-lg font-semibold text-brand-lea">Attached candidate documents</h2>
              </div>
              <CandidateFileUploadButton candidateId={candidate.id} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {candidate.files.length > 0 ? (
                candidate.files.map((file) => (
                  <div key={file.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-brand-lea">{file.displayFilename}</div>
                        <div className="mt-1 text-xs text-brand-grey">Original: {file.originalFilename}</div>
                      </div>
                      {file.storageKey ? (
                        <a
                          href={`/api/candidate-files/${file.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-brand-lea/25 px-3 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-lea hover:text-white"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="rounded bg-brand-cloudDancer px-3 py-1 text-xs font-semibold text-brand-grey">
                          Metadata only
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-brand-grey">
                      <div>{file.mimeType ?? "Unknown type"}</div>
                      <div>{formatBytes(file.sizeBytes)}</div>
                      <div>Uploaded {formatDate(file.uploadedAt)}</div>
                      <div>{file.source ?? "No source"}</div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No files attached yet"
                  detail="Upload a resume, certification, note, or supporting document directly to this candidate."
                />
              )}
            </div>
          </section>

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
              Applications
            </p>
            <h2 className="text-lg font-semibold text-brand-lea">Job history</h2>
            <div className="mt-4 space-y-2">
              {candidate.applications.length > 0 ? (
                candidate.applications.map((application) => (
                  <div key={application.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        {application.job ? (
                          <Link
                            href={`/recruiting-jobs?id=${application.job.id}`}
                            className="font-semibold text-brand-lea hover:text-brand-eden"
                          >
                            {application.job.title}
                          </Link>
                        ) : (
                          <div className="font-semibold text-brand-lea">Unlinked job</div>
                        )}
                        <div className="mt-1 text-xs text-brand-grey">
                          {[application.stage, application.status, application.job?.location].filter(Boolean).join(" - ")}
                        </div>
                      </div>
                      {application.pilotRequirement ? (
                        <Link
                          href={`/pilot-requirements?id=${application.pilotRequirement.id}`}
                          className="rounded-full bg-brand-sweet/25 px-2 py-1 text-[11px] font-semibold text-brand-lea"
                        >
                          {application.pilotRequirement.title}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No applications yet" detail="Application history will appear here after imports or manual linking." />
              )}
            </div>
          </section>

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Notes</p>
            <h2 className="text-lg font-semibold text-brand-lea">Candidate notes</h2>
            <div className="mt-4 space-y-2">
              {candidate.notes.length > 0 ? (
                candidate.notes.map((note) => (
                  <div key={note.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                    <p className="text-sm leading-6 text-brand-black/78">{note.body}</p>
                    <div className="mt-2 text-xs text-brand-grey">
                      {note.source ?? "No source"} - {formatDate(note.createdAt)}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No notes yet" detail="Candidate notes will appear here." />
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          {isEditing ? (
            <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Edit candidate</p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">First Name</label>
                  <input
                    type="text"
                    value={formData.firstName ?? ""}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value || null })}
                    className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName ?? ""}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value || null })}
                    className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Email</label>
                  <input
                    type="email"
                    value={formData.primaryEmail ?? ""}
                    onChange={(e) => setFormData({ ...formData, primaryEmail: e.target.value || null })}
                    className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Phone</label>
                  <input
                    type="tel"
                    value={formData.primaryPhone ?? ""}
                    onChange={(e) => setFormData({ ...formData, primaryPhone: e.target.value || null })}
                    placeholder="10-digit US format"
                    className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Current Title</label>
                  <input
                    type="text"
                    value={formData.currentTitle ?? ""}
                    onChange={(e) => setFormData({ ...formData, currentTitle: e.target.value || null })}
                    className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Stage</label>
                  <input
                    type="text"
                    value={formData.stage ?? ""}
                    onChange={(e) => setFormData({ ...formData, stage: e.target.value || null })}
                    className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Owner</label>
                  <input
                    type="text"
                    value={formData.owner ?? ""}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value || null })}
                    className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Source</label>
                  <input
                    type="text"
                    value={formData.source ?? ""}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value || null })}
                    className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="flex-1 rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-lea/10 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Contact</p>
              <h2 className="text-lg font-semibold text-brand-lea">Primary contact</h2>
              <div className="mt-3 space-y-2 text-sm">
                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Email</div>
                  <div className="mt-1 text-brand-lea">{candidate.primaryEmail ?? "No email"}</div>
                </div>
                <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Phone</div>
                  <div className="mt-1 text-brand-lea">{candidate.primaryPhone ?? "No phone"}</div>
                </div>
              </div>
            </section>
          )}

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Interviews</p>
            <h2 className="text-lg font-semibold text-brand-lea">Upcoming schedule</h2>
            <div className="mt-3 space-y-2">
              {candidate.interviews.length > 0 ? (
                candidate.interviews.map((interview) => (
                  <div key={interview.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                    <div className="font-semibold text-brand-lea">{interview.title}</div>
                    <div className="mt-1 text-xs text-brand-grey">
                      {formatDateTime(interview.startDateTime)} - {interview.status}
                    </div>
                    <div className="mt-1 text-xs text-brand-grey">
                      {[interview.interviewer, interview.location].filter(Boolean).join(" - ")}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No interviews scheduled" detail="Interview scheduling will appear here once Calendar is built." />
              )}
            </div>
          </section>

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Record</p>
            <div className="mt-3 space-y-2 text-sm text-brand-grey">
              <div>Owner: {candidate.owner ?? "Unassigned"}</div>
              <div>Source: {candidate.source ?? "Not recorded"}</div>
              <div>Created: {formatDate(candidate.createdAt)}</div>
              <div>Updated: {formatDate(candidate.updatedAt)}</div>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
