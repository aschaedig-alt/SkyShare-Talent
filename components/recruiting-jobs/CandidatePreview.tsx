"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { X, ExternalLink, Mail, Phone, FileText, StickyNote, Briefcase } from "lucide-react";
import { readinessStyles, initials } from "@/components/pilot-requirements/MatchCard";
import { ScoreSplit } from "@/components/pilot-requirements/ScoreSplit";
import { SCAN_EXCLUSION_LABELS, isScanExclusionReason } from "@/lib/candidates/scan-exclusion";
import type { CandidatePreview as CandidatePreviewData } from "@/app/pilot-requirements/scoring-actions";
import type { PilotRequirementCandidateMatch } from "@/lib/matching/pilot-requirement-matches";

export function CandidatePreview({
  preview,
  loading,
  match,
  onClose
}: {
  preview: CandidatePreviewData | null;
  loading: boolean;
  match?: PilotRequirementCandidateMatch;
  onClose: () => void;
}) {
  const excluded = preview && isScanExclusionReason(preview.scanExcludedReason) ? preview.scanExcludedReason : null;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-brand-lea/15 bg-white">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-brand-lea/10 bg-brand-cloudDancer/35 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-sweet/30 text-xs font-semibold text-brand-lea">
            {preview ? initials(preview.displayName) : "…"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-brand-lea">{preview?.displayName ?? "Loading…"}</div>
            <div className="truncate text-xs text-brand-grey">
              {preview ? [preview.currentTitle, preview.stage].filter(Boolean).join(" · ") || "No title on file" : ""}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="shrink-0 rounded p-1 text-brand-grey transition hover:bg-brand-cloudDancer hover:text-brand-lea"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {loading || !preview ? (
          <p className="text-xs text-brand-grey">Loading candidate…</p>
        ) : (
          <>
            {match ? (
              <div className="rounded-element border border-brand-lea/10 bg-brand-cloudDancer/30 p-2.5">
                <div className="flex items-center gap-2">
                  <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", readinessStyles[match.readiness])}>
                    {match.readiness}
                  </span>
                </div>
                <div className="mt-2">
                  <ScoreSplit qualified={match.qualified} bonus={match.bonus} gated={match.gated} size="sm" />
                </div>
                <p className="mt-1.5 text-xs leading-5 text-brand-black/75">{match.summary}</p>
              </div>
            ) : null}

            {excluded ? (
              <div className="rounded-element border border-brand-lea/10 bg-brand-cloudDancer/45 px-2.5 py-1.5 text-xs text-brand-grey">
                Ignored in scans · <span className="font-semibold text-brand-lea">{SCAN_EXCLUSION_LABELS[excluded]}</span>
                {preview.scanExcludedNote ? <span> — {preview.scanExcludedNote}</span> : null}
              </div>
            ) : null}

            <div className="space-y-1.5">
              {preview.primaryEmail ? (
                <div className="flex items-center gap-2 text-xs text-brand-black/80">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-brand-grey" />
                  <span className="truncate">{preview.primaryEmail}</span>
                </div>
              ) : null}
              {preview.primaryPhone ? (
                <div className="flex items-center gap-2 text-xs text-brand-black/80">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-brand-grey" />
                  <span className="truncate">{preview.primaryPhone}</span>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-2 text-center">
                <FileText className="mx-auto h-3.5 w-3.5 text-brand-grey" />
                <div className="mt-1 text-sm font-semibold text-brand-lea">{preview.fileCount}</div>
                <div className="text-[9px] font-bold uppercase tracking-wide text-brand-grey">Docs</div>
              </div>
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-2 text-center">
                <StickyNote className="mx-auto h-3.5 w-3.5 text-brand-grey" />
                <div className="mt-1 text-sm font-semibold text-brand-lea">{preview.noteCount}</div>
                <div className="text-[9px] font-bold uppercase tracking-wide text-brand-grey">Notes</div>
              </div>
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-2 text-center">
                <Briefcase className="mx-auto h-3.5 w-3.5 text-brand-grey" />
                <div className="mt-1 text-sm font-semibold text-brand-lea">{preview.applicationCount}</div>
                <div className="text-[9px] font-bold uppercase tracking-wide text-brand-grey">Jobs</div>
              </div>
            </div>

            {preview.owner || preview.source ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {preview.owner ? (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-brand-grey">Owner</div>
                    <div className="truncate text-brand-lea">{preview.owner}</div>
                  </div>
                ) : null}
                {preview.source ? (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-brand-grey">Source</div>
                    <div className="truncate text-brand-lea">{preview.source}</div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {preview.metrics.length > 0 ? (
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">Flight profile</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {preview.metrics.map((metric) => (
                    <div key={metric.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-brand-grey">{metric.label}</span>
                      <span className="shrink-0 font-semibold text-brand-lea">{metric.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-brand-grey">No structured flight data extracted yet.</p>
            )}
          </>
        )}
      </div>

      {preview ? (
        <div className="shrink-0 border-t border-brand-lea/10 p-2.5">
          <Link
            href={`/candidates/${preview.id}`}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-element bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden"
          >
            Open full profile <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
