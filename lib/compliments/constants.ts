// Compliments by SkyShare — shared constants.
// The schema stores `strength` and `category` as String columns (matching the
// repo convention of String + `as const` maps rather than Prisma enums). These
// objects are the single source of truth for the allowed values, the points
// each strength awards, and the value color system.

export const RecognitionStrength = {
  GOOD: "GOOD",
  GREAT: "GREAT",
  AMAZING: "AMAZING"
} as const;

export type RecognitionStrength =
  (typeof RecognitionStrength)[keyof typeof RecognitionStrength];

// Recognition strength → points awarded to the recipient.
export const STRENGTH_POINTS: Record<RecognitionStrength, number> = {
  GOOD: 50,
  GREAT: 75,
  AMAZING: 100
};

// Slider stops, in order, with the label shown in the Give Recognition form.
export const STRENGTH_STOPS: { value: RecognitionStrength; label: string }[] = [
  { value: "GOOD", label: "Good" },
  { value: "GREAT", label: "Great" },
  { value: "AMAZING", label: "Amazing" }
];

export const RewardCategory = {
  GIFT_CARD: "GIFT_CARD",
  EXPERIENCE: "EXPERIENCE",
  SWAG: "SWAG",
  CHARITY: "CHARITY"
} as const;

export type RewardCategory =
  (typeof RewardCategory)[keyof typeof RewardCategory];

export const REWARD_CATEGORY_LABELS: Record<RewardCategory, string> = {
  GIFT_CARD: "Gift cards",
  EXPERIENCE: "Experiences",
  SWAG: "Company swag",
  CHARITY: "Donate to charity"
};

// lucide-react icon names the reward catalog can choose from (resolved by
// components/compliments/RewardIcon.tsx).
export const REWARD_ICON_NAMES = ["Gift", "Coffee", "Film", "Plane", "Shirt", "Heart", "Award"] as const;

// Rewards conversion default: 100 points = $1. The live ratio is configurable
// in admin settings (ComplimentsSettings.pointsPerDollar) — pass it in where the
// admin may have changed it; the constant is only the fallback/default.
export const POINTS_PER_DOLLAR = 100;

export function dollarsFromPoints(points: number, pointsPerDollar: number = POINTS_PER_DOLLAR): number {
  return points / (pointsPerDollar || POINTS_PER_DOLLAR);
}

export function pointsToDollars(points: number, pointsPerDollar: number = POINTS_PER_DOLLAR): string {
  return `$${dollarsFromPoints(points, pointsPerDollar).toFixed(2)}`;
}

// Company values and their color system (see handoff §3). `colorKey` is the
// stable identifier stored on RecognitionValue; the Tailwind classes are
// resolved from it in the UI layer (lib/compliments/value-colors.ts).
export const VALUE_COLOR_KEYS = {
  teamwork: "teamwork",
  innovation: "innovation",
  leadership: "leadership",
  customerFocus: "customerFocus",
  growthMindset: "growthMindset",
  integrity: "integrity"
} as const;

export type ValueColorKey =
  (typeof VALUE_COLOR_KEYS)[keyof typeof VALUE_COLOR_KEYS];

// SkyShare's core values, in display order, each mapped to one of the shared
// value-color slots and carrying its definition (shown when a value is picked).
// The colorKey is only a palette slot — the name is what's shown on the chip.
export const COMPANY_VALUES: {
  name: string;
  description: string;
  colorKey: ValueColorKey;
  sortOrder: number;
}[] = [
  {
    name: "Fueled by Passion",
    description:
      "Approaches work with energy, enthusiasm, and a commitment to excellence. Demonstrates a love for aviation and a drive to deliver exceptional results.",
    colorKey: "innovation", // blue
    sortOrder: 0
  },
  {
    name: "Team Alignment",
    description:
      "Works collaboratively across departments, aligning goals and actions with the broader team to ensure seamless operations.",
    colorKey: "teamwork", // green
    sortOrder: 1
  },
  {
    name: "Deliver the Wow",
    description:
      "Creates memorable and high-impact experiences for customers, colleagues, and partners by exceeding expectations.",
    colorKey: "customerFocus", // orange — guest delight
    sortOrder: 2
  },
  {
    name: "Solutions Focused",
    description:
      "Approaches challenges with a proactive, problem-solving mindset to ensure efficiency and effectiveness.",
    colorKey: "growthMindset", // purple
    sortOrder: 3
  }
];

// name -> definition, for the value picker chips / tooltips.
export const VALUE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  COMPANY_VALUES.map((v) => [v.name, v.description])
);
