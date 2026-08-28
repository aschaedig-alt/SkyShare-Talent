"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Plane, UserPlus, SearchCheck, Paperclip, Plus, ExternalLink, X } from "lucide-react";
import {
  TRAVEL_STATUSES,
  TRAVEL_PURPOSES,
  travelPurposeLabel,
  travelStatusLabel,
  travelTabHref,
  formatUsd
} from "@/lib/travel/constants";
import type {
  TravelCalendarData,
  TravelCalendarTraveler,
  TravelHubData,
  TravelTravelerOption
} from "@/lib/data/travel";
import { runsFor, runDateLabel, type TripRun } from "@/lib/travel/hub-calendar";
import { officeDayKey } from "@/lib/dates/display";
import type { TravelChecklistRollup as TravelChecklistRollupData } from "@/lib/travel/rollup";
import { TravelChecklistRollup } from "@/components/travel/TravelChecklistRollup";
import { TravelHubCalendar } from "@/components/travel/TravelHubCalendar";
import { useDialogClose } from "@/lib/hooks/useDialogClose";
import { formatMomentDate } from "@/lib/dates/display";

const STATUS_STYLE: Record<string, string> = {
  NEEDED: "bg-brand-gold/15 text-brand-gold border-brand-gold/30",
  BOOKED: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  CANCELED: "bg-brand-cloudDancer text-brand-grey border-brand-lea/15 dark:bg-white/5 dark:text-slate-400 dark:border-white/10"
};

// Trip/segment times carry a real time of day, so the DAY has to be read in the
// office timezone too — otherwise an evening departure shows as the next day.
function fmtDate(iso: string | null) {
  return formatMomentDate(iso) || "—";
}

const selectClass =
  "rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-sm text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100 dark:placeholder:text-slate-500";

/**
 * Pick who is travelling, then go to their Travel tab and start the trip there.
 *
 * This has now been three things. It used to create the trip here and push the
 * router at the person's record, which threw the travel page away AND left a
 * half-empty trip behind if the navigation was abandoned. Then it loaded the
 * person into a pane at the bottom of this page, which is the profile-at-the-
 * bottom the team asked to be rid of. Now it is what it always should have
 * been: a way of finding the right person, and a real link to where their
 * travel actually lives. Nothing is created until they are on that page.
 */
