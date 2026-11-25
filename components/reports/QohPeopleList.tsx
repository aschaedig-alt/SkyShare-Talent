"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ChevronRight } from "lucide-react";
import type { QohHire, QualityOfHire } from "@/lib/quality-of-hire/report";
import { R } from "@/components/reports/report-ui";
import { formatCalendarDay } from "@/lib/dates/display";
import { CATEGORY_META, type Categorized } from "@/lib/quality-of-hire/categories";

// THE HIRE QUALITY PEOPLE LIST (Aimee's feedback cmww9dqdj, Nov 25 2026: "hard to read,
// too much information, and a sideways scroll bar"). He picked what stays on the line
// in a picker and arranged it: seven columns, each a main line with a smaller line
// under it. Everything else waits until you click a person, and opens underneath as
// "their story" - a timeline, horizontal or vertical (he wanted both; a phone always
// gets vertical). Built from report-ui.ts sizes only.
//
// Not a <table>: a grid that folds to a small card per person on a phone, so the page
// never scrolls sideways.

type Dir = "h" | "v";
const DIR_KEY = "skyshare-qoh-story-direction";

// The line's seven columns plus the open/close caret. One literal so Tailwind sees it.
const COLS = "md:grid-cols-[1.35fr_1.3fr_0.85fr_0.95fr_1.05fr_0.85fr_1.35fr_16px]";

const KIND_WORD: Record<keyof QohHire["kinds"], [string, string]> = {
  recruiter_screen: ["recruiter screen", "recruiter screens"],
  manager_video: ["manager interview", "manager interviews"],
  in_person: ["in person", "in person"],
  other: ["other", "other"]
};
const CHECKIN_LABEL: Record<number, string> = { 90: "90-day", 180: "6-month", 365: "12-month" };

