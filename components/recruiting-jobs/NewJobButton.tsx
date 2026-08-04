"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type ExistingJob = { id: string; title: string; status: string; department: string | null };

/**
 * Create a role by hand.
 *
 * Jobs used to arrive only by import, so a requisition that existed in real life
 * but had never been imported could not be hired against at all — an offer lives
 * on an application, and an application needs a job.
 */
export function NewJobButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server finds a job with this title already — we show it and let
  // the person choose, rather than silently making a duplicate.
  const [clash, setClash] = useState<ExistingJob | null>(null);

  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [jobReqId, setJobReqId] = useState("");
  const [paycomReqId, setPaycomReqId] = useState("");

  function reset() {
    setTitle("");
    setDepartment("");
    setCity("");
    setState("");
    setStatus("OPEN");
    setJobReqId("");
    setPaycomReqId("");
    setError(null);
    setClash(null);
  }

  async function create(force = false) {
    if (!title.trim()) {
      setError("Give the job a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiting-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, department, city, state, status, jobReqId, paycomReqId, force })
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        job?: { id: string };
        message?: string;
        existing?: ExistingJob;
      };
      if (res.status === 409 && data.existing) {
        setClash(data.existing);
        setError(data.message ?? null);
        return;
      }
      if (!res.ok || !data.job) throw new Error(data.message ?? "Unable to create the job.");
      setOpen(false);
      reset();
      // Land on the new job so the next step — adding the candidate — is right there.
      router.push(`/recruiting-jobs?id=${data.job.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create the job.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden"
      >
        <Plus className="h-3.5 w-3.5" />
        New job
      </button>
    );
  }

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder?: string) => (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-brand-lea/20 px-2 py-1 text-xs outline-none focus:border-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
      />
    </label>
  );

  return (
    <div className="mt-3 rounded border border-brand-lea/15 bg-white p-3 dark:border-white/10 dark:bg-brand-panel">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">New job</p>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {field("Title", title, setTitle, "e.g. Aircraft Maintenance Technician")}
        {field("Department", department, setDepartment, "e.g. Maintenance")}
        {field("City", city, setCity, "e.g. Salt Lake City")}
        {field("State", state, setState, "e.g. UT")}
        {field("Requisition ID", jobReqId, setJobReqId, "optional — our own code")}
        {/* Paycom numbers its requisitions differently (3296), and its emails quote
            THAT number — a Jazz code will never match one. Kept separate for
            exactly that reason, so the inbound automation has a real key. */}
        {field("Paycom requisition", paycomReqId, setPaycomReqId, "optional — e.g. 3296")}
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-0.5 w-full rounded border border-brand-lea/20 px-2 py-1 text-xs outline-none focus:border-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
          >
            <option value="OPEN">Open</option>
            <option value="FILLED">Filled</option>
            <option value="RETIRED">Retired</option>
          </select>
        </label>
      </div>

      <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
        Pilot vs support, the seat, and the aircraft are worked out from the title — the same way imported roles are.
      </p>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}

      {clash && (
        <div className="mt-2 rounded bg-amber-50 p-2 dark:bg-amber-500/10">
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            Use the existing one unless this is genuinely a separate role — duplicate jobs are how an offer ends up on a
            requisition that was filled last year.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {/*
              A real Link, not router.push. This navigates to a job that already
              exists and mutates nothing, and it is exactly the case where you
              want a new tab — to read the clashing requisition side by side with
              the one you are about to create.
            */}
            <Link
              href={`/recruiting-jobs?id=${clash.id}`}
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="rounded bg-brand-gold px-2.5 py-1 text-[11px] font-semibold text-brand-black transition hover:bg-brand-gold/90 dark:text-slate-100"
            >
              Use “{clash.title}”
            </Link>
            <button
              onClick={() => void create(true)}
              disabled={busy}
              className="rounded px-2 py-1 text-[11px] font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:text-slate-400"
            >
              Create anyway
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void create(false)}
          disabled={busy}
          className="rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create job"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          disabled={busy}
          className="rounded px-2 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:text-slate-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
