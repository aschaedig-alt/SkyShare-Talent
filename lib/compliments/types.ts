// Compliments by SkyShare — shared view models passed from server data
// functions (lib/data/compliments.ts) into the presentational components.

export type RecognitionValueView = {
  name: string;
  colorKey: string;
};

export type RecognitionView = {
  id: string;
  giverName: string;
  giverInitials: string | null;
  recipientName: string;
  recipientInitials: string | null;
  message: string;
  values: RecognitionValueView[];
  strength: string;
  pointsAwarded: number;
  createdAt: string; // ISO string
  likeCount: number;
  commentCount: number;
};

export type RosterPerson = {
  id: string;
  name: string;
  department: string | null;
  position: string | null;
  initials: string | null;
  stage: string;
  pointsBalance: number;
};

export type RewardView = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pointCost: number;
  icon: string;
  available: boolean;
};
