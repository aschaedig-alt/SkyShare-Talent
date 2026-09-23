import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Plane } from "lucide-react";
import { RequirementPanel } from "@/components/recruiting-jobs/RequirementPanel";
import { getNoJobRequirementPage, resolveRequirementHome } from "@/lib/data/pilot-requirements";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission, isAdminOrRecruiter } from "@/lib/auth/roles";

type RequirementPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

// Which of the job's sections a caller may ask to land on. The Matchboard's
// "Open job" asks for the Overview; everything else wants the requirement itself.
const LANDING_TABS = new Set(["overview", "requirement", "candidates", "screening", "source"]);

/**
 * A pilot requirement's own address: /recruiting-jobs/requirements/<id>.
 *
 * A requirement that belongs to a live job (directly, or through a job that was
 * merged into it) is shown on that job's Pilot requirement tab, so this forwards
 * there. One with no job at all is shown here, with the same blocks the tab has,
 * so it stays findable and editable now that the Pilot Requirements page is gone.
 * The "no job" list under the jobs list links here.
 */
export default async function RequirementPage({ params, searchParams }: RequirementPageProps) {
  const access = await requireModulePageAccess("recruiting-jobs");
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const home = await resolveRequirementHome(id);
  if (!home.exists) {
    notFound();
  }
  if (home.jobId) {
    const tab = sp?.tab && LANDING_TABS.has(sp.tab) ? sp.tab : "requirement";
    redirect(`/recruiting-jobs/${home.jobId}?tab=${tab}&req=${encodeURIComponent(id)}`);
  }

  const page = await getNoJobRequirementPage(id);
  if (!page) {
    notFound();
  }
  const { requirement, matchingJobs } = page;
  const tails = requirement.managedVariants.map((variant) => variant.tailNumber);
  const facts = [requirement.pilotSeat, requirement.operatorType, tails.length ? `Tail ${tails.join(", ")}` : null].filter(
    Boolean
  );

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <Link
        href="/recruiting-jobs"
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-eden underline-offset-2 transition hover:underline dark:text-brand-sweet"
      >
        <ChevronLeft className="h-4 w-4" />
        All jobs
      </Link>

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Pilot requirement · no job</p>
        <h1 className="break-words text-2xl font-semibold text-brand-lea dark:text-slate-100">{requirement.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-brand-grey dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-eden dark:text-brand-sweet">
            <Plane className="h-3.5 w-3.5" /> Pilot
          </span>
          {facts.map((fact) => (
            <span key={fact} className="flex items-center gap-x-2">
              <span aria-hidden className="text-brand-lea/25 dark:text-white/20">
                ·
              </span>
              {fact}
            </span>
          ))}
        </p>

        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Not attached to a live job.</span>{" "}
              {requirement.sourceJobTitle
                ? `Its job, “${requirement.sourceJobTitle}”, was merged into a job that no longer exists.`
                : "It was set up without a job."}{" "}
              It stays listed under the jobs list so its hours, certificates and tail numbers are not lost.
            </span>
          </p>
          {matchingJobs.length > 0 ? (
            <div className="mt-2 border-t border-amber-300/60 pt-2 dark:border-amber-500/20">
              <p className="text-xs">
                Jobs that look like this one. A job with no requirement of its own offers to attach this one on its
                Pilot requirement tab:
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {matchingJobs.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/recruiting-jobs/${job.id}?tab=requirement`}
                      className="inline-flex items-center gap-1 rounded border border-amber-400/60 bg-white px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow dark:border-amber-500/30 dark:bg-brand-panel dark:text-slate-100"
                    >
                      {job.title}
                      <span className="font-normal text-brand-grey dark:text-slate-400">
                        {job.status === "OPEN" ? "Active" : "Inactive"}
                        {job.hasRequirement ? " · has its own requirement" : ""}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <RequirementPanel
        requirement={requirement}
        job={null}
        permissions={{
          canEditJob: hasPermission(access.role, "jobs:write"),
          canEditRequirement: hasPermission(access.role, "requirements:write"),
          canEditScoring: isAdminOrRecruiter(access.role)
        }}
      />
    </div>
  );
}
