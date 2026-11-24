"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { R } from "@/components/reports/report-ui";
import { Button, Modal } from "@/components/ui";
import { EXEC_HUNT_PICTURES_PER_EXEC, EXEC_HUNT_PUBLIC_BASE } from "@/lib/exec-hunt/constants";

// Events > Christmas Party Scavenger Hunt - the admin side of "Where's the
// Executive?". Built from report-ui.ts like every other data page.

type Picture = { id: string; number: number; slug: string; publicKey: string; count: number; url: string };
type Executive = { id: string; slug: string; name: string; photoUrl: string | null; pictures: Picture[] };
type Guest = {
  id: string;
  shortId: string;
  name: string;
  found: number;
  lastAt: string | null;
  firstAt: string | null;
  pictureSlugs: string[];
};
type Activity = {
  id: string;
  guestId: string;
  guestShortId: string;
  guestName: string;
  pictureLabel: string;
  pictureSlug: string;
  createdAt: string;
};
type Config = {
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  showLeaderboard: boolean;
  showNames: boolean;
};
type Stats = {
  participants: number;
  discoveries: number;
  completed: number;
  locationsFound: number;
  total: number;
  executives: Executive[];
  guests: Guest[];
  activity: Activity[];
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "guests", label: "Who found what" },
  { key: "activity", label: "Submissions" },
  { key: "codes", label: "QR codes & photos" },
  { key: "settings", label: "Settings" }
] as const;
type TabKey = (typeof TABS)[number]["key"];

const EXPORT = "/api/events/exec-hunt/export";

