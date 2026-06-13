import Link from "next/link";
import { clsx } from "clsx";
import { getFeedRecognitions, type FeedFilter } from "@/lib/data/compliments";
import { Card } from "@/components/compliments/Card";
import { RecognitionCard } from "@/components/compliments/RecognitionCard";
import { FeedEngagement } from "@/components/compliments/FeedEngagement";

export const dynamic = "force-dynamic";

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" }
];

function filterFromParam(value: string | undefined): FeedFilter {
  return value === "week" || value === "month" ? value : "all";
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const filter = filterFromParam(sp.filter);
  const recognitions = await getFeedRecognitions(filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-brand-lea">Company recognition wall</h2>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/compliments/feed" : `/compliments/feed?filter=${f.key}`}
              className={clsx(
                "rounded-element border-[0.5px] px-3 py-1.5 text-xs font-medium transition",
                filter === f.key
                  ? "border-brand-lea bg-brand-lea text-white"
                  : "border-brand-lea/20 text-brand-grey hover:text-brand-lea"
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {recognitions.length === 0 ? (
        <Card padding="lg">
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-brand-lea">Nothing here yet</p>
            <p className="mt-1 text-sm text-brand-grey">
              No recognition in this range.{" "}
              <Link href="/compliments/give" className="text-value-innovation-dark hover:underline">
                Give the first one →
              </Link>
            </p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {recognitions.map((r) => (
            <li key={r.id}>
              <RecognitionCard
                recognition={r}
                engagementSlot={
                  <FeedEngagement
                    recognitionId={r.id}
                    initialLikes={r.likeCount}
                    commentCount={r.commentCount}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
