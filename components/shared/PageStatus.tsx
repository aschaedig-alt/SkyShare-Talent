type PageStatusProps = {
  eyebrow?: string;
  title: string;
  detail: string;
};

export function PageStatus({ eyebrow = "SkyShare Journey", title, detail }: PageStatusProps) {
  return (
    <div className="flex min-h-[calc(100vh-42px)] items-center justify-center px-5 py-8">
      <section className="w-full max-w-xl rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-brand-gold" />
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">{eyebrow}</p>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-brand-lea dark:text-slate-100">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-brand-grey dark:text-slate-400">{detail}</p>
      </section>
    </div>
  );
}
