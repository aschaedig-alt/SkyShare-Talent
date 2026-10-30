import type { OfferRow } from "@/lib/data/offers";

/**
 * The orders the Offers page offers. Default is newest first (feedback
 * cmvpxiipu, Oct 26). See OfferRow.latestAt for what "newest" means.
 *
 * Its own file, NOT lib/data/offers.ts: that one imports Prisma, and the Offers
 * page is a client component. Value-importing anything from a Prisma-reaching
 * module into a client component is the "Can't resolve 'fs'" production 500 of
 * Sep 8 that both lint and tsc passed. OfferRow is a type-only import here.
 */
export const compareOffers = {
  newest: (x: OfferRow, y: OfferRow) => y.latestAt.localeCompare(x.latestAt),
  oldest: (x: OfferRow, y: OfferRow) => x.latestAt.localeCompare(y.latestAt),
  // Earliest start date first (past starts included); no start date last,
  // newest first among those.
  start: (x: OfferRow, y: OfferRow) =>
    (x.startDate ?? "9999").localeCompare(y.startDate ?? "9999") || y.latestAt.localeCompare(x.latestAt),
  name: (x: OfferRow, y: OfferRow) => x.candidateName.localeCompare(y.candidateName)
};

export type OfferSort = keyof typeof compareOffers;

export const OFFER_SORTS: Array<{ key: OfferSort; label: string }> = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "start", label: "Start date (earliest first)" },
  { key: "name", label: "Name (A–Z)" }
];
