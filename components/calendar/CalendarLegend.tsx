import { interviewTypes, INTERVIEW_TYPE_META } from "@/lib/calendar/interview-types";
import { DEPARTMENTS, DEFAULT_DEPARTMENT_COLOR_META, type ColorMeta, type DeptKey } from "@/lib/calendar/departments";

/** Legend for the calendar, matching whichever color mode is active. */
export function CalendarLegend({
  mode,
  departmentColors = DEFAULT_DEPARTMENT_COLOR_META
}: {
  mode: "department" | "stage";
  departmentColors?: Record<DeptKey, ColorMeta>;
}) {
  const items =
    mode === "department"
      ? [
          ...DEPARTMENTS.map((dept) => ({ key: dept.key, dot: departmentColors[dept.key].dot, label: dept.label })),
          { key: "unassigned", dot: departmentColors.unassigned.dot, label: "Unassigned" }
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
