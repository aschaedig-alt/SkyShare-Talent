import Link from "next/link";
import type { CandidateListData } from "@/lib/data/candidates";

type CandidatesWorkspaceProps = {
  data: CandidateListData;
  query: string;
};

const statLabels: Array<[keyof CandidateListData["stats"], string]> = [
  ["total", "Total candidates"],
  ["active", "Active"],
  ["withFiles", "With files"],
  ["withApplications", "With applications"],
  ["scheduledInterviews", "Scheduled interviews"]
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function CandidatesWorkspace({ data, query }: CandidatesWorkspaceProps) {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
              Candidate operations
            </p>
            <h1 className="text-2xl font-semibold text-brand-lea">Candidates</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-grey">
              First live Prisma-backed candidate workspace in the unified app. This starts with
              records, files, notes, applications, and operational status.
            </p>
          </div>
          <form className="flex w-full gap-2 xl:w-[520px]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search name, role, email, phone, tag, source"
              className="min-w-0 flex-1 rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
            />
            <button
              type="submit"
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statLabels.map(([key, label]) => (
          <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">
              {label}
            </div>
            <div className="mt-1 text-xl font-semibold text-brand-lea">{data.stats[key]}</div>
            <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
              <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
            </div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex items-center justify-between border-b border-brand-lea/10 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-brand-lea">Candidate records</h2>
            <p className="text-xs text-brand-grey">
              Showing up to 100 records{query ? ` matching "${query}"` : ""}.
            </p>
          </div>
        </div>

        {data.candidates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead className="bg-brand-cloudDancer/70 text-[11px] uppercase tracking-[0.16em] text-brand-grey">
                <tr>
                  <th className="px-4 py-3 font-bold">Candidate</th>
                  <th className="px-4 py-3 font-bold">Stage</th>
                  <th className="px-4 py-3 font-bold">Contact</th>
                  <th className="px-4 py-3 font-bold">Tags</th>
                  <th className="px-4 py-3 font-bold">Activity</th>
                  <th className="px-4 py-3 font-bold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-lea/10">
                {data.candidates.map((candidate) => (
                  <tr key={candidate.id} className="transition hover:bg-brand-sweet/12">
                    <td className="px-4 py-3">
                      <Link
                        href={`/candidates/${candidate.id}`}
                        className="font-semibold text-brand-lea hover:text-brand-eden"
                      >
                        {candidate.displayName}
                      </Link>
                      <div className="text-xs text-brand-grey">{candidate.currentTitle ?? "No current role"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-brand-gold/30 bg-brand-gold/10 px-2 py-1 text-xs font-semibold text-brand-lea">
                        {candidate.stage ?? "No stage"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-grey">
                      <div>{candidate.primaryEmail ?? "No email"}</div>
                      <div>{candidate.primaryPhone ?? "No phone"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {candidate.tags.length > 0 ? (
                          candidate.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-brand-sweet/25 px-2 py-0.5 text-[11px] font-semibold text-brand-lea">
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-brand-grey">No tags</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-grey">
                      <div>{candidate.fileCount} files</div>
                      <div>{candidate.noteCount} notes</div>
                      <div>{candidate.applicationCount} applications</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-grey">{formatDate(candidate.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-12 text-center">
            <div className="text-base font-semibold text-brand-lea">No candidates found</div>
            <p className="mt-2 text-sm text-brand-grey">
              Seed data will appear here after the local recruiting seed runs, or clear the search.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
