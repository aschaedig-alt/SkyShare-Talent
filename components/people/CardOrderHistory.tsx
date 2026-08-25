import type { CardOrderView } from "@/lib/data/business-cards";

// Has this person been ordered for before, and when. That is the whole question.
//
// Deliberately NOT a roster-wide table: everyone else's orders on somebody's
// profile is clutter, and that view belongs on the Business cards page. A new
// hire will nearly always read "never ordered" — this earns its place later,
// when an employee changes title or fleet and gets a second set.

function fmtDay(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "";
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function CardOrderHistory({ orders, firstName }: { orders: CardOrderView[]; firstName: string }) {
  const summary = orders.length === 0 ? "Never ordered" : orders.length === 1 ? "Ordered once" : `Ordered ${orders.length} times`;

  return (
    <div className="mt-5 border-t border-brand-lea/10 pt-3 dark:border-white/10">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">Ordered for {firstName}</span>
        <span className="text-sm text-brand-grey dark:text-slate-400">{summary}</span>
      </div>

      {orders.length === 0 ? (
        <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-500">
          No cards have been ordered for {firstName} yet. Most new hires have none; this fills up once they are an
          employee and change title or fleet.
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {orders.map((o, i) => (
            <div
              key={o.id}
              className="flex flex-wrap items-baseline gap-2.5 rounded border border-brand-lea/10 px-3 py-1.5 dark:border-white/10"
            >
              <span className="shrink-0 rounded bg-brand-eden/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-eden dark:bg-white/10 dark:text-brand-edenOnDark">
                {ordinal(orders.length - i)}
              </span>
              <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                {o.orderedOn ? fmtDay(o.orderedOn) : (o.orderedLabel ?? "date not recorded")}
              </span>
              <span className="text-xs text-brand-grey dark:text-slate-400">
                {o.receivedOn || o.receivedLabel ? (
                  <>received {o.receivedOn ? fmtDay(o.receivedOn) : o.receivedLabel}</>
                ) : (
                  <span className="italic text-brand-grey/60 dark:text-slate-500">received date not recorded</span>
                )}
              </span>
              {o.peopleOnOrder > 1 ? (
                <span className="text-xs text-brand-grey/70 dark:text-slate-500">
                  · batch of {o.peopleOnOrder}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
