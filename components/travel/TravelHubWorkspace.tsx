"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Plane, UserPlus, SearchCheck, Paperclip, Plus, ExternalLink } from "lucide-react";
import {
  TRAVEL_STATUSES,
  TRAVEL_PURPOSES,
  travelPurposeLabel,
  travelStatusLabel,
  formatUsd
} from "@/lib/travel/constants";
import { loadTravelerDetail } from "@/app/travel/actions";
import { TravelerWorkspace, TravelerLoading } from "@/components/travel/TravelerInline";
import type { TravelHubData, TravelTravelerOption, TravelerDetail } from "@/lib/data/travel";
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
 * Pick who is travelling. This used to create the trip and then push the router
 * at the person's record to fill it in, which threw away the travel page. Now it
 * only chooses a person — the hub loads them inline (see TravelerWorkspace) so
 * they can be eyeballed and the trip built without leaving.
 */
function NewTripButton({
  travelers,
  onPick,
  busy
}: {
  travelers: TravelTravelerOption[];
  onPick: (t: TravelTravelerOption) => void;
  busy: boolean;
}) {
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

  function choose(t: TravelTravelerOption) {
    setOpen(false);
    setQ("");
    onPick(t);
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
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
                  <button
                    key={`${t.type}-${t.id}`}
                    onClick={() => choose(t)}
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
                  </button>
                ))
              )}
            </div>

            <p className="mt-2 text-[11px] leading-snug text-brand-grey dark:text-slate-400">
              Their details open here on the travel page so you can check it is the right person before booking.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export function TravelHubWorkspace({ data }: { data: TravelHubData }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("ALL");
  const [purpose, setPurpose] = useState<string>("ALL");
  const [type, setType] = useState<string>("ALL");
  const [query, setQuery] = useState("");

  // The traveller opened inline. Loaded on demand rather than shipped with the
  // page — the picker lists every hire + active candidate, and their contact
  // details have no business being in the payload until one is chosen.
  const [traveler, setTraveler] = useState<TravelerDetail | null>(null);
  const [loadingTraveler, setLoadingTraveler] = useState(false);
  const [travelerError, setTravelerError] = useState<string | null>(null);

  async function openTraveler(who: { type: "newHire" | "candidate"; id: string }) {
    setTravelerError(null);
    setLoadingTraveler(true);
    setTraveler(null);
    const res = await loadTravelerDetail({ type: who.type, id: who.id });
    setLoadingTraveler(false);
    if (!res.ok || !res.traveler) {
      setTravelerError(res.error ?? "Could not load that person.");
      return;
    }
    setTraveler(res.traveler);
  }

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
              traveler to open them here, with their calendar and trips, without leaving this page.
            </p>
          </div>
          <NewTripButton travelers={data.travelers} onPick={openTraveler} busy={loadingTraveler} />
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

      {travelerError && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {travelerError}
        </p>
      )}
      {loadingTraveler && <TravelerLoading />}
      {traveler && (
        <TravelerWorkspace
          traveler={traveler}
          onClose={() => setTraveler(null)}
          // The table + the stat pills above are server-rendered, so re-fetch
          // them once trips change underneath. The inline panel keeps its own
          // state, so this does not disturb what is being edited.
          onTripsChanged={() => router.refresh()}
        />
      )}

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
                      "group row-wash border-t border-brand-lea/10 dark:border-white/10",
                      traveler?.id === r.travelerId && "bg-brand-gold/10 dark:bg-brand-sweet/10"
                    )}
                  >
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        {/* Opens the traveller in the pane above — same page, so a
                            button rather than a link. The record link is next to it. */}
                        <button
                          onClick={() => openTraveler({ type: r.travelerType, id: r.travelerId })}
                          disabled={!r.travelerId || loadingTraveler}
                          className="inline-flex items-center gap-1.5 rounded font-semibold text-brand-lea transition hover:text-brand-eden disabled:opacity-60 dark:text-slate-100"
                          title={`Open ${r.travelerName}'s travel here`}
                        >
                          {r.travelerType === "newHire" ? (
                            <UserPlus className="h-3.5 w-3.5 text-brand-grey dark:text-slate-400" />
                          ) : (
                            <SearchCheck className="h-3.5 w-3.5 text-brand-grey dark:text-slate-400" />
                          )}
                          {r.travelerName}
                        </button>
                        <Link
                          href={r.travelerHref}
                          className="shrink-0 rounded p-0.5 text-brand-grey opacity-0 transition hover:text-brand-eden focus:opacity-100 group-hover:opacity-100 dark:text-slate-400"
                          title={`Open ${r.travelerName}'s full record`}
                        >
                          <ExternalLink className="h-3 w-3" />
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
