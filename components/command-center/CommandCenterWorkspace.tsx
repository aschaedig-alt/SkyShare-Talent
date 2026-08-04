import Link from "next/link";
import { ProjectChecklistWorkspace } from "@/components/workspace/ProjectChecklistWorkspace";
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
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <main className="space-y-4">
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
            Recruiting command center
          </p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Command Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
          Operational overview for SkyShare Journey: candidates, roles, requirements, imports, and scheduling signals.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {statLabels.map(([key, label, href]) => (
            <Link key={key} href={href} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 transition-shadow hover:shadow-glow dark:bg-brand-panel dark:ring-white/10">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">{label}</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{data.stats[key]}</div>
              {/*
                A hardcoded w-2/3 meter used to sit here, inside the map, so
                every tile showed a bar reading two thirds regardless of its
                number. No dynamic width was ever computed. It read as data and
                was not, so it is gone rather than reworked — the number is the
                information on this tile.
              */}
            </Link>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Attention</p>
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Needs action</h2>
            <div className="mt-3 space-y-2">
              {data.attentionItems.map((item) => (
                <Link key={item.label} href={item.href} className="block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition-shadow hover:shadow-glow dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-brand-lea dark:text-slate-100">{item.label}</div>
                      <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{item.detail}</div>
                    </div>
                    <div className="text-xl font-semibold text-brand-lea dark:text-slate-100">{item.value}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Pipeline</p>
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Candidate readiness</h2>
            <div className="mt-3 space-y-2">
              {data.readiness.map((item) => (
                <div key={item.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{item.label}</span>
                    <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Recent candidates</p>
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Latest records</h2>
            <div className="mt-3 space-y-2">
              {data.recentCandidates.map((candidate) => (
                <Link key={candidate.id} href={`/candidates/${candidate.id}`} className="block rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition-shadow hover:shadow-glow dark:border-white/10 dark:bg-white/5">
                  <div className="font-semibold text-brand-lea dark:text-slate-100">{candidate.displayName}</div>
                  <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                    {[candidate.currentTitle, candidate.stage].filter(Boolean).join(" - ")}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Role operations</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Recent jobs</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.recentJobs.map((job) => (
              <Link key={job.id} href={`/recruiting-jobs?id=${job.id}`} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 transition-shadow hover:shadow-glow dark:border-white/10 dark:bg-white/5">
                <div className="font-semibold text-brand-lea dark:text-slate-100">{job.title}</div>
                <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                  {job.status} - {job.isPilotRole ? "Pilot role" : "Support role"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Project Checklist */}
      <ProjectChecklistWorkspace />
    </div>
  );
}