const addDays = (day: string, n: number) => new Date(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function tenure(days: number): string {
  if (days < 31) return `${Math.max(days, 0)} d`;
  const months = Math.floor(days / 30.44);
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y ? `${y} yr${m ? ` ${m} mo` : ""}` : `${m} mo`;
}

function howTheyLeft(h: QohHire): string | null {
  if (h.stillHere) return null;
  if (h.situational) return "Situational";
  return h.voluntary === "V" ? "Voluntary" : h.voluntary === "I" ? "Involuntary" : null;
}

/** at = the day it happened, for putting the story in real order (the data can hold an
 *  interview from an earlier application, dated before this one's applied day). */
type Step = { at: string; when: string; title: string; sub?: ReactNode; tone: "hiring" | "check" | "leave" | "now" };

function storySteps(h: QohHire, interviewers: QualityOfHire["interviewers"]): Step[] {
  const steps: Step[] = [];
  const applied = h.daysApplyToStart !== null ? addDays(h.start, -h.daysApplyToStart) : null;
  if (applied) steps.push({ at: applied, when: formatCalendarDay(applied), title: "Applied", tone: "hiring" });

  if (h.interviews !== null) {
    const kinds = (Object.keys(h.kinds) as Array<keyof QohHire["kinds"]>)
      .filter((k) => h.kinds[k])
      .map((k) => `${h.kinds[k]} ${KIND_WORD[k][h.kinds[k] === 1 ? 0 : 1]}`);
    const people = [...new Set(h.interviewList.flatMap((i) => i.interviewers.map((x) => interviewers[x]?.name ?? x)))];
    const first = h.interviewList.map((i) => i.date).filter(Boolean).sort()[0];
    steps.push({
      at: first ? first.slice(0, 10) : applied ?? h.start.slice(0, 10),
      when: first ? formatCalendarDay(first) : "",
      title: h.interviews === 0 ? "No interviews found" : `${h.interviews} ${h.interviews === 1 ? "interview" : "interviews"}`,
      sub:
        h.interviews > 0 ? (
          <>
            {[kinds.join(" · "), people.join(", ")].filter(Boolean).join(" · ")}
            {h.metCeo ? <span className={clsx(R.chip, "ml-1")}>Met Cory</span> : null}
          </>
        ) : undefined,
      tone: "hiring"
    });
  }

  if (applied && h.daysApplyToOffer !== null) {
    const offerDay = addDays(applied, h.daysApplyToOffer);
    steps.push({
      at: offerDay,
      when: formatCalendarDay(offerDay),
      title: "Offer",
      sub: `${h.daysApplyToOffer} ${h.daysApplyToOffer === 1 ? "day" : "days"} after applying`,
      tone: "hiring"
    });
  }

  steps.push({
    at: h.start.slice(0, 10),
    when: formatCalendarDay(h.start),
    title: "Started",
    sub: (
      <>
        {[h.role ?? "role not recorded", h.department].filter(Boolean).join(" · ")}
        {h.rehire ? <span className={clsx(R.chip, "ml-1")}>Rehire</span> : null}
      </>
    ),
    tone: "hiring"
  });

  for (const c of [...h.checkins].sort((a, b) => a.dayMark - b.dayMark)) {
    const parts = [
      c.valuesAverage !== null ? `values ${c.valuesAverage.toFixed(1)} of 10` : null,
      c.wouldHireAgain === null ? null : c.wouldHireAgain ? "would hire again" : "would not hire again"
    ].filter(Boolean);
    // A check-in carries no date of its own, only its mark, so it is shown as "Day 90"
    // rather than as a made-up calendar day (start + 90 can still be in the future).
    steps.push({
      at: addDays(h.start, c.dayMark),
      when: `Day ${c.dayMark}`,
      title: `${CHECKIN_LABEL[c.dayMark] ?? `${c.dayMark}-day`} check-in`,
      sub: parts.length ? parts.join(" · ") : undefined,
      tone: "check"
    });
  }

  if (h.stillHere) {
    steps.push({ at: "9999-12-31", when: "Today", title: "Still here", sub: `${tenure(h.tenureDays)} with us`, tone: "now" });
  } else {
    const how = howTheyLeft(h);
    steps.push({
      at: h.end ? h.end.slice(0, 10) : "9999-12-30",
      when: `${formatCalendarDay(h.end)}${h.rosterExit ? " †" : ""}`,
      title: how ? `Left · ${how}` : "Left",
      sub: [h.reason, h.situational].filter(Boolean).join(" · ") || "reason not recorded",
      tone: "leave"
    });
  }
  // Real order; ties keep the order above (a stable sort).
  return steps.map((st, i) => ({ st, i })).sort((a, b) => a.st.at.localeCompare(b.st.at) || a.i - b.i).map((x) => x.st);
}

const DOT: Record<Step["tone"], string> = {
  hiring: "bg-brand-eden dark:bg-brand-edenOnDark",
  check: "bg-brand-gold",
  leave: "bg-red-600 dark:bg-red-300",
  now: "bg-emerald-600 dark:bg-emerald-300"
};
const LINE = "bg-brand-lea/10 dark:bg-white/10";

function Story({ steps, dir }: { steps: Step[]; dir: Dir }) {
  if (dir === "h") {
    // One row: date, dot on a single line, then what happened. The line runs from each
    // dot to exactly the next one (a column plus the gap) and stops at the last.
    return (
      <ol className="grid auto-cols-[minmax(0,1fr)] grid-flow-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="relative grid grid-rows-[1.5em_14px_auto] content-start gap-1.5">
            <span className="whitespace-nowrap text-[11px] leading-[1.5em] tabular-nums text-brand-grey dark:text-slate-400">{s.when}</span>
            {i < steps.length - 1 ? <span aria-hidden className={clsx("absolute left-[5px] top-[calc(1.5em+0.375rem+6px)] h-0.5 w-[calc(100%+0.75rem)]", LINE)} /> : null}
            <span aria-hidden className={clsx("relative z-10 mt-0.5 h-2.5 w-2.5 rounded-full", DOT[s.tone])} />
            <span className="grid min-w-0 gap-px pr-1">
              <span className={R.listTitle}>{s.title}</span>
              {s.sub ? <span className={clsx(R.tileSub, "break-words")}>{s.sub}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="grid">
      {steps.map((s, i) => (
        <li key={i} className="relative grid grid-cols-[84px_14px_minmax(0,1fr)] gap-2.5 pb-2.5 last:pb-0 max-md:grid-cols-[66px_14px_minmax(0,1fr)]">
          <span className="pt-px text-right text-[11px] tabular-nums text-brand-grey dark:text-slate-400">{s.when}</span>
          {i < steps.length - 1 ? (
            <span aria-hidden className={clsx("absolute bottom-0 top-4 w-0.5 left-[100px] max-md:left-[82px]", LINE)} />
          ) : null}
          <span aria-hidden className={clsx("relative z-10 mt-1 h-2.5 w-2.5 justify-self-center rounded-full", DOT[s.tone])} />
          <span className="grid min-w-0 gap-px">
            <span className={R.listTitle}>{s.title}</span>
            {s.sub ? <span className={clsx(R.tileSub, "break-words")}>{s.sub}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

const SLIDE_MS = 300;

/**
 * Opens and closes its content smoothly (grid rows 0fr <-> 1fr, which animates to the
 * content's real height). Only an open or still-closing person is rendered, so 300+
 * hires do not each build a story. Respects reduced motion.
 */
function Slide({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: the first paints it closed, the second starts the slide open.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return (
    <div
      className={clsx(
        "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
        shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => <span className={clsx(R.sectionLabel, "block md:hidden")}>{children}</span>;

export function QohPeopleList({
  hires,
  verdict,
  interviewers,
  hrControls
}: {
  hires: QohHire[];
  verdict: (h: QohHire) => Categorized | undefined;
  interviewers: QualityOfHire["interviewers"];
  /** Admins only: the category call and situational controls, shown in the opened person. */
  hrControls: ((h: QohHire) => ReactNode) | null;
}) {
  // One person open at a time (his ask, Nov 25 2026): opening someone smoothly closes
  // whoever was open before.
  const [open, setOpen] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const [dir, setDir] = useState<Dir>("h");
  const [narrow, setNarrow] = useState(false);

  // His choice is remembered in this browser only; a phone is always vertical.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DIR_KEY);
      if (saved === "h" || saved === "v") setDir(saved);
    } catch {
      // storage blocked: keep the default
    }
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const pickDir = (d: Dir) => {
    setDir(d);
    try {
      window.localStorage.setItem(DIR_KEY, d);
    } catch {
      // ignore
    }
  };
  const toggle = (k: string) => {
    const opening = open !== k;
    setOpen(opening ? k : null);
    // A person closing ABOVE this one pulls the page up while both slide; once they
    // settle, bring the one just opened back into view if it moved off screen.
    if (opening) {
      window.setTimeout(() => rowRefs.current.get(k)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), SLIDE_MS + 20);
    }
  };

  return (
    <div className="mt-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className={R.footnote.replace("mt-2 ", "")}>Click a person to see their story.</p>
        <div className={clsx(R.segmentGroup, "max-md:hidden")} role="group" aria-label="Timeline direction">
          {(["h", "v"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dir === d}
              onClick={() => pickDir(d)}
              className={clsx(R.segment, dir === d ? R.segmentOn : R.segmentOff)}
            >
              {d === "h" ? "Horizontal" : "Vertical"}
            </button>
          ))}
        </div>
      </div>

      <div className={clsx("hidden gap-3 px-3 py-2 md:grid", COLS, R.thead, "font-bold")} aria-hidden>
        <span>Person</span>
        <span>Role</span>
        <span>Started</span>
        <span>Left</span>
        <span>How they left</span>
        <span>Speed</span>
        <span>Verdict</span>
        <span />
      </div>

      <ul className={R.tbody}>
        {hires.map((h) => {
          const k = `${h.id}|${h.start}`;
          const isOpen = open === k;
          const v = verdict(h);
          const how = howTheyLeft(h);
          return (
            <li
              key={k}
              ref={(node) => {
                if (node) rowRefs.current.set(k, node);
                else rowRefs.current.delete(k);
              }}
            >
              {/* The whole line opens the person; the name stays a real link to their profile. */}
              <div
                onClick={() => toggle(k)}
                className={clsx(
                  "grid cursor-pointer grid-cols-2 gap-x-3.5 gap-y-2 px-3 py-2 text-sm transition-colors",
                  COLS,
                  "md:gap-3",
                  isOpen ? "bg-brand-cloudDancer/45 shadow-[inset_3px_0_0_#eaaa00] dark:bg-white/5" : R.tr
                )}
              >
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <Link href={`/people/${h.id}`} className={R.link} onClick={(e) => e.stopPropagation()}>
                    {h.name}
                  </Link>
                  <span className={clsx(R.tileSub, "block")}>{tenure(h.tenureDays)} with us</span>
                </div>
                <div className="min-w-0">
                  <Label>Role</Label>
                  {h.role ?? <span className={R.muted}>not recorded</span>}
                  <span className={clsx(R.tileSub, "block")}>{h.department || "—"}</span>
                </div>
                <div className="min-w-0 tabular-nums">
                  <Label>Started</Label>
                  {formatCalendarDay(h.start)}
                </div>
                <div className="min-w-0 tabular-nums">
                  <Label>Left</Label>
                  {h.stillHere ? (
                    <span className={R.muted}>still here</span>
                  ) : (
                    <>
                      {formatCalendarDay(h.end)}
                      {h.rosterExit ? <span className={R.muted} title="A year-end roster date - the real last day is later"> †</span> : null}
                    </>
                  )}
                  {h.left365 === 1 ? <span className={clsx(R.chip, "mt-0.5 inline-block")}>year one</span> : null}
                </div>
                <div className="min-w-0">
                  <Label>How they left</Label>
                  {how ? <span className={R.chip}>{how}</span> : <span className={R.muted}>—</span>}
                  {h.wouldHireBack ? (
                    <span className={clsx(R.tileSub, "block")}>Would hire back: {h.wouldHireBack === "YES" ? "Yes" : "No"}</span>
                  ) : null}
                </div>
                <div className="min-w-0 tabular-nums">
                  <Label>Speed</Label>
                  {h.daysApplyToOffer === null ? <span className={R.muted}>—</span> : `${h.daysApplyToOffer} d to offer`}
                  {h.daysApplyToStart !== null ? <span className={clsx(R.tileSub, "block")}>{h.daysApplyToStart} d to start</span> : null}
                </div>
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <Label>Verdict</Label>
                  <span className={R.chip}>{CATEGORY_META[v?.category ?? "NEEDS_CALL"].label}</span>
                  {v?.why ? <span className={clsx(R.tileSub, "block")}>{v.why}</span> : null}
                </div>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Close" : "Open"} ${h.name}'s story`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(k);
                  }}
                  className="hidden justify-self-end pt-0.5 text-brand-grey md:block dark:text-slate-400"
                >
                  <ChevronRight className={clsx("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90 text-brand-gold")} />
                </button>
              </div>

              <Slide open={isOpen}>
                <div className="grid gap-3 border-t border-dashed border-brand-lea/10 bg-brand-cloudDancer/45 px-3 pb-4 pt-3 md:pl-6 dark:border-white/10 dark:bg-white/5">
                  <span className={R.sectionLabel}>Their story</span>
                  <Story steps={storySteps(h, interviewers)} dir={narrow ? "v" : dir} />
                  {hrControls ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-brand-lea/10 pt-2.5 dark:border-white/10">
                      <span className={R.sectionLabel}>HR</span>
                      {hrControls(h)}
                    </div>
                  ) : null}
                </div>
              </Slide>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
