"use client";

import { useEffect, useState } from "react";
import { EXEC_HUNT_TITLE, type ExecHuntLiveData } from "@/lib/exec-hunt/constants";
import { ExecPhoto } from "@/components/exec-hunt/FestiveShell";

// The projector / big-TV page. Polls every 5 seconds; a failed poll keeps the
// last good numbers on screen rather than blanking the room's display.

const POLL_MS = 5000;

export function LiveDisplay({ initial, logoDataUrl }: { initial: ExecHuntLiveData; logoDataUrl: string | null }) {
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const response = await fetch("/api/christmas/exec-hunt/live", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as ExecHuntLiveData;
        if (live) {
          setData(next);
          setStale(false);
        }
      } catch {
        if (live) setStale(true);
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const tiles = [
    { label: "Hunters", value: data.participants },
    { label: "Discoveries", value: data.discoveries },
    { label: "Found all 15", value: data.completed },
    { label: "Spots found", value: `${data.locationsFound}/${data.total}` }
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0b3d2e] via-[#0d2c43] to-[#0b3d2e] text-white">
      <div
        aria-hidden
        className="h-3 w-full"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, #c8102e 0 20px, #ffffff 20px 40px)" }}
      />
      <div className="mx-auto max-w-[1800px] px-10 py-8">
        <header className="flex items-center justify-between gap-6">
          <div>
            {logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- workspace logo is a data: URL
              <img src={logoDataUrl} alt="SkyShare" className="mb-2 h-10 w-auto brightness-0 invert" />
            ) : (
              <p className="text-lg font-bold uppercase tracking-[0.3em] text-brand-gold">SkyShare</p>
            )}
            <h1 className="text-6xl font-extrabold tracking-tight">🎄 {EXEC_HUNT_TITLE}</h1>
            <p className="mt-2 text-2xl font-semibold text-brand-gold">{data.statusLine}</p>
          </div>
          <p className="text-right text-lg text-white/70">
            Scan a QR code next to any
            <br />
            executive picture to play!
          </p>
        </header>

        <section className="mt-8 grid grid-cols-4 gap-6">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded bg-white/10 p-6 text-center ring-1 ring-brand-gold/40">
              <p className="text-7xl font-extrabold tabular-nums text-brand-gold">{tile.value}</p>
              <p className="mt-2 text-xl font-bold uppercase tracking-[0.2em] text-white/80">{tile.label}</p>
            </div>
          ))}
        </section>

        <div className={`mt-8 grid gap-8 ${data.leaderboard ? "grid-cols-[1.4fr_1fr]" : "grid-cols-1"}`}>
          <section className="rounded bg-white/10 p-6 ring-1 ring-white/15">
            <h2 className="text-3xl font-extrabold">Progress by executive</h2>
            <ul className="mt-5 space-y-5">
              {data.executives.map((exec) => {
                const found = exec.pictures.filter((p) => p.count > 0).length;
                return (
                  <li key={exec.slug} className="flex items-center gap-5">
                    <ExecPhoto name={exec.name} photoUrl={exec.photoUrl} className="h-20 w-20" showName={false} />
                    <span className="w-44 text-3xl font-bold">{exec.name}</span>
                    <span className="flex flex-1 gap-3">
                      {exec.pictures.map((p) => (
                        <span
                          key={p.number}
                          className={`flex h-20 flex-1 flex-col items-center justify-center rounded text-2xl font-extrabold ${
                            p.count > 0 ? "bg-[#c8102e] text-white" : "border-2 border-dashed border-white/30 text-white/50"
                          }`}
                        >
                          <span>#{p.number}</span>
                          <span className="text-base font-semibold">
                            {p.count > 0 ? `found ${p.count}x` : "still hiding"}
                          </span>
                        </span>
                      ))}
                    </span>
                    <span className="w-20 text-right text-2xl font-bold text-brand-gold">{found}/3</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {data.leaderboard ? (
            <section className="rounded bg-white/10 p-6 ring-1 ring-white/15">
              <h2 className="text-3xl font-extrabold">🏆 Top hunters</h2>
              {data.leaderboard.length === 0 ? (
                <p className="mt-6 text-2xl text-white/70">No discoveries yet. Be the first!</p>
              ) : (
                <ol className="mt-5 space-y-3">
                  {data.leaderboard.map((row) => (
                    <li
                      key={row.rank}
                      className={`flex items-center gap-4 rounded px-4 py-3 text-2xl ${
                        row.rank === 1 ? "bg-brand-gold font-extrabold text-brand-lea" : "bg-white/5 font-semibold"
                      }`}
                    >
                      <span className="w-10 tabular-nums">{row.rank}</span>
                      <span className="flex-1 truncate">{row.name ?? `Hunter #${row.rank}`}</span>
                      <span className="tabular-nums">{row.found}/15</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}
        </div>
        <p className="mt-6 text-right text-sm text-white/50">
          {stale ? "Reconnecting... showing the last update. " : "Updates every few seconds. "}
          Last update {new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
