import Link from "next/link";
import { BuildChecklistPanel } from "@/components/layout/BuildChecklistPanel";
import type { CommandCenterData } from "@/lib/data/command-center";

type CommandCenterWorkspaceProps = {
  data: CommandCenterData;
};

const statLabels: Array<[keyof CommandCenterData["stats"], string, string]> = [
  ["candidates", "Candidates", "/candidates"],
  ["files", "Files", "/candidates"],
  ["jobs", "Jobs", "/recruiting-jobs"],
  ["pilotRequirements", "Pilot requirements", "/pilot-requirements"],
  ["openImports", "Import queue", "/imports"],
  ["scheduledInterviews", "Interviews", "/calendar"]
];

export function CommandCenterWorkspace({ data }: CommandCenterWorkspaceProps) {
  return (
    <div className="grid gap-4 px-5 py-5 lg:px-8 xl:grid-cols-[1fr_340px]">
      <main className="space-y-4">
        <div className="rounded border-2 border-red-500 bg-red-100 p-4 text-sm font-bold text-red-700">
          🚨 DEBUG BOX - If you see this, deployments are working! (Timestamp: {new Date().toLocaleTimeString()})
        </div>

        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
            Recruiting command center
          </p>
          <h1 className="text-2xl font-semibold text-brand-lea">Command Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          Operational overview for SkyShare Talent: candidates, roles, requirements, imports, and scheduling signals.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {statLabels.map(([key, label, href]) => (
            <Link key={key} href={href} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 transition hover:ring-brand-sweet">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">{label}</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea">{data.stats[key]}</div>
              <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
                <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
              </div>
            </Link>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Attention</p>
            <h2 className="text-base font-semibold text-brand-lea">Needs action</h2>
            <div className="mt-3 space-y-2">
              {data.attentionItems.map((item) => (
                <Link key={item.label} href={item.href} className="block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition hover:border-brand-sweet hover:bg-brand-sweet/18">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-brand-lea">{item.label}</div>
                      <div className="mt-1 text-xs text-brand-grey">{item.detail}</div>
                    </div>
                    <div className="text-xl font-semibold text-brand-lea">{item.value}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Pipeline</p>
            <h2 className="text-base font-semibold text-brand-lea">Candidate readiness</h2>
            <div className="mt-3 space-y-2">
              {data.readiness.map((item) => (
                <div key={item.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-brand-lea">{item.label}</span>
                    <span className="text-sm font-semibold text-brand-lea">{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Recent candidates</p>
            <h2 className="text-base font-semibold text-brand-lea">Latest records</h2>
            <div className="mt-3 space-y-2">
              {data.recentCandidates.map((candidate) => (
                <Link key={candidate.id} href={`/candidates/${candidate.id}`} className="block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition hover:border-brand-sweet hover:bg-brand-sweet/18">
                  <div className="font-semibold text-brand-lea">{candidate.displayName}</div>
                  <div className="mt-1 text-xs text-brand-grey">
                    {[candidate.currentTitle, candidate.stage].filter(Boolean).join(" - ")}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Role operations</p>
          <h2 className="text-base font-semibold text-brand-lea">Recent jobs</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.recentJobs.map((job) => (
              <Link key={job.id} href={`/recruiting-jobs?id=${job.id}`} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition hover:border-brand-sweet hover:bg-brand-sweet/18">
                <div className="font-semibold text-brand-lea">{job.title}</div>
                <div className="mt-1 text-xs text-brand-grey">
                  {job.status} - {job.isPilotRole ? "Pilot role" : "Support role"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <div className="space-y-4">
        <BuildChecklistPanel />
      </div>
    </div>
  );
}
