import { History } from "lucide-react";

type ActivityItem = {
  id: string;
  activityType: string;
  description: string;
  actor: string | null;
  createdAt: string;
};

const TYPE_LABEL: Record<string, string> = {
  CANDIDATE_CREATED: "Created",
  CANDIDATE_EDITED: "Edited",
  CANDIDATE_DELETED: "Deleted",
  CANDIDATE_NOTE_CREATED: "Note added",
  CANDIDATE_NOTE_DELETED: "Note removed",
  DUPLICATE_RESOLVED: "Duplicate resolved",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEW_UPDATED: "Interview updated",
  INTERVIEW_CANCELED: "Interview canceled"
};

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value)
  );
}

export function CandidateActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <section className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
        <div className="py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70">
            <History className="h-5 w-5 text-brand-grey" />
          </div>
          <p className="mt-3 text-base font-semibold text-brand-lea">No activity yet</p>
          <p className="mt-1 text-sm text-brand-grey">Edits, notes, and other changes to this candidate will show here.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <ol className="relative space-y-4 border-l border-brand-lea/15 pl-5">
        {items.map((item) => (
          <li key={item.id} className="relative">
            <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-gold" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-brand-cloudDancer/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-lea">
                {TYPE_LABEL[item.activityType] ?? item.activityType}
              </span>
              <span className="text-xs text-brand-grey">{formatWhen(item.createdAt)}</span>
            </div>
            <p className="mt-1 text-sm text-brand-black/80">{item.description}</p>
            {item.actor ? <p className="text-xs text-brand-grey">by {item.actor}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
