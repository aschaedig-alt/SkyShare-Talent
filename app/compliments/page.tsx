import Link from "next/link";
import { clsx } from "clsx";
import { Heart, Sparkles, PartyPopper } from "lucide-react";
import { getDashboardData, getUpcomingCelebrations } from "@/lib/data/compliments";
import { Card } from "@/components/compliments/Card";
import { MetricCard } from "@/components/compliments/MetricCard";
import { Avatar } from "@/components/compliments/Avatar";
import { ValueTag } from "@/components/compliments/ValueTag";
import { Leaderboard } from "@/components/compliments/Leaderboard";
import { valueColorClasses } from "@/lib/compliments/value-colors";

export const dynamic = "force-dynamic";

export default async function ComplimentsDashboardPage() {
  const [data, celebrations] = await Promise.all([getDashboardData(), getUpcomingCelebrations(14)]);
  const leadingValue = data.valuesInAction[0];
  const maxValueCount = Math.max(1, ...data.valuesInAction.map((v) => v.count));
  // Only the most timely celebrations belong on the dashboard (today + this week).
  const soonCelebrations = [...celebrations.today, ...celebrations.upcoming].filter((c) => c.daysUntil <= 7).slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard
          label="Recognitions this month"
          value={data.recognitionsThisMonth}
          trend={data.recognitionsTrend}
        />
        <MetricCard label="All-time recognitions" value={data.allTimeRecognitions.toLocaleString()} sublabel="since launch" />
        <MetricCard
          label="Recognition streak"
          value={`🔥 ${data.streakDays}`}
          sublabel={
            data.streakDays === 0
              ? "give one to start a streak"
              : `${data.streakDays === 1 ? "day" : "days"} in a row`
          }
        />
        <MetricCard label="Points distributed" value={data.pointsThisMonth.toLocaleString()} trend={data.pointsTrend} />
        <MetricCard label="People celebrated" value={data.peopleCelebrated} sublabel={`of ${data.rosterSize} new hires`} />
        <MetricCard label="Participation" value={`${data.participationPct}%`} sublabel="gave recognition" />
      </div>

      {/* Monthly momentum goal */}
      <Card padding="lg" className="bg-brand-lea text-white">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-gold">This month&apos;s goal</p>
            <p className="mt-1 text-xl font-medium">
              {data.goal.remaining === 0
                ? "Goal smashed — keep the momentum going! 🎉"
                : `${data.goal.remaining} more to reach ${data.goal.target} recognitions`}
            </p>
          </div>
          <Link
            href="/compliments/give"
            className="inline-flex items-center gap-1.5 rounded-element bg-brand-gold px-4 py-2 text-sm font-medium text-brand-lea transition hover:bg-brand-gold/90 dark:text-slate-100"
          >
            <Sparkles className="h-4 w-4" />
            Give recognition
          </Link>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-brand-gold transition-all" style={{ width: `${data.goal.pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-white/70">
          <span>
            {data.goal.current} of {data.goal.target} ({data.goal.pct}%)
          </span>
          {data.notRecognized > 0 ? (
            <span>{data.notRecognized} teammates still waiting for their first shout-out</span>
          ) : (
            <span>Everyone&apos;s been celebrated this month 💜</span>
          )}
        </div>
      </Card>

      {/* Upcoming celebrations — turn birthdays & anniversaries into recognitions */}
      {soonCelebrations.length > 0 && (
        <Card padding="lg">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-medium text-brand-lea dark:text-slate-100">
              <PartyPopper className="h-5 w-5 text-brand-gold" />
              Celebrate this week
            </h2>
            <Link href="/compliments/celebrations" className="text-xs font-medium text-brand-eden hover:text-brand-lea dark:text-slate-300">
              See all →
            </Link>
          </div>
          <div className="space-y-2">
            {soonCelebrations.map((c) => (
              <div key={`${c.type}-${c.personId}`} className="flex items-center gap-3">
                <Avatar name={c.name} initials={c.initials} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-brand-lea dark:text-slate-100">{c.name}</p>
                  <p className="truncate text-xs text-brand-grey dark:text-slate-400">
                    {c.type === "birthday" ? "🎂 Birthday" : `🎉 ${c.years}-year anniversary`}
                    {" · "}
                    {c.daysUntil === 0 ? "today" : c.daysUntil === 1 ? "tomorrow" : `in ${c.daysUntil} days`}
                  </p>
                </div>
                <Link
                  href={`/compliments/give?recipient=${c.personId}`}
                  className="shrink-0 rounded-element bg-brand-lea px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-eden"
                >
                  Recognize
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Leaderboards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Leaderboard
          title="Top recognizers"
          emoji="🏆"
          subtitle="This month"
          entries={data.topRecognizers}
          unit="given"
          emptyText="No recognition given yet — be the first to start the streak."
        />
        <Leaderboard
          title="Most celebrated"
          emoji="⭐"
          subtitle="This month"
          entries={data.topRecipients}
          unit="received"
          emptyText="No one's been celebrated this month yet."
        />
      </div>

      {/* Spotlight + values in action */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="lg">
          <h2 className="mb-4 text-base font-medium text-brand-lea dark:text-slate-100">
            <span className="mr-1.5" aria-hidden="true">
              💜
            </span>
            Most loved recognition
          </h2>
          {data.mostLoved ? (
            <div className="flex gap-3">
              <Avatar
                name={data.mostLoved.giverName}
                initials={data.mostLoved.giverInitials}
                colorKey={data.mostLoved.values[0]?.colorKey}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-brand-lea dark:text-slate-100">
                  {data.mostLoved.giverName} recognized {data.mostLoved.recipientName}
                </p>
                <p className="mt-1 text-[13px] text-brand-grey dark:text-slate-400">{data.mostLoved.message}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {data.mostLoved.values.map((v) => (
                    <ValueTag key={v.name} name={v.name} colorKey={v.colorKey} />
                  ))}
                  <span className="ml-auto flex items-center gap-1.5 text-[13px] text-value-customerFocus-dark">
                    <Heart className="h-4 w-4 fill-current" />
                    {data.mostLoved.likeCount}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-brand-grey dark:text-slate-400">No recognition to spotlight yet.</p>
          )}
        </Card>

        <Card padding="lg">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium text-brand-lea dark:text-slate-100">
              <span className="mr-1.5" aria-hidden="true">
                ✨
              </span>
              Values in action
            </h2>
            {leadingValue ? (
              <span className="text-xs text-brand-grey dark:text-slate-400">
                Most lived: <span className="font-medium text-brand-lea dark:text-slate-100">{leadingValue.name}</span>
              </span>
            ) : null}
          </div>
          {data.valuesInAction.length === 0 ? (
            <p className="text-sm text-brand-grey dark:text-slate-400">No values recognized this month yet.</p>
          ) : (
            <div className="space-y-3">
              {data.valuesInAction.map((v) => (
                <div key={v.name}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="font-medium text-brand-lea dark:text-slate-100">{v.name}</span>
                    <span className="text-brand-grey dark:text-slate-400">{v.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/5">
                    <div
                      className={clsx("h-full rounded-full", valueColorClasses(v.colorKey).barFill)}
                      style={{ width: `${Math.round((v.count / maxValueCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
