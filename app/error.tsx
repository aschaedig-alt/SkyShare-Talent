"use client";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="flex min-h-[calc(100vh-42px)] items-center justify-center px-5 py-8">
      <section className="w-full max-w-xl rounded bg-white p-5 shadow-panel ring-1 ring-brand-red/20 dark:bg-brand-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-red">Workspace error</p>
        <h1 className="mt-2 text-xl font-semibold text-brand-lea dark:text-slate-100">Something did not load correctly</h1>
        <p className="mt-2 text-sm leading-6 text-brand-grey dark:text-slate-400">
          Try loading the workspace again. If this repeats, capture the page and action that caused it.
        </p>
        <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 text-xs text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          {error.digest ? `Reference: ${error.digest}` : error.message}
        </div>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden"
        >
          Try again
        </button>
      </section>
    </div>
  );
}
