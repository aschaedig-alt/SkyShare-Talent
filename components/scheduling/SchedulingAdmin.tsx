"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Copy, Check, Link as LinkIcon, Calendar, Clock, Ban, ImageUp } from "lucide-react";
import { clsx } from "clsx";
import { US_TIMEZONES } from "@/lib/calendar/timezones";
import { DEPARTMENTS } from "@/lib/calendar/departments";

export type AdminWeeklyRule = { id: string; dayOfWeek: number; startMinute: number; endMinute: number };
export type AdminBookingType = {
  id: string;
  name: string;
  kind: string;
  durationMinutes: number;
  bufferMinutes: number | null;
  location: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};
export type AdminHost = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  role: string;
  departments: string[];
  title: string | null;
  avatarUrl: string | null;
  timezone: string;
  calendarId: string | null;
  minNoticeHours: number;
  bookingWindowDays: number;
  maxPerDay: number | null;
  bufferMinutes: number;
  isActive: boolean;
  weeklyRules: AdminWeeklyRule[];
  bookingTypes: AdminBookingType[];
};
export type AdminOverride = {
  id: string;
  hostId: string | null;
  startDate: string;
  endDate: string;
  kind: string;
  startMinute: number | null;
  endMinute: number | null;
  label: string | null;
};

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const inp = "w-full rounded-lg border border-brand-lea/20 px-3 py-2 text-sm dark:border-white/10";

function toHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fromHHMM(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}
function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Read an image file and downscale to a small square data URL so avatars stay tiny.
function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a readable image."));
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Request failed.");
  return data;
}

