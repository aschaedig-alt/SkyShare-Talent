import { ValueTag, PointsTag } from "@/components/compliments/ValueTag";
import { valueColorClasses } from "@/lib/compliments/value-colors";
import { relativeTime } from "@/lib/compliments/format";
import type { RecognitionView } from "@/lib/compliments/types";

type RecognitionRowProps = {
  recognition: RecognitionView;
  /**
   * "received" → "{giver} recognized you"; "given" → "You recognized {recipient}";
   * "company" → "{giver} recognized {recipient}".
   */
  perspective?: "received" | "given" | "company";
};

/**
 * Compact feed row: left accent bar in the value color, recognition line,
 * message, timestamp, value + points tags. No avatar.
 */
export function RecognitionRow({ recognition, perspective = "received" }: RecognitionRowProps) {
  const primary = recognition.values[0];
  const accent = valueColorClasses(primary?.colorKey ?? "integrity").accent;
  const valueLabel = primary ? primary.name.toLowerCase() : "great work";

  const line =
    perspective === "received"
      ? `${recognition.giverName} recognized you for ${valueLabel}`
      : perspective === "given"
        ? `You recognized ${recognition.recipientName} for ${valueLabel}`
        : `${recognition.giverName} recognized ${recognition.recipientName} for ${valueLabel}`;

  return (
    <div className="flex gap-3">
      <span className={`mt-0.5 w-[3px] shrink-0 self-stretch rounded-full ${accent}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-brand-lea">{line}</p>
            <p className="mt-1 text-[13px] text-brand-grey">{recognition.message}</p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-brand-grey">
            {relativeTime(recognition.createdAt)}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {recognition.values.map((v) => (
            <ValueTag key={v.name} name={v.name} colorKey={v.colorKey} />
          ))}
          <PointsTag points={recognition.pointsAwarded} />
        </div>
      </div>
    </div>
  );
}
