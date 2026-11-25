import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CURRENT_EMPLOYEE_WHERE } from "@/lib/data/current-employee";
import { cardLinkOrigin } from "@/lib/new-hire-contacts/hire-card-link";
import type { CreditStatus, StoreItemView, StoreOrderView, StorePersonView, StoreSummary } from "@/lib/party-store/shared";

// ---------------------------------------------------------------------------
// The party store's rules, in one place.
//
// WHO HAS CREDIT: CURRENT_EMPLOYEE_WHERE — full and part time, never contractors
// (his answer, Nov 24 2026). Guests get nothing. Somebody who has already bought
// something stays on the sheet even if they later leave, flagged as former.
//
// BALANCE = startingCents - every line on that person's orders that is not
// CANCELED. Never stored, so it cannot disagree with the orders.
//
// STOCK: sold = completed sales + fulfilled pre-orders; held = pending pre-orders;
// on hand = startingQty - sold - held. A pre-order holds stock the moment it is
// placed, so the register can never sell the last one to somebody else.
//
// RACES: every charge takes a per-store advisory lock inside its transaction, so
// two registers (or a register and a phone) cannot both spend the last dollar or
// the last item. A party's worth of traffic queues for milliseconds at most.
// ---------------------------------------------------------------------------

export class StoreError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function lockStore(tx: Tx, storeId: string) {
  // ::text because the lock function returns void, which Prisma cannot read back.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`party-store:${storeId}`}))::text`;
}

function newLinkToken() {
  return randomBytes(24).toString("base64url");
}

async function isCurrentEmployee(tx: Tx, newHireId: string) {
  const hit = await tx.newHire.findFirst({ where: { id: newHireId, ...CURRENT_EMPLOYEE_WHERE }, select: { id: true } });
  return Boolean(hit);
}

/** The person's account in this store, made on first use at the store's credit. */
async function ensureAccount(tx: Tx, storeId: string, newHireId: string) {
  const existing = await tx.partyStoreAccount.findUnique({ where: { storeId_newHireId: { storeId, newHireId } } });
  if (existing) return existing;
  if (!(await isCurrentEmployee(tx, newHireId))) {
    throw new StoreError("Only current full and part time employees have store credit.");
  }
  const store = await tx.partyStore.findUnique({ where: { id: storeId }, select: { startingCreditCents: true } });
  if (!store) throw new StoreError("That store no longer exists.", 404);
  return tx.partyStoreAccount.create({ data: { storeId, newHireId, startingCents: store.startingCreditCents } });
}

async function balanceOf(tx: Tx, accountId: string, startingCents: number) {
  const spent = await tx.partyStoreOrder.aggregate({
    where: { accountId, status: { not: "CANCELED" } },
    _sum: { totalCents: true }
  });
  return startingCents - (spent._sum.totalCents ?? 0);
}

async function onHandOf(tx: Tx, itemId: string, startingQty: number) {
  const used = await tx.partyStoreOrderLine.aggregate({
    where: { itemId, order: { status: { not: "CANCELED" } } },
    _sum: { quantity: true }
  });
  return startingQty - (used._sum.quantity ?? 0);
}

export type OrderLineInput = { itemId: string; quantity: number };

