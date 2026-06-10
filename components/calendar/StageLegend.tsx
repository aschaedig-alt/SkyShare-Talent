import { interviewTypes, INTERVIEW_TYPE_META } from "@/lib/calendar/interview-types";

export function StageLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {interviewTypes.map((type) => {
        const meta = INTERVIEW_TYPE_META[type];
        return (
          <span key={type} className="flex items-center gap-1 whitespace-nowrap">
            <span className={`h-3 w-3 rounded ${meta.dot}`} /> {meta.label}
          </span>
        );
      })}
    </div>
  );
}
