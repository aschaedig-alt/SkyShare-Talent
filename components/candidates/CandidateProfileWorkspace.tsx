"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { FileText, Briefcase, StickyNote, CalendarClock, History, Plane, Clock, Sparkles, Mail, FileSignature, X } from "lucide-react";
import { Button } from "@/components/ui";
import { CandidateDocuments } from "@/components/candidates/CandidateDocuments";
import { DocumentChecklist } from "@/components/candidates/DocumentChecklist";
import { CurrencyPanel } from "@/components/candidates/CurrencyPanel";
import { ProConPanel } from "@/components/candidates/ProConPanel";
import { CandidateNotes } from "@/components/candidates/CandidateNotes";
import { CandidateActivityTimeline } from "@/components/candidates/CandidateActivityTimeline";
import { HistoricalMatchPanel } from "@/components/candidates/HistoricalMatchPanel";
import { LinkedHistoricalPanel } from "@/components/candidates/LinkedHistoricalPanel";
import { MoveToPreOnboardingPanel } from "@/components/candidates/MoveToPreOnboardingPanel";
import { AddJobToCandidate } from "@/components/candidates/AddJobToCandidate";
import { DeleteCandidateButton } from "@/components/candidates/DeleteCandidateButton";
import { CandidateTagEditor } from "@/components/candidates/CandidateTagEditor";
import { stageOptionsFor } from "@/lib/candidates/stages";
import { OfferControl } from "@/components/candidates/OfferControl";
import { isTestTagged } from "@/lib/testdata/markers";
import { offerStatusLabel } from "@/lib/offers/constants";
import { CandidateTimeline } from "@/components/candidates/CandidateTimeline";
import { AiSummaryCard } from "@/components/candidates/AiSummaryCard";
import { CandidateCommunications } from "@/components/candidates/CandidateCommunications";
import { FlightProfilePanel } from "@/components/candidates/FlightProfilePanel";
import { EditableGrid, type GridItem } from "@/components/shared/EditableGrid";
import { TravelPanel } from "@/components/travel/TravelPanel";
import type { WidgetInstance } from "@/lib/data/page-layout";
import type { CandidateProfileData } from "@/lib/data/candidates";
import type { TravelTripView, TravelerLoyalty } from "@/lib/data/travel";
import { InterviewWriteUp } from "@/components/candidates/InterviewWriteUp";
import { LinkPendingIndicator } from "@/components/navigation/LinkPendingIndicator";
import { PaycomLinkControl } from "@/components/candidates/PaycomLinkControl";
import { formatMomentDate, formatMomentDateTime } from "@/lib/dates/display";

type CandidateProfileWorkspaceProps = {
  candidate: CandidateProfileData;
  canEdit?: boolean;
  canDelete?: boolean;
  canCreateJob?: boolean;
  savedLayout?: GridItem[] | null;
  savedWidgets?: WidgetInstance[] | null;
  travelTrips?: TravelTripView[];
  travelLoyalty?: TravelerLoyalty;
  /** Everyone who can be recorded as an interviewer or @-mentioned. */
  team?: Array<{ name: string; email: string }>;
  /** The signed-in user, pre-selected as the interviewer. Null in local dev. */
  me?: { name: string; email: string } | null;
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

type ProfileTab = "documents" | "applications" | "offers" | "notes" | "interviews" | "timeline" | "summary" | "communications" | "activity" | "travel";

const PROFILE_TABS = new Set<string>([
  "documents", "applications", "offers", "notes", "interviews", "timeline", "summary", "communications", "activity", "travel"
]);

/** ?tab=interviews opens straight to that tab — how the mention email's
    "View their interview notes" link lands somewhere useful instead of the
    default Documents tab. Anything not a real tab id is ignored. */
function tabFromQuery(value: string | null): ProfileTab | null {
  return value && PROFILE_TABS.has(value) ? (value as ProfileTab) : null;
}

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
  paycomPersonId: string | null;
};

// These are all MOMENTS (created/updated, an interview's start), so they render
// in the office timezone explicitly. Left to Intl's default they took whatever
// zone the renderer happened to be in — the browser's on the client, but UTC on
// the server, which is both inconsistent and wrong for anyone outside Mountain.
function formatDate(value: string | null) {
  return value ? formatMomentDate(value) : "Not recorded";
}