function cleanLines(raw: unknown): OrderLineInput[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, number>();
  for (const entry of raw) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const itemId = typeof e.itemId === "string" ? e.itemId : "";
    const quantity = typeof e.quantity === "number" ? Math.floor(e.quantity) : 0;
    if (!itemId || quantity < 1 || quantity > 50) continue;
    merged.set(itemId, (merged.get(itemId) ?? 0) + quantity);
  }
  return [...merged.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

/**
 * Charge an order to somebody's credit. SALE at the register, PREORDER from the
 * personal link. Everything is checked again here, under the lock: the store is
 * open for this kind, every item is this store's and active, there is enough
 * stock, and the total fits the balance. Prices come from the database, never
 * from the caller.
 */
export async function placeOrder(input: {
  storeId: string;
  newHireId: string;
  kind: "SALE" | "PREORDER";
  lines: unknown;
  createdBy: string | null;
}) {
  const lines = cleanLines(input.lines);
  if (!lines.length) throw new StoreError("Add at least one item.");

  return prisma.$transaction(async (tx) => {
    await lockStore(tx, input.storeId);
    const store = await tx.partyStore.findUnique({ where: { id: input.storeId } });
    if (!store) throw new StoreError("That store no longer exists.", 404);
    if (input.kind === "SALE" && !store.registerOpen) throw new StoreError("The register is closed.");
    if (input.kind === "PREORDER" && !store.preordersOpen) throw new StoreError("Pre-orders are closed right now.");

    const account = await ensureAccount(tx, store.id, input.newHireId);
    const items = await tx.partyStoreItem.findMany({ where: { id: { in: lines.map((l) => l.itemId) }, storeId: store.id } });
    const byId = new Map(items.map((i) => [i.id, i]));

    let total = 0;
    for (const line of lines) {
      const item = byId.get(line.itemId);
      if (!item || !item.active) throw new StoreError("One of those items is no longer for sale.");
      const onHand = await onHandOf(tx, item.id, item.startingQty);
      if (line.quantity > onHand) {
        throw new StoreError(onHand > 0 ? `Only ${onHand} ${item.name} left.` : `${item.name} is sold out.`);
      }
      total += item.priceCents * line.quantity;
    }

    const balance = await balanceOf(tx, account.id, account.startingCents);
    if (total > balance) {
      throw new StoreError(`That comes to $${(total / 100).toFixed(2)}, more than the $${(balance / 100).toFixed(2)} left.`);
    }

    const order = await tx.partyStoreOrder.create({
      data: {
        storeId: store.id,
        accountId: account.id,
        kind: input.kind,
        status: input.kind === "SALE" ? "COMPLETE" : "PENDING",
        totalCents: total,
        createdBy: input.createdBy,
        lines: {
          create: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCents: byId.get(l.itemId)!.priceCents }))
        }
      }
    });
    // Ringing somebody up means they are here.
    if (input.kind === "SALE" && !account.checkedInAt) {
      await tx.partyStoreAccount.update({
        where: { id: account.id },
        data: { checkedInAt: new Date(), checkedInBy: input.createdBy }
      });
    }
    return { orderId: order.id, totalCents: total, balanceCents: balance - total };
  });
}

/** Cancel = refund: the credit and the stock both come back. Kept, not deleted. */
export async function cancelOrder(orderId: string, opts: { onlyPendingPreorder?: boolean; accountId?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.partyStoreOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new StoreError("That order no longer exists.", 404);
    await lockStore(tx, order.storeId);
    if (opts.accountId && order.accountId !== opts.accountId) throw new StoreError("That order no longer exists.", 404);
    if (order.status === "CANCELED") return order;
    if (opts.onlyPendingPreorder && !(order.kind === "PREORDER" && order.status === "PENDING")) {
      throw new StoreError("That order has already been filled, so it can't be changed here. Ask HR.");
    }
    return tx.partyStoreOrder.update({ where: { id: orderId }, data: { status: "CANCELED", canceledAt: new Date() } });
  });
}

export async function setPreorderFulfilled(orderId: string, fulfilled: boolean) {
  const order = await prisma.partyStoreOrder.findUnique({ where: { id: orderId } });
  if (!order || order.kind !== "PREORDER" || order.status === "CANCELED") {
    throw new StoreError("Only an open pre-order can be marked picked up.");
  }
  return prisma.partyStoreOrder.update({
    where: { id: orderId },
    data: fulfilled ? { status: "FULFILLED", fulfilledAt: new Date() } : { status: "PENDING", fulfilledAt: null }
  });
}

