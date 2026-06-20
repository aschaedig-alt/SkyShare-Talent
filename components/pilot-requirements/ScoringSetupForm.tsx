"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Lock, ShieldCheck, RotateCcw, Plus, Trash2 } from "lucide-react";
import { saveScoringConfig } from "@/app/pilot-requirements/scoring-actions";
import type { ScoringSetupData } from "@/lib/data/scoring-setup";
import {
  CATEGORY_LABELS,
  SCORING_CATEGORIES,
  SCORING_REQUIREMENTS,
  defaultProfileConfig,
  type CategoryKey,
  type ReqStatus,
  type ScoringConfigDoc,
  type ScoringProfileConfig
} from "@/lib/matching/scoring-config";

const DEFAULT_KEY = "__default__";

// Short, plain-English meaning of each category — shown under its slider so the
// weight can be set with confidence.
const CATEGORY_HELP: Record<CategoryKey, string> = {
  aircraft: "Holds the type rating for this aircraft",
  seat: "Hours in the seat the role needs (PIC vs SIC)",
  hourMins: "Meets the role's flight-hour minimums",
  timeInType: "Hours flown in this specific aircraft",
  recency: "Hours flown in the last 12 months (currency)",
  certs: "Required certificates (Commercial/ATP, medical, instrument)"
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function ScoringSetupForm({ data }: { data: ScoringSetupData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [doc, setDoc] = useState<ScoringConfigDoc>(data.doc);
  const [selected, setSelected] = useState<string>(DEFAULT_KEY);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { canEdit } = data;

  const cfg: ScoringProfileConfig = useMemo(() => {
    if (selected === DEFAULT_KEY) return doc.default;
    return doc.profiles[selected] ?? doc.default;
  }, [doc, selected]);

  const isOverride = selected === DEFAULT_KEY || Boolean(doc.profiles[selected]);

  function update(updater: (draft: ScoringProfileConfig) => void) {
    if (!canEdit) return;
    setNotice(null);
    const base = selected === DEFAULT_KEY ? doc.default : doc.profiles[selected] ?? doc.default;
    const next = clone(base);
    updater(next);
    if (selected === DEFAULT_KEY) {
      setDoc({ ...doc, default: next });
    } else {
      setDoc({ ...doc, profiles: { ...doc.profiles, [selected]: next } });
    }
  }

  function resetProfile() {
    if (!canEdit) return;
    setNotice(null);
    if (selected === DEFAULT_KEY) {
      setDoc({ ...doc, default: defaultProfileConfig() });
    } else {
      const profiles = { ...doc.profiles };
      delete profiles[selected];
      setDoc({ ...doc, profiles });
    }
  }

  function toggleChecked(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Copy the settings currently on screen onto every checked position (staged in
  // the doc — the user still clicks "Save scoring" to persist).
  function applyToChecked() {
    if (!canEdit || checked.size === 0) return;
    const snapshot = clone(cfg);
    const profiles = { ...doc.profiles };
    for (const key of checked) {
      if (key === DEFAULT_KEY) continue;
      profiles[key] = clone(snapshot);
    }
    setDoc({ ...doc, profiles });
    const count = checked.size;
    setChecked(new Set());
    setNotice({
      kind: "ok",
      text: `Applied these settings to ${count} position${count === 1 ? "" : "s"}. Click “Save scoring” to persist.`
    });
  }

  function save() {
    setNotice(null);
    startTransition(async () => {
      const res = await saveScoringConfig(doc);
      if (res.ok) {
        setNotice({ kind: "ok", text: "Scoring saved." });
        router.refresh();
      } else {
        setNotice({ kind: "err", text: res.error ?? "Could not save." });
      }
    });
  }

  const weightSum = SCORING_CATEGORIES.reduce((sum, key) => sum + cfg.weights[key], 0) || 1;
  const requirementsByCategory = useMemo(() => {
    const map = new Map<CategoryKey, typeof SCORING_REQUIREMENTS>();
    for (const req of SCORING_REQUIREMENTS) {
      const list = map.get(req.category) ?? [];
      list.push(req);
      map.set(req.category, list);
    }
    return map;
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <aside className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
        <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">Positions</div>
        {canEdit ? (
          <p className="px-1 pb-2 text-[11px] leading-snug text-brand-grey dark:text-slate-400">
            Tick positions to copy the settings on screen to several at once.
          </p>
        ) : null}
        <div className="space-y-1">
          {data.profiles.map((profile) => (
            <div key={profile.key} className="flex items-center gap-2">
              {canEdit && profile.key !== DEFAULT_KEY ? (
                <input
                  type="checkbox"
                  checked={checked.has(profile.key)}
                  onChange={() => toggleChecked(profile.key)}
                  aria-label={`Select ${profile.label}`}
                  className="h-3.5 w-3.5 shrink-0 accent-brand-eden"
                />
              ) : null}
              <button
                type="button"
                onClick={() => setSelected(profile.key)}
                className={clsx(
                  "min-w-0 flex-1 rounded border p-2.5 text-left transition hover:shadow-glow",
                  profile.key === selected
                    ? "border-brand-gold bg-brand-sweet/18 dark:bg-brand-sweet/25"
                    : "border-brand-lea/10 bg-white hover:border-brand-sweet hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-[#10243a]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{profile.label}</span>
                  {doc.profiles[profile.key] || profile.key === DEFAULT_KEY ? (
                    <span className="shrink-0 rounded bg-value-teamwork-light px-1.5 py-0.5 text-[9px] font-bold uppercase text-value-teamwork-dark">
                      {profile.key === DEFAULT_KEY ? "base" : "custom"}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[9px] font-semibold uppercase text-brand-grey dark:text-slate-400">defaults</span>
                  )}
                </div>
                {profile.key !== DEFAULT_KEY ? (
                  <div className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">{profile.count} requirement{profile.count === 1 ? "" : "s"}</div>
                ) : null}
              </button>
            </div>
          ))}
        </div>
        {canEdit && checked.size > 0 ? (
          <div className="mt-3 space-y-2 rounded border border-brand-gold/40 bg-brand-gold/10 p-2.5">
            <div className="text-[11px] font-semibold text-brand-lea dark:text-slate-100">
              {checked.size} position{checked.size === 1 ? "" : "s"} selected
            </div>
            <button
              type="button"
              onClick={applyToChecked}
              className="w-full rounded-element bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden"
            >
              Apply these settings
            </button>
            <button
              type="button"
              onClick={() => setChecked(new Set())}
              className="w-full rounded-element border border-brand-lea/15 px-3 py-1.5 text-[11px] font-semibold text-brand-grey transition hover:bg-brand-cloudDancer dark:border-white/10 dark:text-slate-400"
            >
              Clear selection
            </button>
          </div>
        ) : null}
      </aside>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded bg-white px-4 py-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <div className="flex items-center gap-2 text-xs text-brand-grey dark:text-slate-400">
            <Lock className="h-3.5 w-3.5" />
            {canEdit ? "Recruiters & admins can edit. " : "Read-only — recruiters and admins can edit. "}
            {selected === DEFAULT_KEY
              ? "Editing defaults for all positions."
              : isOverride
                ? "Custom settings for this position."
                : "Using defaults — edits create a custom override."}
          </div>
          {canEdit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetProfile}
                className="inline-flex items-center gap-1.5 rounded-element border border-brand-lea/15 px-3 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer dark:border-white/10 dark:text-slate-400 dark:bg-white/5"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {selected === DEFAULT_KEY ? "Reset defaults" : "Use defaults"}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-element bg-brand-lea px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save scoring"}
              </button>
            </div>
          ) : null}
        </div>

        {notice ? (
          <p
            className={clsx(
              "rounded-element px-3 py-2 text-sm",
              notice.kind === "ok"
                ? "bg-value-teamwork-light text-value-teamwork-dark"
                : "bg-value-customerFocus-light text-value-customerFocus-dark"
            )}
          >
            {notice.text}
          </p>
        ) : null}

        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Category weights</h3>
          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
            How much each sub-score counts toward the overall read. The description under each name is what that score measures.
          </p>
          <div className="mt-4 space-y-3.5">
            {SCORING_CATEGORIES.map((key) => (
              <div key={key} className="grid grid-cols-[210px_1fr_84px] items-center gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-brand-lea dark:text-slate-100">{CATEGORY_LABELS[key]}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-brand-grey dark:text-slate-400">{CATEGORY_HELP[key]}</div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={cfg.weights[key]}
                  disabled={!canEdit}
                  onChange={(event) => update((draft) => (draft.weights[key as CategoryKey] = Number(event.target.value)))}
                  className="w-full accent-brand-eden disabled:opacity-50"
                />
                <span className="text-right text-xs text-brand-grey dark:text-slate-400">
                  <span className="font-semibold text-brand-lea dark:text-slate-100">{cfg.weights[key]}</span> ·{" "}
                  {Math.round((cfg.weights[key] / weightSum) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Requirements</h3>
          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
            Mark each as <span className="font-semibold text-brand-lea dark:text-slate-100">hard</span> (a minimum — missing it flags the
            candidate), <span className="font-semibold text-brand-lea dark:text-slate-100">soft</span> (a minimum that counts toward the
            qualified score), <span className="font-semibold text-brand-lea dark:text-slate-100">bonus</span> (add-only extra, never
            penalizes), or <span className="font-semibold text-brand-lea dark:text-slate-100">none</span> (ignored for this position).
            Nothing here rejects a candidate.
          </p>
          <div className="mt-4 space-y-4">
            {SCORING_CATEGORIES.filter((category) => requirementsByCategory.has(category)).map((category) => (
              <div key={category}>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
                  {CATEGORY_LABELS[category]}
                </div>
                <div className="space-y-1.5">
                  {(requirementsByCategory.get(category) ?? []).map((req) => (
                    <div
                      key={req.key}
                      className="flex items-center justify-between gap-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/30 px-3 py-2 transition hover:border-brand-gold/50 hover:bg-brand-sweet/15 hover:shadow-glow-soft dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <span className="text-sm text-brand-lea dark:text-slate-100">{req.label}</span>
                      <StatusToggle
                        value={cfg.requirements[req.key] ?? req.defaultStatus}
                        disabled={!canEdit}
                        onChange={(status) => update((draft) => (draft.requirements[req.key] = status))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Custom certs &amp; ratings</h3>
              <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                Add cert/rating rows beyond the built-in list. A row is credited if the candidate has{" "}
                <span className="font-semibold text-brand-lea dark:text-slate-100">any</span> of its terms (an either/or group) — comma-separate them.
              </p>
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={() =>
                  update((draft) => {
                    draft.customCerts = [
                      ...(draft.customCerts ?? []),
                      { id: `cc-${Date.now()}-${draft.customCerts?.length ?? 0}`, label: "", terms: [], status: "soft" }
                    ];
                  })
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded-element bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden"
              >
                <Plus className="h-3.5 w-3.5" /> Add cert
              </button>
            ) : null}
          </div>
          {cfg.customCerts && cfg.customCerts.length > 0 ? (
            <div className="mt-4 space-y-2">
              {cfg.customCerts.map((cert) => (
                <div key={cert.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={cert.label}
                      disabled={!canEdit}
                      placeholder="Cert name (e.g. G450 type rating)"
                      onChange={(e) =>
                        update((draft) => {
                          draft.customCerts = (draft.customCerts ?? []).map((c) => (c.id === cert.id ? { ...c, label: e.target.value } : c));
                        })
                      }
                      className="min-w-[160px] flex-1 rounded-element border-[0.5px] border-brand-lea/20 px-2.5 py-1.5 text-sm outline-none focus:border-brand-gold dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                    />
                    <StatusToggle
                      value={cert.status}
                      disabled={!canEdit}
                      onChange={(status) =>
                        update((draft) => {
                          draft.customCerts = (draft.customCerts ?? []).map((c) => (c.id === cert.id ? { ...c, status } : c));
                        })
                      }
                    />
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() =>
                          update((draft) => {
                            draft.customCerts = (draft.customCerts ?? []).filter((c) => c.id !== cert.id);
                          })
                        }
                        className="rounded-element border border-brand-lea/15 p-1.5 text-value-customerFocus-dark transition hover:bg-value-customerFocus-light dark:border-white/10"
                        aria-label="Remove cert"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <input
                    value={cert.terms.join(", ")}
                    disabled={!canEdit}
                    placeholder="Match terms, comma-separated (e.g. G450, GV, G-V)"
                    onChange={(e) =>
                      update((draft) => {
                        draft.customCerts = (draft.customCerts ?? []).map((c) =>
                          c.id === cert.id ? { ...c, terms: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } : c
                        );
                      })
                    }
                    className="mt-2 w-full rounded-element border-[0.5px] border-brand-lea/20 px-2.5 py-1.5 text-xs outline-none focus:border-brand-gold dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">
              No custom certs yet{canEdit ? " — add one to score a rating the built-in list doesn't cover." : "."}
            </p>
          )}
        </section>

        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Hours logic</h3>
          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
            Meeting a minimum earns full credit. Higher numbers don&apos;t earn more — except time in type, where more is
            better.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PctField
              label="Near-miss tolerance"
              hint="How far below a minimum still earns partial credit."
              value={cfg.hours.nearMissTolerancePct}
              max={50}
              disabled={!canEdit}
              onChange={(v) => update((draft) => (draft.hours.nearMissTolerancePct = v))}
            />
            <PctField
              label="Near-miss credit"
              hint="Fraction of full credit a near-miss earns."
              value={cfg.hours.nearMissCredit}
              max={100}
              disabled={!canEdit}
              onChange={(v) => update((draft) => (draft.hours.nearMissCredit = v))}
            />
            <PctField
              label="Completeness bonus"
              hint="Added when every hour minimum is met."
              value={cfg.hours.completenessBonus}
              max={100}
              disabled={!canEdit}
              onChange={(v) => update((draft) => (draft.hours.completenessBonus = v))}
            />
            <div>
              <label className="block text-sm font-medium text-brand-lea dark:text-slate-100">Time-in-type target (hrs)</label>
              <input
                type="number"
                min={1}
                max={20000}
                value={cfg.hours.timeInTypeTargetHours}
                disabled={!canEdit}
                onChange={(event) =>
                  update((draft) => (draft.hours.timeInTypeTargetHours = Math.max(1, Number(event.target.value) || 1)))
                }
                className="mt-1 w-full rounded-element border-[0.5px] border-brand-lea/20 px-3 py-2 text-sm outline-none focus:border-brand-gold disabled:bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5"
              />
              <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">Hours in type that earn full time-in-type credit.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-lea dark:text-slate-100">Currency threshold (hrs / last 12 mo)</label>
              <input
                type="number"
                min={0}
                max={5000}
                value={cfg.hours.recencyMinHours12mo}
                disabled={!canEdit}
                onChange={(event) =>
                  update((draft) => (draft.hours.recencyMinHours12mo = Math.max(0, Number(event.target.value) || 0)))
                }
                className="mt-1 w-full rounded-element border-[0.5px] border-brand-lea/20 px-3 py-2 text-sm outline-none focus:border-brand-gold disabled:bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5"
              />
              <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">Hours flown in the last 12 months at/above which a candidate reads as current (Recency category).</p>
            </div>
          </div>
        </section>

        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">Readiness thresholds</h3>
          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">Where the overall score lands a candidate. Labels only — never a reject.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-[150px_1fr_44px] items-center gap-3">
              <span className="text-sm text-brand-lea dark:text-slate-100">Worth a look ≥</span>
              <input
                type="range"
                min={0}
                max={100}
                value={cfg.readiness.possible}
                disabled={!canEdit}
                onChange={(event) =>
                  update((draft) => {
                    draft.readiness.possible = Number(event.target.value);
                    if (draft.readiness.strong < draft.readiness.possible) draft.readiness.strong = draft.readiness.possible;
                  })
                }
                className="w-full accent-value-leadership"
              />
              <span className="text-right text-sm font-semibold text-brand-lea dark:text-slate-100">{cfg.readiness.possible}</span>
            </div>
            <div className="grid grid-cols-[150px_1fr_44px] items-center gap-3">
              <span className="text-sm text-brand-lea dark:text-slate-100">Strong signal ≥</span>
              <input
                type="range"
                min={cfg.readiness.possible}
                max={100}
                value={cfg.readiness.strong}
                disabled={!canEdit}
                onChange={(event) => update((draft) => (draft.readiness.strong = Number(event.target.value)))}
                className="w-full accent-value-teamwork"
              />
              <span className="text-right text-sm font-semibold text-brand-lea dark:text-slate-100">{cfg.readiness.strong}</span>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-2 rounded-element bg-value-innovation-light px-4 py-3 text-sm text-value-innovation-dark">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Excluded from scoring by policy: age, name, gender, and location. These can never be added as factors.
        </div>
      </div>
    </div>
  );
}

function StatusToggle({
  value,
  onChange,
  disabled
}: {
  value: ReqStatus;
  onChange: (status: ReqStatus) => void;
  disabled: boolean;
}) {
  const options: Array<{ key: ReqStatus; label: string; active: string }> = [
    { key: "hard", label: "Hard", active: "bg-brand-lea text-white" },
    { key: "soft", label: "Soft", active: "bg-brand-sweet text-brand-lea dark:text-slate-100" },
    { key: "bonus", label: "Bonus", active: "bg-value-leadership-light text-value-leadership-dark" },
    { key: "none", label: "None", active: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400" }
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-element border-[0.5px] border-brand-lea/20 text-[11px] font-semibold dark:border-white/10">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.key)}
          className={clsx(
            "px-3 py-1 transition hover:shadow-glow",
            value === option.key ? option.active : "bg-white text-brand-grey hover:bg-brand-cloudDancer/60 dark:bg-[#10243a] dark:text-slate-400",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PctField({
  label,
  hint,
  value,
  max,
  disabled,
  onChange
}: {
  label: string;
  hint: string;
  value: number; // stored as 0–1 fraction
  max: number; // max percent on the slider
  disabled: boolean;
  onChange: (fraction: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-brand-lea dark:text-slate-100">{label}</label>
        <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{pct}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={pct}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="mt-1 w-full accent-brand-eden"
      />
      <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">{hint}</p>
    </div>
  );
}
