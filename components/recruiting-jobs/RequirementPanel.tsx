"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Info, Pencil, SlidersHorizontal } from "lucide-react";
import { Badge, Button, type BadgeTone } from "@/components/ui";
import { formatMomentDate, formatMomentDateTime } from "@/lib/dates/display";
import { matchRequirementStatusToJob } from "@/app/recruiting-jobs/requirement-actions";
import { RequirementRoleBlock } from "@/components/recruiting-jobs/RequirementRoleBlock";
import { ManagedAircraftPanel } from "@/components/pilot-requirements/ManagedAircraftPanel";
import { FleetPositionEditor } from "@/components/pilot-requirements/FleetPositionEditor";
import { PilotRequirementEditor } from "@/components/pilot-requirements/PilotRequirementEditor";
import type { JobRequirementView, RequirementGateView } from "@/lib/data/pilot-requirements";

// One pilot requirement, as the job's Pilot requirement tab shows it. Everything
// the old Pilot Requirements page held for a requirement lives here now:
//
//   review status, version, import confidence, import notes -> the status strip
//   fleet position, operator, seat, base, pay, aircraft      -> the Role block
//   hard gates                                               -> Hours tiles and the checklists
//   the gate editor                                          -> Edit requirement
//   managed aircraft (tail numbers)                          -> Managed aircraft
//   change history (saved on every edit, never shown before) -> Change history
//
// Candidate fit is the Screening tab and the source text is the Source text tab,
// which already existed on the job.

const CARD = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400";
const LINKISH =
  "inline-flex items-center gap-1.5 rounded border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-sweet hover:bg-brand-cloudDancer/60 hover:shadow-glow dark:border-white/10 dark:bg-white/5 dark:text-brand-edenOnDark";

export type RequirementPermissions = {
  /**
   * jobs:write (admins and recruiters) — the job's own fields, and on this tab the
   * Role block: seat, aircraft, base, operator and pay text. Recruiters were given
   * the Role on 2026-09-23 (his call), with every save kept in Change history.
   */
  canEditJob: boolean;
  /**
   * requirements:write (admins) — everything else on this tab that writes: the
   * status match, set up and attach, and the requirement editor.
   */
  canEditRequirement: boolean;
  /** Recruiters and admins — fleet position and managed aircraft. */
  canEditScoring: boolean;
};

function sentence(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

const STATUS_TONE: Record<string, BadgeTone> = { ACTIVE: "success", EVERGREEN: "info" };
const REVIEW_TONE: Record<string, BadgeTone> = {
  APPROVED: "success",
  NEEDS_REVIEW: "danger",
  READY_FOR_REVIEW: "warning",
  DRAFT: "warning"
};

// Short names for the hours tiles, keyed by the catalog's stable gate key.
const HOUR_LABEL: Record<string, string> = {
  total_time: "total",
  pic_time: "PIC",
  sic_time: "SIC",
  multi_engine_time: "multi-engine",
  turbine_time: "turbine",
  jet_time: "jet",
  instrument_time: "instrument",
  cross_country_time: "cross-country",
  night_time: "night",
  time_in_type: "in type",
  pic_time_in_type: "PIC in type",
  single_pilot_time: "single-pilot",
  single_pilot_jet_time: "single-pilot jet"
};

// The catalog's categories, in the order and under the names the tab uses.
// Anything a future catalog adds still shows, under its own name, last.
const CHECKLISTS: Array<{ title: string; categories: string[] }> = [
  { title: "Certificates & compliance", categories: ["Certificates / Compliance"] },
  { title: "Location & schedule", categories: ["Location / Commute", "Schedule / Availability"] },
  { title: "Avionics & programs", categories: ["Avionics / Programs"] }
];
const HOURS_CATEGORY = "Structured Numeric Pilot Gates";

function gateLine(gate: RequirementGateView) {
  return gate.textValue ? `${gate.label}: ${gate.textValue}` : gate.label;
}

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={LABEL}>{label}</div>
      <div className="mt-1 text-sm font-semibold text-brand-lea dark:text-slate-100">{children}</div>
    </div>
  );
}

