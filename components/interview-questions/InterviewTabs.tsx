import Link from "next/link";
import { ListChecks, Wand2 } from "lucide-react";

type InterviewView = "bank" | "guide";

const tabs: Array<{ id: InterviewView; href: string; label: string; icon: typeof ListChecks }> = [
  { id: "bank", href: "/interview-questions", label: "Question bank", icon: ListChecks },
  { id: "guide", href: "/interview-questions/guide", label: "Build guide", icon: Wand2 }
];

export function InterviewTabs({ active }: { active: InterviewView }) {
  return (
    <nav className="flex gap-1 rounded bg-white p-1 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      {tabs.map(({ id, href, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <Link
            key={id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold transition hover:shadow-glow ${
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
