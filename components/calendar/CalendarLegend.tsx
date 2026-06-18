import { interviewTypes, INTERVIEW_TYPE_META } from "@/lib/calendar/interview-types";
import { DEPARTMENTS, DEPARTMENT_META } from "@/lib/calendar/departments";

/** Legend for the calendar, matching whichever color mode is active. */
export function CalendarLegend({ mode }: { mode: "department" | "stage" }) {
  const items =
    mode === "department"
      ? [
          ...DEPARTMENTS.map((dept) => ({ key: dept.key, dot: DEPARTMENT_META[dept.key].dot, label: dept.label })),
          { key: "unassigned", dot: DEPARTMENT_META.unassigned.dot, label: "Unassigned" }
        ]
      : interviewTypes.map((type) => ({ key: type, dot: INTERVIEW_TYPE_META[type].dot, label: INTERVIEW_TYPE_META[type].label }));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1 whitespace-nowrap">
          <span className={`h-3 w-3 rounded ${item.dot}`} /> {item.label}
        </span>
      ))}
    </div>
  );
}
