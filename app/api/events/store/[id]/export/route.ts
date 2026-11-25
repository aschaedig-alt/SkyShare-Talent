import { NextResponse } from "next/server";
import { getStoreSummary, StoreError } from "@/lib/party-store/server";
import { storeAdminRoute } from "@/lib/party-store/http";
import { CREDIT_STATUS_LABEL, partyStoreLinkPath } from "@/lib/party-store/shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  // Leading = + - @ would run as a formula in Sheets/Excel.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** GET ?kind=balances|orders|inventory — CSV downloads. */
export async function GET(request: Request, ctx: Ctx) {
  return storeAdminRoute("export", async () => {
    const { id } = await ctx.params;
    const summary = await getStoreSummary(id);
    if (!summary) throw new StoreError("That store no longer exists.", 404);
    const kind = new URL(request.url).searchParams.get("kind") ?? "balances";

    let rows: (string | number | null)[][];
    if (kind === "orders") {
      rows = [["Date", "Employee", "Type", "Status", "Items", "Total", "Rung up by"]];
      for (const o of summary.orders) {
        rows.push([
          o.createdAt,
          o.personName,
          o.kind === "SALE" ? "Sale" : "Pre-order",
          o.status,
          o.lines.map((l) => `${l.quantity} x ${l.itemName}`).join("; "),
          dollars(o.totalCents),
          o.createdBy
        ]);
      }
    } else if (kind === "inventory") {
      rows = [["Item", "Price", "Starting count", "Sold", "Held for pre-orders", "On hand", "For sale"]];
      for (const i of summary.items) {
        rows.push([i.name, dollars(i.priceCents), i.startingQty, i.sold, i.held, i.onHand, i.active ? "yes" : "no"]);
      }
    } else {
      rows = [["Employee", "Email", "Department", "Starting", "Spent at party", "Pre-ordered", "Ending balance", "Status", "Checked in", "Pre-order link"]];
      for (const p of summary.people) {
        rows.push([
          p.current ? p.name : `${p.name} (former)`,
          p.email,
          p.department,
          dollars(p.startingCents),
          dollars(p.saleCents),
          dollars(p.preorderCents),
          dollars(p.balanceCents),
          CREDIT_STATUS_LABEL[p.status],
          p.checkedInAt,
          p.linkToken ? `${summary.origin}${partyStoreLinkPath(p.linkToken)}` : ""
        ]);
      }
    }

    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const file = `${summary.store.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${kind}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store"
      }
    });
  });
}
