import { clsx } from "clsx";

// Shimmer placeholder bar for loading/skeleton states. Uses the neutral surface
// tints (light + dark) with a gentle pulse. Compose several to sketch the shape
// of incoming content so page loads don't flash a jarring empty box.
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded bg-brand-cloudDancer dark:bg-white/10", className)} />;
}
