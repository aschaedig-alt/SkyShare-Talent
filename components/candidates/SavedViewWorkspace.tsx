"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Link2,
  Check,
  Trash2,
  X,
  Mail,
  Phone,
  FileText,
  StickyNote,
  Send,
  BarChart3,
  ExternalLink,
  UserMinus,
  Loader2
} from "lucide-react";
import type { CandidateListItem } from "@/lib/data/candidates";
import { CANDIDATE_DEPARTMENTS } from "@/lib/candidates/departments";
import { CandidateTagCell } from "@/components/candidates/CandidateTagCell";
import { Button } from "@/components/ui";

type ProfileSummary = {
  displayName: string;
  currentTitle: string | null;
  stage: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  notes?: Array<{ id: string; body: string; createdAt: string; author?: string | null }>;
  files?: Array<{ id: string; displayFilename: string; documentType: string | null }>;
  applications?: Array<{ id: string; status: string | null; job?: { title: string; department: string | null } | null }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function DepartmentChips({ keys }: { keys: CandidateListItem["departments"] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((key) => {
        const dept = CANDIDATE_DEPARTMENTS.find((d) => d.key === key);
        if (!dept) return null;
        return (
          <span key={key} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold ${dept.chip}`}>
            {dept.label}
          </span>
        );
      })}
    </div>
  );
}

/**
 * A saved view you can actually work in.
 *
 * The three things the Compare table could not do, which is why this page
 * exists alongside it: get back to the view later, open somebody WITHOUT losing
 * the list, and drop the people who turned out not to belong.
 *
 * The profile opens in a side pane rather than navigating, because the whole
 * point of a shortlist is that you are working THROUGH it — a full page load per
 * name loses your place and your ticks.
 */
export function SavedViewWorkspace({
  viewId,
  name,
  note,
  createdByEmail,
  members,
  missingCount,
  canEdit
}: {
  viewId: string;
  name: string;
  note: string | null;
  createdByEmail: string | null;
  members: CandidateListItem[];
  missingCount: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ids = useMemo(() => members.map((m) => m.id), [members]);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  const loadProfile = useCallback(async (id: string) => {
    setProfileLoading(true);
    setProfile(null);
    try {
      const res = await fetch(`/api/candidates/${id}`);
      if (res.ok) setProfile((await res.json()) as ProfileSummary);
      else setProfile(null);
    } catch {
      setProfile(null);
    }
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    if (openId) void loadProfile(openId);
  }, [openId, loadProfile]);

  // Escape closes the pane — it is a detail overlay, and being unable to dismiss
  // it without reaching for the mouse is the sort of thing that makes a
  // work-through-the-list screen tiring.
  useEffect(() => {
    if (!openId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ids));
  }

  async function patchMembers(nextIds: string[], failureMessage: string) {
    if (nextIds.length === 0) {
      setError("A view needs at least one candidate — delete the whole view instead.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidate-views/${viewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: nextIds })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? failureMessage);
        setBusy(false);
        return;
      }
      setSelected(new Set());
      setOpenId(null);
      router.refresh();
    } catch {
      setError(failureMessage);
    }
    setBusy(false);
  }

  /** Drop the ticked people. */
  const removeSelected = () => patchMembers(ids.filter((id) => !selected.has(id)), "Could not update the view.");
  /** Keep ONLY the ticked people — the "untick all, tick the few that belong" path. */
  const keepOnlySelected = () => patchMembers(ids.filter((id) => selected.has(id)), "Could not update the view.");

  async function copyLink() {
    const url = `${window.location.origin}/candidates/views/${viewId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function deleteView() {
    setBusy(true);
    const res = await fetch(`/api/candidate-views/${viewId}`, { method: "DELETE" });
    if (res.ok) router.push("/candidates/views");
    else setBusy(false);
  }

  const openMember = openId ? members.find((m) => m.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Saved view</p>
            <h2 className="mt-0.5 text-xl font-semibold text-brand-lea dark:text-slate-100">{name}</h2>
            {note && <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">{note}</p>}
            <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
              {members.length} candidate{members.length === 1 ? "" : "s"}
              {createdByEmail ? ` · saved by ${createdByEmail}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/candidates/compare?view=${viewId}`}
              className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-100"
            >
              <BarChart3 className="h-4 w-4" /> Open in Compare
            </Link>
            <Button variant="secondary" onClick={() => void copyLink()}>
              {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Link2 className="h-4 w-4" /> Copy link</>}
            </Button>
            {canEdit &&
              (confirmingDelete ? (
                <>
                  <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                  <Button onClick={() => void deleteView()} disabled={busy}>Really delete</Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Delete view
                </Button>
              ))}
          </div>
        </div>

        {missingCount > 0 && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
            {missingCount} candidate{missingCount === 1 ? " was" : "s were"} saved into this view but can no longer be
            loaded — most likely deleted or merged.
          </p>
        )}
        <p className="mt-3 text-[11px] text-brand-grey dark:text-slate-400">
          Anyone you send this link to needs a Journey account with access to Candidates — it is not a public page.
        </p>
      </section>

      <div className={`grid gap-4 ${openMember ? "xl:grid-cols-[minmax(0,1fr)_380px]" : "grid-cols-1"}`}>
        {/* The list */}
        <section className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          {canEdit && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-brand-gold/40 bg-brand-sweet/15 px-5 py-3 dark:bg-brand-gold/10">
              <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs font-semibold text-brand-grey underline transition hover:text-brand-lea dark:text-slate-400"
              >
                Clear
              </button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => void removeSelected()} disabled={busy}>
                  <UserMinus className="h-4 w-4" /> Remove {selected.size} from view
                </Button>
                <Button onClick={() => void keepOnlySelected()} disabled={busy}>
                  <Check className="h-4 w-4" /> Keep only these {selected.size}
                </Button>
              </div>
              {error && <p className="w-full text-xs font-semibold text-red-600 dark:text-red-300">{error}</p>}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.16em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
                <tr>
                  {canEdit && (
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label={allSelected ? "Clear all" : "Select all"}
                        className="h-4 w-4 cursor-pointer rounded border-brand-lea/30 accent-brand-lea"
                      />
                    </th>
                  )}
                  <th className="px-5 py-3 font-bold">Candidate</th>
                  <th className="px-4 py-3 font-bold">Department</th>
                  <th className="px-4 py-3 font-bold">Stage</th>
                  <th className="px-4 py-3 font-bold">Tags</th>
                  <th className="px-4 py-3 font-bold">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-lea/10 dark:divide-white/10">
                {members.map((member) => {
                  const isSelected = selected.has(member.id);
                  const isOpen = openId === member.id;
                  return (
                    <tr
                      key={member.id}
                      className={`row-wash align-top ${isSelected ? "bg-brand-sweet/20 dark:bg-brand-gold/10" : ""} ${
                        isOpen ? "ring-1 ring-inset ring-brand-gold" : ""
                      }`}
                    >
                      {canEdit && (
                        <td className="px-3 py-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(member.id)}
                            aria-label={`Select ${member.displayName}`}
                            className="h-4 w-4 cursor-pointer rounded border-brand-lea/30 accent-brand-lea"
                          />
                        </td>
                      )}
                      <td className="px-5 py-4">
                        <div className="flex gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-lea/10 text-xs font-bold text-brand-lea dark:text-slate-100">
                            {initials(member.displayName) || "—"}
                          </span>
                          <div className="min-w-0">
                            {/* A BUTTON, not a link: this swaps a detail pane on
                                the same page, which is exactly the case the house
                                rule reserves for onClick. The real link to the
                                full profile is in the pane. */}
                            <button
                              type="button"
                              onClick={() => setOpenId(isOpen ? null : member.id)}
                              className="text-left font-semibold text-brand-lea underline-offset-2 hover:text-brand-eden hover:underline dark:text-slate-100"
                            >
                              {member.displayName}
                            </button>
                            <div className="text-xs text-brand-grey dark:text-slate-400">
                              {member.currentTitle ?? "No current role"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4"><DepartmentChips keys={member.departments} /></td>
                      <td className="px-4 py-4 text-xs text-brand-grey dark:text-slate-400">{member.stage ?? "—"}</td>
                      <td className="px-4 py-4"><CandidateTagCell chips={member.tagChips} /></td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-brand-grey dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" title="Files">
                            <FileText className="h-3 w-3" /> {member.fileCount}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-brand-cloudDancer/70 px-1.5 py-0.5 text-brand-lea dark:bg-white/5 dark:text-slate-100" title="Notes">
                            <StickyNote className="h-3 w-3" /> {member.noteCount}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" title="Applications">
                            <Send className="h-3 w-3" /> {member.applicationCount}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Detail pane — stays beside the list so ticks and scroll position survive. */}
        {openMember && (
          <aside className="h-fit rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 xl:sticky xl:top-4 dark:bg-brand-panel dark:ring-white/10">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{openMember.displayName}</h3>
                <p className="text-xs text-brand-grey dark:text-slate-400">{openMember.currentTitle ?? "No current role"}</p>
              </div>
              <button
                onClick={() => setOpenId(null)}
                aria-label="Close panel"
                className="rounded p-1 text-brand-grey transition hover:text-brand-lea dark:text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3"><DepartmentChips keys={openMember.departments} /></div>

            <dl className="mt-3 space-y-1.5 text-xs text-brand-grey dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 shrink-0 text-brand-lea/50" />
                <span className="min-w-0 truncate">{openMember.primaryEmail ?? "No email"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 shrink-0 text-brand-lea/50" />
                <span>{openMember.primaryPhone ?? "No phone"}</span>
              </div>
              <div>Stage: {openMember.stage ?? "—"}</div>
              <div>Updated {formatDate(openMember.updatedAt)}</div>
            </dl>

            {profileLoading && (
              <p className="mt-4 flex items-center gap-2 text-xs text-brand-grey dark:text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading their record…
              </p>
            )}

            {profile && (
              <>
                {profile.applications && profile.applications.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Applications</h4>
                    <ul className="mt-1 space-y-1">
                      {profile.applications.slice(0, 6).map((app) => (
                        <li key={app.id} className="rounded bg-brand-cloudDancer/40 px-2 py-1 text-xs text-brand-lea dark:bg-white/5 dark:text-slate-100">
                          {app.job?.title ?? "Unlinked application"}
                          {app.job?.department ? <span className="text-brand-grey dark:text-slate-400"> · {app.job.department}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {profile.files && profile.files.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Documents</h4>
                    <ul className="mt-1 space-y-1">
                      {profile.files.slice(0, 6).map((file) => (
                        <li key={file.id} className="truncate rounded bg-brand-cloudDancer/40 px-2 py-1 text-xs text-brand-lea dark:bg-white/5 dark:text-slate-100">
                          {file.displayFilename}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {/* A real link — this DOES change the whole screen. */}
              <Link
                href={`/candidates/${openMember.id}`}
                className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-2 text-xs font-semibold text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-100"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open full profile
              </Link>
              {canEdit && (
                <Button variant="secondary" onClick={() => void patchMembers(ids.filter((id) => id !== openMember.id), "Could not update the view.")} disabled={busy}>
                  <UserMinus className="h-3.5 w-3.5" /> Remove from view
                </Button>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
