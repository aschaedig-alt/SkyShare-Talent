"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, CheckCircle2, Link2 } from "lucide-react";
import type { CandidateProfileData } from "@/lib/data/candidates";

type Props = {
  candidate: CandidateProfileData;
  canEdit: boolean;
};

// Explicit locale + UTC so the server and client render the same string.
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Moves a candidate into pre-onboarding by creating a linked NewHire
 * (candidateId set), prefilled from their record — so their resume, interviews,
 * and history stay connected instead of being re-typed.
 *
 * Three states:
 *  - already linked  → link to the record
 *  - name matches an existing, unlinked hire → offer to LINK (not duplicate)
 *  - otherwise → create, suggested when the candidate is hired
 */
export function MoveToPreOnboardingPanel({ candidate, canEdit }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"create" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { preOnboarding: pre } = candidate;

  // The move form. Everything the hire needs is gathered HERE, at the one moment
  // someone is actually thinking about this person — rather than assumed and left
  // null. A hire with no start date is filtered out of nearly every panel on the
  // New hires dashboard, so "assume it" meant "lose them".
  const [form, setForm] = useState(false);
  const [position, setPosition] = useState(pre.suggestedPosition ?? "");
  const [department, setDepartment] = useState(pre.suggestedDepartment ?? "");
  const [startDate, setStartDate] = useState(pre.suggestedStartDate?.slice(0, 10) ?? "");
  const [ssEmail, setSsEmail] = useState(pre.suggestedEmail ?? "");
  // Only warn while they still hold the colliding address — editing clears it.
  const emailClash = pre.emailTakenBy && ssEmail.trim().toLowerCase() === (pre.suggestedEmail ?? "").toLowerCase();

  const prefill = [pre.suggestedPosition, pre.suggestedDepartment].filter(Boolean).join(" · ");
  const missing = [!position.trim() && "position", !department.trim() && "department", !startDate && "start date"]
    .filter(Boolean)
    .join(", ");

  const createHire = async () => {
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/new-hires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidate.displayName,
          position: position.trim() || null,
          department: department.trim() || null,
          phone: candidate.primaryPhone,
          personalEmail: candidate.primaryEmail,
          // The company address follows a fixed convention and feeds the business
          // cards, so it is filled in by default rather than typed.
          ssEmail: ssEmail.trim() || null,
          // Carried from the signed offer when it named one, so the start date
          // is not re-typed (and cannot drift from what was offered).
          startDate: startDate || null,
          candidateId: candidate.id
        })
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok || !data.id) throw new Error(data.message || "Unable to create the pre-onboarding record.");
      router.push(`/people/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the pre-onboarding record.");
      setBusy(null);
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, type = "text", placeholder?: string) => (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-brand-lea/20 px-2 py-1 text-xs outline-none focus:border-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
      />
    </label>
  );

  const moveForm = (
    <div className="mt-3 rounded border border-brand-lea/15 bg-white p-3 dark:border-white/10 dark:bg-brand-panel">
      <div className="grid gap-2 sm:grid-cols-2">
        {field("Position", position, setPosition, "text", "e.g. Gulfstream G200 First Officer")}
        {field("Department", department, setDepartment, "text", "e.g. Pilot")}
        {field("Start date", startDate, setStartDate, "date")}
        {field("Company email", ssEmail, setSsEmail, "text")}
      </div>

      {emailClash && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {pre.emailTakenBy} already has {pre.suggestedEmail} — give this person a different address.
        </p>
      )}
      {!startDate && (
        <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
          Without a start date they will not show on the New hires dashboard — no “starting soon”, no reminders.
        </p>
      )}
      {missing && (
        <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">Still blank: {missing}. You can fill it in later.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void createHire()}
          disabled={busy !== null}
          className="rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50 dark:text-slate-100"
        >
          {busy === "create" ? "Moving…" : "Move to onboarding"}
        </button>
        <button
          onClick={() => setForm(false)}
          disabled={busy !== null}
          className="rounded px-2 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:text-slate-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const linkHire = async (hireId: string) => {
    setBusy("link");
    setError(null);
    try {
      const res = await fetch(`/api/new-hires/${hireId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Unable to link the records.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to link the records.");
      setBusy(null);
    }
  };

  // 1) Already linked.
  if (pre.hireId) {
    return (
      <section className="rounded border border-emerald-500/30 bg-emerald-50/60 p-3 dark:bg-emerald-500/10">
        <div className="flex flex-wrap items-center gap-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
          <p className="text-sm text-brand-lea dark:text-slate-100">
            In {pre.hireStage === "ACTIVE" ? "pre-onboarding" : "onboarding records"} as a new hire.
          </p>
          <Link
            href={`/people/${pre.hireId}`}
            className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 dark:border-white/10 dark:text-slate-200"
          >
            View onboarding record
          </Link>
        </div>
      </section>
    );
  }

  // 2) An existing, unlinked hire already has this name — link instead of duplicating.
  if (pre.matchingHire) {
    const m = pre.matchingHire;
    const detail = [m.position, m.department].filter(Boolean).join(" · ");
    const start = fmtDate(m.startDate);
    return (
      <section className="rounded border border-brand-gold/40 bg-brand-sweet/12 p-4 shadow-panel ring-1 ring-brand-gold/20 dark:bg-brand-gold/10">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold/25 text-brand-lea dark:text-slate-100">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
              Already in {m.stage === "ACTIVE" ? "pre-onboarding" : "onboarding records"}
            </p>
            <p className="mt-1 text-sm text-brand-lea dark:text-slate-100">
              <span className="font-semibold">{m.name}</span>
              {detail ? ` — ${detail}` : ""}
              {start ? ` (starts ${start})` : ""} already exists, but isn&apos;t linked to this candidate.
            </p>
            <p className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">
              Linking connects their resume, interviews, and history — no duplicate record is created.
            </p>
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={`/people/${m.id}`}
                className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 dark:border-white/10 dark:text-slate-200"
              >
                View that record
              </Link>
              {canEdit && (
                <>
                  <button
                    onClick={() => void linkHire(m.id)}
                    disabled={busy !== null}
                    className="rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50 dark:text-slate-100"
                  >
                    {busy === "link" ? "Linking…" : "Link to that record"}
                  </button>
                  <button
                    onClick={() => setForm(true)}
                    disabled={busy !== null}
                    className="rounded px-3 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5"
                  >
                    Different person — create separate
                  </button>
                </>
              )}
            </div>

            {form && (
              <>
                <p className="mt-3 rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  Only do this if this is a DIFFERENT person who happens to share the name {m.name}.
                </p>
                {moveForm}
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  // 3) No record yet — offer to create, highlighted when they're hired.
  const hired = pre.isHired;
  return (
    <section
      className={
        hired
          ? "rounded border border-brand-gold/40 bg-brand-sweet/12 p-4 shadow-panel ring-1 ring-brand-gold/20 dark:bg-brand-gold/10"
          : "rounded border border-brand-lea/10 bg-white p-3 dark:bg-brand-panel dark:border-white/10"
      }
    >
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={
            hired
              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold/25 text-brand-lea dark:text-slate-100"
              : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
          }
        >
          <UserPlus className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          {hired ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
                {pre.offerSigned ? "Offer signed — ready to onboard" : "Hired — ready to onboard"}
              </p>
              <p className="mt-1 text-sm text-brand-lea dark:text-slate-100">
                Move {candidate.displayName} into pre-onboarding to start their onboarding checklist.
              </p>
            </>
          ) : (
            <p className="text-sm text-brand-lea dark:text-slate-100">Move this candidate into pre-onboarding.</p>
          )}
          <p className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">
            {prefill ? `Will prefill: ${prefill}` : ""}
            {pre.suggestedStartDate ? `${prefill ? ", " : "Will prefill: "}starts ${fmtDate(pre.suggestedStartDate)}` : ""}
            {prefill || pre.suggestedStartDate ? ". " : ""}
            Their candidate record, resume, and interview history stay linked.
          </p>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}

          {canEdit && !form && (
            <div className="mt-3">
              <button
                onClick={() => setForm(true)}
                disabled={busy !== null}
                className={
                  hired
                    ? "rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50 dark:text-slate-100"
                    : "rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-200"
                }
              >
                Move to onboarding
              </button>
            </div>
          )}
          {canEdit && form && moveForm}
        </div>
      </div>
    </section>
  );
}