export function SchedulingAdmin({ hosts, overrides }: { hosts: AdminHost[]; overrides: AdminOverride[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(hosts[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => hosts.find((h) => h.id === selectedId) ?? null, [hosts, selectedId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function addHost() {
    const name = window.prompt("New team member name (e.g. Aimee Chen):");
    if (!name) return;
    await run(async () => {
      const data = await api("/api/booking-hosts", "POST", { name, slug: slugify(name) });
      setSelectedId(data.host.id);
    });
  }

  async function removeHost(h: AdminHost) {
    if (!window.confirm(`Remove ${h.name} from scheduling? Their bookings and availability will be deleted. This cannot be undone.`)) return;
    await run(async () => {
      await api(`/api/booking-hosts/${h.id}`, "DELETE");
      if (selectedId === h.id) setSelectedId(null);
    });
  }

  return (
    <div className="px-5 py-6 lg:px-8">
      <div className="mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Scheduling</p>
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Booking links</h1>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Give each recruiter and hiring manager a &quot;schedule with me&quot; link. Bookings land on the shared SkyShare calendar.
        </p>
      </div>

      {error ? <p className="mb-4 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* Host list */}
        <aside className="space-y-2">
          <button
            onClick={addHost}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-lea/30 px-3 py-2 text-sm font-semibold text-brand-lea hover:border-brand-sweet hover:bg-brand-sweet/5 dark:border-white/10 dark:text-slate-100"
          >
            <Plus className="h-4 w-4" /> New team member
          </button>
          {hosts.map((h) => (
            <div
              key={h.id}
              className={clsx(
                "flex items-stretch gap-1 rounded-lg border pr-1 transition hover:shadow-glow",
                h.id === selectedId ? "border-brand-sweet bg-brand-sweet/10" : "border-brand-lea/10 hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:bg-white/5"
              )}
            >
              <button onClick={() => setSelectedId(h.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{h.name}</span>
                  {!h.isActive ? <span className="text-[10px] font-bold uppercase text-brand-grey dark:text-slate-400">off</span> : null}
                </div>
                <div className="truncate text-[11px] text-brand-grey dark:text-slate-400">/book/{h.slug}</div>
              </button>
              <button
                onClick={() => removeHost(h)}
                disabled={busy}
                title={`Remove ${h.name}`}
                aria-label={`Remove ${h.name}`}
                className="flex shrink-0 items-center rounded p-1.5 text-brand-grey/70 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {hosts.length === 0 ? <p className="px-1 text-xs text-brand-grey dark:text-slate-400">No team members yet.</p> : null}
        </aside>

        {/* Detail */}
        <div className="min-w-0">
          {selected ? (
            <HostDetail key={selected.id} host={selected} overrides={overrides} busy={busy} run={run} onDeleted={() => setSelectedId(null)} />
          ) : (
            <div className="rounded-xl bg-white p-8 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:text-slate-400 dark:ring-white/10">
              Select or create a team member to manage their availability.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Clock; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">
        <Icon className="h-4 w-4 text-brand-gold" /> {title}
      </h2>
      {children}
    </section>
  );
}

function HostDetail({
  host,
  overrides,
  busy,
  run,
  onDeleted
}: {
  host: AdminHost;
  overrides: AdminOverride[];
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onDeleted: () => void;
}) {
  const hostOverrides = overrides.filter((o) => o.hostId === host.id || o.hostId === null);

  return (
    <div className="space-y-5">
      <PhotoCard host={host} busy={busy} run={run} />
      <ShareLink slug={host.slug} />
      <Settings host={host} busy={busy} run={run} onDeleted={onDeleted} />
      <WeeklyAvailability host={host} busy={busy} run={run} />
      <BookingTypes host={host} busy={busy} run={run} />
      <Overrides host={host} overrides={hostOverrides} busy={busy} run={run} />
    </div>
  );
}

function PhotoCard({
  host,
  busy,
  run
}: {
  host: AdminHost;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setReading(true);
    try {
      const avatarUrl = await fileToAvatarDataUrl(file);
      await run(async () => {
        await api(`/api/booking-hosts/${host.id}`, "PATCH", { avatarUrl });
      });
    } finally {
      setReading(false);
    }
  }

  return (
    <Card title="Profile photo" icon={ImageUp}>
      <div className="flex items-center gap-4">
        {host.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={host.avatarUrl} alt={host.name} className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-brand-lea/15 dark:ring-white/10" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-lea text-lg font-bold text-white">
            {initials(host.name)}
          </span>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy || reading}
              className="rounded-lg bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-lea/90 disabled:opacity-50"
            >
              {reading ? "Reading…" : host.avatarUrl ? "Replace photo" : "Upload photo"}
            </button>
            {host.avatarUrl ? (
              <button
                onClick={() => run(async () => void api(`/api/booking-hosts/${host.id}`, "PATCH", { avatarUrl: null }))}
                disabled={busy}
                className="rounded-lg border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="text-xs text-brand-grey dark:text-slate-400">Shown next to {host.name} on the calendar timeline. Square images look best; large photos are scaled down automatically.</p>
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      </div>
    </Card>
  );
}

function ShareLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/book/${slug}` : `/book/${slug}`;
  return (
    <Card title="Share link" icon={LinkIcon}>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg bg-brand-cloudDancer/40 px-3 py-2 text-sm text-brand-lea dark:bg-white/5 dark:text-slate-100">{url}</code>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 rounded-lg bg-brand-lea px-3 py-2 text-sm font-semibold text-white hover:bg-brand-lea/90"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
        >
          Open
        </a>
      </div>
    </Card>
  );
}

function Settings({
  host,
  busy,
  run,
  onDeleted
}: {
  host: AdminHost;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState({
    name: host.name,
    slug: host.slug,
    title: host.title ?? "",
    email: host.email ?? "",
    role: host.role,
    departments: host.departments,
    timezone: host.timezone,
    calendarId: host.calendarId ?? "",
    minNoticeHours: host.minNoticeHours,
    bookingWindowDays: host.bookingWindowDays,
    maxPerDay: host.maxPerDay ?? "",
    bufferMinutes: host.bufferMinutes,
    isActive: host.isActive
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <Card title="Settings" icon={Clock}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} />
        </Field>
        <Field label="Link slug">
          <input value={form.slug} onChange={(e) => set("slug", e.target.value)} className={inp} />
        </Field>
        <Field label="Title">
          <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inp} />
        </Field>
        <Field label="Role">
          <select value={form.role} onChange={(e) => set("role", e.target.value)} className={inp}>
            <option value="RECRUITER">Recruiter</option>
            <option value="HIRING_MANAGER">Hiring Manager</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Email (@skyshare)">
          <input value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} />
        </Field>
        <Field label="Personal calendar id (free/busy, optional)">
          <input value={form.calendarId} onChange={(e) => set("calendarId", e.target.value)} placeholder="name@skyshare.dev" className={inp} />
        </Field>
        <Field label="Minimum notice (hours)">
          <input type="number" value={form.minNoticeHours} onChange={(e) => set("minNoticeHours", Number(e.target.value))} className={inp} />
        </Field>
        <Field label="Bookable window (days)">
          <input type="number" value={form.bookingWindowDays} onChange={(e) => set("bookingWindowDays", Number(e.target.value))} className={inp} />
        </Field>
        <Field label="Max bookings / day (blank = no limit)">
          <input
            type="number"
            value={form.maxPerDay}
            onChange={(e) => set("maxPerDay", e.target.value === "" ? "" : Number(e.target.value))}
            className={inp}
          />
        </Field>
        <Field label="Default buffer">
          <select value={form.bufferMinutes} onChange={(e) => set("bufferMinutes", Number(e.target.value))} className={inp}>
            <option value={0}>No buffer</option>
            <option value={10}>10 minutes</option>
          </select>
        </Field>
        <Field label="Timezone">
          <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className={inp}>
            {US_TIMEZONES.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
            {US_TIMEZONES.every((z) => z.value !== form.timezone) ? (
              <option value={form.timezone}>{form.timezone}</option>
            ) : null}
          </select>
        </Field>
        <Field label="Active">
          <label className="flex items-center gap-2 py-2 text-sm text-brand-lea dark:text-slate-100">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Accepting bookings
          </label>
        </Field>
      </div>

      <div className="mt-3">
        <div className="text-xs font-semibold text-brand-lea dark:text-slate-100">Departments</div>
        <p className="mb-2 text-[11px] text-brand-grey dark:text-slate-400">Which departments this person interviews for — choose one or more.</p>
        <div className="flex flex-wrap gap-1.5">
          {DEPARTMENTS.map((d) => {
            const active = form.departments.includes(d.key);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() =>
                  set("departments", active ? form.departments.filter((x) => x !== d.key) : [...form.departments, d.key])
                }
                className={clsx(
                  "rounded border px-3 py-1 text-xs font-semibold transition hover:shadow-glow",
                  active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() =>
            run(async () => {
              if (!window.confirm(`Remove ${host.name} and all their bookings?`)) return;
              await api(`/api/booking-hosts/${host.id}`, "DELETE");
              onDeleted();
            })
          }
          disabled={busy}
          className="flex items-center gap-1 rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
        <button
          onClick={() =>
            run(async () => {
              await api(`/api/booking-hosts/${host.id}`, "PATCH", {
                ...form,
                maxPerDay: form.maxPerDay === "" ? null : Number(form.maxPerDay)
              });
            })
          }
          disabled={busy}
          className="rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white hover:bg-brand-lea/90 disabled:opacity-50"
        >
          Save settings
        </button>
      </div>

      <style jsx>{`
        :global(.inp) {
          border-radius: 0.5rem;
          border: 1px solid rgb(20 33 61 / 0.2);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          width: 100%;
        }
      `}</style>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
      {label}
      {children}
    </label>
  );
}

type DayRange = { startMinute: number; endMinute: number };

function WeeklyAvailability({
  host,
  busy,
  run
}: {
  host: AdminHost;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const initial: DayRange[][] = useMemo(() => {
    const byDay: DayRange[][] = [[], [], [], [], [], [], []];
    for (const r of host.weeklyRules) byDay[r.dayOfWeek].push({ startMinute: r.startMinute, endMinute: r.endMinute });
    return byDay;
  }, [host.weeklyRules]);

  const [days, setDays] = useState<DayRange[][]>(initial);

  function update(d: number, next: DayRange[]) {
    setDays((prev) => prev.map((arr, i) => (i === d ? next : arr)));
  }

  return (
    <Card title="Weekly availability" icon={Calendar}>
      <div className="space-y-2">
        {DOW.map((label, d) => (
          <div key={d} className="flex flex-wrap items-start gap-2 border-b border-brand-lea/5 py-2 last:border-0 dark:border-white/10">
            <div className="w-24 shrink-0 pt-2 text-sm font-semibold text-brand-lea dark:text-slate-100">{label}</div>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {days[d].length === 0 ? <span className="py-2 text-xs text-brand-grey dark:text-slate-400">Unavailable</span> : null}
              {days[d].map((range, i) => (
                <div key={i} className="flex items-center gap-1 rounded-lg bg-brand-cloudDancer/40 px-2 py-1 dark:bg-white/5">
                  <input
                    type="time"
                    value={toHHMM(range.startMinute)}
                    onChange={(e) => update(d, days[d].map((r, j) => (j === i ? { ...r, startMinute: fromHHMM(e.target.value) } : r)))}
                    className="rounded border border-brand-lea/20 px-1 py-0.5 text-xs dark:border-white/10"
                  />
                  <span className="text-xs text-brand-grey dark:text-slate-400">–</span>
                  <input
                    type="time"
                    value={toHHMM(range.endMinute)}
                    onChange={(e) => update(d, days[d].map((r, j) => (j === i ? { ...r, endMinute: fromHHMM(e.target.value) } : r)))}
                    className="rounded border border-brand-lea/20 px-1 py-0.5 text-xs dark:border-white/10"
                  />
                  <button onClick={() => update(d, days[d].filter((_, j) => j !== i))} className="text-brand-grey hover:text-red-600 dark:text-slate-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => update(d, [...days[d], { startMinute: 9 * 60, endMinute: 17 * 60 }])}
                className="rounded-lg border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
              >
                + Add hours
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={() =>
            run(async () => {
              const rules = days.flatMap((arr, dayOfWeek) =>
                arr.map((r) => ({ dayOfWeek, startMinute: r.startMinute, endMinute: r.endMinute }))
              );
              await api(`/api/booking-hosts/${host.id}/availability`, "PUT", { rules });
            })
          }
          disabled={busy}
          className="rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white hover:bg-brand-lea/90 disabled:opacity-50"
        >
          Save availability
        </button>
      </div>
    </Card>
  );
}

function BookingTypes({
  host,
  busy,
  run
}: {
  host: AdminHost;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ name: "", kind: "INTERVIEW", durationMinutes: 30, bufferMinutes: "" as string, location: "" });

  return (
    <Card title="Meeting types" icon={Clock}>
      <div className="space-y-2">
        {host.bookingTypes.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-lea/10 p-2 dark:border-white/10">
            <span className="flex-1 text-sm font-semibold text-brand-lea dark:text-slate-100">
              {t.name} <span className="text-xs font-normal text-brand-grey dark:text-slate-400">· {t.kind === "MEETING" ? "Meeting" : "Interview"}</span>
            </span>
            <select
              value={t.durationMinutes}
              onChange={(e) => run(async () => void api(`/api/booking-types/${t.id}`, "PATCH", { durationMinutes: Number(e.target.value) }))}
              className="rounded border border-brand-lea/20 px-2 py-1 text-xs dark:border-white/10"
            >
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
            <select
              value={t.bufferMinutes ?? ""}
              onChange={(e) =>
                run(async () =>
                  void api(`/api/booking-types/${t.id}`, "PATCH", { bufferMinutes: e.target.value === "" ? 0 : Number(e.target.value) })
                )
              }
              className="rounded border border-brand-lea/20 px-2 py-1 text-xs dark:border-white/10"
            >
              <option value="">No buffer</option>
              <option value={10}>10 min buffer</option>
            </select>
            <button
              onClick={() => run(async () => void api(`/api/booking-types/${t.id}`, "PATCH", { isActive: !t.isActive }))}
              className={clsx("rounded px-2 py-1 text-xs font-semibold transition hover:shadow-glow", t.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}
            >
              {t.isActive ? "Active" : "Off"}
            </button>
            <button onClick={() => run(async () => void api(`/api/booking-types/${t.id}`, "DELETE"))} className="text-brand-grey hover:text-red-600 dark:text-slate-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {host.bookingTypes.length === 0 ? <p className="text-xs text-brand-grey dark:text-slate-400">No meeting types yet — add one below.</p> : null}
      </div>

      {/* Add */}
      <div className="mt-3 grid gap-2 rounded-lg bg-brand-cloudDancer/30 p-3 sm:grid-cols-2 dark:bg-white/5">
        <input
          placeholder="Name (e.g. Candidate screen)"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10"
        />
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10">
          <option value="INTERVIEW">Interview (creates a candidate)</option>
          <option value="MEETING">Meeting (any guest)</option>
        </select>
        <select
          value={draft.durationMinutes}
          onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })}
          className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10"
        >
          <option value={30}>30 minutes</option>
          <option value={45}>45 minutes</option>
          <option value={60}>60 minutes</option>
        </select>
        <input
          placeholder="Location (e.g. Video — Zoom)"
          value={draft.location}
          onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10"
        />
        <button
          onClick={() =>
            run(async () => {
              if (!draft.name.trim()) return;
              await api("/api/booking-types", "POST", {
                hostId: host.id,
                name: draft.name,
                kind: draft.kind,
                durationMinutes: draft.durationMinutes,
                location: draft.location || null
              });
              setDraft({ name: "", kind: "INTERVIEW", durationMinutes: 30, bufferMinutes: "", location: "" });
            })
          }
          disabled={busy}
          className="flex items-center justify-center gap-1 rounded-lg bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-lea/90 disabled:opacity-50 sm:col-span-2"
        >
          <Plus className="h-4 w-4" /> Add meeting type
        </button>
      </div>
    </Card>
  );
}

function Overrides({
  host,
  overrides,
  busy,
  run
}: {
  host: AdminHost;
  overrides: AdminOverride[];
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    scope: "host" as "host" | "org",
    kind: "BLOCK" as "BLOCK" | "CUSTOM",
    startDate: "",
    endDate: "",
    startMinute: 9 * 60,
    endMinute: 17 * 60,
    label: ""
  });

  return (
    <Card title="Date overrides (vacation, holidays, special hours)" icon={Ban}>
      <div className="space-y-2">
        {overrides.map((o) => (
          <div key={o.id} className="flex items-center gap-2 rounded-lg border border-brand-lea/10 p-2 text-sm dark:border-white/10">
            <span
              className={clsx(
                "rounded px-2 py-0.5 text-[11px] font-semibold",
                o.kind === "BLOCK" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
              )}
            >
              {o.kind === "BLOCK" ? "Blocked" : "Custom"}
            </span>
            <span className="flex-1 text-brand-lea dark:text-slate-100">
              {o.label ? `${o.label} · ` : ""}
              {o.startDate}
              {o.endDate !== o.startDate ? ` → ${o.endDate}` : ""}
              {o.kind === "CUSTOM" && o.startMinute != null && o.endMinute != null
                ? ` (${toHHMM(o.startMinute)}–${toHHMM(o.endMinute)})`
                : ""}
              {o.hostId === null ? <span className="ml-2 text-[11px] text-brand-grey dark:text-slate-400">org-wide</span> : null}
            </span>
            <button onClick={() => run(async () => void api(`/api/availability-overrides/${o.id}`, "DELETE"))} className="text-brand-grey hover:text-red-600 dark:text-slate-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {overrides.length === 0 ? <p className="text-xs text-brand-grey dark:text-slate-400">No overrides. Recurring schedule applies every week.</p> : null}
      </div>

      <div className="mt-3 grid gap-2 rounded-lg bg-brand-cloudDancer/30 p-3 sm:grid-cols-2 dark:bg-white/5">
        <Field label="Applies to">
          <select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as "host" | "org" })} className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10">
            <option value="host">{host.name} only</option>
            <option value="org">Everyone (holiday)</option>
          </select>
        </Field>
        <Field label="Type">
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as "BLOCK" | "CUSTOM" })} className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10">
            <option value="BLOCK">Block (unavailable)</option>
            <option value="CUSTOM">Custom hours</option>
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10" />
        </Field>
        <Field label="End date">
          <input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10" />
        </Field>
        {draft.kind === "CUSTOM" ? (
          <>
            <Field label="From">
              <input type="time" value={toHHMM(draft.startMinute)} onChange={(e) => setDraft({ ...draft, startMinute: fromHHMM(e.target.value) })} className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10" />
            </Field>
            <Field label="To">
              <input type="time" value={toHHMM(draft.endMinute)} onChange={(e) => setDraft({ ...draft, endMinute: fromHHMM(e.target.value) })} className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10" />
            </Field>
          </>
        ) : null}
        <Field label="Label (optional)">
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Vacation, Holiday…" className="rounded border border-brand-lea/20 px-2 py-1.5 text-sm dark:border-white/10" />
        </Field>
        <button
          onClick={() =>
            run(async () => {
              if (!draft.startDate || !draft.endDate) return;
              await api("/api/availability-overrides", "POST", {
                hostId: draft.scope === "org" ? null : host.id,
                startDate: draft.startDate,
                endDate: draft.endDate,
                kind: draft.kind,
                startMinute: draft.kind === "CUSTOM" ? draft.startMinute : null,
                endMinute: draft.kind === "CUSTOM" ? draft.endMinute : null,
                label: draft.label || null
              });
              setDraft({ ...draft, startDate: "", endDate: "", label: "" });
            })
          }
          disabled={busy}
          className="flex items-center justify-center gap-1 rounded-lg bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-lea/90 disabled:opacity-50 sm:col-span-2"
        >
          <Plus className="h-4 w-4" /> Add override
        </button>
      </div>
    </Card>
  );
}
