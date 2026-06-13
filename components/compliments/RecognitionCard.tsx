import type { ReactNode } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/compliments/Avatar";
import { ValueTag, PointsTag } from "@/components/compliments/ValueTag";
import { valueColorClasses } from "@/lib/compliments/value-colors";
import { relativeTime } from "@/lib/compliments/format";
import type { RecognitionView } from "@/lib/compliments/types";

type RecognitionCardProps = {
  recognition: RecognitionView;
  /** Interactive like/comment bar; falls back to static counts when omitted. */
  engagementSlot?: ReactNode;
};

/**
 * Company-wall feed card: absolute left accent bar in the value color, giver
 * avatar, recognition line, message, value + points tags, and engagement.
 */
export function RecognitionCard({ recognition, engagementSlot }: RecognitionCardProps) {
  const primary = recognition.values[0];
  const accent = valueColorClasses(primary?.colorKey ?? "integrity").accent;
  const valueLabel = primary ? primary.name.toLowerCase() : "great work";

  return (
    <article className="relative overflow-hidden rounded-card border-[0.5px] border-brand-lea/15 bg-white p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden="true" />
      <div className="flex gap-3 pl-1">
        <Avatar
          name={recognition.giverName}
          initials={recognition.giverInitials}
          colorKey={primary?.colorKey}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-brand-lea">
                {recognition.giverName} recognized {recognition.recipientName} for {valueLabel}
              </p>
              <p className="mt-1 text-[13px] text-brand-grey">{recognition.message}</p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs text-brand-grey">
              {relativeTime(recognition.createdAt)}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {recognition.values.map((v) => (
              <ValueTag key={v.name} name={v.name} colorKey={v.colorKey} />
            ))}
            <PointsTag points={recognition.pointsAwarded} />
            {engagementSlot ?? (
              <div className="ml-auto flex items-center gap-4 text-[13px] text-brand-grey">
                <span className="flex items-center gap-1.5">
                  <Heart className="h-4 w-4" aria-hidden="true" />
                  {recognition.likeCount}
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  {recognition.commentCount}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
