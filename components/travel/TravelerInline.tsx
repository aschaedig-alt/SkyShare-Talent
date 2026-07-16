"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { clsx } from "clsx";
import { UserPlus, SearchCheck, Mail, Phone, Briefcase, MapPin, ExternalLink, X, Plus, CalendarDays } from "lucide-react";
import { TRAVEL_PURPOSES } from "@/lib/travel/constants";
import { createTrip } from "@/app/travel/actions";
import { TravelPanel } from "@/components/travel/TravelPanel";
import { TravelPersonCalendar } from "@/components/travel/TravelPersonCalendar";
import type { TravelerDetail, TravelTripView } from "@/lib/data/travel";

const labelClass = "text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400";
const selectClass =
  "rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-sm text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * "Is this the right person?" — identity and contact details pulled inline so a
 * trip can be confirmed and filled in without leaving /travel.
 */
function TravelerCard({ traveler, onClose }: { traveler: TravelerDetail; onClose: () => void }) {
  const TypeIcon = traveler.type === "newHire" ? UserPlus : SearchCheck;
  const facts: { icon: typeof Mail; value: string | null; label: string }[] = [
    { icon: Briefcase, value: traveler.title, label: "Position" },
    { icon: MapPin, value: [traveler.department, traveler.location].filter(Boolean).join(" · ") || null, label: "Team" },
    { icon: Mail, value: traveler.email, label: "Email" },
    { icon: Phone, value: traveler.phone, label: "Phone" }
  ];

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded border border-brand-lea/12 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-lea text-sm font-bold text-white dark:bg-brand-gold dark:text-brand-black">
          {initials(traveler.name)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-brand-lea dark:text-slate-100">{traveler.name}</span>
            <span className="inline-flex items-center gap-1 rounded border border-brand-lea/15 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">
              <TypeIcon className="h-3 w-3" />
              {traveler.type === "newHire" ? "New hire" : "Candidate"}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {facts
              .filter((f) => f.value)
              .map((f) => (
                <span key={f.label} className="flex items-center gap-1 text-xs text-brand-grey dark:text-slate-400" title={f.label}>
                  <f.icon className="h-3 w-3 shrink-0" />
                  {f.value}
                </span>
              ))}
            {facts.every((f) => !f.value) && (
              <span className="text-xs italic text-brand-grey dark:text-slate-400">
                No position or contact details on this record.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={traveler.href}
          className="inline-flex items-center gap-1 rounded border border-brand-lea/15 bg-white px-2 py-1 text-[11px] font-semibold text-brand-eden transition hover:shadow-glow dark:border-white/10 dark:bg-brand-panel dark:text-slate-200"
        >
          <ExternalLink className="h-3 w-3" />
          Full record
        </Link>
        <button
          onClick={onClose}
          aria-label="Close traveler"
          className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** The "no trips yet — start one" call to action, with the purpose picker. */
function StartTripCta({
  travelerName,
  onCreate
}: {
  travelerName: string;
  onCreate: (purpose: string) => Promise<void>;
}) {
  const [purpose, setPurpose] = useState<string>("ORIENTATION");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-brand-gold/40 bg-brand-gold/5 p-3">
      <label className="block">
        <span className={labelClass}>Purpose of the trip</span>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={clsx(selectClass, "mt-1 block")}>
          {TRAVEL_PURPOSES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={async () => {
          setBusy(true);
          await onCreate(purpose);
          setBusy(false);
        }}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-60 dark:text-slate-100"
      >
        <Plus className="h-4 w-4" />
        {busy ? "Creating…" : `Yes — start a trip for ${travelerName.split(" ")[0]}`}
      </button>
    </div>
  );
}

/**
 * The travel hub's detail pane: confirm who was picked, see their calendar, and
 * build the trip out — all without leaving /travel.
 */
export function TravelerWorkspace({
  traveler,
  onClose,
  onTripsChanged
}: {
  traveler: TravelerDetail;
  onClose: () => void;
  /** Lets the hub refresh its table/stats once trips are edited here. */
  onTripsChanged?: () => void;
}) {
  const [trips, setTrips] = useState<TravelTripView[]>(traveler.trips);
  // Bumped only when this component creates a trip, which is the one case where
  // TravelPanel has to re-seed from a new initialTrips.
  const [panelKey, setPanelKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // TravelPanel reports its trips on mount as well as on edit, and the hub's
  // table is server-rendered — so refreshing on every report would re-fetch the
  // page just for opening someone. Only tell the hub when something really moved.
  const signature = (list: TravelTripView[]) =>
    JSON.stringify(list.map((t) => [t.id, t.updatedAt, t.status, t.total, t.items.length]));
  const lastReported = useRef(signature(traveler.trips));

  async function handleCreate(purpose: string) {
    setError(null);
    const res = await createTrip({
      [traveler.type === "newHire" ? "newHireId" : "candidateId"]: traveler.id,
      purpose
    });
    if (!res.ok || !res.trip) {
      setError(res.error ?? "Could not create the trip.");
      return;
    }
    // Remount the panel onto the new list; its mount report is what tells the hub.
    setTrips((cur) => [res.trip!, ...cur]);
    setPanelKey((k) => k + 1);
  }

  function handlePanelTrips(next: TravelTripView[]) {
    setTrips(next);
    const sig = signature(next);
    if (sig === lastReported.current) return;
    lastReported.current = sig;
    onTripsChanged?.();
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-gold/40 dark:bg-brand-panel dark:ring-brand-gold/30">
      <TravelerCard traveler={traveler} onClose={onClose} />

      {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

      {trips.length === 0 && (
        <div className="mt-3">
          <StartTripCta travelerName={traveler.name} onCreate={handleCreate} />
        </div>
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="min-w-0">
          <TravelPanel
            key={`${traveler.id}-${panelKey}`}
            subjectType={traveler.type}
            subjectId={traveler.id}
            initialTrips={trips}
            loyalty={traveler.loyalty}
            onTripsChange={handlePanelTrips}
            hideHeading
          />
        </div>
        <div className="min-w-0">
          <TravelPersonCalendar trips={trips} travelerName={traveler.name} />
        </div>
      </div>
    </section>
  );
}

/** Empty-state placeholder shown while a traveller is being fetched. */
export function TravelerLoading() {
  return (
    <section className="flex items-center gap-2 rounded bg-white p-4 text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:text-slate-400 dark:ring-white/10">
      <CalendarDays className="h-4 w-4 animate-pulse text-brand-gold" />
      Loading traveler…
    </section>
  );
}