function NewTripButton({ travelers }: { travelers: TravelTravelerOption[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "newHire" | "candidate">("ALL");

  useDialogClose(() => setOpen(false), open);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase();
    return travelers
      .filter((t) => (typeFilter === "ALL" || t.type === typeFilter) && (!query || t.name.toLowerCase().includes(query)))
      .slice(0, 50);
  }, [travelers, q, typeFilter]);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden"
      >
        <Plus className="h-4 w-4" />
        New trip
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-40 mt-1 w-80 rounded border border-brand-lea/15 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-brand-panel">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Who is traveling?</p>

            <div className="mt-2 flex gap-1">
              {([
                ["ALL", "All"],
                ["newHire", "Hires"],
                ["candidate", "Candidates"]
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTypeFilter(val)}
                  className={clsx(
                    "rounded border px-2 py-1 text-[11px] font-semibold transition",
                    typeFilter === val
                      ? "border-brand-lea bg-brand-lea text-white"
                      : "border-brand-lea/15 bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name…"
              className={clsx(selectClass, "mt-2 w-full")}
              autoFocus
            />

            <div className="mt-1 max-h-44 overflow-auto rounded border border-brand-lea/10 dark:border-white/10">
              {matches.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-brand-grey dark:text-slate-400">No matches.</div>
              ) : (
                matches.map((t) => (
                  <Link
                    key={`${t.type}-${t.id}`}
                    href={travelTabHref(t.href)}
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition hover:bg-brand-cloudDancer/60 dark:hover:bg-white/5"
                  >
                    {t.type === "newHire" ? (
                      <UserPlus className="h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-400" />
                    ) : (
                      <SearchCheck className="h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-400" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-brand-lea dark:text-slate-100">{t.name}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-brand-grey dark:text-slate-400">
                      {t.type === "newHire" ? "Hire" : "Cand"}
                    </span>
                  </Link>
                ))
              )}
            </div>

            <p className="mt-2 text-[11px] leading-snug text-brand-grey dark:text-slate-400">
              Opens their Travel tab, where the trip is created.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Where an archived tab list lives. Per browser, not per team — see below. */
const ARCHIVED_TABS_KEY = "skyshare.travel.archivedTravelerTabs";

/**
 * Everybody with travel, as a row of tabs above the calendar.
 *
 * WHY TABS AND NOT ANOTHER LIST. The page already had three ways to reach a
 * person — the rail beside the calendar, the chips on it, and the table at the
 * bottom — and all three are inside something you have to read first. A tab
 * strip is the one that answers "who is there" without reading anything, which
 * is the shape the new hire page already uses for the same job.
 *
 * Each tab is a real LINK to that person's own profile, on its Travel tab. It
 * used to load a second copy of the profile into a pane at the bottom of this
 * page, which is what the team asked to be rid of — a profile below a six-week
 * calendar and a roll-up is a profile nobody can reach without scrolling past
 * everything else.
 *
 * ARCHIVING IS PER BROWSER, deliberately, and this is the honest limit of it: it
 * is a localStorage list, so it tidies YOUR strip and nobody else's, and it
 * comes back empty in a fresh browser. It hides nothing that matters — the
 * trip, the calendar, the rail and the table are all untouched — which is what
 * makes a view-only preference the right size for it. A shared archive means a
 * column on TravelTrip and a migration against the live database, and that is
 * worth doing on purpose rather than as a side effect of a tab strip.
 *
 * Only a traveller whose trips have all ENDED can be archived. Offering it on a
 * live trip is how somebody hides the person they are about to need.
 */
function TravelerTabs({ travelers }: { travelers: TravelCalendarTraveler[] }) {
  const [archived, setArchived] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Read after mount, never during render: the server has no localStorage, and
  // seeding state from it directly is a hydration mismatch.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ARCHIVED_TABS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setArchived(parsed.filter((v): v is string => typeof v === "string"));
    } catch {
      // A corrupt or blocked store is not worth breaking the page over.
    }
  }, []);

  function persist(next: string[]) {
    setArchived(next);
    try {
      window.localStorage.setItem(ARCHIVED_TABS_KEY, JSON.stringify(next));
    } catch {
      // Private windows refuse writes; the tab strip still works for this visit.
    }
  }

  const today = useMemo(() => officeDayKey(new Date()), []);

  const cards = useMemo(
    () =>
      travelers.map((t) => {
        const runs = t.trips.map(runsFor).filter((r): r is TripRun => r !== null);
        const upcoming = runs.find((r) => r.endDay >= today);
        return {
          traveler: t,
          // No readable dates at all is NOT "ended" — that trip is unfinished
          // work, and offering to archive it would hide the one that needs doing.
          ended: runs.length > 0 && !upcoming,
          // What clicking the tab should open: the live trip, else the last one.
          tripId: (upcoming ?? runs[runs.length - 1])?.tripId,
          dates: (upcoming ?? runs[runs.length - 1]) ? runDateLabel(upcoming ?? runs[runs.length - 1]) : null
        };
      }),
    [travelers, today]
  );

  const archivedSet = useMemo(() => new Set(archived), [archived]);
  const shown = cards.filter((c) => !archivedSet.has(c.traveler.key));
  const hidden = cards.filter((c) => archivedSet.has(c.traveler.key));

  if (cards.length === 0) return null;

  const renderTab = (c: (typeof cards)[number], isArchived: boolean) => {
    // The archive control is a SIBLING of the tab, not a child of it. An
    // interactive element inside a link is invalid HTML and the inner one's
    // clicks are unreliable; sharing a bordered wrapper makes them read as one
    // control anyway.
    return (
      <span
        key={c.traveler.key}
        className={clsx(
          "inline-flex items-stretch overflow-hidden rounded border border-brand-lea/10 bg-white transition hover:shadow-glow dark:border-white/10 dark:bg-brand-panel",
          isArchived && "opacity-60"
        )}
      >
        <Link
          href={travelTabHref(c.traveler.href)}
          title={`Open ${c.traveler.name}'s Travel tab`}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-grey transition dark:text-slate-400"
        >
          {c.traveler.name}
          {c.dates ? (
            <span className="rounded bg-brand-lea/10 px-1.5 py-0.5 text-[10.5px] font-bold text-brand-eden dark:bg-white/10 dark:text-slate-300">
              {c.dates}
            </span>
          ) : null}
        </Link>
        {c.ended && !isArchived ? (
          <button
            type="button"
            onClick={() => persist([...archived, c.traveler.key])}
            aria-label={`Archive ${c.traveler.name}'s tab`}
            title="Trip has ended — archive this tab"
            className="px-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-500"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
        {isArchived ? (
          <button
            type="button"
            onClick={() => persist(archived.filter((k) => k !== c.traveler.key))}
            title={`Bring ${c.traveler.name}'s tab back`}
            className="border-l border-brand-lea/10 px-2 text-[11px] font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
          >
            Restore
          </button>
        ) : null}
      </span>
    );
  };

  return (
    <section className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      {/* Not role="tablist": each of these navigates to another page rather
          than swapping a tabpanel here, so they are links and say so. */}
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Travelers">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
          Travelers
        </span>
        {shown.length === 0 ? (
          <span className="text-xs text-brand-grey dark:text-slate-400">Every tab is archived.</span>
        ) : (
          shown.map((c) => renderTab(c, false))
        )}
        {hidden.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="ml-auto rounded border border-brand-lea/10 bg-white px-2 py-1 text-[11px] font-semibold text-brand-grey transition hover:shadow-glow dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
          >
            {showArchived ? "Hide" : "Show"} {hidden.length} archived
          </button>
        ) : null}
      </div>
      {showArchived && hidden.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-brand-lea/10 pt-2 dark:border-white/10">
          {hidden.map((c) => renderTab(c, true))}
        </div>
      ) : null}
    </section>
  );
}

export function TravelHubWorkspace({
  data,
  calendar,
  rollup
}: {
  data: TravelHubData;
  calendar?: TravelCalendarData;
  rollup?: TravelChecklistRollupData;
}) {
  const [status, setStatus] = useState<string>("ALL");
  const [purpose, setPurpose] = useState<string>("ALL");
  const [type, setType] = useState<string>("ALL");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (purpose !== "ALL" && r.purpose !== purpose) return false;
      if (type !== "ALL" && r.travelerType !== type) return false;
      if (q && !r.travelerName.toLowerCase().includes(q) && !(r.destination ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.rows, status, purpose, type, query]);

  const filteredTotal = rows.filter((r) => r.status !== "CANCELED").reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Plane className="h-5 w-5 text-brand-gold" />
              <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Travel</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
              Every trip across new hires and candidates — onboarding, indoc, interviews, recruiting visits, and more. Click a
              traveler or a trip to open it on their own profile, where the booking is edited.
            </p>
          </div>
          <NewTripButton travelers={data.travelers} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            ["Trips", data.stats.tripCount],
            ["Needs booking", data.stats.needsBooking],
            ["Booked", data.stats.booked],
            ["Total spend", formatUsd(data.stats.totalSpend)]
          ].map(([label, val]) => (
            <span key={String(label)} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-1 text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
              <span className="font-semibold">{val}</span> <span className="text-brand-grey dark:text-slate-400">{label}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Who has travel at all, before the calendar has to be read. */}
      {calendar && calendar.travelers.length > 0 ? (
        <TravelerTabs travelers={calendar.travelers} />
      ) : null}

      {/* Front of the page, above the table: who is travelling and when. The
          per-trip calendar inside a panel can only answer "when is this person
          away" — this is the one that answers "who else is here that week". */}
      {calendar ? <TravelHubCalendar data={calendar} /> : null}

      {/* What is outstanding across every trip. Above the table on purpose: the
          table says what EXISTS, this says what still needs doing, and the
          second question is the one somebody opens this page to answer. */}
      {rollup ? <TravelChecklistRollup rollup={rollup} /> : null}


      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search traveler or destination…"
            className={clsx(selectClass, "min-w-[200px] flex-1")}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
            <option value="ALL">All statuses</option>
            {TRAVEL_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={selectClass}>
            <option value="ALL">All purposes</option>
            {TRAVEL_PURPOSES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
            <option value="ALL">Hires &amp; candidates</option>
            <option value="newHire">New hires</option>
            <option value="candidate">Candidates</option>
          </select>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                <th className="py-2 pr-3">Traveler</th>
                <th className="px-2 py-2">Purpose</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Destination</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2 text-center">Items</th>
                <th className="px-2 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-brand-grey dark:text-slate-400">
                    {data.rows.length === 0 ? "No travel logged yet. Add trips from a hire or candidate record." : "No trips match these filters."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.tripId}
                    className={clsx(
                      "group row-wash border-t border-brand-lea/10 dark:border-white/10"
                    )}
                  >
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        {/* Each row IS a trip, so the name goes to THAT trip on
                            that person's Travel tab. A real link, ctrl-clickable,
                            replacing a button that used to open a second copy of
                            the profile at the bottom of this page. */}
                        <Link
                          href={travelTabHref(r.travelerHref, r.tripId)}
                          className="inline-flex items-center gap-1.5 rounded font-semibold text-brand-lea transition hover:text-brand-eden dark:text-slate-100"
                          title={`Open this trip on ${r.travelerName}'s Travel tab`}
                        >
                          {r.travelerType === "newHire" ? (
                            <UserPlus className="h-3.5 w-3.5 text-brand-grey dark:text-slate-400" />
                          ) : (
                            <SearchCheck className="h-3.5 w-3.5 text-brand-grey dark:text-slate-400" />
                          )}
                          {r.travelerName}
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-60" />
                        </Link>
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-brand-grey dark:text-slate-400">
                        {r.travelerType === "newHire" ? "New hire" : "Candidate"}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-brand-lea dark:text-slate-100">{travelPurposeLabel(r.purpose)}</td>
                    <td className="px-2 py-2">
                      <span className={clsx("rounded border px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[r.status] ?? STATUS_STYLE.NEEDED)}>
                        {travelStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-brand-grey dark:text-slate-400">{r.destination ?? "—"}</td>
                    <td className="px-2 py-2 text-brand-grey dark:text-slate-400">{fmtDate(r.startsAt)}</td>
                    <td className="px-2 py-2 text-center text-brand-grey dark:text-slate-400">
                      {r.itemCount}
                      {r.receiptCount > 0 ? (
                        <span className="ml-1 inline-flex items-center text-brand-grey dark:text-slate-400" title={`${r.receiptCount} receipt(s)`}>
                          <Paperclip className="h-3 w-3" />
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-brand-lea dark:text-slate-100">{formatUsd(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-brand-lea/15 dark:border-white/10">
                  <td colSpan={6} className="py-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                    {rows.length} {rows.length === 1 ? "trip" : "trips"} shown · total
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-brand-lea dark:text-slate-100">{formatUsd(filteredTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
