"use client";

import { useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  Plane,
  Car,
  Building2,
  Bus,
  Receipt,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Upload,
  Paperclip,
  Sparkles,
  ClipboardPaste
} from "lucide-react";
import {
  TRAVEL_PURPOSES,
  TRAVEL_STATUSES,
  TRAVEL_ITEM_TYPES,
  travelPurposeLabel,
  travelItemTypeLabel,
  formatUsd
} from "@/lib/travel/constants";
import type { TravelItemView, TravelReceiptView, TravelTripView, TravelerLoyalty } from "@/lib/data/travel";
import {
  createTrip,
  updateTrip,
  deleteTrip,
  addItem,
  updateItem,
  deleteItem,
  saveTravelerLoyalty,
  extractTravelConfirmation
} from "@/app/travel/actions";
import type { ParsedTravel } from "@/lib/extraction/travel-confirmation";

type Props = {
  subjectType: "newHire" | "candidate";
  subjectId: string;
  initialTrips: TravelTripView[];
  loyalty?: TravelerLoyalty;
};

const STATUS_STYLE: Record<string, string> = {
  NEEDED: "bg-brand-gold/15 text-brand-gold border-brand-gold/30",
  BOOKED: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  CANCELED: "bg-brand-cloudDancer text-brand-grey border-brand-lea/15 dark:bg-white/5 dark:text-slate-400 dark:border-white/10"
};

const ITEM_ICON: Record<string, typeof Plane> = {
  FLIGHT: Plane,
  CAR: Car,
  HOTEL: Building2,
  TRANSPORT: Bus,
  OTHER: Receipt
};

const labelClass = "text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400";
const inputClass =
  "w-full rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-sm text-brand-lea outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100 dark:placeholder:text-slate-500";

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}
function toDateTimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

function tripWithRecomputedTotal(trip: TravelTripView, items: TravelItemView[]): TravelTripView {
  return { ...trip, items, total: items.reduce((sum, i) => sum + (i.amount ?? 0), 0) };
}

export function TravelPanel({ subjectType, subjectId, initialTrips, loyalty }: Props) {
  const [trips, setTrips] = useState<TravelTripView[]>(initialTrips);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grandTotal = useMemo(() => trips.reduce((sum, t) => sum + t.total, 0), [trips]);

  const subjectKey = subjectType === "newHire" ? "newHireId" : "candidateId";

  async function handleCreate(purpose: string) {
    setCreating(true);
    setError(null);
    const res = await createTrip({
      [subjectType === "newHire" ? "newHireId" : "candidateId"]: subjectId,
      purpose
    });
    setCreating(false);
    if (!res.ok || !res.trip) {
      setError(res.error ?? "Could not create the trip.");
      return;
    }
    setTrips((cur) => [res.trip!, ...cur]);
  }

  function patchTrip(updated: TravelTripView) {
    setTrips((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
  }
  function removeTrip(tripId: string) {
    setTrips((cur) => cur.filter((t) => t.id !== tripId));
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-brand-gold" />
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Travel &amp; logistics</h2>
          {trips.length > 0 && (
            <span className="rounded bg-brand-cloudDancer/70 px-2 py-0.5 text-[11px] font-bold text-brand-grey dark:bg-white/5 dark:text-slate-400">
              {trips.length} {trips.length === 1 ? "trip" : "trips"} · {formatUsd(grandTotal)}
            </span>
          )}
        </div>
        <NewTripButton creating={creating} onCreate={handleCreate} />
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

      <LoyaltyCard subjectKey={subjectKey} subjectId={subjectId} loyalty={loyalty} />

      {trips.length === 0 ? (
        <div className="mt-3 rounded border border-dashed border-brand-lea/20 bg-brand-cloudDancer/40 p-4 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          No travel yet. Add a trip to track flights, rental cars, hotels, costs, and receipts.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} onChange={patchTrip} onDelete={removeTrip} />
          ))}
        </div>
      )}
    </section>
  );
}

