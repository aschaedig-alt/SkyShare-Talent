import Link from "next/link";
import { List, BarChart3, Bookmark } from "lucide-react";

type CandidateView = "list" | "compare" | "views";

// Saved views need a permanent door. Without one they were reachable only from
// the Compare tab when NO view was open — so opening a shortlist was a one-way
// trip and the view read as lost.
const tabs: Array<{ id: CandidateView; href: string; label: string; icon: typeof List }> = [
  { id: "list", href: "/candidates", label: "Records", icon: List },
  { id: "views", href: "/candidates/views", label: "Saved views", icon: Bookmark },
  { id: "compare", href: "/candidates/compare", label: "Compare", icon: BarChart3 }
];

export function CandidateViewTabs({ active }: { active: CandidateView }) {
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
              isActive
                ? "bg-brand-lea text-white shadow-sm"
                : "text-brand-grey hover:bg-brand-cloudDancer/70 hover:text-brand-lea dark:text-slate-400 dark:bg-white/5"
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
