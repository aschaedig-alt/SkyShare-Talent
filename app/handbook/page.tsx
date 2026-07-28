import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { CHAPTERS, HANDBOOK_GROUPS, HANDBOOK_BOOK } from "@/lib/handbook/chapters";

export const dynamic = "force-dynamic";

export default async function HandbookIndexPage() {
  await requireModulePageAccess("handbook");

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-brand-gold" />
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Handbook</h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
          Every standard operating procedure in one place. Published chapters open here with their flow diagram;
          the rest are on the way. On a page that has an SOP, the bookmark in the top-right corner jumps you straight
          to it.
        </p>
        <Link
          href={`/handbook/${HANDBOOK_BOOK.slug}`}
          className="mt-4 inline-flex items-center gap-1.5 rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden"
        >
          <BookOpen className="h-4 w-4" />
          {HANDBOOK_BOOK.title}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {HANDBOOK_GROUPS.map((group) => {
        const chapters = CHAPTERS.filter((c) => c.group === group);
        if (chapters.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{group}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {chapters.map((c) =>
                c.status === "published" ? (
                  <Link
                    key={c.slug}
                    href={`/handbook/${c.slug}`}
                    className="group block rounded border border-brand-lea/10 bg-white p-4 shadow-panel transition-shadow hover:shadow-glow dark:border-white/10 dark:bg-brand-panel"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-base font-semibold text-brand-lea dark:text-slate-100">{c.title}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-brand-grey transition group-hover:translate-x-0.5 group-hover:text-brand-lea dark:text-slate-400" />
                    </div>
                    <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">{c.blurb}</p>
                  </Link>
                ) : (
                  <div
                    key={c.slug}
                    className="block rounded border border-dashed border-brand-lea/15 bg-brand-cloudDancer/30 p-4 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-base font-semibold text-brand-grey dark:text-slate-400">{c.title}</span>
                      <span className="shrink-0 rounded bg-brand-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-lea dark:text-slate-200">
                        Coming soon
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">{c.blurb}</p>
                  </div>
                )
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
