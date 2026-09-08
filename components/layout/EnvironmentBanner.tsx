function getEnvironmentLabel() {
  return process.env.NEXT_PUBLIC_APP_ENV ?? (process.env.NODE_ENV === "production" ? "Production" : "Local development");
}

/**
 * The line under the environment name.
 *
 * IT MUST NOT PROMISE SAFETY THIS PROJECT DOES NOT HAVE. There is one Neon
 * database and every environment points at it, and since 2026-07-30 local dev
 * writes the live S3 bucket too, so there is no environment where a mistake is
 * contained. Two of the three lines here said otherwise:
 *
 *   staging  said "Safe validation environment before production changes", on the
 *            deployment the TEAM ACTUALLY USES. Removed on his instruction
 *            2026-09-08, once it turned out journey is the live site and had been
 *            labelled staging all along.
 *   local    said "Local workstation data and local file storage". Both halves are
 *            false and it is the more dangerous of the two, because it is the exact
 *            belief behind the Jul 27 incident: a backfill run from the laptop wrote
 *            411 rows into the live database pointing at S3 keys that were never
 *            uploaded, every one of which showed on a real candidate's profile and
 *            could not be opened.
 *
 * So a detail line now either states a real risk or says nothing at all. If a
 * genuinely isolated environment is ever set up, give it its own label and its own
 * honest line rather than reviving these.
 */
function getEnvironmentDetail(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("production")) {
    return "Production runtime. Use real-data controls carefully.";
  }

  if (normalized.includes("staging") || normalized.includes("sandbox")) {
    // Deliberately nothing. Naming the environment is useful; reassuring anybody
    // about it is not true here.
    return null;
  }

  return "Shared live database and live file storage - the same data production uses.";
}

export function EnvironmentBanner() {
  const label = getEnvironmentLabel();
  const detail = getEnvironmentDetail(label);

  return (
    <div className="border-b border-brand-lea/10 bg-white/90 px-5 py-2 text-xs text-brand-grey lg:px-8 print:hidden dark:border-white/10 dark:bg-brand-panel/90 dark:text-slate-400">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-gold" />
          <span className="font-semibold text-brand-lea dark:text-slate-100">{label}</span>
          {detail ? (
            <span className="hidden text-brand-grey sm:inline dark:text-slate-400">- {detail}</span>
          ) : null}
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">SkyShare Journey</span>
      </div>
    </div>
  );
}
