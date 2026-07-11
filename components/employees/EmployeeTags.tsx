import { clsx } from "clsx";

// Person tags shown as small 4px pills (matching the house corner radius).
// Executive/Management are hand-applied and stored on the person; "Contract" is
// derived from employmentStatus, so it shows automatically and is never tagged
// by hand. Colors are distinct per tag and readable in light + dark.

const TAG_STYLES: Record<string, string> = {
  Executive: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  Management: "bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  PDP: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  Argus: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "Check Pilot": "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  ATP: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  Contract: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
};
export const tagStyle = (t: string) => TAG_STYLES[t] ?? "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400";

// The full set of pills to show for a person: their stored tags plus an
// automatic "Contract" when their employment status is Contract (de-duped).
export function displayTags(tags: string[], employmentStatus: string): string[] {
  const out = [...tags];
  if (employmentStatus === "CONTRACT" && !out.includes("Contract")) out.push("Contract");
  return out;
}

export function TagPill({ tag }: { tag: string }) {
  return <span className={clsx("inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold", tagStyle(tag))}>{tag}</span>;
}

export function EmployeeTags({ tags, employmentStatus }: { tags: string[]; employmentStatus: string }) {
  const all = displayTags(tags, employmentStatus);
  if (!all.length) return <span className="text-brand-grey dark:text-slate-500">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {all.map((t) => <TagPill key={t} tag={t} />)}
    </span>
  );
}
