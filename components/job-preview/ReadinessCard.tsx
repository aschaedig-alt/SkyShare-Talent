import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { SerializedJobPost } from "@/lib/types";
import type { ValidationWarning } from "@/lib/validation/warnings";
import { getReadinessChecklist } from "@/lib/blocks/sections";

type ReadinessCardProps = {
  job: SerializedJobPost;
  warnings: ValidationWarning[];
  compact?: boolean;
};

export function ReadinessCard({ job, warnings, compact = false }: ReadinessCardProps) {
  const hasWarnings = warnings.length > 0;
  const checklist = getReadinessChecklist(job);
  const completeCount = checklist.filter((item) => item.complete).length;

  return (
    <div
      className={`rounded border px-4 py-3 ${
        hasWarnings ? "border-brand-gold/45 bg-brand-gold/12" : "border-emerald-200 bg-emerald-50"
      }`}
    >
      <div className="flex items-center gap-2">
        {hasWarnings ? (
          <AlertTriangle className="h-4 w-4 text-brand-gold" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        )}
        <div className="text-sm font-bold text-brand-lea dark:text-slate-100">
          {hasWarnings
            ? `${warnings.length} validation warning${warnings.length === 1 ? "" : "s"}`
            : "Ready check clean"}
        </div>
        <div className="ml-auto rounded bg-white/70 px-2 py-1 text-xs font-bold text-brand-eden">
          {completeCount}/{checklist.length}
        </div>
      </div>
      <div className={`mt-3 grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        {checklist.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-xs font-semibold text-brand-black/72">
            {item.complete ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-brand-gold" />
            )}
            {item.label}
          </div>
        ))}
      </div>
      {hasWarnings && (
        <div className="mt-4 space-y-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
          {warnings.slice(0, compact ? 6 : 5).map((warning) => (
            <div key={warning.id} className="text-xs font-medium leading-5 text-brand-black/72">
              {warning.label}
            </div>
          ))}
          {warnings.length > (compact ? 6 : 5) && (
            <div className="text-xs font-bold text-brand-eden">
              +{warnings.length - (compact ? 6 : 5)} more warnings
            </div>
          )}
        </div>
      )}
    </div>
  );
}
