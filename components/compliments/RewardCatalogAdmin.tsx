"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { Card } from "@/components/compliments/Card";
import { RewardIcon } from "@/components/compliments/RewardIcon";
import { createReward, updateReward, deleteReward } from "@/app/compliments/admin-actions";
import { REWARD_CATEGORY_LABELS, RewardCategory, REWARD_ICON_NAMES } from "@/lib/compliments/constants";
import type { RewardCost } from "@/lib/data/compliments-budget";

type Props = { rewards: RewardCost[]; pointsPerDollar: number };

type Draft = {
  name: string;
  description: string;
  category: string;
  pointCost: string;
  icon: string;
  available: boolean;
};

const EMPTY: Draft = {
  name: "",
  description: "",
  category: RewardCategory.GIFT_CARD,
  pointCost: "1000",
  icon: "Gift",
  available: true
};

const CATEGORY_OPTIONS = Object.values(RewardCategory);

function dollars(points: number, ratio: number): string {
  return `$${(points / (ratio || 100)).toFixed(2)}`;
}

export function RewardCatalogAdmin({ rewards, pointsPerDollar }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function startEdit(r: RewardCost) {
    setAdding(false);
    setEditingId(r.id);
    setDraft({
      name: r.name,
      description: "",
      category: r.category,
      pointCost: String(r.pointCost),
      icon: "Gift",
      available: r.available
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setNotice(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setNotice({ kind: "ok", text: okText });
        setEditingId(null);
        setAdding(false);
        setDraft(EMPTY);
        router.refresh();
      } else {
        setNotice({ kind: "err", text: res.error ?? "Something went wrong." });
      }
    });
  }

  const draftToPayload = (extra?: Record<string, unknown>) => ({
    name: draft.name,
    description: draft.description,
    category: draft.category,
    pointCost: Number(draft.pointCost),
    icon: draft.icon,
    available: draft.available,
    ...extra
  });

  return (
    <Card padding="lg">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-medium text-brand-lea">Rewards catalog</h3>
          <p className="text-xs text-brand-grey">What you give out and what each costs ({pointsPerDollar} pts = $1).</p>
        </div>
        {!adding ? (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setDraft(EMPTY);
              setAdding(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-element bg-brand-lea px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-eden"
          >
            <Plus className="h-4 w-4" /> Add reward
          </button>
        ) : null}
      </div>

      {notice ? (
        <p
          className={clsx(
            "mb-3 rounded-element px-3 py-2 text-sm",
            notice.kind === "ok"
              ? "bg-value-teamwork-light text-value-teamwork-dark"
              : "bg-value-customerFocus-light text-value-customerFocus-dark"
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brand-lea/10 text-xs text-brand-grey">
              <th className="py-2 font-medium">Reward</th>
              <th className="py-2 font-medium">Category</th>
              <th className="py-2 text-right font-medium">Cost (pts)</th>
              <th className="py-2 text-right font-medium">$ value</th>
              <th className="py-2 text-right font-medium">Redeemed</th>
              <th className="py-2 text-center font-medium">Active</th>
              <th className="py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {adding ? (
              <EditRow
                draft={draft}
                setDraft={setDraft}
                pending={pending}
                onSave={() => run(() => createReward(draftToPayload()), "Reward added.")}
                onCancel={() => {
                  setAdding(false);
                  setDraft(EMPTY);
                }}
              />
            ) : null}

            {rewards.map((r) =>
              editingId === r.id ? (
                <EditRow
                  key={r.id}
                  draft={draft}
                  setDraft={setDraft}
                  pending={pending}
                  onSave={() => run(() => updateReward(draftToPayload({ id: r.id })), "Reward updated.")}
                  onCancel={() => {
                    setEditingId(null);
                    setDraft(EMPTY);
                  }}
                />
              ) : (
                <tr key={r.id} className="border-b border-brand-lea/5">
                  <td className="py-2.5">
                    <span className="flex items-center gap-2">
                      <RewardIcon name="Gift" className="h-4 w-4 text-brand-grey" />
                      <span className="font-medium text-brand-lea">{r.name}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-brand-grey">
                    {REWARD_CATEGORY_LABELS[r.category as RewardCategory] ?? r.category}
                  </td>
                  <td className="py-2.5 text-right text-brand-lea">{r.pointCost.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-brand-lea">{dollars(r.pointCost, pointsPerDollar)}</td>
                  <td className="py-2.5 text-right text-brand-grey">
                    {r.redeemedCount} · {dollars(r.pointsRedeemed, pointsPerDollar)}
                  </td>
                  <td className="py-2.5 text-center">
                    <span
                      className={clsx(
                        "inline-block rounded-full px-2 py-0.5 text-xs",
                        r.available
                          ? "bg-value-teamwork-light text-value-teamwork-dark"
                          : "bg-brand-cloudDancer text-brand-grey"
                      )}
                    >
                      {r.available ? "Active" : "Off"}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer hover:text-brand-lea"
                        aria-label={`Edit ${r.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => deleteReward(r.id), "Reward deleted.")}
                        disabled={pending}
                        className="rounded p-1.5 text-brand-grey transition hover:bg-value-customerFocus-light hover:text-value-customerFocus-dark"
                        aria-label={`Delete ${r.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EditRow({
  draft,
  setDraft,
  pending,
  onSave,
  onCancel
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inputCls =
    "w-full rounded-element border-[0.5px] border-brand-lea/20 px-2 py-1 text-sm outline-none focus:border-value-innovation";
  return (
    <tr className="border-b border-brand-lea/10 bg-brand-cloudDancer/30">
      <td className="py-2 pr-2">
        <input
          className={inputCls}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Reward name"
        />
      </td>
      <td className="py-2 pr-2">
        <select
          className={inputCls}
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {REWARD_CATEGORY_LABELS[c as RewardCategory]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min={1}
          className={clsx(inputCls, "text-right")}
          value={draft.pointCost}
          onChange={(e) => setDraft({ ...draft, pointCost: e.target.value })}
        />
      </td>
      <td className="py-2 pr-2">
        <select
          className={inputCls}
          value={draft.icon}
          onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
          aria-label="Icon"
        >
          {REWARD_ICON_NAMES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-2" />
      <td className="py-2 text-center">
        <input
          type="checkbox"
          checked={draft.available}
          onChange={(e) => setDraft({ ...draft, available: e.target.checked })}
          aria-label="Available"
        />
      </td>
      <td className="py-2">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="rounded p-1.5 text-value-teamwork-dark transition hover:bg-value-teamwork-light"
            aria-label="Save"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
