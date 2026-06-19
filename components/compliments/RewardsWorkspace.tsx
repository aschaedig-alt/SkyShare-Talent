"use client";

import { useMemo, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Card } from "@/components/compliments/Card";
import { PersonPicker } from "@/components/compliments/PersonPicker";
import { RewardIcon } from "@/components/compliments/RewardIcon";
import { redeemReward } from "@/app/compliments/actions";
import { REWARD_CATEGORY_LABELS, RewardCategory, pointsToDollars } from "@/lib/compliments/constants";
import type { RewardView, RosterPerson } from "@/lib/compliments/types";

type Props = {
  roster: RosterPerson[];
  rewards: RewardView[];
  pointsPerDollar: number;
};

// Thumbnail accent per category (handoff allows color blocks on reward cards).
const CATEGORY_COLOR: Record<string, string> = {
  GIFT_CARD: "bg-value-innovation",
  EXPERIENCE: "bg-value-customerFocus",
  SWAG: "bg-value-leadership",
  CHARITY: "bg-value-teamwork"
};

const CATEGORY_PILLS = [
  { key: "ALL", label: "All rewards" },
  { key: RewardCategory.GIFT_CARD, label: REWARD_CATEGORY_LABELS.GIFT_CARD },
  { key: RewardCategory.EXPERIENCE, label: REWARD_CATEGORY_LABELS.EXPERIENCE },
  { key: RewardCategory.SWAG, label: REWARD_CATEGORY_LABELS.SWAG },
  { key: RewardCategory.CHARITY, label: REWARD_CATEGORY_LABELS.CHARITY }
];

export function RewardsWorkspace({ roster, rewards, pointsPerDollar }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const selected = roster.find((p) => p.id === selectedId) ?? null;
  const balance = selected ? balances[selected.id] ?? selected.pointsBalance : null;

  const visibleRewards = useMemo(
    () => (category === "ALL" ? rewards : rewards.filter((r) => r.category === category)),
    [rewards, category]
  );

  function onRedeem(reward: RewardView) {
    if (!selected || balance === null) return;
    setNotice(null);
    setPendingId(reward.id);
    startTransition(async () => {
      const result = await redeemReward({ newHireId: selected.id, rewardId: reward.id });
      if (result.ok) {
        setBalances((prev) => ({ ...prev, [selected.id]: (prev[selected.id] ?? selected.pointsBalance) - reward.pointCost }));
        setNotice({ kind: "ok", text: `Redeemed ${reward.name} for ${selected.name}.` });
      } else {
        setNotice({ kind: "err", text: result.error ?? "Redemption failed." });
      }
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
        <Card padding="md">
          <PersonPicker
            label="Redeem rewards for"
            people={roster}
            value={selectedId}
            onChange={(id) => {
              setSelectedId(id);
              setNotice(null);
            }}
            showBalance
          />
        </Card>
        <Card padding="md" className="flex flex-col justify-center text-center">
          <p className="text-xs font-medium text-brand-grey">Available points</p>
          <p className="mt-1 text-[32px] font-medium leading-none text-brand-lea">
            {balance === null ? "—" : balance.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-brand-grey">
            {balance === null ? "Select a person" : `${pointsToDollars(balance, pointsPerDollar)} value`}
          </p>
        </Card>
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

      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORY_PILLS.map((pill) => (
          <button
            key={pill.key}
            type="button"
            onClick={() => setCategory(pill.key)}
            className={clsx(
              "whitespace-nowrap rounded-element border-[0.5px] px-3.5 py-2 text-[13px] font-medium transition hover:shadow-glow",
              category === pill.key
                ? "border-brand-lea bg-brand-lea text-white"
                : "border-brand-lea/20 text-brand-grey hover:text-brand-lea"
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {visibleRewards.map((reward) => {
          const affordable = balance !== null && balance >= reward.pointCost;
          const canRedeem = Boolean(selected) && reward.available && affordable && pendingId === null;
          const disabledLabel = !reward.available
            ? "Soon"
            : !selected
              ? "Select a person"
              : !affordable
                ? "Not enough"
                : null;

          return (
            <Card key={reward.id} padding="sm" className="flex flex-col overflow-hidden !p-0">
              <div className={clsx("flex h-24 items-center justify-center", CATEGORY_COLOR[reward.category] ?? "bg-brand-eden")}>
                <RewardIcon name={reward.icon} className="h-9 w-9 text-white" />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-sm font-medium text-brand-lea">{reward.name}</p>
                <p className="mt-0.5 text-xs text-brand-grey">{reward.description}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-brand-lea">{reward.pointCost.toLocaleString()} pts</span>
                  <button
                    type="button"
                    disabled={!canRedeem}
                    onClick={() => onRedeem(reward)}
                    className={clsx(
                      "rounded-element px-3 py-1.5 text-xs font-medium transition",
                      canRedeem
                        ? "bg-brand-lea text-white hover:bg-brand-eden"
                        : "cursor-not-allowed bg-brand-cloudDancer text-brand-grey"
                    )}
                  >
                    {pendingId === reward.id ? "..." : disabledLabel ?? "Redeem"}
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
