"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Video, MapPin, ChevronLeft, Check, CalendarClock, Globe } from "lucide-react";
import { clsx } from "clsx";
import type { PublicHost, PublicBookingType } from "@/lib/data/booking";
import { formatDateTimeLongWithZone, formatTime, zoneLabel } from "@/lib/calendar/format";
import { US_TIMEZONES } from "@/lib/calendar/timezones";

type TzOption = { value: string; label: string };

type Props = { slug: string; host: PublicHost };

type DaySlots = { date: string; slots: string[] };

type LocalDay = { key: string; label: string; times: Array<{ iso: string; label: string }> };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Regroup UTC slots by the invitee's local date so they see their own day/time. */
function groupByLocalDate(days: DaySlots[], tz: string): LocalDay[] {
  const all = days.flatMap((d) => d.slots);
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const labelFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

  const byKey = new Map<string, LocalDay>();
  for (const iso of all) {
    const d = new Date(iso);
    const key = dateFmt.format(d);
    if (!byKey.has(key)) byKey.set(key, { key, label: labelFmt.format(d), times: [] });
    byKey.get(key)!.times.push({ iso, label: timeFmt.format(d) });
  }
  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function PublicBooking({ slug, host }: Props) {
  const [tz, setTz] = useState<string>(host.timezone);
  const [type, setType] = useState<PublicBookingType | null>(host.bookingTypes.length === 1 ? host.bookingTypes[0] : null);
  const [days, setDays] = useState<DaySlots[]>([]);
  const [loading, setLoading] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ start: string; typeName: string; location: string | null } | null>(null);

  // Detect the invitee's timezone client-side (avoids SSR hydration mismatch).
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTz(detected);
    } catch {
      /* keep host tz */
    }
  }, []);

  useEffect(() => {
    if (!type) return;
    let active = true;
    setLoading(true);
    setSlot(null);
    fetch(`/api/book/${slug}/slots?typeId=${encodeURIComponent(type.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) setDays(Array.isArray(data.days) ? data.days : []);
      })
      .catch(() => active && setDays([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [type, slug]);

  const localDays = useMemo(() => groupByLocalDate(days, tz), [days, tz]);

  const selectedLabel = useMemo(() => (slot ? formatDateTimeLongWithZone(slot, tz) : null), [slot, tz]);

  // Timezone choices: standard US zones, plus the detected and host zones if not already listed.
  const tzOptions = useMemo<TzOption[]>(() => {
    const map = new Map<string, string>();
    for (const z of US_TIMEZONES) map.set(z.value, z.label);
    if (!map.has(tz)) map.set(tz, tz);
    if (!map.has(host.timezone)) map.set(host.timezone, host.timezone);
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [tz, host.timezone]);

  // The host's local time, shown alongside the invitee's when the zones differ.
  const hostLabel = useMemo(
    () => (slot && host.timezone !== tz ? `${formatTime(slot, host.timezone)} ${zoneLabel(host.timezone)} for ${host.name}` : null),
    [slot, tz, host.timezone, host.name]
  );

  async function submit() {
    if (!type || !slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingTypeId: type.id,
          startDateTime: slot,
          inviteeName: name,
          inviteeEmail: email,
          inviteePhone: phone || null,
          notes: notes || null,
          timezone: tz
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Unable to book.");
      setConfirmed({ start: data.booking.start, typeName: data.booking.typeName, location: data.booking.location });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to book.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      {/* Host header */}
      <div className="flex items-center gap-4">
        {host.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={host.avatarUrl} alt={host.name} className="h-14 w-14 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-brand-lea/15 dark:ring-white/10" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-lea text-lg font-bold text-white shadow-sm">
            {initials(host.name)}
          </span>
        )}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Schedule a time</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">{host.name}</h1>
          {host.title ? <p className="text-sm text-brand-grey dark:text-slate-400">{host.title}</p> : null}
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 sm:p-8 dark:bg-[#10243a] dark:ring-white/10">
        {confirmed ? (
          <ConfirmedCard confirmed={confirmed} tz={tz} hostName={host.name} hostTimezone={host.timezone} email={email} />
        ) : !type ? (
          <TypePicker types={host.bookingTypes} onPick={setType} />
        ) : !slot ? (
          <SlotPicker
            type={type}
            tz={tz}
            tzOptions={tzOptions}
            onTzChange={setTz}
            days={localDays}
            loading={loading}
            multiType={host.bookingTypes.length > 1}
            onBack={() => setType(null)}
            onPick={setSlot}
          />
        ) : (
          <BookingForm
            type={type}
            selectedLabel={selectedLabel}
            hostLabel={hostLabel}
            name={name}
            email={email}
            phone={phone}
            notes={notes}
            error={error}
            submitting={submitting}
            setName={setName}
            setEmail={setEmail}
            setPhone={setPhone}
            setNotes={setNotes}
            onBack={() => setSlot(null)}
            onSubmit={submit}
          />
        )}
      </div>

      <p className="mt-4 text-center text-xs text-brand-grey dark:text-slate-400">Powered by SkyShare Talent scheduling</p>
    </main>
  );
}

function TypeMeta({ type }: { type: PublicBookingType }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-grey dark:text-slate-400">
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" /> {type.durationMinutes} min
      </span>
      {type.location ? (
        <span className="inline-flex items-center gap-1">
          {/zoom|video|meet|teams/i.test(type.location) ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
          {type.location}
        </span>
      ) : null}
    </div>
  );
}

function TypePicker({ types, onPick }: { types: PublicBookingType[]; onPick: (t: PublicBookingType) => void }) {
  if (types.length === 0) {
    return <p className="py-8 text-center text-sm text-brand-grey dark:text-slate-400">No meeting types are available yet.</p>;
  }
  return (
    <div>
      <h2 className="text-sm font-semibold text-brand-lea dark:text-slate-100">What would you like to book?</h2>
      <div className="mt-4 space-y-3">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t)}
            className="flex w-full items-start justify-between gap-3 rounded-xl border border-brand-lea/15 p-4 text-left transition hover:border-brand-sweet hover:bg-brand-sweet/5 hover:shadow-glow dark:border-white/10"
          >
            <div>
              <div className="font-semibold text-brand-lea dark:text-slate-100">{t.name}</div>
              {t.description ? <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">{t.description}</p> : null}
              <TypeMeta type={t} />
            </div>
            <CalendarClock className="h-5 w-5 shrink-0 text-brand-gold" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotPicker({
  type,
  tz,
  tzOptions,
  onTzChange,
  days,
  loading,
  multiType,
  onBack,
  onPick
}: {
  type: PublicBookingType;
  tz: string;
  tzOptions: TzOption[];
  onTzChange: (tz: string) => void;
  days: LocalDay[];
  loading: boolean;
  multiType: boolean;
  onBack: () => void;
  onPick: (iso: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          {multiType ? (
            <button onClick={onBack} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
              <ChevronLeft className="h-3.5 w-3.5" /> Meeting type
            </button>
          ) : null}
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">{type.name}</h2>
          <TypeMeta type={type} />
        </div>
        <label className="inline-flex shrink-0 items-center gap-1.5 rounded bg-brand-cloudDancer/60 py-1 pl-2.5 pr-1 text-[11px] font-medium text-brand-grey dark:bg-white/5 dark:text-slate-400">
          <Globe className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Times in</span>
          <select
            value={tz}
            onChange={(e) => onTzChange(e.target.value)}
            aria-label="Display timezone"
            className="max-w-[10rem] truncate rounded bg-transparent py-0.5 pr-1 text-[11px] font-semibold text-brand-lea focus:outline-none dark:text-slate-100"
          >
            {tzOptions.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-brand-grey dark:text-slate-400">Loading available times…</p>
      ) : days.length === 0 ? (
        <p className="py-10 text-center text-sm text-brand-grey dark:text-slate-400">No open times in the booking window. Please check back later.</p>
      ) : (
        <div className="mt-5 max-h-[28rem] space-y-5 overflow-y-auto pr-1">
          {days.map((day) => (
            <div key={day.key}>
              <h3 className="sticky top-0 bg-white py-1 text-xs font-bold uppercase tracking-[0.12em] text-brand-grey dark:bg-[#10243a] dark:text-slate-400">{day.label}</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {day.times.map((t) => (
                  <button
                    key={t.iso}
                    onClick={() => onPick(t.iso)}
                    className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:border-brand-sweet hover:bg-brand-sweet/10 hover:shadow-glow dark:border-white/10 dark:text-slate-100"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingForm(props: {
  type: PublicBookingType;
  selectedLabel: string | null;
  hostLabel: string | null;
  name: string;
  email: string;
  phone: string;
  notes: string;
  error: string | null;
  submitting: boolean;
  setName: (v: string) => void;
  setEmail: (v: string) => void;
  setPhone: (v: string) => void;
  setNotes: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { type, selectedLabel, error, submitting } = props;
  const canSubmit = props.name.trim().length > 0 && /\S+@\S+\.\S+/.test(props.email) && !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) props.onSubmit();
      }}
    >
      <button type="button" onClick={props.onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
        <ChevronLeft className="h-3.5 w-3.5" /> Pick another time
      </button>

      <div className="rounded-xl bg-brand-cloudDancer/40 p-4 dark:bg-white/5">
        <div className="font-semibold text-brand-lea dark:text-slate-100">{type.name}</div>
        <div className="mt-1 flex items-center gap-2 text-sm text-brand-grey dark:text-slate-400">
          <CalendarClock className="h-4 w-4 text-brand-gold" />
          {selectedLabel}
        </div>
        {props.hostLabel ? <div className="mt-1 pl-6 text-xs text-brand-grey dark:text-slate-400">{props.hostLabel}</div> : null}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Name
          <input
            value={props.name}
            onChange={(e) => props.setName(e.target.value)}
            required
            className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Email
          <input
            type="email"
            value={props.email}
            onChange={(e) => props.setEmail(e.target.value)}
            required
            className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Phone <span className="font-normal text-brand-grey dark:text-slate-400">(optional)</span>
          <input
            value={props.phone}
            onChange={(e) => props.setPhone(e.target.value)}
            className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Anything we should know? <span className="font-normal text-brand-grey dark:text-slate-400">(optional)</span>
          <textarea
            value={props.notes}
            onChange={(e) => props.setNotes(e.target.value)}
            rows={3}
            className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10"
          />
        </label>
      </div>

      {error ? <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-4 w-full rounded-lg bg-brand-lea px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-lea/90 disabled:opacity-50"
      >
        {submitting ? "Booking…" : "Confirm booking"}
      </button>
    </form>
  );
}

function ConfirmedCard({
  confirmed,
  tz,
  hostName,
  hostTimezone,
  email
}: {
  confirmed: { start: string; typeName: string; location: string | null };
  tz: string;
  hostName: string;
  hostTimezone: string;
  email: string;
}) {
  const when = formatDateTimeLongWithZone(confirmed.start, tz);
  const hostWhen = hostTimezone !== tz ? `${formatTime(confirmed.start, hostTimezone)} ${zoneLabel(hostTimezone)} for ${hostName}` : null;

  return (
    <div className="py-4 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
        <Check className="h-7 w-7 text-emerald-600" />
      </span>
      <h2 className="mt-4 text-xl font-semibold text-brand-lea dark:text-slate-100">You&apos;re booked!</h2>
      <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
        {confirmed.typeName} with {hostName}
      </p>
      <div className="mx-auto mt-4 max-w-sm rounded-xl bg-brand-cloudDancer/40 p-4 text-left text-sm text-brand-lea dark:bg-white/5 dark:text-slate-100">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-brand-gold" /> {when}
        </div>
        {hostWhen ? <div className="mt-1 pl-6 text-xs text-brand-grey dark:text-slate-400">{hostWhen}</div> : null}
        {confirmed.location ? (
          <div className="mt-2 flex items-center gap-2 text-brand-grey dark:text-slate-400">
            <MapPin className="h-4 w-4" /> {confirmed.location}
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-xs text-brand-grey dark:text-slate-400">
        Your time with {hostName} is reserved{email ? ` under ${email}` : ""}. Please make a note of it.
      </p>
    </div>
  );
}
