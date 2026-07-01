import { clsx } from "clsx";
import { Plane } from "lucide-react";
import { FLEET_POSITIONS, fleetAircraft, type FleetStatus } from "@/lib/fleet/positions";

function statusPill(status: FleetStatus) {
  return status === "Active"
    ? "bg-value-teamwork-light text-value-teamwork-dark"
    : "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400";
}

function seatPill(seat: string) {
  return seat === "PIC" ? "bg-value-teamwork-light text-value-teamwork-dark" : "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400";
}

export function FleetPositionsView() {
  const aircraftOrder = fleetAircraft();
  const activeCount = FLEET_POSITIONS.filter((p) => p.status === "Active").length;
  const archivedCount = FLEET_POSITIONS.length - activeCount;

  return (
    <div className="px-5 py-5 lg:px-8">
      <section className="mb-4 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin · Settings</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">
          <Plane className="h-6 w-6 text-brand-gold" /> Fleet positions
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
          The master list of every pilot position SkyShare hires for — the single source of truth the app reads from.
          Edit <span className="font-semibold text-brand-lea dark:text-slate-100">FLEET_POSITIONS.md</span> and run{" "}
          <span className="font-mono text-xs text-brand-eden">npm run fleet:sync</span> to update it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-value-teamwork-light px-2.5 py-1 font-semibold text-value-teamwork-dark">
            {activeCount} active
          </span>
          <span className="rounded bg-brand-cloudDancer px-2.5 py-1 font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
            {archivedCount} archived
          </span>
          <span className="rounded bg-brand-cloudDancer/60 px-2.5 py-1 font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
            {aircraftOrder.length} aircraft
          </span>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {aircraftOrder.map((aircraft) => {
          const positions = FLEET_POSITIONS.filter((p) => p.aircraft === aircraft);
          const allArchived = positions.every((p) => p.status === "Archived");
          const typeRating = positions[0]?.typeRating;
          return (
            <section
              key={aircraft}
              className={clsx(
                "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10",
                allArchived && "opacity-75"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">{aircraft}</h2>
                  {typeRating ? (
                    <span className="rounded bg-value-leadership-light px-2 py-0.5 text-[10px] font-semibold text-value-leadership-dark">
                      {typeRating} rating
                    </span>
                  ) : (
                    <span className="rounded bg-brand-cloudDancer px-2 py-0.5 text-[10px] font-medium text-brand-grey dark:bg-white/5 dark:text-slate-400">
                      No type rating
                    </span>
                  )}
                </div>
                {allArchived ? (
                  <span className="rounded bg-brand-cloudDancer px-2 py-0.5 text-[10px] font-bold uppercase text-brand-grey dark:bg-white/5 dark:text-slate-400">
                    Archived
                  </span>
                ) : null}
              </div>
              <div className="mt-2 space-y-1.5">
                {positions.map((position) => (
                  <div
                    key={position.slug}
                    className="flex items-center justify-between gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/30 px-3 py-2 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate text-sm font-medium text-brand-lea dark:text-slate-100">{position.title}</span>
                        <span className={clsx("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", seatPill(position.seat))}>
                          {position.seat}
                        </span>
                      </div>
                      {position.notes ? <div className="mt-0.5 truncate text-[11px] text-brand-grey dark:text-slate-400">{position.notes}</div> : null}
                    </div>
                    <span className={clsx("shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold", statusPill(position.status))}>
                      {position.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
