"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

/**
 * Shows a spinner the instant a Link's navigation starts, whether or not the
 * click itself worked.
 *
 * WHY THIS EXISTS. "Back to candidates" and the sidebar's Candidates link were
 * both already real <Link>s — the click always worked. What was missing was
 * any sign that it worked: with no visual change on click, a data-fetch that
 * takes even a few hundred ms (a serverless cold start, a slow query) reads as
 * "did that do anything?", and the natural response is to click something
 * else — which then races the original navigation and is what actually looked
 * broken.
 *
 * useLinkStatus reports the Link's OWN transition state, set the moment the
 * click is registered — before the destination page has fetched or rendered
 * anything — so this appears immediately regardless of how slow the backend
 * request turns out to be. It MUST render as a child of the <Link> it is
 * reporting on (a Next.js requirement); it cannot be called from the
 * component that renders the Link itself.
 */
export function LinkPendingIndicator({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className={clsx("h-3.5 w-3.5 animate-spin", className)} aria-label="Loading" />;
}
