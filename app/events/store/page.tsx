import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { R } from "@/components/reports/report-ui";
import { formatCents } from "@/lib/party-store/shared";
import { NewStoreForm } from "@/components/party-store/NewStoreForm";

// Events > Party store. Behind the auth wall (middleware protects /events) and
// limited to roles that can edit events.
export const dynamic = "force-dynamic";

export default async function PartyStoresPage() {
  const access = await requireModulePageAccess("events");
  if (!hasPermission(access.role, "events:write")) notFound();

  const [stores, events] = await Promise.all([
    prisma.partyStore.findMany({
      orderBy: { createdAt: "desc" },
      include: { event: { select: { name: true, startsAt: true } }, _count: { select: { items: true, orders: true } } }
    }),
    prisma.event.findMany({
      where: { status: { not: "CANCELED" } },
      orderBy: { startsAt: "desc" },
      take: 40,
      select: { id: true, name: true }
    })
  ]);

  return (
    <div className={R.page}>
      <Link href="/events" className="inline-flex text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
        ← Events &amp; Outreach
      </Link>
      <section className={R.pageHeader}>
        <div>
          <p className={R.eyebrow}>Events</p>
          <h1 className={R.pageTitle}>Party store</h1>
          <p className={R.pageLede}>
            Store credit for every current employee (full and part time, not contractors), spent at the register on
            the night. Whatever is left can be spent later through a personal pre-order link.
          </p>
        </div>
      </section>

      <section className={R.panel}>
        <h2 className={R.title}>Stores</h2>
        {stores.length === 0 ? (
          <p className={R.lede}>No store yet. Open one below.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-lea/10 dark:divide-white/10">
            {stores.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`/events/store/${s.id}`} className={R.link}>
                    {s.name}
                  </Link>
                  <p className="text-xs text-brand-grey dark:text-slate-400">
                    {s.event ? `${s.event.name} · ` : ""}
                    {formatCents(s.startingCreditCents)} each · {s._count.items} items · {s._count.orders} orders
                  </p>
                </div>
                <Link href={`/events/store/${s.id}`} className={R.smallButton}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={R.panel}>
        <h2 className={R.title}>Open a new store</h2>
        <NewStoreForm events={events} />
      </section>
    </div>
  );
}