function NewTripButton({ creating, onCreate }: { creating: boolean; onCreate: (purpose: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={creating}
        className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        {creating ? "Adding…" : "New trip"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded border border-brand-lea/15 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-brand-panel">
            {TRAVEL_PURPOSES.map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  setOpen(false);
                  onCreate(p.value);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:hover:bg-white/5"
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LoyaltyCard({
  subjectKey,
  subjectId,
  loyalty
}: {
  subjectKey: "newHireId" | "candidateId";
  subjectId: string;
  loyalty?: TravelerLoyalty;
}) {
  const [saved, setSaved] = useState(false);

  async function save(field: "frequentFlyer" | "hotelLoyalty" | "rentalLoyalty", value: string) {
    const res = await saveTravelerLoyalty({ [subjectKey]: subjectId, [field]: value });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  return (
    <div className="mt-3 rounded border border-brand-lea/12 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between">
        <p className={labelClass}>Traveler loyalty numbers</p>
        <span className="text-[11px] text-brand-grey dark:text-slate-400">
          {saved ? "Saved · auto-fills new trips" : "Saved to profile · auto-fills new trips"}
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <TextField label="Frequent flyer #" defaultValue={loyalty?.frequentFlyer ?? ""} onSave={(v) => save("frequentFlyer", v)} />
        <TextField label="Hotel loyalty #" defaultValue={loyalty?.hotelLoyalty ?? ""} onSave={(v) => save("hotelLoyalty", v)} />
        <TextField label="Rental car loyalty #" defaultValue={loyalty?.rentalLoyalty ?? ""} onSave={(v) => save("rentalLoyalty", v)} />
      </div>
    </div>
  );
}

function TripCard({
  trip,
  onChange,
  onDelete
}: {
  trip: TravelTripView;
  onChange: (t: TravelTripView) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(trip.items.length === 0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const route = [trip.originAirport, trip.destinationAirport].filter(Boolean).join(" → ");
  const dateSummary = fmtDate(trip.requestedArrival) || fmtDate(trip.orientationDate);

  async function saveField(field: string, value: string) {
    const res = await updateTrip(trip.id, { [field]: value });
    if (res.ok && res.trip) onChange(res.trip);
  }

  async function setStatus(status: string) {
    const res = await updateTrip(trip.id, { status });
    if (res.ok && res.trip) onChange(res.trip);
  }

  async function handleDelete() {
    const res = await deleteTrip(trip.id);
    if (res.ok) onDelete(trip.id);
  }

  // Item helpers — keep trip.total in sync as amounts change.
  async function handleAddItem(type: string) {
    const res = await addItem(trip.id, { type });
    if (res.ok && res.item) onChange(tripWithRecomputedTotal(trip, [...trip.items, res.item]));
  }
  function patchItem(updated: TravelItemView) {
    onChange(tripWithRecomputedTotal(trip, trip.items.map((i) => (i.id === updated.id ? updated : i))));
  }
  function removeItem(itemId: string) {
    onChange(tripWithRecomputedTotal(trip, trip.items.filter((i) => i.id !== itemId)));
  }
  function setReceipts(receipts: TravelReceiptView[]) {
    onChange({ ...trip, receipts });
  }

  return (
    <div className="rounded border border-brand-lea/12 bg-brand-cloudDancer/30 transition hover:shadow-glow dark:border-white/10 dark:bg-white/5">
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-brand-grey transition hover:text-brand-lea dark:text-slate-400"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{travelPurposeLabel(trip.purpose)}</span>
            {route && <span className="text-sm text-brand-grey dark:text-slate-400">· {route}</span>}
            {dateSummary && <span className="text-xs text-brand-grey dark:text-slate-400">· {dateSummary}</span>}
          </div>
          <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
            {trip.items.length} {trip.items.length === 1 ? "item" : "items"} · {formatUsd(trip.total)}
            {trip.receipts.length > 0 ? ` · ${trip.receipts.length} receipt${trip.receipts.length === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <select
          value={trip.status}
          onChange={(e) => setStatus(e.target.value)}
          className={clsx(
            "shrink-0 rounded border px-2 py-1 text-xs font-semibold outline-none",
            STATUS_STYLE[trip.status] ?? STATUS_STYLE.NEEDED
          )}
        >
          {TRAVEL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => (confirmDelete ? handleDelete() : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
          className={clsx(
            "shrink-0 rounded p-1.5 text-xs font-semibold transition",
            confirmDelete ? "bg-red-600 text-white" : "text-brand-grey hover:bg-red-50 hover:text-red-600 dark:hover:text-red-300 dark:text-slate-400 dark:hover:bg-red-500/10"
          )}
          title={confirmDelete ? "Click again to delete this trip" : "Delete trip"}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-brand-lea/10 px-3 py-3 dark:border-white/10">
          <RequestDetails trip={trip} onSave={saveField} />
          <ConfirmationImport trip={trip} onApplied={onChange} />
          <ItemsTable
            items={trip.items}
            onAdd={handleAddItem}
            onPatch={patchItem}
            onRemove={removeItem}
          />
          <ReceiptsBlock tripId={trip.id} receipts={trip.receipts} onChange={setReceipts} />
          <TextAreaField label="Special requests / notes" defaultValue={trip.specialRequests} onSave={(v) => saveField("specialRequests", v)} />
          <TextAreaField label="Internal notes" defaultValue={trip.notes} onSave={(v) => saveField("notes", v)} />
        </div>
      )}
    </div>
  );
}

function RequestDetails({ trip, onSave }: { trip: TravelTripView; onSave: (field: string, value: string) => void }) {
  const text = (field: keyof TravelTripView, label: string) => (
    <TextField label={label} defaultValue={(trip[field] as string | null) ?? ""} onSave={(v) => onSave(field, v)} />
  );
  return (
    <div>
      <p className={labelClass}>Request details</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {text("originAirport", "From (airport)")}
        {text("destinationAirport", "To (airport)")}
        <DateField label="Orientation date" defaultValue={toDateInput(trip.orientationDate)} onSave={(v) => onSave("orientationDate", v)} />
        <DateField label="Indoc start" defaultValue={toDateInput(trip.indocStart)} onSave={(v) => onSave("indocStart", v)} />
        <DateField label="Indoc end" defaultValue={toDateInput(trip.indocEnd)} onSave={(v) => onSave("indocEnd", v)} />
        <DateTimeField label="Requested arrival" defaultValue={toDateTimeLocal(trip.requestedArrival)} onSave={(v) => onSave("requestedArrival", v)} />
        <DateTimeField label="Requested return" defaultValue={toDateTimeLocal(trip.requestedReturn)} onSave={(v) => onSave("requestedReturn", v)} />
        {text("preferredAirline", "Preferred airline / seat")}
        {text("preferences", "Hotel / car preferences")}
        {text("additionalTransport", "Additional transport")}
      </div>
    </div>
  );
}

function ConfirmationImport({ trip, onApplied }: { trip: TravelTripView; onApplied: (t: TravelTripView) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [parsed, setParsed] = useState<ParsedTravel | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runExtract() {
    setParsing(true);
    setError(null);
    setParsed(null);
    const res = await extractTravelConfirmation(text);
    setParsing(false);
    if (!res.ok || !res.parsed) {
      setError(res.error ?? "Could not read that confirmation.");
      return;
    }
    setParsed(res.parsed);
  }

  async function apply() {
    if (!parsed) return;
    setApplying(true);
    for (const pi of parsed.items) {
      const added = await addItem(trip.id, { type: pi.type });
      if (!added.ok || !added.item) continue;
      const patch: Record<string, string> = {};
      if (pi.vendor) patch.vendor = pi.vendor;
      if (pi.confirmation) patch.confirmation = pi.confirmation;
      if (pi.detail) patch.detail = pi.detail;
      if (pi.amount !== null) patch.amount = String(pi.amount);
      if (pi.startsAt) patch.startsAt = pi.startsAt;
      if (Object.keys(patch).length) await updateItem(added.item.id, patch);
    }
    // Fill empty trip-level fields from the parse (never overwrite existing).
    const tripPatch: Record<string, string> = {};
    if (parsed.originAirport && !trip.originAirport) tripPatch.originAirport = parsed.originAirport;
    if (parsed.destinationAirport && !trip.destinationAirport) tripPatch.destinationAirport = parsed.destinationAirport;
    if (parsed.preferredAirline && !trip.preferredAirline) tripPatch.preferredAirline = parsed.preferredAirline;

    // An (even empty) updateTrip returns the canonical fresh trip incl. new items.
    const ut = await updateTrip(trip.id, tripPatch);
    setApplying(false);
    if (ut.ok && ut.trip) onApplied(ut.trip);
    setText("");
    setParsed(null);
    setOpen(false);
  }

  return (
    <div className="rounded border border-dashed border-brand-gold/40 bg-brand-gold/5 p-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-brand-gold"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Auto-fill from a confirmation
        <span className="ml-1 font-normal normal-case tracking-normal text-brand-grey dark:text-slate-400">
          paste an airline / hotel / rental email
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Paste the confirmation email or itinerary text here…"
            className={clsx(inputClass, "resize-y font-mono text-xs")}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={runExtract}
              disabled={parsing || text.trim().length < 8}
              className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
            >
              <ClipboardPaste className="h-4 w-4" />
              {parsing ? "Reading…" : "Extract"}
            </button>
            {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">{error}</span>}
          </div>

          {parsed && (
            <div className="rounded border border-brand-lea/15 bg-white p-2.5 dark:border-white/10 dark:bg-brand-panel">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                Found {parsed.items.length} {parsed.items.length === 1 ? "item" : "items"} — review &amp; apply
              </p>
              {(parsed.originAirport || parsed.destinationAirport) && (
                <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                  Route: {[parsed.originAirport, parsed.destinationAirport].filter(Boolean).join(" → ")}
                </p>
              )}
              <div className="mt-2 space-y-1">
                {parsed.items.map((pi, i) => {
                  const Icon = ITEM_ICON[pi.type] ?? Receipt;
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm text-brand-lea dark:text-slate-100">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-brand-gold" />
                      <span className="font-semibold">{travelItemTypeLabel(pi.type)}</span>
                      {pi.vendor && <span className="text-brand-grey dark:text-slate-400">· {pi.vendor}</span>}
                      {pi.confirmation && <span className="text-brand-grey dark:text-slate-400">· {pi.confirmation}</span>}
                      {pi.amount !== null && <span className="text-brand-grey dark:text-slate-400">· {formatUsd(pi.amount)}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={apply}
                  disabled={applying}
                  className="rounded bg-brand-gold px-3 py-1.5 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-60 dark:text-slate-100"
                >
                  {applying ? "Adding…" : `Add ${parsed.items.length} to trip`}
                </button>
                <button
                  onClick={() => setParsed(null)}
                  className="rounded border border-brand-lea/15 px-3 py-1.5 text-sm font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-400"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemsTable({
  items,
  onAdd,
  onPatch,
  onRemove
}: {
  items: TravelItemView[];
  onAdd: (type: string) => void;
  onPatch: (item: TravelItemView) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={labelClass}>Booked items</p>
        <div className="flex flex-wrap gap-1.5">
          {TRAVEL_ITEM_TYPES.map((t) => {
            const Icon = ITEM_ICON[t.value] ?? Receipt;
            return (
              <button
                key={t.value}
                onClick={() => onAdd(t.value)}
                className="inline-flex items-center gap-1 rounded border border-brand-lea/15 bg-white px-2 py-1 text-[11px] font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {items.length > 0 && (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} onPatch={onPatch} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onPatch,
  onRemove
}: {
  item: TravelItemView;
  onPatch: (item: TravelItemView) => void;
  onRemove: (id: string) => void;
}) {
  const Icon = ITEM_ICON[item.type] ?? Receipt;

  async function save(field: string, value: string) {
    const res = await updateItem(item.id, { [field]: value });
    if (res.ok && res.item) onPatch(res.item);
  }
  async function handleRemove() {
    const res = await deleteItem(item.id);
    if (res.ok) onRemove(item.id);
  }

  return (
    <div className="rounded border border-brand-lea/10 bg-white p-2.5 dark:border-white/10 dark:bg-brand-panel">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-brand-gold" />
        <select
          defaultValue={item.type}
          onChange={(e) => save("type", e.target.value)}
          className="rounded border border-brand-lea/15 bg-white px-2 py-1 text-xs font-semibold text-brand-lea outline-none dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
        >
          {TRAVEL_ITEM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          defaultValue={item.vendor ?? ""}
          onBlur={(e) => save("vendor", e.target.value)}
          placeholder="Vendor (Delta, Hertz…)"
          className={clsx(inputClass, "flex-1")}
        />
        <button
          onClick={handleRemove}
          className="shrink-0 rounded p-1.5 text-brand-grey transition hover:bg-red-50 hover:text-red-600 dark:hover:text-red-300 dark:text-slate-400 dark:hover:bg-red-500/10"
          title="Remove item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          defaultValue={item.confirmation ?? ""}
          onBlur={(e) => save("confirmation", e.target.value)}
          placeholder="Confirmation #"
          className={inputClass}
        />
        <input
          defaultValue={item.detail ?? ""}
          onBlur={(e) => save("detail", e.target.value)}
          placeholder="Details (flight #, route…)"
          className={inputClass}
        />
        <label className="flex items-center gap-1">
          <span className="text-[10px] font-bold uppercase text-brand-grey dark:text-slate-400">$</span>
          <input
            type="number"
            step="0.01"
            defaultValue={item.amount ?? ""}
            onBlur={(e) => save("amount", e.target.value)}
            placeholder="Cost"
            className={inputClass}
          />
        </label>
        <input
          type="datetime-local"
          defaultValue={toDateTimeLocal(item.startsAt)}
          onBlur={(e) => save("startsAt", e.target.value)}
          className={inputClass}
          title="Starts"
        />
      </div>
    </div>
  );
}

function ReceiptsBlock({
  tripId,
  receipts,
  onChange
}: {
  tripId: string;
  receipts: TravelReceiptView[];
  onChange: (receipts: TravelReceiptView[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const res = await fetch(`/api/travel/${tripId}/receipts`, { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? "Upload failed.");
      onChange([...(data.receipts as TravelReceiptView[]), ...receipts]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/travel/receipts/${id}`, { method: "DELETE" });
    if (res.ok) onChange(receipts.filter((r) => r.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className={labelClass}>Receipts &amp; confirmations</p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded border border-brand-lea/15 bg-white px-2 py-1 text-[11px] font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea disabled:opacity-60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      {receipts.length > 0 && (
        <div className="mt-2 space-y-1">
          {receipts.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded border border-brand-lea/10 bg-white px-2.5 py-1.5 text-sm dark:border-white/10 dark:bg-brand-panel"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-brand-grey dark:text-slate-400" />
              <a
                href={`/api/travel/receipts/${r.id}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate font-medium text-brand-lea hover:text-brand-eden dark:text-slate-100"
              >
                {r.displayFilename}
              </a>
              {r.amount !== null && <span className="shrink-0 text-xs text-brand-grey dark:text-slate-400">{formatUsd(r.amount)}</span>}
              <button
                onClick={() => handleDelete(r.id)}
                className="shrink-0 rounded p-1 text-brand-grey transition hover:bg-red-50 hover:text-red-600 dark:hover:text-red-300 dark:text-slate-400 dark:hover:bg-red-500/10"
                title="Delete receipt"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Small auto-saving field primitives -------------------------------------

function TextField({ label, defaultValue, onSave }: { label: string; defaultValue: string; onSave: (v: string) => void }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input defaultValue={defaultValue} onBlur={(e) => onSave(e.target.value)} className={clsx(inputClass, "mt-1")} />
    </label>
  );
}

function DateField({ label, defaultValue, onSave }: { label: string; defaultValue: string; onSave: (v: string) => void }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input type="date" defaultValue={defaultValue} onBlur={(e) => onSave(e.target.value)} className={clsx(inputClass, "mt-1")} />
    </label>
  );
}

function DateTimeField({ label, defaultValue, onSave }: { label: string; defaultValue: string; onSave: (v: string) => void }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input type="datetime-local" defaultValue={defaultValue} onBlur={(e) => onSave(e.target.value)} className={clsx(inputClass, "mt-1")} />
    </label>
  );
}

function TextAreaField({ label, defaultValue, onSave }: { label: string; defaultValue: string | null; onSave: (v: string) => void }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <textarea
        defaultValue={defaultValue ?? ""}
        onBlur={(e) => onSave(e.target.value)}
        rows={2}
        className={clsx(inputClass, "mt-1 resize-none")}
      />
    </label>
  );
}
