// Compliments by SkyShare — resolves a RecognitionValue.colorKey to the
// Tailwind classes for its tags, accent bars, avatars and progress fills.
//
// IMPORTANT: every class is written as a full literal string so Tailwind's
// content scanner keeps them in the build. Don't construct these names
// dynamically (e.g. `bg-value-${key}-light`) — they'd be purged.

import type { ValueColorKey } from "@/lib/compliments/constants";

export type ValueColorClasses = {
  /** Tag / chip: light fill + dark same-family text. */
  tag: string;
  /** Solid accent bar / left rail in the value's full color. */
  accent: string;
  /** Avatar chip: light tint background. */
  avatarBg: string;
  /** Avatar chip: dark same-family text. */
  avatarText: string;
  /** Progress/equity bar fill in the value's full color. */
  barFill: string;
  /** Selected-state border + tint for the value picker. */
  selected: string;
};

const FALLBACK: ValueColorClasses = {
  tag: "bg-value-integrity-light text-value-integrity-dark",
  accent: "bg-value-integrity",
  avatarBg: "bg-value-integrity-light",
  avatarText: "text-value-integrity-dark",
  barFill: "bg-value-integrity",
  selected: "border-value-integrity bg-value-integrity-light"
};

export const VALUE_COLOR_CLASSES: Record<ValueColorKey, ValueColorClasses> = {
  teamwork: {
    tag: "bg-value-teamwork-light text-value-teamwork-dark",
    accent: "bg-value-teamwork",
    avatarBg: "bg-value-teamwork-light",
    avatarText: "text-value-teamwork-dark",
    barFill: "bg-value-teamwork",
    selected: "border-value-teamwork bg-value-teamwork-light"
  },
  innovation: {
    tag: "bg-value-innovation-light text-value-innovation-dark",
    accent: "bg-value-innovation",
    avatarBg: "bg-value-innovation-light",
    avatarText: "text-value-innovation-dark",
    barFill: "bg-value-innovation",
    selected: "border-value-innovation bg-value-innovation-light"
  },
  leadership: {
    tag: "bg-value-leadership-light text-value-leadership-dark",
    accent: "bg-value-leadership",
    avatarBg: "bg-value-leadership-light",
    avatarText: "text-value-leadership-dark",
    barFill: "bg-value-leadership",
    selected: "border-value-leadership bg-value-leadership-light"
  },
  customerFocus: {
    tag: "bg-value-customerFocus-light text-value-customerFocus-dark",
    accent: "bg-value-customerFocus",
    avatarBg: "bg-value-customerFocus-light",
    avatarText: "text-value-customerFocus-dark",
    barFill: "bg-value-customerFocus",
    selected: "border-value-customerFocus bg-value-customerFocus-light"
  },
  growthMindset: {
    tag: "bg-value-growthMindset-light text-value-growthMindset-dark",
    accent: "bg-value-growthMindset",
    avatarBg: "bg-value-growthMindset-light",
    avatarText: "text-value-growthMindset-dark",
    barFill: "bg-value-growthMindset",
    selected: "border-value-growthMindset bg-value-growthMindset-light"
  },
  integrity: {
    tag: "bg-value-integrity-light text-value-integrity-dark",
    accent: "bg-value-integrity",
    avatarBg: "bg-value-integrity-light",
    avatarText: "text-value-integrity-dark",
    barFill: "bg-value-integrity",
    selected: "border-value-integrity bg-value-integrity-light"
  }
};

export function valueColorClasses(colorKey: string): ValueColorClasses {
  return VALUE_COLOR_CLASSES[colorKey as ValueColorKey] ?? FALLBACK;
}

// Avatar tint palette for people who aren't tied to a value (e.g. recipients
// in the rewards roster). Deterministic by name so a person's chip is stable.
const AVATAR_PALETTE: { bg: string; text: string }[] = [
  { bg: "bg-value-teamwork-light", text: "text-value-teamwork-dark" },
  { bg: "bg-value-innovation-light", text: "text-value-innovation-dark" },
  { bg: "bg-value-leadership-light", text: "text-value-leadership-dark" },
  { bg: "bg-value-customerFocus-light", text: "text-value-customerFocus-dark" },
  { bg: "bg-value-growthMindset-light", text: "text-value-growthMindset-dark" },
  { bg: "bg-value-integrity-light", text: "text-value-integrity-dark" }
];

export function avatarPalette(seed: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