type Mismatch = "still-on" | "off" | null;

function statusMismatch(jobStatus: string, requirementStatus: string): Mismatch {
  const jobOpen = jobStatus === "OPEN";
  if (!jobOpen && requirementStatus === "ACTIVE") return "still-on";
  if (jobOpen && requirementStatus === "INACTIVE") return "off";
  return null;
}

/**
 * Job status and requirement status are kept apart ON PURPOSE: a managed seat can
 * stay on the Matchboard after its job posting closes. So nothing changes either
 * one quietly — this says when they disagree and offers both answers.
 *
 * "Keep it active" is the smaller of the two honest options: it hides the flag
 * for this browser tab and saves nothing. Recording that the mismatch is meant
 * would need somewhere to keep that decision, which does not exist yet, so the
 * flag comes back on the next visit rather than pretending it was recorded.
 */
function StatusMismatchBanner({
  requirement,
  job,
  canEdit
}: {
  requirement: JobRequirementView;
  job: { id: string; status: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const kind = statusMismatch(job.status, requirement.status);
  // Keyed on both statuses, so a later change to either brings the flag back.
  const storageKey = `jobs:requirement-status-ok:${requirement.id}:${job.status}:${requirement.status}`;
  const [dismissed, setDismissed] = useState(false);
  const [pending, startFix] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(storageKey) === "1");
    } catch {
      // Storage blocked (private window, preview): the flag simply shows.
    }
  }, [storageKey]);

  if (!kind) return null;

  if (dismissed) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-brand-grey dark:text-slate-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Left as it is. The reminder is hidden until you close this tab; nothing was saved.
      </p>
    );
  }

  function keep() {
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Not remembered, but still hidden for as long as this page is open.
    }
    setDismissed(true);
  }

  function fix() {
    setError(null);
    startFix(async () => {
      const result = await matchRequirementStatusToJob({ requirementId: requirement.id, jobId: job.id });
      if (!result.ok) {
        setError(result.error ?? "Could not change the requirement status.");
        return;
      }
      router.refresh();
    });
  }

  const stillOn = kind === "still-on";
  return (
    <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold">
            {stillOn ? "This job is Inactive, but its requirement is still Active" : "This job is Active, but its requirement is Inactive"}
          </span>
          {stillOn
            ? ", so the role still shows on the Matchboard."
            : ", so the role is not on the Matchboard."}
        </span>
      </p>
      {canEdit ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={keep} disabled={pending}>
            {stillOn ? "Keep it active" : "Leave it off"}
          </Button>
          <Button size="sm" onClick={fix} disabled={pending}>
            {pending ? "Saving…" : stillOn ? "Make the requirement inactive too" : "Make the requirement active too"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-semibold">{error}</p> : null}
    </div>
  );
}

function Checklist({ title, gates }: { title: string; gates: RequirementGateView[] }) {
  return (
    <section>
      <p className={LABEL}>
        {title} · {gates.length}
      </p>
      <ul className="mt-2 grid gap-x-4 gap-y-1.5 text-sm text-brand-lea [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))] dark:text-slate-100">
        {gates.map((gate) => (
          <li key={gate.id} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="min-w-0 break-words">{gateLine(gate)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GatesCard({ requirement }: { requirement: JobRequirementView }) {
  const [showOff, setShowOff] = useState(false);
  const all = requirement.editableGatesByCategory.flatMap((group) => group.gates);
  const on = all.filter((gate) => gate.enabled);
  const off = all.filter((gate) => !gate.enabled);
  const hours = on.filter((gate) => gate.category === HOURS_CATEGORY);

  const listed = new Set([HOURS_CATEGORY, ...CHECKLISTS.flatMap((list) => list.categories)]);
  const other = [...new Set(on.map((gate) => gate.category).filter((category) => !listed.has(category)))];
  const lists = [
    ...CHECKLISTS.map((list) => ({ title: list.title, gates: on.filter((gate) => list.categories.includes(gate.category)) })),
    ...other.map((category) => ({ title: category, gates: on.filter((gate) => gate.category === category) }))
  ].filter((list) => list.gates.length > 0);

  return (
    <section className={CARD}>
      <p className={EYEBROW}>Requirements</p>
      <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">What a candidate needs</h3>

      {on.length === 0 ? (
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">
          Nothing is switched on yet, so screening has no hours or certificates to check.
        </p>
      ) : null}

      {hours.length > 0 ? (
        <div className="mt-3">
          <p className={LABEL}>Hours</p>
          <div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
            {hours.map((gate) => (
              <div
                key={gate.id}
                className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 dark:border-white/10 dark:bg-white/5"
              >
                <div className="text-lg font-semibold text-brand-lea dark:text-slate-100">
                  {typeof gate.numericValue === "number" ? gate.numericValue.toLocaleString("en-US") : "Required"}
                </div>
                <div className="text-xs text-brand-grey dark:text-slate-400">
                  {typeof gate.numericValue === "number" ? "hours " : ""}
                  {HOUR_LABEL[gate.key] ?? gate.label.replace(/ Time$/, "").toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {lists.map((list) => (
          <Checklist key={list.title} title={list.title} gates={list.gates} />
        ))}
      </div>

      <div className="mt-4 border-t border-brand-lea/10 pt-2 text-xs text-brand-grey dark:border-white/10 dark:text-slate-400">
        {on.length} of {all.length} requirements are switched on
        {off.length > 0 ? (
          <>
            {" · "}
            {/* Swaps a list open in place, so a button, not a link. */}
            <button
              type="button"
              onClick={() => setShowOff((current) => !current)}
              aria-expanded={showOff}
              className="inline-flex items-center gap-0.5 font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-edenOnDark"
            >
              {showOff ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {showOff ? "Hide" : "Show"} the {off.length} that are off
            </button>
          </>
        ) : null}
      </div>
      {showOff ? (
        <ul className="mt-2 grid gap-x-4 gap-y-1 text-xs text-brand-grey [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))] dark:text-slate-400">
          {off.map((gate) => (
            <li key={gate.id}>{gate.label}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ChangeHistory({ requirement }: { requirement: JobRequirementView }) {
  const changes = requirement.changes;
  return (
    <section className={CARD}>
      <p className={EYEBROW}>Change history</p>
      <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">
        {changes.length > 0 ? `${changes.length} saved edit${changes.length === 1 ? "" : "s"}` : "No edits yet"}
      </h3>
      <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
        Every save to this requirement is recorded. The older ones did not record who made them.
      </p>
      {changes.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {changes.map((change) => (
            <li
              key={change.id}
              className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{change.summary}</span>
                <span className="text-xs text-brand-grey dark:text-slate-400">
                  {formatMomentDateTime(change.at)} · {change.by ?? "who: not recorded"}
                </span>
              </div>
              {change.note ? <p className="mt-1 text-xs italic text-brand-black/75 dark:text-slate-300">“{change.note}”</p> : null}
              {change.details.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5 text-xs text-brand-grey dark:text-slate-400">
                  {change.details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">Created {formatMomentDate(requirement.createdAt)}.</p>
    </section>
  );
}

export function RequirementPanel({
  requirement,
  job,
  permissions
}: {
  requirement: JobRequirementView;
  /** The job whose page this is on; null on a no-job requirement's own page. */
  job: { id: string; status: string } | null;
  permissions: RequirementPermissions;
}) {
  const [editing, setEditing] = useState(false);
  const canOpenEditor = permissions.canEditRequirement || permissions.canEditScoring;
  const scoringHref = job ? `/pilot-requirements/scoring?job=${encodeURIComponent(job.id)}` : "/pilot-requirements/scoring";

  return (
    <div className="space-y-3">
      <section className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={EYEBROW}>Pilot requirement</p>
            <h3 className="break-words text-base font-semibold text-brand-lea dark:text-slate-100">{requirement.title}</h3>
            {requirement.link === "merged" ? (
              <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                Came from “{requirement.mergedFromJobTitle ?? "another job"}”, which was merged into this job.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Its own admin page, as before; a real link so it opens in a new tab too. */}
            <Link href={scoringHref} prefetch={false} className={LINKISH}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Scoring setup
            </Link>
            {canOpenEditor ? (
              <Button size="sm" variant={editing ? "secondary" : "primary"} onClick={() => setEditing((current) => !current)}>
                <Pencil className="h-3.5 w-3.5" /> {editing ? "Done editing" : "Edit requirement"}
              </Button>
            ) : null}
          </div>
        </div>

        {job ? (
          <div className="mt-3">
            <StatusMismatchBanner requirement={requirement} job={job} canEdit={permissions.canEditRequirement} />
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))] dark:border-white/10 dark:bg-white/5">
          {job ? (
            <Kv label="Job">
              <Badge tone={job.status === "OPEN" ? "success" : "neutral"}>{job.status === "OPEN" ? "Active" : "Inactive"}</Badge>
            </Kv>
          ) : null}
          <Kv label="Requirement">
            <Badge tone={STATUS_TONE[requirement.status] ?? "neutral"}>{sentence(requirement.status)}</Badge>
          </Kv>
          <Kv label="Review">
            <Badge tone={REVIEW_TONE[requirement.reviewStatus] ?? "neutral"}>{sentence(requirement.reviewStatus)}</Badge>
          </Kv>
          <Kv label="Version">{requirement.version}</Kv>
          <Kv label="Last reviewed">{requirement.lastReviewedAt ? formatMomentDate(requirement.lastReviewedAt) : "Never"}</Kv>
          <Kv label="Import confidence">
            {typeof requirement.extractionConfidence === "number" ? `${requirement.extractionConfidence}%` : "Not recorded"}
          </Kv>
        </div>

        {requirement.extractionWarnings.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {requirement.extractionWarnings.map((warning) => (
              <li key={warning} className="flex items-start gap-2 text-xs text-brand-grey dark:text-slate-400">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-gold" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <RequirementRoleBlock
        key={`role-${requirement.id}`}
        requirement={requirement}
        pageJobId={job?.id ?? null}
        // The Role block writes the requirement's operator, seat, aircraft, base
        // and pay text: admins and recruiters since 2026-09-23 (his call), every
        // save recorded in Change history. Same gate as the server action it
        // calls (saveRequirementRole in requirement-actions.ts).
        canEdit={permissions.canEditJob}
        canEditFleetPosition={permissions.canEditScoring}
      />

      {editing ? (
        <div className="space-y-3">
          {permissions.canEditScoring ? (
            <FleetPositionEditor
              key={`fleet-${requirement.id}`}
              requirementId={requirement.id}
              currentSlug={requirement.fleetPositionSlug}
              currentAdvertised={requirement.advertisedTitle}
              currentLinkedSlugs={requirement.linkedPositions.map((position) => position.slug)}
              rawTitle={requirement.title}
            />
          ) : null}
          {permissions.canEditRequirement ? (
            <PilotRequirementEditor key={`editor-${requirement.id}`} requirement={requirement} />
          ) : (
            <p className={clsx(CARD, "text-sm text-brand-grey dark:text-slate-400")}>
              The name, statuses and gates are changed by an admin.
            </p>
          )}
        </div>
      ) : (
        <>
          <GatesCard requirement={requirement} />
          <ManagedAircraftPanel
            key={`tails-${requirement.id}`}
            requirementId={requirement.id}
            variants={requirement.managedVariants}
            canEdit={permissions.canEditScoring}
          />
          <ChangeHistory requirement={requirement} />
        </>
      )}
    </div>
  );
}
