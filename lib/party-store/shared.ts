// Party store — client-safe types and helpers. Server logic: lib/party-store/server.ts.

/** $100 for the 2026 Christmas party (his answer, Nov 24 2026). */
export const DEFAULT_STARTING_CREDIT_CENTS = 10_000;

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

/** "$12.50" / "12.5" / "12" -> 1250. Null when it is not a sensible price. */
export function parseDollarsToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function partyStoreLinkPath(token: string) {
  return `/store/${encodeURIComponent(token)}`;
}

export type StoreItemView = {
  id: string;
  name: string;
  priceCents: number;
  startingQty: number;
  sold: number;
  held: number;
  onHand: number;
  active: boolean;
};

export type CreditStatus = "UNUSED" | "AT_PARTY" | "SPENT" | "PREORDERED";

export type StorePersonView = {
  newHireId: string;
  name: string;
  department: string | null;
  email: string | null;
  /** False for someone with store history who is no longer a current employee. */
  current: boolean;
  accountId: string | null;
  startingCents: number;
  saleCents: number;
  preorderCents: number;
  balanceCents: number;
  checkedInAt: string | null;
  linkToken: string | null;
  status: CreditStatus;
};

export type StoreOrderView = {
  id: string;
  kind: "SALE" | "PREORDER";
  status: string;
  totalCents: number;
  personName: string;
  newHireId: string;
  createdBy: string | null;
  createdAt: string;
  fulfilledAt: string | null;
  lines: { itemName: string; quantity: number; unitCents: number }[];
};

export type StoreSummary = {
  store: {
    id: string;
    name: string;
    eventId: string | null;
    eventName: string | null;
    startingCreditCents: number;
    registerOpen: boolean;
    preordersOpen: boolean;
  };
  items: StoreItemView[];
  people: StorePersonView[];
  orders: StoreOrderView[];
  totals: {
    people: number;
    checkedIn: number;
    issuedCents: number;
    spentAtPartyCents: number;
    preorderedCents: number;
    leftCents: number;
    pendingPreorders: number;
  };
  origin: string;
};

export const CREDIT_STATUS_LABEL: Record<CreditStatus, string> = {
  UNUSED: "Not checked in",
  AT_PARTY: "Checked in",
  SPENT: "Spent in full",
  PREORDERED: "Pre-ordered"
};
