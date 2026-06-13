import { clsx } from "clsx";
import { Avatar } from "@/components/compliments/Avatar";
import type { LeaderEntry } from "@/lib/data/compliments";

type LeaderboardProps = {
  title: string;
  emoji: string;
  entries: LeaderEntry[];
  unit: string;
  emptyText: string;
  subtitle?: string;
};

// Medal tint for the top three ranks; plain number after that.
const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ title, emoji, entries, unit, emptyText, subtitle }: LeaderboardProps) {
  return (
    <div className="rounded-card border-[0.5px] border-brand-lea/15 bg-white p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-medium text-brand-lea">
          <span className="mr-1.5" aria-hidden="true">
            {emoji}
          </span>
          {title}
        </h2>
        {subtitle ? <span className="text-xs text-brand-grey">{subtitle}</span> : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-brand-grey">{emptyText}</p>
      ) : (
        <ul>
          {entries.map((entry, i) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 border-b border-brand-lea/10 py-2.5 last:border-0"
            >
              <span
                className={clsx(
                  "flex h-6 w-6 shrink-0 items-center justify-center text-sm",
                  i > 2 && "font-medium text-brand-grey"
                )}
                aria-hidden="true"
              >
                {MEDALS[i] ?? i + 1}
              </span>
              <Avatar name={entry.name} initials={entry.initials} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-brand-lea">{entry.name}</p>
                <p className="truncate text-xs text-brand-grey">{entry.department ?? "New hire"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-brand-lea">{entry.count}</p>
                <p className="text-xs text-brand-grey">{unit}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