function when(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/** ISO -> the value a datetime-local input wants, in the browser's own zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExecHuntAdmin({ config, stats, origin }: { config: Config; stats: Stats; origin: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("overview");
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(id);
  }, [autoRefresh, router]);

  // Two guests with the same name are different people; show their short id.
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of stats.guests) counts.set(g.name.toLowerCase(), (counts.get(g.name.toLowerCase()) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name));
  }, [stats.guests]);
  const guestLabel = (name: string, shortId: string) => (
    <>
      {name}
      {duplicateNames.has(name.toLowerCase()) ? <span className={`ml-1.5 ${R.chip}`}>#{shortId}</span> : null}
    </>
  );

  const pct = Math.round((stats.locationsFound / stats.total) * 100);

  return (
    <div className={R.page}>
      <section className={R.pageHeader}>
        <div>
          <p className={R.eyebrow}>Events · Christmas party, Dec 11</p>
          <h1 className={R.pageTitle}>Christmas Party Scavenger Hunt</h1>
          <p className={R.pageLede}>
            &ldquo;Where&apos;s the Executive?&rdquo; Five executives, three hidden pictures each, one QR code per
            picture. Guests scan with their phone camera, no login.{" "}
            <span className={config.enabled ? "font-semibold text-emerald-700 dark:text-emerald-400" : "font-semibold text-red-700 dark:text-red-400"}>
              The game is {config.enabled ? "ON" : "OFF"}.
            </span>
          </p>
        </div>
        <div className={R.controls}>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-brand-grey dark:text-slate-400">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh
          </label>
          <a href={`${EXEC_HUNT_PUBLIC_BASE}/live`} target="_blank" rel="noreferrer" className={R.pageButton}>
            Open live display
          </a>
        </div>
      </section>

      <nav className={R.tabBar} aria-label="Scavenger hunt sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`${R.tab} ${tab === t.key ? R.segmentOn : R.segmentOff}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <section className={R.panel}>
          <div className={R.header}>
            <div>
              <p className={R.eyebrow}>Game statistics</p>
              <h2 className={R.title}>How the hunt is going</h2>
            </div>
            <div className={R.controls}>
              <a className={R.smallButton} href={`${EXPORT}?kind=leaderboard-csv`}>
                Leaderboard CSV
              </a>
              <a className={R.smallButton} href={`${EXPORT}?kind=discoveries-csv`}>
                All submissions CSV
              </a>
            </div>
          </div>
          <div className={R.hero}>
            <div className={R.heroRow}>
              <span className={R.heroFigure}>{stats.discoveries}</span>
              <span className={R.heroText}>unique discoveries by {stats.participants} guests</span>
            </div>
            <p className={R.heroSub}>Counted from real claims only; a repeat scan never adds one.</p>
          </div>
          <div className={R.tiles}>
            <Tile label="Participating guests" value={stats.participants} />
            <Tile label="Unique discoveries" value={stats.discoveries} />
            <Tile label="Found all 15" value={stats.completed} />
            <Tile label="Spots found by someone" value={`${pct}%`} sub={`${stats.locationsFound} of ${stats.total} hiding places`} />
          </div>

          <div className={R.box}>
            <p className={R.sectionLabel}>Discoveries per picture</p>
            <ul className="mt-2 space-y-2">
              {stats.executives.map((exec) => (
                <li key={exec.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <span className={`w-24 ${R.listTitle}`}>{exec.name}</span>
                  <span className="grid flex-1 grid-cols-3 gap-2">
                    {exec.pictures.map((p) => (
                      <span key={p.id} className={`${R.tile} flex items-baseline justify-between`}>
                        <span className={R.tileLabel}>#{p.number}</span>
                        <span className="text-xl font-semibold text-brand-lea dark:text-slate-100">{p.count}</span>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={R.box}>
            <p className={R.sectionLabel}>Leaderboard</p>
            {stats.guests.length === 0 ? (
              <p className={R.note}>No discoveries yet.</p>
            ) : (
              <div className={R.tableWrap}>
                <table className={R.table}>
                  <thead className={R.thead}>
                    <tr>
                      <th className={R.th}>#</th>
                      <th className={R.th}>Guest</th>
                      <th className={`${R.th} text-right`}>Found</th>
                      <th className={`${R.th} hidden sm:table-cell`}>Last discovery</th>
                      <th className={`${R.th} text-right`}>Done</th>
                    </tr>
                  </thead>
                  <tbody className={R.tbody}>
                    {stats.guests.map((g, i) => (
                      <tr key={g.id} className={R.tr}>
                        <td className={R.td}>{i + 1}</td>
                        <td className={`${R.td} font-semibold text-brand-lea dark:text-slate-100`}>{guestLabel(g.name, g.shortId)}</td>
                        <td className={R.num}>{g.found}</td>
                        <td className={`${R.td} hidden sm:table-cell ${R.muted}`}>{when(g.lastAt)}</td>
                        <td className={R.num}>{Math.round((g.found / stats.total) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={R.box}>
            <p className={R.sectionLabel}>Recent discoveries</p>
            <ActivityList rows={stats.activity.slice(0, 15)} guestLabel={guestLabel} />
          </div>
        </section>
      ) : null}

      {tab === "guests" ? (
        <section className={R.panel}>
          <p className={R.eyebrow}>Every guest</p>
          <h2 className={R.title}>Exactly which pictures each guest has found</h2>
          <p className={R.lede}>
            Guests are told apart by their phone, not their name. When two share a name, the #code beside it tells
            them apart.
          </p>
          {stats.guests.length === 0 ? <p className={R.note}>No guests yet.</p> : null}
          <ul className="mt-3 divide-y divide-brand-lea/10 dark:divide-white/10">
            {stats.guests.map((g) => {
              const have = new Set(g.pictureSlugs);
              return (
                <li key={g.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className={R.listTitle}>{guestLabel(g.name, g.shortId)}</p>
                    <p className={R.tileSub}>
                      {g.found}/{stats.total} · last {when(g.lastAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {stats.executives.map((exec) => (
                      <span key={exec.id} className="flex items-center gap-1">
                        <span className={`w-14 text-right ${R.tileLabel}`}>{exec.name}</span>
                        {exec.pictures.map((p) => (
                          <span
                            key={p.id}
                            title={`${exec.name} ${p.number}`}
                            className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold ${
                              have.has(p.slug)
                                ? "bg-brand-lea text-brand-gold"
                                : "border border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-500"
                            }`}
                          >
                            {p.number}
                          </span>
                        ))}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className={R.panel}>
          <div className={R.header}>
            <div>
              <p className={R.eyebrow}>Submissions</p>
              <h2 className={R.title}>Every claim, newest first</h2>
              <p className={R.lede}>Remove a claim that should not count. The guest can then claim that picture again.</p>
            </div>
            <a className={R.smallButton} href={`${EXPORT}?kind=discoveries-csv`}>
              Download CSV
            </a>
          </div>
          <ActivityList rows={stats.activity} guestLabel={guestLabel} removable onChanged={() => router.refresh()} />
          {stats.activity.length >= 300 ? <p className={R.footnote}>Showing the latest 300; the CSV has all of them.</p> : null}
        </section>
      ) : null}

      {tab === "codes" ? <CodesTab executives={stats.executives} origin={origin} onChanged={() => router.refresh()} /> : null}

      {tab === "settings" ? <SettingsTab config={config} onChanged={() => router.refresh()} /> : null}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className={R.tile}>
      <p className={R.tileLabel}>{label}</p>
      <p className={R.tileValue}>{value}</p>
      {sub ? <p className={R.tileSub}>{sub}</p> : null}
    </div>
  );
}

function ActivityList({
  rows,
  guestLabel,
  removable = false,
  onChanged
}: {
  rows: Activity[];
  guestLabel: (name: string, shortId: string) => React.ReactNode;
  removable?: boolean;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(row: Activity) {
    if (!window.confirm(`Remove ${row.guestName}'s claim of ${row.pictureLabel}? It will no longer count.`)) return;
    setBusy(row.id);
    setError(null);
    const response = await fetch(`/api/events/exec-hunt/discoveries/${row.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!response?.ok) setError("Couldn't remove that claim. Try again.");
    onChanged?.();
  }

  if (rows.length === 0) return <p className={R.note}>No discoveries yet.</p>;
  return (
    <>
      {error ? <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-400">{error}</p> : null}
      <ul className="mt-2 divide-y divide-brand-lea/10 text-sm dark:divide-white/10">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-semibold text-brand-lea dark:text-slate-100">{guestLabel(row.guestName, row.guestShortId)}</span>{" "}
              <span className={R.muted}>found</span> <span className="font-semibold text-brand-eden dark:text-slate-300">{row.pictureLabel}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className={`text-xs ${R.muted}`}>{when(row.createdAt)}</span>
              {removable ? (
                <button type="button" className={R.smallButton} disabled={busy === row.id} onClick={() => void remove(row)}>
                  {busy === row.id ? "Removing..." : "Remove"}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function QrPreview({ url, label }: { url: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 2, width: 280, color: { dark: "#0d2c43", light: "#ffffff" } })
      .then((data) => live && setSrc(data))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div className="flex h-32 w-32 items-center justify-center rounded bg-white p-1 ring-1 ring-brand-lea/10">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn in the browser
        <img src={src} alt={`QR code for ${label}`} className="h-full w-full" />
      ) : (
        <span className="text-[11px] text-brand-grey">Drawing...</span>
      )}
    </div>
  );
}

/** Resize in the browser to a ~1000px JPEG: small for hangar Wi-Fi, and a format
 *  the cards PDF can embed. Also turns an iPhone HEIC (which Safari can decode)
 *  into a JPEG. */
async function resizeToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("unreadable"));
      img.src = url;
    });
    const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/jpeg", 0.86)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PhotoControl({ exec, onChanged }: { exec: Executive; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await resizeToJpeg(file);
      const form = new FormData();
      form.append("photo", new File([blob], `${exec.slug}.jpg`, { type: "image/jpeg" }));
      const response = await fetch(`/api/events/exec-hunt/executives/${exec.slug}/photo`, { method: "POST", body: form });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(data?.message ?? "Upload failed.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error && e.message !== "unreadable" ? e.message : "That file couldn't be read as a photo.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!window.confirm(`Remove ${exec.name}'s photo? The QR codes are not affected.`)) return;
    setBusy(true);
    await fetch(`/api/events/exec-hunt/executives/${exec.slug}/photo`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    onChanged();
  }

  return (
    <div className="flex items-center gap-3">
      {exec.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own cache-busted photo route
        <img src={exec.photoUrl} alt={exec.name} className="h-16 w-16 rounded object-cover ring-2 ring-brand-gold" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded bg-brand-lea text-2xl font-bold text-brand-gold">
          {exec.name.charAt(0)}
        </div>
      )}
      <div className="space-y-1">
        <label className={`${R.smallButton} cursor-pointer`}>
          {busy ? "Working..." : exec.photoUrl ? "Replace photo" : "Upload photo"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {exec.photoUrl ? (
          <button type="button" className={`block ${R.footnote} underline-offset-2 hover:underline`} onClick={() => void removePhoto()} disabled={busy}>
            Remove photo
          </button>
        ) : (
          <p className={R.footnote}>Placeholder until a photo is uploaded.</p>
        )}
        {error ? <p className="text-xs font-semibold text-red-700 dark:text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}

function CodesTab({ executives, origin, onChanged }: { executives: Executive[]; origin: string; onChanged: () => void }) {
  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div>
          <p className={R.eyebrow}>Print in advance</p>
          <h2 className={R.title}>QR codes &amp; executive photos</h2>
          <p className={R.lede}>
            Each code is permanent: it belongs to one hidden picture and never changes, even if you replace a photo or
            reset the game. Codes point at <span className={R.term}>{origin}</span>, never at a laptop.
          </p>
        </div>
        <div className={R.controls}>
          <a className={R.pageButton} href={`${EXPORT}?kind=qr-zip`}>
            All 15 PNGs (ZIP)
          </a>
          <a className={R.pageButton} href={`${EXPORT}?kind=sheet`}>
            One-page PDF
          </a>
          <a className={R.pageButton} href={`${EXPORT}?kind=cards`}>
            Printable cards PDF
          </a>
        </div>
      </div>
      <p className={R.note}>
        The cards PDF has two cards per letter page (cut on the dashed line): the photo, the QR code, the picture&apos;s
        label and &ldquo;Scan to claim your discovery!&rdquo;. Upload photos first if you want them on the cards.
      </p>

      <div className="mt-4 space-y-4">
        {executives.map((exec) => (
          <div key={exec.id} className={R.box}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className={R.title}>{exec.name}</h3>
              <PhotoControl exec={exec} onChanged={onChanged} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {exec.pictures.map((p) => (
                <div key={p.id} className={`${R.tile} flex gap-3`}>
                  <QrPreview url={p.url} label={`${exec.name} ${p.number}`} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className={R.tileLabel}>Picture {p.number} of {EXEC_HUNT_PICTURES_PER_EXEC}</p>
                    <p className={R.tileValue}>
                      {exec.name} {p.number}
                    </p>
                    <p className={`break-all ${R.tileSub}`}>{p.url}</p>
                    <p className={R.tileSub}>Claimed {p.count}x</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <a className={R.smallButton} href={`${EXPORT}?kind=qr&slug=${p.slug}`}>
                        PNG
                      </a>
                      <Link className={R.smallButton} href={p.url.replace(origin, "")} target="_blank">
                        Open page
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className={R.footnote}>
        &ldquo;Open page&rdquo; opens the scan page on this server. While the game is on, opening it records a claim
        for you like any guest; reset before the party.
      </p>
    </section>
  );
}

function SettingsTab({ config, onChanged }: { config: Config; onChanged: () => void }) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [opensAt, setOpensAt] = useState(toLocalInput(config.opensAt));
  const [closesAt, setClosesAt] = useState(toLocalInput(config.closesAt));
  const [showLeaderboard, setShowLeaderboard] = useState(config.showLeaderboard);
  const [showNames, setShowNames] = useState(config.showNames);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetting, setResetting] = useState(false);

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/events/exec-hunt/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        showLeaderboard,
        showNames,
        opensAt: opensAt ? new Date(opensAt).toISOString() : null,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null
      })
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { message?: string } | null;
    setSaving(false);
    if (!response?.ok) {
      setMessage({ ok: false, text: data?.message ?? "Couldn't save." });
      return;
    }
    setMessage({ ok: true, text: "Saved." });
    onChanged();
  }

  async function reset() {
    setResetting(true);
    const response = await fetch("/api/events/exec-hunt/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: resetText })
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { guests?: number; discoveries?: number; message?: string } | null;
    setResetting(false);
    if (!response?.ok) {
      setMessage({ ok: false, text: data?.message ?? "Reset failed." });
    } else {
      setMessage({ ok: true, text: `Reset: removed ${data?.discoveries ?? 0} discoveries and ${data?.guests ?? 0} guests. QR codes and photos are untouched.` });
    }
    setResetOpen(false);
    setResetText("");
    onChanged();
  }

  const check = "h-4 w-4 accent-[#0d2c43]";
  return (
    <section className={R.panel}>
      <p className={R.eyebrow}>Admin controls</p>
      <h2 className={R.title}>Game settings</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={`${R.box} mt-0 space-y-3`}>
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
            <input type="checkbox" className={check} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Game is on (guests can claim discoveries)
          </label>
          <label className="block space-y-1">
            <span className={R.sectionLabel}>Opens (optional)</span>
            <input type="datetime-local" className={R.input} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className={R.sectionLabel}>Closes (optional)</span>
            <input type="datetime-local" className={R.input} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </label>
          <p className={R.footnote}>Times are in this computer&apos;s time zone. Leave blank for no limit.</p>
        </div>
        <div className={`${R.box} mt-0 space-y-3`}>
          <p className={R.sectionLabel}>Live display</p>
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
            <input type="checkbox" className={check} checked={showLeaderboard} onChange={(e) => setShowLeaderboard(e.target.checked)} />
            Show a top-10 leaderboard
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
            <input type="checkbox" className={check} checked={showNames} onChange={(e) => setShowNames(e.target.checked)} disabled={!showLeaderboard} />
            Show guest names on it (off = &ldquo;Hunter #1&rdquo;)
          </label>
          <p className={R.footnote}>
            The live display is at{" "}
            <a className={R.link} href={`${EXEC_HUNT_PUBLIC_BASE}/live`} target="_blank" rel="noreferrer">
              {EXEC_HUNT_PUBLIC_BASE}/live
            </a>{" "}
            and needs no login, so the venue screen can open it.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
        {message ? (
          <span className={`text-sm font-semibold ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
            {message.text}
          </span>
        ) : null}
      </div>

      <div className="mt-6 rounded border border-red-200 p-4 dark:border-red-500/30">
        <p className={R.listTitle}>Reset test data</p>
        <p className={R.lede}>
          Deletes every guest and every discovery. Keeps the executives, photos, settings and all 15 QR codes, so
          anything already printed keeps working. Do this before the party.
        </p>
        <Button variant="danger" className="mt-3" onClick={() => setResetOpen(true)}>
          Reset submissions...
        </Button>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} busy={resetting} title="Reset the scavenger hunt">
        <div className="space-y-3">
          <h3 className={R.title}>Reset the scavenger hunt?</h3>
          <p className="text-sm text-brand-grey dark:text-slate-400">
            Every guest and discovery will be permanently deleted. QR codes, photos and settings stay. Type{" "}
            <strong>RESET</strong> to confirm.
          </p>
          <input className={R.input} value={resetText} onChange={(e) => setResetText(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={resetText !== "RESET" || resetting} onClick={() => void reset()}>
              {resetting ? "Resetting..." : "Delete all submissions"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
