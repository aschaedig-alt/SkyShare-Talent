import Link from "next/link";
import { ClipboardList, ListChecks, Wand2 } from "lucide-react";

type InterviewView = "bank" | "guide" | "saved";

const tabs: Array<{ id: InterviewView; href: string; label: string; icon: typeof ListChecks }> = [
  { id: "bank", href: "/interview-questions", label: "Question bank", icon: ListChecks },
  { id: "guide", href: "/interview-questions/guide", label: "Build guide", icon: Wand2 },
  { id: "saved", href: "/interview-questions/guides", label: "Saved guides", icon: ClipboardList }
];

export function InterviewTabs({ active }: { active: InterviewView }) {
  return (
    // Wraps rather than scrolls sideways on a phone (always-works-on-mobile).
    <nav className="flex flex-wrap gap-1 rounded bg-white p-1 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      {tabs.map(({ id, href, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <Link
            key={id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold transition hover:shadow-glow sm:px-4 ${
              isActive ? "bg-brand-lea text-white shadow-sm" : "text-brand-grey hover:bg-brand-cloudDancer/70 hover:text-brand-lea dark:text-slate-400 dark:bg-white/5"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