function formatDateTime(value: string) {
  return formatMomentDateTime(value);
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
  "mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";
const labelClass = "text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400";

export function CandidateProfileWorkspace({
  candidate: initialCandidate,
  canEdit = false,
  canDelete = false,
  canCreateJob = false,
  savedLayout = null,
  savedWidgets = null,
  travelTrips = [],
  travelLoyalty,
  team = [],
  me = null
}: CandidateProfileWorkspaceProps) {
  const [candidate, setCandidate] = useState<CandidateProfileData>(initialCandidate);
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ProfileTab>(() => tabFromQuery(searchParams.get("tab")) ?? "documents");
  // Adding, removing, recolouring and the historical group all live in
  // CandidateTagEditor now. The two-click removal it uses is the same pattern
  // that was here before — but it is no longer a one-way door, since a tag taken
  // off by mistake can now be added straight back.
  const [openApp, setOpenApp] = useState<string | null>(null);
  const [armedApplication, setArmedApplication] = useState<string | null>(null);
  const [removingApplication, setRemovingApplication] = useState<string | null>(null);
  const [applicationError, setApplicationError] = useState<string | null>(null);

  async function removeApplication(applicationId: string) {
    setRemovingApplication(applicationId);
    setApplicationError(null);
    try {
      const res = await fetch(`/api/candidate-applications/${applicationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id })
      });
      if (res.ok) {
        setCandidate({ ...candidate, applications: candidate.applications.filter((a) => a.id !== applicationId) });
      } else {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setApplicationError(payload?.message ?? "Couldn't remove this link.");
      }
    } finally {
      setRemovingApplication(null);
      setArmedApplication(null);
    }
  }
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
    owner: initialCandidate.owner,
    paycomPersonId: initialCandidate.paycomPersonId
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
      owner: candidate.owner,
      paycomPersonId: candidate.paycomPersonId
    });
    setIsEditing(false);
    setError(null);
  };

  const tabs: Array<{ id: ProfileTab; label: string; icon: typeof FileText; count: number }> = [
    { id: "documents", label: "Documents", icon: FileText, count: candidate.files.length },
    { id: "applications", label: "Applied to", icon: Briefcase, count: candidate.applications.length },
    { id: "offers", label: "Offers", icon: FileSignature, count: candidate.applications.filter((a) => (a.offerStatus ?? "NONE") !== "NONE").length },
    { id: "notes", label: "Notes", icon: StickyNote, count: candidate.notes.length },
    { id: "interviews", label: "Interviews", icon: CalendarClock, count: candidate.interviews.length },
    { id: "timeline", label: "Timeline", icon: Clock, count: candidate.timeline.length },
    { id: "communications", label: "Communication", icon: Mail, count: candidate.communicationCount },
    { id: "summary", label: "AI summary", icon: Sparkles, count: candidate.aiSummary ? 1 : 0 },
    { id: "travel", label: "Travel", icon: Plane, count: travelTrips.length },
    { id: "activity", label: "Activity", icon: History, count: candidate.activity.length }
  ];

  const statusActive = candidate.status === "ACTIVE";

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      {error && <div className="rounded border border-red-500/30 bg-red-50 dark:bg-red-500/15 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {success && <div className="rounded border border-green-500/30 bg-green-50 dark:bg-emerald-500/15 p-3 text-sm text-green-700 dark:text-emerald-300">{success}</div>}

      {/* Header */}
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        {/* A real target, not bare words. As a plain text link the clickable area
            was exactly the width of the letters, so a near-miss did nothing and
            read as the link being broken — the last open piece of the "Back to
            candidates feels broken" report. Now it is a padded, bordered box
            that highlights on hover, so where to click is visible before you
            click and anywhere inside it works. The negative margin cancels the
            new padding so the text still lines up with the content below. */}
        <Link
          href="/candidates"
          className="-ml-2.5 inline-flex items-center gap-1.5 rounded border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-gold hover:bg-brand-gold/10 hover:text-brand-lea hover:shadow-glow dark:border-white/10 dark:text-slate-300 dark:hover:bg-brand-gold/15 dark:hover:text-slate-100"
        >
          ← Back to candidates
          {/* The click already worked before this existed — what was missing
              was any sign of it. See the component doc. */}
          <LinkPendingIndicator />
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
            <CandidateTagEditor
              candidateId={candidate.id}
              chips={candidate.tagChips}
              canEdit={canEdit}
              onChange={(chips) =>
                setCandidate({ ...candidate, tagChips: chips, tags: chips.map((c) => c.label) })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <PaycomLinkControl candidateId={candidate.id} paycomLink={candidate.paycomLink} canEdit={canEdit} />
            <span
              className={clsx(
                "rounded px-3 py-1 text-xs font-semibold",
                statusActive ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" : "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
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
            {/* Test-data teardown — admin only, and only for a TEST-tagged record. */}
            {canDelete && !isEditing && isTestTagged(candidate.tags) && (
              <DeleteCandidateButton
                candidateId={candidate.id}
                candidateName={candidate.displayName}
                hasHire={Boolean(candidate.preOnboarding.hireId)}
              />
            )}
          </div>
        </div>
      </section>

      {/* Historical Candidate Archive — match banner (Jazz history present) */}
      {!isEditing && candidate.isHistorical && candidate.historicalMatch && (
        <HistoricalMatchPanel
          match={candidate.historicalMatch}
          jazzCandidateNumber={candidate.jazzCandidateNumber}
          onViewTimeline={() => setActiveTab("timeline")}
        />
      )}

      {/* New candidate ↔ separate historical (Jazz) profile — view / merge / dismiss */}
      {!isEditing && candidate.linkedHistorical && (
        <LinkedHistoricalPanel keepId={candidate.id} link={candidate.linkedHistorical} canEdit={canEdit} />
      )}

      {/* Move to pre-onboarding — link once moved; otherwise only on live candidates */}
      {!isEditing &&
        (candidate.preOnboarding.hireId ||
          (candidate.status !== "ARCHIVED" && candidate.status !== "MERGED")) && (
          <MoveToPreOnboardingPanel candidate={candidate} canEdit={canEdit} />
        )}

      {isEditing ? (
        /* Edit form */
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
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
              {/* A picked list, not a free-text box — typing this field is how
                  the pipeline ended up with one-off stages nothing can filter
                  on. The candidate's existing stage is always among the options
                  (stageOptionsFor adds it under "Current" when it is not one of
                  ours), so opening this can never rewrite an imported value. */}
              <select
                value={formData.stage ?? ""}
                onChange={(e) => setFormData({ ...formData, stage: e.target.value || null })}
                className={inputClass}
              >
                <option value="">No stage</option>
                {stageOptionsFor(formData.stage).map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.values.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Owner</label>
              <input value={formData.owner ?? ""} onChange={(e) => setFormData({ ...formData, owner: e.target.value || null })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Source</label>
              <input value={formData.source ?? ""} onChange={(e) => setFormData({ ...formData, source: e.target.value || null })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Paycom ID</label>
              <input
                value={formData.paycomPersonId ?? ""}
                inputMode="numeric"
                placeholder="e.g. 320080"
                onChange={(e) => setFormData({ ...formData, paycomPersonId: e.target.value || null })}
                className={inputClass}
              />
              {/* Paycom quotes this in its Offer Accepted emails and it is the only
                  EXACT key we get for a person — matching on name is what made the
                  duplicates. Nothing can read it yet; it is stored now so the
                  inbound Paycom automation has something real to match on later. */}
              <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
                From Paycom. Lets us match their Paycom emails to this person exactly.
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
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
                    <div className="h-full overflow-auto rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
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
                    <div className="h-full overflow-auto rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
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
            <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
              {/* Link to a job right here — no detour to the Jobs page. Once linked,
                  the offer for it can be worked on the Offers tab. */}
              {canEdit && (
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs text-brand-grey dark:text-slate-400">Jobs this candidate has applied to or been linked to.</p>
                  <AddJobToCandidate candidateId={candidate.id} canCreateJob={canCreateJob} />
                </div>
              )}
              {applicationError && (
                <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {applicationError}
                </p>
              )}
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
                        <div className="flex shrink-0 items-center gap-2">
                          {application.pilotRequirement ? (
                            <Link href={`/pilot-requirements?id=${application.pilotRequirement.id}`} className="rounded bg-brand-sweet/25 px-2 py-1 text-[11px] font-semibold text-brand-lea dark:text-slate-100">
                              {application.pilotRequirement.title}
                            </Link>
                          ) : null}
                          {/* Undo a job linked by mistake. Not offered once the
                              application has real offer progress on it — see
                              the route for why: deleting it would silently
                              throw that progress away too. */}
                          {canEdit && (application.offerStatus ?? "NONE") === "NONE" && (
                            <button
                              onClick={() =>
                                armedApplication === application.id ? removeApplication(application.id) : setArmedApplication(application.id)
                              }
                              onBlur={() => setArmedApplication((cur) => (cur === application.id ? null : cur))}
                              disabled={removingApplication === application.id}
                              aria-label={armedApplication === application.id ? `Confirm removing the link to ${application.job?.title ?? "this job"}` : `Remove the link to ${application.job?.title ?? "this job"}`}
                              className={clsx(
                                "shrink-0 rounded p-1 transition disabled:opacity-40",
                                armedApplication === application.id
                                  ? "bg-red-600 text-white"
                                  : "text-brand-grey hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                              )}
                              title={armedApplication === application.id ? "Click again to remove" : "Remove this job link"}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* The offer for this application lives on the Offers tab —
                          keep this tab about which jobs they applied to. */}
                      {(application.offerStatus ?? "NONE") !== "NONE" && (
                        <button
                          onClick={() => setActiveTab("offers")}
                          className="mt-1 text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-sweet"
                        >
                          {offerStatusLabel(application.offerStatus)} — manage in Offers →
                        </button>
                      )}
                      {application.questionnaire.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => setOpenApp(openApp === application.id ? null : application.id)}
                            className="text-xs font-semibold text-brand-eden transition hover:text-brand-lea dark:text-slate-300"
                          >
                            {openApp === application.id ? "Hide" : "Show"} questionnaire ({application.questionnaire.length})
                          </button>
                          {openApp === application.id && (
                            <dl className="mt-2 space-y-2 border-t border-brand-lea/10 pt-2 dark:border-white/10">
                              {application.questionnaire.map((q, idx) => (
                                <div key={idx}>
                                  <dt className="text-xs font-semibold text-brand-lea dark:text-slate-200">{q.question}</dt>
                                  <dd className="whitespace-pre-wrap text-xs text-brand-grey dark:text-slate-400">{q.answer || "—"}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <EmptyState title="No applications yet" detail={canEdit ? "Use “Link to a job” above to attach this candidate to a role — then work the offer on the Offers tab." : "Application history appears here after imports or manual linking."} />
                )}
              </div>
            </section>
          )}

          {/* Offers tab — one place to work every offer, per job. An offer is the
              last act of recruiting, so it gets its own home rather than hiding
              inside the application list. */}
          {activeTab === "offers" && (
            <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
              <div className="space-y-3">
                {candidate.applications.length > 0 ? (
                  candidate.applications.map((application) => (
                    <div key={application.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                      {application.job ? (
                        <Link href={`/recruiting-jobs?id=${application.job.id}`} className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100">
                          {application.job.title}
                        </Link>
                      ) : (
                        <div className="font-semibold text-brand-lea dark:text-slate-100">Unlinked job</div>
                      )}
                      <OfferControl application={application} canEdit={canEdit} />
                    </div>
                  ))
                ) : (
                  <EmptyState title="No applications to offer against" detail={canEdit ? "An offer is made for a specific job. Open the “Applied to” tab and use “Link to a job” to attach one, then come back here to work the offer." : "An offer is made for a specific job. Once this candidate is linked to a role, its offer appears here."} />
                )}
              </div>
            </section>
          )}

          {/* Notes tab */}
          {activeTab === "notes" && <CandidateNotes candidateId={candidate.id} initialNotes={candidate.notes} people={team} />}

          {/* Timeline tab — unified candidate lifecycle (live + historical) */}
          {activeTab === "timeline" && <CandidateTimeline events={candidate.timeline} />}

          {/* Communication history tab — archived email/messages */}
          {activeTab === "communications" && (
            <CandidateCommunications communications={candidate.communications} total={candidate.communicationCount} />
          )}

          {/* AI summary tab */}
          {activeTab === "summary" && (
            <AiSummaryCard candidateId={candidate.id} summary={candidate.aiSummary} isHistorical={candidate.isHistorical} canEdit={canEdit} />
          )}

          {/* Travel tab — pre-hire fly-outs and any other travel for this candidate */}
          {activeTab === "travel" && (
            <TravelPanel subjectType="candidate" subjectId={candidate.id} initialTrips={travelTrips} loyalty={travelLoyalty} />
          )}

          {/* Activity tab */}
          {activeTab === "activity" && <CandidateActivityTimeline items={candidate.activity} />}

          {/* Interviews tab — write-ups pasted in after the fact, since
              interviews are still run in Paycom. */}
          {activeTab === "interviews" && (
            <InterviewWriteUp
              candidateId={candidate.id}
              interviews={candidate.interviews}
              people={team}
              me={me}
              canEdit={canEdit}
            />
          )}
        </>
      )}
    </div>
  );
}
