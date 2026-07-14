// Compliments by SkyShare — resolves a RecognitionValue.colorKey to the
// Tailwind classes for its tags, accent bars, avatars and progress fills.
//
// IMPORTANT: every class is written as a full literal string so Tailwind's
// content scanner keeps them in the build. Don't construct these names
// dynamically (e.g. `bg-value-${key}-light`) — they'd be purged.
//
// Dark mode: light-fill chips would glare on the dark page, so tags/avatars
// carry `dark:` variants — a low-opacity tint of the value color + its light
// shade for text (readable, on-brand). Solid accent bars / bar fills stay full
// color (they read fine on dark).

import type { ValueColorKey } from "@/lib/compliments/constants";

export type ValueColorClasses = {
  /** Tag / chip: light fill + dark same-family text (dark: tinted + light text). */
  tag: string;
  /** Solid accent bar / left rail in the value's full color. */
  accent: string;
  /** Avatar chip: light tint background (dark: low-opacity tint). */
  avatarBg: string;
  /** Avatar chip: dark same-family text (dark: light shade). */
  avatarText: string;
  /** Progress/equity bar fill in the value's full color. */
  barFill: string;
  /** Selected-state border + tint for the value picker. */
  selected: string;
};

const FALLBACK: ValueColorClasses = {
  tag: "bg-value-integrity-light text-value-integrity-dark dark:bg-value-integrity/15 dark:text-value-integrity-light",
  accent: "bg-value-integrity",
  avatarBg: "bg-value-integrity-light dark:bg-value-integrity/20",
  avatarText: "text-value-integrity-dark dark:text-value-integrity-light",
  barFill: "bg-value-integrity",
  selected: "border-value-integrity bg-value-integrity-light dark:bg-value-integrity/20"
};

export const VALUE_COLOR_CLASSES: Record<ValueColorKey, ValueColorClasses> = {
  teamwork: {
    tag: "bg-value-teamwork-light text-value-teamwork-dark dark:bg-value-teamwork/15 dark:text-value-teamwork-light",
    accent: "bg-value-teamwork",
    avatarBg: "bg-value-teamwork-light dark:bg-value-teamwork/20",
    avatarText: "text-value-teamwork-dark dark:text-value-teamwork-light",
    barFill: "bg-value-teamwork",
    selected: "border-value-teamwork bg-value-teamwork-light dark:bg-value-teamwork/20"
  },
  innovation: {
    tag: "bg-value-innovation-light text-value-innovation-dark dark:bg-value-innovation/15 dark:text-value-innovation-light",
    accent: "bg-value-innovation",
    avatarBg: "bg-value-innovation-light dark:bg-value-innovation/20",
    avatarText: "text-value-innovation-dark dark:text-value-innovation-light",
    barFill: "bg-value-innovation",
    selected: "border-value-innovation bg-value-innovation-light dark:bg-value-innovation/20"
  },
  leadership: {
    tag: "bg-value-leadership-light text-value-leadership-dark dark:bg-value-leadership/15 dark:text-value-leadership-light",
    accent: "bg-value-leadership",
    avatarBg: "bg-value-leadership-light dark:bg-value-leadership/20",
    avatarText: "text-value-leadership-dark dark:text-value-leadership-light",
    barFill: "bg-value-leadership",
    selected: "border-value-leadership bg-value-leadership-light dark:bg-value-leadership/20"
  },
  customerFocus: {
    tag: "bg-value-customerFocus-light text-value-customerFocus-dark dark:bg-value-customerFocus/15 dark:text-value-customerFocus-light",
    accent: "bg-value-customerFocus",
    avatarBg: "bg-value-customerFocus-light dark:bg-value-customerFocus/20",
    avatarText: "text-value-customerFocus-dark dark:text-value-customerFocus-light",
    barFill: "bg-value-customerFocus",
    selected: "border-value-customerFocus bg-value-customerFocus-light dark:bg-value-customerFocus/20"
  },
  growthMindset: {
    tag: "bg-value-growthMindset-light text-value-growthMindset-dark dark:bg-value-growthMindset/15 dark:text-value-growthMindset-light",
    accent: "bg-value-growthMindset",
    avatarBg: "bg-value-growthMindset-light dark:bg-value-growthMindset/20",
    avatarText: "text-value-growthMindset-dark dark:text-value-growthMindset-light",
    barFill: "bg-value-growthMindset",
    selected: "border-value-growthMindset bg-value-growthMindset-light dark:bg-value-growthMindset/20"
  },
  integrity: {
    tag: "bg-value-integrity-light text-value-integrity-dark dark:bg-value-integrity/15 dark:text-value-integrity-light",
    accent: "bg-value-integrity",
    avatarBg: "bg-value-integrity-light dark:bg-value-integrity/20",
    avatarText: "text-value-integrity-dark dark:text-value-integrity-light",
    barFill: "bg-value-integrity",
    selected: "border-value-integrity bg-value-integrity-light dark:bg-value-integrity/20"
  }
};

export function valueColorClasses(colorKey: string): ValueColorClasses {
  return VALUE_COLOR_CLASSES[colorKey as ValueColorKey] ?? FALLBACK;
}

// Avatar tint palette for people who aren't tied to a value (e.g. recipients
// in the rewards roster). Deterministic by name so a person's chip is stable.
const AVATAR_PALETTE: { bg: string; text: string }[] = [
  { bg: "bg-value-teamwork-light dark:bg-value-teamwork/20", text: "text-value-teamwork-dark dark:text-value-teamwork-light" },
  { bg: "bg-value-innovation-light dark:bg-value-innovation/20", text: "text-value-innovation-dark dark:text-value-innovation-light" },
  { bg: "bg-value-leadership-light dark:bg-value-leadership/20", text: "text-value-leadership-dark dark:text-value-leadership-light" },
  { bg: "bg-value-customerFocus-light dark:bg-value-customerFocus/20", text: "text-value-customerFocus-dark dark:text-value-customerFocus-light" },
  { bg: "bg-value-growthMindset-light dark:bg-value-growthMindset/20", text: "text-value-growthMindset-dark dark:text-value-growthMindset-light" },
  { bg: "bg-value-integrity-light dark:bg-value-integrity/20", text: "text-value-integrity-dark dark:text-value-integrity-light" }
];

export function avatarPalette(seed: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
