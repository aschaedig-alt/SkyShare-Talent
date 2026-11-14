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
      // Phones: a button in the top bar beside Feedback (AppShell draws the bar),
      // not a tab floating over the page's fields. lg and up: the side tab.
      className="group fixed right-[8.5rem] top-3 z-40 flex h-9 items-center gap-1.5 rounded bg-brand-lea px-2.5 text-white shadow-lg ring-1 ring-brand-lea/30 transition-all duration-200 hover:bg-brand-gold hover:text-brand-lea motion-reduce:transition-none dark:ring-white/10 lg:right-0 lg:top-24 lg:h-auto lg:rounded-l lg:rounded-r-none lg:py-2 lg:pl-2.5 lg:pr-3 lg:shadow-glow lg:hover:pr-4"
    >
      <Bookmark className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none" />
      <span className="text-xs font-bold uppercase tracking-wide">SOP</span>
      {/* The chapter name reveals on hover; collapsed by default so the tab stays small. */}
      <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold opacity-0 transition-all duration-200 group-hover:max-w-[220px] group-hover:opacity-100 motion-reduce:transition-none lg:inline">
        · {chapter.title}
      </span>
    </Link>
  );
}
