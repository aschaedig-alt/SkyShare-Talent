"use client";

import { useMemo, useState } from "react";
import { Copy, Download, Mail } from "lucide-react";
import { R } from "@/components/reports/report-ui";
import { CreditEmailDialog } from "@/components/party-store/CreditEmailDialog";
import {
  CREDIT_STATUS_LABEL,
  formatCents,
  partyStoreLinkPath,
  type CreditStatus,
  type StorePersonView,
  type StoreSummary
} from "@/lib/party-store/shared";
import type { StoreCall } from "@/components/party-store/PartyStoreWorkspace";

const STATUS_TONE: Record<CreditStatus, string> = {
  UNUSED: "border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-400",
  AT_PARTY: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200",
  PREORDERED: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
  SPENT: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200"
};

const FILTERS: { key: "ALL" | "LEFT" | CreditStatus; label: string }[] = [
  { key: "ALL", label: "Everyone" },
  { key: "LEFT", label: "Has credit left" },
  { key: "AT_PARTY", label: "Checked in" },
  { key: "UNUSED", label: "Not checked in" },
  { key: "PREORDERED", label: "Pre-ordered" },
  { key: "SPENT", label: "Spent in full" }
];

function StatusChip({ p }: { p: StorePersonView }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[p.status]}`}>
      {CREDIT_STATUS_LABEL[p.status]}
    </span>
  );
}

export function BalanceSheetTab({ summary, call }: { summary: StoreSummary; call: StoreCall }) {
  const storeId = summary.store.id;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return summary.people.filter((p) => {
      if (needle && !`${p.name} ${p.department ?? ""}`.toLowerCase().includes(needle)) return false;
      if (filter === "ALL") return true;
      if (filter === "LEFT") return p.balanceCents > 0;
      return p.status === filter;
    });
  }, [summary.people, query, filter]);

  async function copyLink(p: StorePersonView) {
    setMessage(null);
    let url = p.linkToken ? `${summary.origin}${partyStoreLinkPath(p.linkToken)}` : null;
    if (!url) {
      const result = await call(`/api/events/store/${storeId}/links`, { newHireId: p.newHireId });
      url = typeof result.data?.url === "string" ? result.data.url : null;
      if (!result.ok || !url) {
        setMessage(result.message ?? "Could not make the link.");
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(p.newHireId);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function makeAllLinks() {
    setBusy(true);
    setMessage(null);
    const result = await call(`/api/events/store/${storeId}/links`, { all: true });
    setBusy(false);
    const made = typeof result.data?.made === "number" ? result.data.made : 0;
    setMessage(
      result.ok
        ? `${made} new link${made === 1 ? "" : "s"} made. Download the CSV to send them (it has each person's email and link).`
        : result.message ?? "Could not make the links."
    );
  }

  const linkButton = (p: StorePersonView) =>
    p.current && p.balanceCents > 0 ? (
      <button onClick={() => copyLink(p)} className={R.smallButton} title="Copy this person's pre-order link">
        <Copy className="h-3 w-3" />
        {copied === p.newHireId ? "Copied" : p.linkToken ? "Copy link" : "Make link"}
      </button>
    ) : null;

  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div>
          <h2 className={R.title}>Balance sheet</h2>
          <p className={R.lede}>
            Every current employee&apos;s credit: what they started with, spent at the party, pre-ordered, and have left.
            No expiry on leftover credit.
          </p>
        </div>
        <div className={R.controls}>
          <a href={`/api/events/store/${storeId}/export?kind=balances`} className={R.smallButton}>
            <Download className="h-3 w-3" /> Balances CSV
          </a>
          <button onClick={makeAllLinks} disabled={busy} className={R.smallButton}>
            {busy ? "Making links…" : "Make links for everyone with credit"}
          </button>
          <button onClick={() => setEmailing(true)} className={R.smallButton}>
            <Mail className="h-3 w-3" /> Email links…
          </button>
        </div>
      </div>
      <CreditEmailDialog
        storeId={storeId}
        open={emailing}
        onClose={() => setEmailing(false)}
        onSent={() => void call(`/api/events/store/${storeId}`, undefined, "GET")}
      />

      <div className={R.hero}>
        <div className={R.heroRow}>
          <span className={R.heroFigure}>{formatCents(summary.totals.leftCents)}</span>
          <span className={R.heroText}>of {formatCents(summary.totals.issuedCents)} in credit is still unspent</span>
        </div>
        <p className={R.heroSub}>
          {formatCents(summary.totals.spentAtPartyCents)} spent at the party · {formatCents(summary.totals.preorderedCents)} pre-ordered ·{" "}
          {summary.totals.checkedIn} of {summary.totals.people} checked in
        </p>
      </div>

      {message ? <p className={R.note}>{message}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a name or department" className={R.input} />
        </div>
        <div className={`${R.segmentGroup} flex-wrap`}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`${R.segment} ${filter === f.key ? R.segmentOn : R.segmentOff}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Wide screens: a table. */}
      <div className={`${R.tableWrap} hidden md:block`}>
        <table className={R.table}>
          <thead className={R.thead}>
            <tr>
              <th className={R.th}>Employee</th>
              <th className={`${R.th} text-right`}>Starting</th>
              <th className={`${R.th} text-right`}>Spent</th>
              <th className={`${R.th} text-right`}>Pre-ordered</th>
              <th className={`${R.th} text-right`}>Ending</th>
              <th className={R.th}>Status</th>
              <th className={R.th} />
            </tr>
          </thead>
          <tbody className={R.tbody}>
            {rows.map((p) => (
              <tr key={p.newHireId} className={R.tr}>
                <td className={R.td}>
                  <span className="font-semibold text-brand-lea dark:text-slate-100">{p.name}</span>
                  {!p.current ? <span className={`${R.chip} ml-1.5`}>former</span> : null}
                  <span className="block text-[11px] text-brand-grey dark:text-slate-400">{p.department ?? "No department"}</span>
                </td>
                <td className={R.num}>{formatCents(p.startingCents)}</td>
                <td className={R.num}>{formatCents(p.saleCents)}</td>
                <td className={R.num}>{formatCents(p.preorderCents)}</td>
                <td className={`${R.num} font-semibold text-brand-lea dark:text-slate-100`}>{formatCents(p.balanceCents)}</td>
                <td className={R.td}>
                  <StatusChip p={p} />
                </td>
                <td className={`${R.td} text-right`}>{linkButton(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per person, no sideways scrolling. */}
      <ul className="mt-3 divide-y divide-brand-lea/10 md:hidden dark:divide-white/10">
        {rows.map((p) => (
          <li key={p.newHireId} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">
                  {p.name}
                  {!p.current ? <span className={`${R.chip} ml-1.5`}>former</span> : null}
                </p>
                <p className="text-[11px] text-brand-grey dark:text-slate-400">
                  Spent {formatCents(p.saleCents)} · pre-ordered {formatCents(p.preorderCents)} of {formatCents(p.startingCents)}
                </p>
              </div>
              <p className="shrink-0 text-base font-semibold text-brand-lea dark:text-slate-100">{formatCents(p.balanceCents)}</p>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <StatusChip p={p} />
              {linkButton(p)}
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? <p className={R.note}>Nobody matches.</p> : null}
      <p className={R.footnote}>
        Showing {rows.length} of {summary.people.length}. Contractors and guests have no store credit.
      </p>
    </section>
  );
}