export async function setCheckedIn(storeId: string, newHireId: string, checkedIn: boolean, by: string | null) {
  return prisma.$transaction(async (tx) => {
    const account = await ensureAccount(tx, storeId, newHireId);
    return tx.partyStoreAccount.update({
      where: { id: account.id },
      data: checkedIn ? { checkedInAt: account.checkedInAt ?? new Date(), checkedInBy: by } : { checkedInAt: null, checkedInBy: null }
    });
  });
}

/** The person's personal pre-order link token, made once and kept. */
export async function ensureLinkToken(storeId: string, newHireId: string) {
  return prisma.$transaction(async (tx) => {
    const account = await ensureAccount(tx, storeId, newHireId);
    if (account.linkToken) return account.linkToken;
    const updated = await tx.partyStoreAccount.update({
      where: { id: account.id },
      data: { linkToken: newLinkToken(), linkCreatedAt: new Date() }
    });
    return updated.linkToken!;
  });
}

/** Links for everybody who still has credit — one call before sending them out. */
export async function ensureLinksForEveryoneWithCredit(storeId: string) {
  const summary = await getStoreSummary(storeId);
  if (!summary) throw new StoreError("That store no longer exists.", 404);
  let made = 0;
  for (const person of summary.people) {
    if (person.current && person.balanceCents > 0 && !person.linkToken) {
      await ensureLinkToken(storeId, person.newHireId);
      made += 1;
    }
  }
  return made;
}

