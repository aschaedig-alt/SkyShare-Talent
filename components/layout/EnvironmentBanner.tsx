function getEnvironmentLabel() {
  return process.env.NEXT_PUBLIC_APP_ENV ?? (process.env.NODE_ENV === "production" ? "Production" : "Local development");
}

function getEnvironmentDetail(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("production")) {
    return "Production runtime. Use real-data controls carefully.";
  }

  if (normalized.includes("staging") || normalized.includes("sandbox")) {
    return "Safe validation environment before production changes.";
  }

  return "Local workstation data and local file storage.";
}

export function EnvironmentBanner() {
  const label = getEnvironmentLabel();
  const detail = getEnvironmentDetail(label);

  return (
    <div className="border-b border-brand-lea/10 bg-white/90 px-5 py-2 text-xs text-brand-grey lg:px-8 dark:border-white/10 dark:text-slate-400">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-gold" />
          <span className="font-semibold text-brand-lea dark:text-slate-100">{label}</span>
          <span className="hidden text-brand-grey sm:inline dark:text-slate-400">- {detail}</span>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">SkyShare Talent</span>
      </div>
    </div>
  );
}
