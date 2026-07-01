import type { ImportsData } from "@/lib/data/imports";
import { CandidateCsvImportCard } from "@/components/imports/CandidateCsvImportCard";
import {
  JobPdfImportCard,
  JobsCsvImportCard,
  RequirementCatalogImportCard,
  ResumeFileUploadImportCard
} from "@/components/imports/ImportActionCards";

type ImportsWorkspaceProps = {
  data: ImportsData;
};

const statLabels: Array<[keyof ImportsData["stats"], string]> = [
  ["batches", "Import batches"],
  ["importedRows", "Imported rows"],
  ["warnings", "Warnings"],
  ["errors", "Errors"],
  ["pendingRows", "Pending rows"]
];

function formatDate(value: string | null) {
  if (!value) {
    return "Not completed";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function ImportsWorkspace({ data }: ImportsWorkspaceProps) {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
              Data intake
            </p>
            <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Imports / Uploads</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
              Central home for candidate imports, job imports, file uploads, requirement catalog updates, and manual review queues.
            </p>
          </div>
          <div className="rounded bg-brand-cloudDancer px-3 py-1 text-xs font-semibold text-brand-eden dark:bg-white/5">
            Local-first foundation
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statLabels.map(([key, label]) => (
          <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">
              {label}
            </div>
            <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{data.stats[key]}</div>
            <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
              <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <CandidateCsvImportCard />
        <ResumeFileUploadImportCard />
        <JobsCsvImportCard />
        <JobPdfImportCard />
        <RequirementCatalogImportCard />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
              Import history
            </p>
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Recent batches</h2>
          </div>
          <div className="p-4">
            {data.batches.length > 0 ? (
              <div className="space-y-2">
                {data.batches.map((batch) => (
                  <div key={batch.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-brand-lea dark:text-slate-100">{batch.sourceType.replaceAll("_", " ")}</div>
                        <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                          {batch.sourceFilename ?? "No filename"} - {formatDate(batch.completedAt)}
                        </div>
                      </div>
                      <span className="rounded bg-brand-sweet/25 px-2 py-1 text-[11px] font-semibold text-brand-lea dark:text-slate-100">
                        {batch.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-brand-grey sm:grid-cols-5 dark:text-slate-400">
                      <div>{batch.rowCount} rows</div>
                      <div>{batch.importedCount} imported</div>
                      <div>{batch.skippedCount} skipped</div>
                      <div>{batch.warningCount} warnings</div>
                      <div>{batch.errorCount} errors</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-6 text-center dark:border-white/10 dark:bg-white/5">
                <div className="font-semibold text-brand-lea dark:text-slate-100">No import batches yet</div>
                <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">Import history will appear here after the first parser workflow is built.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
              Review queue
            </p>
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Recent import rows</h2>
          </div>
          <div className="max-h-[460px] overflow-y-auto p-4">
            {data.recentRows.length > 0 ? (
              <div className="space-y-2">
                {data.recentRows.map((row) => (
                  <div key={row.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="font-semibold text-brand-lea dark:text-slate-100">
                      {row.candidateName ?? row.jobTitle ?? `Row ${row.rowNumber ?? "unknown"}`}
                    </div>
                    <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                      {row.status} - {formatDate(row.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                No row-level review records yet.
              </p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
