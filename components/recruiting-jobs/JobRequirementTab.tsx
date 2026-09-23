"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Info, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { attachRequirementToJob, createRequirementForJob } from "@/app/recruiting-jobs/requirement-actions";
import { RequirementPanel, type RequirementPermissions } from "@/components/recruiting-jobs/RequirementPanel";
import type { JobRequirementTabData } from "@/lib/data/pilot-requirements";

// The Pilot requirement tab on a job's page.
//
// "New requirement" lives here now, not on a requirements page: a pilot job with
// none gets "Set one up", built from the job. When a requirement with no job
// looks like this job's, it is offered — never attached on a guess.

const CARD = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold";

function sentence(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

function NoRequirementYet({
  job,
  data,
  canEdit
}: {
  job: { id: string; title: string };
  data: JobRequirementTabData;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(key: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusy(key);
    start(async () => {
      const result = await action();
      setBusy(null);
      if (!result.ok) {
        setError(result.error ?? "That did not work.");
        return;
      }
      router.refresh();
    });
  }

  const suggestions = data.suggestions;
  return (
    <section className={CARD}>
      <p className={EYEBROW}>Pilot requirement</p>
      <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">No pilot requirement for this job yet</h3>
      <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
        The requirement holds the seat, aircraft, hours and certificates candidates are checked against. Until this job
        has one it cannot be screened, and it is not on the Matchboard.
      </p>

      {suggestions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-sweet/60 bg-brand-sweet/15 p-3 dark:border-white/15 dark:bg-white/5"
            >
              <p className="flex min-w-0 items-start gap-2 text-sm text-brand-lea dark:text-slate-100">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-eden dark:text-brand-edenOnDark" />
                <span>
                  Possible match: <span className="font-semibold">{suggestion.title}</span>, an existing requirement with
                  no job ({[suggestion.operatorType, suggestion.pilotSeat, suggestion.tails.join(", "), sentence(suggestion.status)]
                    .filter(Boolean)
                    .join(" · ")}
                  ).{" "}
                  <Link
                    href={`/recruiting-jobs/requirements/${suggestion.id}`}
                    prefetch={false}
                    className="font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-edenOnDark"
                  >
                    Look at it first
                  </Link>
                </span>
              </p>
              {canEdit ? (
                <Button
                  size="sm"
                  onClick={() => run(suggestion.id, () => attachRequirementToJob({ requirementId: suggestion.id, jobId: job.id }))}
                  disabled={pending}
                >
                  {busy === suggestion.id ? "Attaching…" : `Attach “${suggestion.title}”`}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={suggestions.length > 0 ? "secondary" : "primary"}
            onClick={() => run("new", () => createRequirementForJob({ jobId: job.id }))}
            disabled={pending}
          >
            <Plus className="h-3.5 w-3.5" />
            {busy === "new" ? "Setting it up…" : suggestions.length > 0 ? "Start a new one instead" : "Set one up"}
          </Button>
          <span className="text-xs text-brand-grey dark:text-slate-400">
            Built from this job&apos;s seat, aircraft, base, pay and posting, with the standard requirements switched on
            from the posting. Check them before relying on screening.
          </span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">An admin can set one up here.</p>
      )}
      {error ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
    </section>
  );
}

export function JobRequirementTab({
  job,
  basePath,
  data,
  selectedId,
  onSelect,
  permissions
}: {
  job: { id: string; title: string; status: string };
  basePath: string;
  data: JobRequirementTabData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  permissions: RequirementPermissions;
}) {
  const requirements = data.requirements;
  if (requirements.length === 0) {
    // Set one up and Attach both write a requirement, so they need the
    // requirement permission (admins), not the job one - see requirement-actions.ts.
    return <NoRequirementYet job={job} data={data} canEdit={permissions.canEditRequirement} />;
  }

  const index = Math.max(0, requirements.findIndex((requirement) => requirement.id === selectedId));
  const selected = requirements[index];

  return (
    <div className="space-y-3">
      {requirements.length > 1 ? (
        <nav className={clsx(CARD, "py-3")} aria-label="Requirements on this job">
          <p className="text-xs font-semibold text-brand-grey dark:text-slate-400">
            Requirement {index + 1} of {requirements.length}
            <span className="font-normal">
              {" "}
              — this job holds more than one, because{" "}
              {requirements.some((requirement) => requirement.link === "merged")
                ? "jobs merged into it kept their own."
                : "more than one was set up for it."}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {requirements.map((requirement) => {
              const on = requirement.id === selected.id;
              return (
                <Link
                  key={requirement.id}
                  href={`${basePath}?tab=requirement&req=${requirement.id}`}
                  prefetch={false}
                  aria-current={on ? "true" : undefined}
                  // A real href, so ctrl-click opens it on its own; a plain click
                  // swaps the requirement in place, the same way the tabs do.
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    event.preventDefault();
                    onSelect(requirement.id);
                    window.history.replaceState(null, "", `${basePath}?tab=requirement&req=${requirement.id}`);
                  }}
                  className={clsx(
                    "flex items-center gap-2 rounded border px-3 py-1.5 text-sm transition hover:shadow-glow",
                    on
                      ? "border-brand-lea bg-brand-lea font-semibold text-white shadow-[inset_0_-3px_0_theme(colors.brand.gold)]"
                      : "border-brand-lea/10 bg-white text-brand-grey hover:text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
                  )}
                >
                  {requirement.title}
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5 text-[11px] font-bold",
                      on ? "bg-brand-gold text-brand-lea" : "bg-brand-lea/10 text-brand-eden dark:bg-white/10 dark:text-brand-sweet"
                    )}
                  >
                    {sentence(requirement.status)}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      <RequirementPanel key={selected.id} requirement={selected} job={job} permissions={permissions} />
    </div>
  );
}
