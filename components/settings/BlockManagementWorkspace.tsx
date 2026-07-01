"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Archive, Trash2, AlertTriangle, Search } from "lucide-react";
import type { SerializedContentBlock } from "@/lib/types";

type Props = { blocks: SerializedContentBlock[] };

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function BlockManagementWorkspace({ blocks: initialBlocks }: Props) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [selectedId, setSelectedId] = useState(initialBlocks[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [migrateJobs, setMigrateJobs] = useState(false);
  const [replacementBlockId, setReplacementBlockId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter((b) => [b.name, b.description, b.category].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [blocks, query]);

  const selected = blocks.find((b) => b.id === selectedId) ?? filtered[0] ?? blocks[0] ?? null;
  const usage = selected?.usedByJobs?.length ?? selected?.usageCount ?? 0;
  const replacements = blocks.filter((b) => b.id !== selected?.id && !b.archivedAt);
  const replacementRequired = migrateJobs && !replacementBlockId;
  const deleteLocked = usage > 0 && !migrateJobs;

  function select(id: string) {
    setSelectedId(id);
    setMigrateJobs(false);
    setReplacementBlockId("");
    setMessage(null);
    setError(null);
  }

  async function retire(action: "ARCHIVE" | "DELETE") {
    if (!selected) return;
    if (migrateJobs && !replacementBlockId) {
      setError("Choose a replacement block before updating jobs.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/blocks/${selected.id}/retire`, {
        method: action === "ARCHIVE" ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ migrateJobs, replacementBlockId: replacementBlockId || null })
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(p?.message ?? `Unable to ${action === "ARCHIVE" ? "archive" : "delete"} block.`);
      }
      if (action === "DELETE") {
        const p = (await res.json()) as { deletedId: string };
        setBlocks((cur) => cur.filter((b) => b.id !== p.deletedId));
        setSelectedId((cur) => (cur === p.deletedId ? "" : cur));
        setMessage("Block deleted.");
      } else {
        const archived = (await res.json()) as SerializedContentBlock;
        setBlocks((cur) => cur.map((b) => (b.id === archived.id ? archived : b)));
        setMessage("Block archived.");
      }
      setMigrateJobs(false);
      setReplacementBlockId("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update block.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
      {/* list */}
      <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="border-b border-brand-lea/10 p-3 dark:border-white/10">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-brand-grey dark:text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search blocks..."
              className="w-full rounded border border-brand-lea/15 bg-white py-2 pl-9 pr-3 text-sm text-brand-black outline-none focus:border-brand-eden dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            />
          </div>
        </div>
        <div className="max-h-[560px] divide-y divide-brand-lea/8 overflow-y-auto dark:divide-white/10">
          {filtered.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => select(b.id)}
              className={clsx("w-full px-4 py-3 text-left transition hover:shadow-glow", selected?.id === b.id ? "bg-brand-sweet/35" : "hover:bg-brand-cloudDancer/70 dark:bg-white/5")}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-brand-lea dark:text-slate-100">{b.name}</span>
                {b.archivedAt ? (
                  <span className="rounded bg-brand-grey/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-grey dark:text-slate-400">Archived</span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-brand-grey dark:text-slate-400">
                <span className="rounded bg-brand-lea px-1.5 py-0.5 font-bold uppercase tracking-wide text-white">{formatEnum(b.category)}</span>
                <span>{b.usageCount ?? 0} jobs</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* management */}
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        {!selected ? (
          <p className="text-sm text-brand-grey dark:text-slate-400">Select a block to manage.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">{selected.name}</h2>
                <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">{selected.description}</p>
              </div>
              <span
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold",
                  usage > 0 ? "bg-brand-gold/20 text-brand-lea dark:text-slate-100" : "bg-emerald-50 text-emerald-800"
                )}
              >
                {usage > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                {usage} {usage === 1 ? "job" : "jobs"}
              </span>
            </div>

            <div className="mt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Jobs using this block</h3>
              <div className="mt-2 max-h-56 divide-y divide-brand-lea/8 overflow-auto rounded border border-brand-lea/10 dark:divide-white/10 dark:border-white/10">
                {selected.usedByJobs?.length ? (
                  selected.usedByJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{job.title}</span>
                      <span className="rounded bg-brand-cloudDancer px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-eden dark:bg-white/5">
                        {formatEnum(job.status)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-3 text-sm text-brand-grey dark:text-slate-400">No jobs use this block.</div>
                )}
              </div>
            </div>

            <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-brand-black/78 dark:text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={migrateJobs}
                onChange={(e) => setMigrateJobs(e.target.checked)}
                disabled={!usage || busy}
              />
              Update jobs using this block to a replacement block first
            </label>
            <div className="mt-2">
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Replacement block</label>
              <select
                value={replacementBlockId}
                onChange={(e) => setReplacementBlockId(e.target.value)}
                disabled={!migrateJobs || busy}
                className="w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              >
                <option value="">Choose replacement block...</option>
                {replacements.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {formatEnum(b.category)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => retire("ARCHIVE")}
                disabled={busy || Boolean(selected.archivedAt) || replacementRequired}
                className="inline-flex items-center gap-2 rounded bg-brand-lea px-3 py-2 text-sm font-bold text-white transition hover:bg-brand-eden disabled:opacity-50"
              >
                <Archive className="h-4 w-4" />
                {busy ? "Working..." : "Archive block"}
              </button>
              <button
                type="button"
                onClick={() => retire("DELETE")}
                disabled={busy || deleteLocked || replacementRequired}
                className="inline-flex items-center gap-2 rounded border border-brand-red/25 bg-white px-3 py-2 text-sm font-bold text-brand-red transition hover:bg-brand-red/8 disabled:opacity-50 dark:bg-brand-panel"
              >
                <Trash2 className="h-4 w-4" />
                Delete block
              </button>
            </div>
            {deleteLocked ? (
              <p className="mt-2 text-xs font-semibold text-brand-red">
                Delete is locked while jobs still use this block. Choose a replacement and update those jobs first, or
                archive instead.
              </p>
            ) : null}
            {error ? <p className="mt-3 text-sm font-medium text-brand-red">{error}</p> : null}
            {message ? <p className="mt-3 text-sm font-medium text-emerald-700">{message}</p> : null}
          </>
        )}
      </section>
    </div>
  );
}