export async function getStoreSummary(storeId: string): Promise<StoreSummary | null> {
  const store = await prisma.partyStore.findUnique({
    where: { id: storeId },
    include: { event: { select: { name: true } } }
  });
  if (!store) return null;

  const [items, accounts, orders, roster] = await Promise.all([
    prisma.partyStoreItem.findMany({ where: { storeId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.partyStoreAccount.findMany({ where: { storeId } }),
    prisma.partyStoreOrder.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: { lines: true, account: { select: { newHireId: true } } }
    }),
    prisma.newHire.findMany({
      where: CURRENT_EMPLOYEE_WHERE,
      select: { id: true, name: true, department: true, ssEmail: true },
      orderBy: { name: "asc" }
    })
  ]);

  // People with an account who are no longer current still belong on the sheet.
  const rosterIds = new Set(roster.map((r) => r.id));
  const formerIds = accounts.filter((a) => !rosterIds.has(a.newHireId)).map((a) => a.newHireId);
  const former = formerIds.length
    ? await prisma.newHire.findMany({
        where: { id: { in: formerIds } },
        select: { id: true, name: true, department: true, ssEmail: true }
      })
    : [];

  const itemById = new Map(items.map((i) => [i.id, i]));
  const sold = new Map<string, number>();
  const held = new Map<string, number>();
  const salesByAccount = new Map<string, number>();
  const preByAccount = new Map<string, number>();
  for (const order of orders) {
    if (order.status === "CANCELED") continue;
    const target = order.kind === "SALE" ? salesByAccount : preByAccount;
    target.set(order.accountId, (target.get(order.accountId) ?? 0) + order.totalCents);
    for (const line of order.lines) {
      const bucket = order.kind === "PREORDER" && order.status === "PENDING" ? held : sold;
      bucket.set(line.itemId, (bucket.get(line.itemId) ?? 0) + line.quantity);
    }
  }

  const itemViews: StoreItemView[] = items.map((i) => {
    const s = sold.get(i.id) ?? 0;
    const h = held.get(i.id) ?? 0;
    return { id: i.id, name: i.name, priceCents: i.priceCents, startingQty: i.startingQty, sold: s, held: h, onHand: i.startingQty - s - h, active: i.active };
  });

  const accountByHire = new Map(accounts.map((a) => [a.newHireId, a]));
  const toPerson = (p: { id: string; name: string; department: string | null; ssEmail: string | null }, current: boolean): StorePersonView => {
    const account = accountByHire.get(p.id) ?? null;
    const startingCents = account?.startingCents ?? store.startingCreditCents;
    const saleCents = account ? salesByAccount.get(account.id) ?? 0 : 0;
    const preorderCents = account ? preByAccount.get(account.id) ?? 0 : 0;
    const balanceCents = startingCents - saleCents - preorderCents;
    let status: CreditStatus = "UNUSED";
    if (startingCents > 0 && balanceCents <= 0) status = "SPENT";
    else if (preorderCents > 0) status = "PREORDERED";
    else if (account?.checkedInAt || saleCents > 0) status = "AT_PARTY";
    return {
      newHireId: p.id,
      name: p.name,
      department: p.department,
      email: p.ssEmail,
      current,
      accountId: account?.id ?? null,
      startingCents,
      saleCents,
      preorderCents,
      balanceCents,
      checkedInAt: account?.checkedInAt?.toISOString() ?? null,
      linkToken: account?.linkToken ?? null,
      status
    };
  };
  const people = [...roster.map((p) => toPerson(p, true)), ...former.map((p) => toPerson(p, false))];

  const nameByHire = new Map([...roster, ...former].map((p) => [p.id, p.name]));
  const orderViews: StoreOrderView[] = orders.map((o) => ({
    id: o.id,
    kind: o.kind === "PREORDER" ? "PREORDER" : "SALE",
    status: o.status,
    totalCents: o.totalCents,
    personName: nameByHire.get(o.account.newHireId) ?? "(removed)",
    newHireId: o.account.newHireId,
    createdBy: o.createdBy,
    createdAt: o.createdAt.toISOString(),
    fulfilledAt: o.fulfilledAt?.toISOString() ?? null,
    lines: o.lines.map((l) => ({ itemName: itemById.get(l.itemId)?.name ?? "?", quantity: l.quantity, unitCents: l.unitCents }))
  }));

  const current = people.filter((p) => p.current || p.accountId);
  return {
    store: {
      id: store.id,
      name: store.name,
      eventId: store.eventId,
      eventName: store.event?.name ?? null,
      startingCreditCents: store.startingCreditCents,
      registerOpen: store.registerOpen,
      preordersOpen: store.preordersOpen
    },
    items: itemViews,
    people,
    orders: orderViews,
    totals: {
      people: people.length,
      checkedIn: people.filter((p) => p.checkedInAt).length,
      issuedCents: current.reduce((sum, p) => sum + p.startingCents, 0),
      spentAtPartyCents: people.reduce((sum, p) => sum + p.saleCents, 0),
      preorderedCents: people.reduce((sum, p) => sum + p.preorderCents, 0),
      leftCents: people.reduce((sum, p) => sum + p.balanceCents, 0),
      pendingPreorders: orderViews.filter((o) => o.kind === "PREORDER" && o.status === "PENDING").length
    },
    origin: cardLinkOrigin()
  };
}

/** What the employee's personal link shows: their balance, their orders, what is in stock. */
export async function getLinkView(token: string) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const account = await prisma.partyStoreAccount.findUnique({
    where: { linkToken: token },
    include: { newHire: { select: { name: true } }, store: true }
  });
  if (!account) return null;
  const summary = await getStoreSummary(account.storeId);
  if (!summary) return null;
  const me = summary.people.find((p) => p.newHireId === account.newHireId);
  return {
    accountId: account.id,
    newHireId: account.newHireId,
    storeId: account.storeId,
    storeName: account.store.name,
    preordersOpen: account.store.preordersOpen,
    firstName: account.newHire.name.split(/\s+/)[0] ?? account.newHire.name,
    balanceCents: me?.balanceCents ?? 0,
    startingCents: account.startingCents,
    items: summary.items.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, onHand: i.onHand })),
    orders: summary.orders
      .filter((o) => o.newHireId === account.newHireId)
      .map((o) => ({ id: o.id, kind: o.kind, status: o.status, totalCents: o.totalCents, createdAt: o.createdAt, lines: o.lines }))
  };
}
