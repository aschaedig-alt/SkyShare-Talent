import { EXEC_HUNT_TITLE } from "@/lib/exec-hunt/constants";

// The guest-facing frame for "Where's the Executive?": Christmas green with red
// and gold, deliberately not the HR app's look. The same deep-green ground in
// light and dark mode; the cards carry their own dark pair.

export const FESTIVE = {
  card: "rounded bg-white p-5 text-slate-800 shadow-xl ring-1 ring-black/5 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10",
  bigButton:
    "flex w-full items-center justify-center rounded bg-[#c8102e] px-5 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-[#a50d26] hover:shadow-glow disabled:opacity-60",
  ghostButton:
    "rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:shadow-glow dark:border-white/20 dark:text-slate-200",
  input:
    "w-full rounded border-2 border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-brand-gold dark:border-white/20 dark:bg-slate-800 dark:text-slate-100",
  label: "text-sm font-semibold text-slate-700 dark:text-slate-300"
} as const;

export function FestiveShell({
  logoDataUrl,
  children,
  wide = false
}: {
  logoDataUrl?: string | null;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-[#0b3d2e] via-[#0f5132] to-[#0b3d2e] text-white">
      {/* Candy-cane stripe across the top */}
      <div
        aria-hidden
        className="h-2 w-full"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, #c8102e 0 14px, #ffffff 14px 28px)" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 select-none text-center text-2xl opacity-25">
        ❄ ✦ ❄ ✦ ❄ ✦ ❄ ✦ ❄
      </div>
      <main className={`relative mx-auto w-full px-4 pb-16 pt-8 ${wide ? "max-w-6xl" : "max-w-md"}`}>
        <header className="text-center">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- workspace logo is a data: URL
            <img src={logoDataUrl} alt="SkyShare" className="mx-auto mb-3 h-8 w-auto brightness-0 invert" />
          ) : (
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-gold">SkyShare</p>
          )}
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span aria-hidden>🎄 </span>
            {EXEC_HUNT_TITLE}
          </h1>
          <p className="mt-1 text-sm font-medium text-brand-gold">Christmas Party Scavenger Hunt</p>
        </header>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

/** One executive's photo, or a festive placeholder until it is uploaded. */
export function ExecPhoto({
  name,
  photoUrl,
  className = "h-28 w-28",
  showName = true
}: {
  name: string;
  photoUrl: string | null;
  className?: string;
  /** Off for small tiles, where the name is printed beneath anyway. */
  showName?: boolean;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- our own photo route, already cache-busted
      <img src={photoUrl} alt={name} className={`${className} rounded object-cover ring-4 ring-brand-gold`} />
    );
  }
  return (
    <div
      className={`${className} flex flex-col items-center justify-center rounded bg-[#c8102e] text-white ring-4 ring-brand-gold`}
      aria-label={`${name} (photo coming soon)`}
    >
      <span className="text-4xl font-extrabold">{name.charAt(0)}</span>
      {showName ? <span className="max-w-full truncate px-1 text-[10px] font-bold uppercase tracking-widest">{name}</span> : null}
    </div>
  );
}
