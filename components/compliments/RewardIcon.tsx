import { Award, Coffee, Film, Gift, Heart, Plane, Shirt, type LucideIcon } from "lucide-react";

// Maps the string stored on Reward.icon (a lucide-react name) to its component.
// Extend this when new reward icons are introduced.
const ICONS: Record<string, LucideIcon> = {
  Gift,
  Coffee,
  Film,
  Plane,
  Shirt,
  Heart,
  Award
};

export function RewardIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Award;
  return <Icon className={className} aria-hidden="true" />;
}
