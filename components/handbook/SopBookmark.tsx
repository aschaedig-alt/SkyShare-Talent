"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark } from "lucide-react";
import { chapterForPathname } from "@/lib/handbook/chapters";

// Rendered ONCE in the app shell. It reads the current route and, if that page
// has an SOP, shows a bookmark in the top-right corner that opens the right
// chapter. Same component, same spot, every page — the target is the only thing
// that changes. Pages with no SOP render nothing.

export function SopBookmark() {
  const pathname = usePathname() ?? "";
  const chapter = chapterForPathname(pathname);
  if (!chapter) return null;

  return (
    <Link
      href={`/handbook/${chapter.slug}`}
      title={`Open the SOP for this page: ${chapter.title}`}
      aria-label={`Open the SOP for this page: ${chapter.title}`}
      className="group fixed right-0 top-24 z-40 flex items-center gap-1.5 rounded-l bg-brand-lea py-2 pl-2.5 pr-3 text-white shadow-glow ring-1 ring-brand-lea/30 transition-all duration-200 hover:bg-brand-gold hover:pr-4 hover:text-brand-lea motion-reduce:transition-none dark:ring-white/10"
    >
      <Bookmark className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none" />
      <span className="text-xs font-bold uppercase tracking-wide">SOP</span>
      {/* The chapter name reveals on hover; collapsed by default so the tab stays small. */}
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold opacity-0 transition-all duration-200 group-hover:max-w-[220px] group-hover:opacity-100 motion-reduce:transition-none">
        · {chapter.title}
      </span>
    </Link>
  );
}
