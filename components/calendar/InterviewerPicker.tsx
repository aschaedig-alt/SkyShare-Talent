"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEPARTMENT_LABELS, type DeptKey } from "@/lib/calendar/departments";

type Person = { name: string; role: string; departments: string[] };

/**
 * Interviewer combobox: type-ahead over the team roster (free text still allowed).
 * When a department is active (from the interview's job), interviewers tagged with
 * that department are grouped to the top; everyone else falls under "Other team".
 */
export function InterviewerPicker({
  name = "interviewer",
  defaultValue = "",
  interviewers,
  activeDepartmentKey = null,
  className = "rounded border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10",
  onValueChange
}: {
  name?: string;
  defaultValue?: string;
  interviewers: Person[];
  activeDepartmentKey?: DeptKey | null;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValueRaw] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function setValue(next: string) {
    setValueRaw(next);
    onValueChange?.(next);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    const exact = interviewers.some((p) => p.name.toLowerCase() === q);
    return interviewers.filter((p) => !q || exact || p.name.toLowerCase().includes(q));
  }, [interviewers, q]);

  const matching = activeDepartmentKey ? filtered.filter((p) => p.departments.includes(activeDepartmentKey)) : [];
  const others = activeDepartmentKey ? filtered.filter((p) => !p.departments.includes(activeDepartmentKey)) : filtered;

  function Row({ person }: { person: Person }) {
    return (
      <button
        type="button"
        // onMouseDown (not onClick) so selection lands before the input blur closes the panel.
        onMouseDown={(event) => {
          event.preventDefault();
          setValue(person.name);
          setOpen(false);
        }}
        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-brand-lea transition hover:bg-brand-cloudDancer/70 hover:shadow-glow dark:text-slate-100 dark:bg-white/5"
      >
        <span className="truncate">{person.name}</span>
        {person.departments.length > 0 ? (
          <span className="flex shrink-0 gap-1">
            {person.departments.map((d) => (
              <span key={d} className="rounded bg-brand-sweet/25 px-1.5 py-0.5 text-[10px] font-semibold text-brand-lea dark:text-slate-100">
                {DEPARTMENT_LABELS[d as DeptKey] ?? d}
              </span>
            ))}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <input
        name={name}
        value={value}
        autoComplete="off"
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={interviewers.length ? "Pick or type a name" : "Type a name"}
        className={`w-full ${className}`}
      />
      {open && interviewers.length > 0 ? (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded border border-brand-lea/15 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#10243a]">
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-xs text-brand-grey dark:text-slate-400">No matches — keep typing to enter a custom name.</p>
          ) : null}
          {activeDepartmentKey && matching.length > 0 ? (
            <>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-gold">
                {DEPARTMENT_LABELS[activeDepartmentKey]}
              </div>
              {matching.map((person) => (
                <Row key={person.name} person={person} />
              ))}
            </>
          ) : null}
          {others.length > 0 ? (
            <>
              {activeDepartmentKey && matching.length > 0 ? (
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Other team</div>
              ) : null}
              {others.map((person) => (
                <Row key={person.name} person={person} />
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
