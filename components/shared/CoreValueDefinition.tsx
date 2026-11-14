"use client";

import { useId, useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { COMPANY_VALUE_BY_NAME } from "@/lib/compliments/constants";

/**
 * One core value's definition, in HR's own wording (lib/compliments/constants.ts):
 * the short line - the most important part - shown at first, and a small More
 * toggle that opens HR's whole definition plus its Key behaviors. His ask, Nov 14
 * 2026: "only see a little bit initially", but "the ability to show it all as
 * needed", without it getting busy.
 *
 * `label` puts the value's name in front of the short line, for places that list
 * several definitions together (the recognition form). `textClass` sets the type
 * size so it matches where it sits.
 */
export function CoreValueDefinition({
  name,
  label = false,
  textClass = "text-xs"
}: {
  name: string;
  label?: boolean;
  textClass?: string;
}) {
  const value = COMPANY_VALUE_BY_NAME[name];
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!value) return null;

  // The rest of HR's Definition after the short line, so opening it reads on rather than repeating.
  const rest = value.definition.startsWith(value.description) ? value.definition.slice(value.description.length).trim() : value.definition;

  return (
    <div className={clsx(textClass, "leading-relaxed text-brand-grey dark:text-slate-400")}>
      <p>
        {label ? <span className="font-semibold text-brand-lea dark:text-slate-200">{value.name}: </span> : null}
        {value.description}
        {open && rest ? ` ${rest}` : null}{" "}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 align-baseline font-semibold text-brand-eden transition hover:text-brand-lea hover:shadow-glow dark:text-brand-sweet dark:hover:text-white"
        >
          {open ? "Less" : "More"}
          <ChevronDown className={clsx("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </p>
      {open ? (
        <div id={panelId} className="mt-1.5 border-l-2 border-brand-gold/60 pl-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-lea dark:text-slate-200">Key behaviors</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            {value.keyBehaviors.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
