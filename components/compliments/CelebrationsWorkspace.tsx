import Link from "next/link";
import { clsx } from "clsx";
import { PartyPopper, Cake, Gift } from "lucide-react";
import { Card } from "@/components/compliments/Card";
import { Avatar } from "@/components/compliments/Avatar";
import type { Celebration, CelebrationsData } from "@/lib/data/compliments";

function relativeLabel(daysUntil: number, dateYmd: string): string {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  const d = new Date(`${dateYmd}T00:00:00`);
  if (daysUntil <= 6) return new Intl.DateTimeFormat("en", { weekday: "long" }).format(d);
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(d);
}

function anniversaryLabel(years: number): string {
  return `${years}-year anniversary`;
}

function CelebrationRow({ c, highlight = false }: { c: Celebration; highlight?: boolean }) {
  const isBirthday = c.type === "birthday";
  const badge = isBirthday ? "🎂 Birthday" : `🎉 ${anniversaryLabel(c.years ?? 0)}`;
  const subtitle = [c.position, c.department].filter(Boolean).join(" · ");
  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-element border-[0.5px] p-3 transition",
        highlight
          ? "border-brand-gold/40 bg-white/80 dark:bg-white/5"
          : "border-brand-lea/15 hover:border-brand-gold/40 hover:shadow-glow dark:border-white/10"
      )}
    >
      <div className="relative shrink-0">
        <Avatar name={c.name} initials={c.initials} size="md" />
        <span
          aria-hidden
          className={clsx(
            "absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ring-2 ring-white dark:ring-brand-panel",
            isBirthday ? "bg-value-customerFocus-light" : "bg-brand-gold/25"
          )}
        >
          {isBirthday ? <Cake className="h-3 w-3 text-value-customerFocus-dark" /> : <Gift className="h-3 w-3 text-brand-lea dark:text-brand-gold" />}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-brand-lea dark:text-slate-100">{c.name}</p>
        <p className="truncate text-[13px] text-brand-grey dark:text-slate-400">
          <span className="font-medium text-brand-lea/80 dark:text-slate-300">{badge}</span>
          {subtitle ? <span> · {subtitle}</span> : null}
        </p>
      </div>

      <div className="hidden shrink-0 text-right text-xs text-brand-grey dark:text-slate-400 sm:block">
        {relativeLabel(c.daysUntil, c.date)}
      </div>

      <Link
        href={`/compliments/give?recipient=${c.personId}`}
        className="shrink-0 rounded-element bg-brand-lea px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-eden"
      >
        Recognize
      </Link>
    </div>
  );
}

function Section({ title, items, highlight = false }: { title: string; items: Celebration[]; highlight?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
        {title} <span className="text-brand-lea/50 dark:text-slate-500">· {items.length}</span>
      </h2>
      <div className="space-y-2">
        {items.map((c) => (
          <CelebrationRow key={`${c.type}-${c.personId}`} c={c} highlight={highlight} />
        ))}
      </div>
    </div>
  );
}

export function CelebrationsWorkspace({ data }: { data: CelebrationsData }) {
  const thisWeek = data.upcoming.filter((c) => c.daysUntil <= 7);
  const later = data.upcoming.filter((c) => c.daysUntil > 7);
  const total = data.today.length + data.upcoming.length;
  const birthdays = [...data.today, ...data.upcoming].filter((c) => c.type === "birthday").length;
  const anniversaries = total - birthdays;

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-medium text-brand-lea dark:text-slate-100">
              <PartyPopper className="h-5 w-5 text-brand-gold" />
              Celebrations
            </h2>
            <p className="mt-0.5 text-sm text-brand-grey dark:text-slate-400">
              {total === 0
                ? `No birthdays or work anniversaries in the next ${data.windowDays} days.`
                : `${birthdays} birthday${birthdays === 1 ? "" : "s"} and ${anniversaries} work anniversar${anniversaries === 1 ? "y" : "ies"} in the next ${data.windowDays} days. Send a little SkyShare love.`}
            </p>
          </div>
        </div>
      </Card>

      {data.today.length > 0 && (
        <Card padding="lg" className="border-brand-gold/40 bg-gradient-to-br from-brand-gold/15 to-transparent">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-brand-lea dark:text-slate-100">
            <span aria-hidden>🎉</span> Celebrate today
          </h2>
          <div className="space-y-2">
            {data.today.map((c) => (
              <CelebrationRow key={`today-${c.type}-${c.personId}`} c={c} highlight />
            ))}
          </div>
        </Card>
      )}

      {total === 0 ? (
        <Card padding="lg">
          <p className="py-6 text-center text-sm text-brand-grey dark:text-slate-400">
            Nothing on the calendar just yet. Birthdays and start dates come from each person&apos;s employee record.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          <Section title="This week" items={thisWeek} />
          <Section title={`Coming up`} items={later} />
        </div>
      )}
    </div>
  );
}
