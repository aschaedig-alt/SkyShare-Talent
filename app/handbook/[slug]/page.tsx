import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { chapterFileForSlug } from "@/lib/handbook/chapters";
import { SopFrame } from "@/components/handbook/SopFrame";

export const dynamic = "force-dynamic";

export default async function HandbookChapterPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireModulePageAccess("handbook");
  const { slug } = await params;
  const chapter = chapterFileForSlug(slug);
  if (!chapter) notFound();

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/handbook"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Handbook
        </Link>
        <h1 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{chapter.title}</h1>
      </div>
      <SopFrame slug={slug} title={chapter.title} />
      <p className="flex items-center gap-1.5 text-xs text-brand-grey dark:text-slate-400">
        <ExternalLink className="h-3.5 w-3.5" />
        This SOP lives in the repo at <code className="rounded bg-brand-cloudDancer/60 px-1 py-0.5 dark:bg-white/10">docs/sops</code> — edit there and it updates here.
      </p>
    </div>
  );
}
