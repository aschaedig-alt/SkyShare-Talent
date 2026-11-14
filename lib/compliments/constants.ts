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
// value-color slots. The colorKey is only a palette slot — the name is what's
// shown on the chip.
//
// The wording is HR's, word for word, from HR's "Core Values" table (Definition
// | Key Behaviors), sent by him on Nov 14 2026 so every place the app shows a
// value matches the HR version. Do not reword it here; if HR changes the table,
// copy the new text in.
//   description  - the short line shown at first: HR's first definition sentence.
//   definition   - HR's whole Definition cell.
//   keyBehaviors - HR's Key Behaviors cell, one sentence per entry.
// components/shared/CoreValueDefinition.tsx shows the short line with a More
// toggle that opens the rest.
export const COMPANY_VALUES: {
  name: string;
  description: string;
  definition: string;
  keyBehaviors: string[];
  colorKey: ValueColorKey;
  sortOrder: number;
}[] = [
  {
    name: "Fueled by Passion",
    description: "Approaches work with energy, enthusiasm, and a commitment to excellence.",
    definition:
      "Approaches work with energy, enthusiasm, and a commitment to excellence. Demonstrates a love for aviation and a drive to deliver exceptional results.",
    keyBehaviors: [
      "Displays enthusiasm and dedication in daily tasks and interactions.",
      "Goes above and beyond to contribute to the company success.",
      "Inspires and motivates others through a positive attitude and work ethic.",
      "Continuously seeks personal and professional growth opportunities."
    ],
    colorKey: "innovation", // blue
    sortOrder: 0
  },
  {
    name: "Team Alignment",
    description:
      "Works collaboratively across departments, aligning goals and actions with the broader team to ensure seamless operations.",
    definition:
      "Works collaboratively across departments, aligning goals and actions with the broader team to ensure seamless operations. Demonstrates a strong commitment to collective success by supporting team cohesion, cross-functional effectiveness, and the operation as a whole.",
    keyBehaviors: [
      "Actively communicates and collaborates with colleagues to achieve shared goals.",
      "Supports team members in solving challenges and maintaining efficiency.",
      "Demonstrates respect, trust, and accountability in all interactions.",
      "Encourages open dialogue and constructive feedback to strengthen teamwork.",
      "Maintains a positive and collaborative tone, even under pressure or in conflict situations.",
      "Models respectful influence and diplomacy in high-impact decisions.",
      "Prioritizes the success of the overall operation over individual or departmental interests.",
      "Seeks to understand how decisions and actions affect other teams and the broader organization.",
      "Builds strong cross-functional relationships to promote unity, transparency, and operational excellence."
    ],
    colorKey: "teamwork", // green
    sortOrder: 1
  },
  {
    name: "Deliver the Wow",
    description:
      "Creates memorable and high-impact experiences for customers, colleagues, and partners by exceeding expectations.",
    definition:
      "Creates memorable and high-impact experiences for customers, colleagues, and partners by exceeding expectations.",
    keyBehaviors: [
      "Anticipates customer needs and provides proactive, personalized service.",
      "Takes the initiative to exceed expectations in service and operations.",
      "Brings creativity and innovation to problem-solving and service delivery.",
      "Seeks continuous improvement to elevate customer and employee experiences."
    ],
    colorKey: "customerFocus", // orange — guest delight
    sortOrder: 2
  },
  {
    name: "Solutions Focused",
    description:
      "Approaches challenges with a proactive, problem-solving mindset to ensure efficiency and effectiveness.",
    definition:
      "Approaches challenges with a proactive, problem-solving mindset to ensure efficiency and effectiveness. Maintains focus on outcomes, identifies root causes, and applies practical thinking to resolve issues while supporting continuous improvement.",
    keyBehaviors: [
      "Identifies challenges quickly and seeks appropriate solutions.",
      "Stays calm under pressure and focuses on finding answers rather than dwelling on problems.",
      "Encourages a culture of continuous improvement and operational efficiency.",
      "Utilizes data, insights, and past experiences to make informed, effective decisions.",
      "Applies critical thinking and structured problem-solving techniques to analyze and determine root causes.",
      "Collaborates with others to brainstorm options and evaluate alternatives when solving problems."
    ],
    colorKey: "growthMindset", // purple
    sortOrder: 3
  }
];

/** name -> the whole HR entry, for CoreValueDefinition. */
export const COMPANY_VALUE_BY_NAME: Record<string, (typeof COMPANY_VALUES)[number]> = Object.fromEntries(
  COMPANY_VALUES.map((v) => [v.name, v])
);

// name -> definition, for the value picker chips / tooltips.
export const VALUE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  COMPANY_VALUES.map((v) => [v.name, v.description])
);
