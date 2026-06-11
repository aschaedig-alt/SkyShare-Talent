import { clsx } from "clsx";
import type { DuplicateReviewData } from "@/lib/data/duplicate-review";
import { CandidateDuplicateScanCard } from "@/components/duplicate-review/CandidateDuplicateScanCard";
import { JobDuplicateScanCard } from "@/components/duplicate-review/JobDuplicateScanCard";
import { CandidateDuplicateActions } from "@/components/duplicate-review/CandidateDuplicateActions";

type DuplicateReviewWorkspaceProps = {
  data: DuplicateReviewData;
};

const statLabels: Array<[keyof DuplicateReviewData["stats"], string]> = [
  ["open", "Open reviews"],
  ["candidate", "Candidate"],
  ["job", "Job"],
  ["file", "File"],
  ["resolved", "Resolved"]
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function DuplicateReviewWorkspace({ data }: DuplicateReviewWorkspaceProps) {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
          Review control
        </p>
        <h1 className="text-2xl font-semibold text-brand-lea">Duplicate Review</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          Central review queue for candidate duplicates, job variants, file assignment, and import exceptions.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statLabels.map(([key, label]) => (
          <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">{label}</div>
            <div className="mt-1 text-xl font-semibold text-brand-lea">{data.stats[key]}</div>
            <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
              <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
            </div>
          </div>
        ))}
      </section>

      <CandidateDuplicateScanCard />

      <JobDuplicateScanCard />

      <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
        <div className="border-b border-brand-lea/10 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Review queue</p>
          <h2 className="text-base font-semibold text-brand-lea">Open and recent review items</h2>
        </div>
        <div className="p-4">
          {data.items.length > 0 ? (
            <div className="space-y-2">
              {data.items.map((item) => (
                <div key={item.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-semibold text-brand-lea">{item.reviewType} review</div>
                      <div className="mt-1 text-xs text-brand-grey">
                        {[item.primary?.displayName, item.secondary?.displayName].filter(Boolean).join(" vs ") || "No linked entity"}
                      </div>
                    </div>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-1 text-[11px] font-semibold",
                        item.status === "OPEN" ? "bg-brand-gold/25 text-brand-lea" : "bg-emerald-100 text-emerald-700"
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-brand-grey sm:grid-cols-3">
                    <div>Reason: {item.reason ?? "Not recorded"}</div>
                    <div>Confidence: {item.confidence ?? "Not scored"}</div>
                    <div>Created: {formatDate(item.createdAt)}</div>
                  </div>

                  {item.reviewType === "CANDIDATE" && item.status === "OPEN" && (
                    <CandidateDuplicateActions itemId={item.id} primary={item.primary} secondary={item.secondary} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-8 text-center">
              <div className="text-lg font-semibold text-brand-lea">No duplicate review items yet</div>
              <p className="mt-2 text-sm text-brand-grey">
                Candidate and job duplicate detection will populate this queue after import APIs are built.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
