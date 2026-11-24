import { EXEC_HUNT_PICTURES_PER_EXEC, type ExecHuntProgress } from "@/lib/exec-hunt/constants";

export function encouragement(found: number, total: number) {
  if (found >= total) return "🏆 You found EVERY executive! Legendary. Show this screen to claim your bragging rights!";
  const left = total - found;
  if (found === 0) return "Start searching! The executives are hiding all over the hangar.";
  if (left === 1) return "Just ONE left! Check behind the aircraft... 👀";
  if (left <= 3) return `Only ${left} to go. You're so close!`;
  if (found >= total / 2) return `Over halfway there! ${left} executives are still hiding.`;
  return `Great start! ${left} more are hiding around the hangar. Keep looking! 🎅`;
}

export function GuestProgress({ progress, highlight }: { progress: ExecHuntProgress; highlight?: string | null }) {
  const pct = Math.round((progress.found / progress.total) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Your progress</p>
        <p className="text-2xl font-extrabold text-[#0f5132] dark:text-emerald-300">
          {progress.found} <span className="text-base font-bold text-slate-500">/ {progress.total}</span>
        </p>
      </div>
      <div className="mt-2 h-4 w-full overflow-hidden rounded bg-slate-200 dark:bg-white/10">
        <div
          className="h-full rounded"
          style={{
            width: `${pct}%`,
            backgroundImage: "repeating-linear-gradient(135deg, #c8102e 0 10px, #e23a52 10px 20px)"
          }}
        />
      </div>
      <ul className="mt-4 space-y-2">
        {progress.executives.map((exec) => (
          <li key={exec.slug} className="flex items-center justify-between gap-3">
            <span className="font-semibold">{exec.name}</span>
            <span className="flex gap-1.5">
              {Array.from({ length: EXEC_HUNT_PICTURES_PER_EXEC }, (_, i) => {
                const n = i + 1;
                const got = exec.found.includes(n);
                const isNew = highlight === `${exec.slug}-${n}`;
                return (
                  <span
                    key={n}
                    className={`flex h-9 w-9 items-center justify-center rounded text-sm font-bold ${
                      got
                        ? `bg-[#0f5132] text-white ${isNew ? "ring-4 ring-brand-gold" : ""}`
                        : "border-2 border-dashed border-slate-300 text-slate-400 dark:border-white/20"
                    }`}
                    aria-label={`${exec.name} ${n}: ${got ? "found" : "not found yet"}`}
                  >
                    {got ? "★" : n}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
        {encouragement(progress.found, progress.total)}
      </p>
    </div>
  );
}
