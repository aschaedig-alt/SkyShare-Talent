"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Plane, UserPlus, SearchCheck, Paperclip } from "lucide-react";
import {
  TRAVEL_STATUSES,
  TRAVEL_PURPOSES,
  travelPurposeLabel,
  travelStatusLabel,
  formatUsd
} from "@/lib/travel/constants";
import type { TravelHubData } from "@/lib/data/travel";

const STATUS_STYLE: Record<string, string> = {
  NEEDED: "bg-brand-gold/15 text-brand-gold border-brand-gold/30",
  BOOKED: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  CANCELED: "bg-brand-cloudDancer text-brand-grey border-brand-lea/15 dark:bg-white/5 dark:text-slate-400 dark:border-white/10"
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

const selectClass =
  "rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-sm text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100";

export function TravelHubWorkspace({ data }: { data: TravelHubData }) {
  const [status, setStatus] = useState<string>("ALL");
  const [purpose, setPurpose] = useState<string>("ALL");
  const [type, setType] = useState<string>("ALL");
  const [query, setQuery] = useState("");

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
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div className="flex items-center gap-2">
          <Plane className="h-5 w-5 text-brand-gold" />
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Travel</h1>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
          Every trip across new hires and candidates — onboarding, indoc, interviews, recruiting visits, and more. Click a row to open that
          person&apos;s record, where trips are added and edited.
        </p>
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

      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
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
                  <tr key={r.tripId} className="border-t border-brand-lea/10 transition hover:bg-brand-sweet/10 dark:border-white/10">
                    <td className="py-2 pr-3">
                      <Link href={r.travelerHref} className="inline-flex items-center gap-1.5 font-semibold text-brand-lea hover:text-brand-eden transition hover:shadow-glow dark:text-slate-100">
                        {r.travelerType === "newHire" ? <UserPlus className="h-3.5 w-3.5 text-brand-grey dark:text-slate-400" /> : <SearchCheck className="h-3.5 w-3.5 text-brand-grey dark:text-slate-400" />}
                        {r.travelerName}
                      </Link>
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
