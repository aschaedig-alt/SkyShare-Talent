import { getHostBySlug, toPublicHost } from "@/lib/data/booking";
import { PublicBooking } from "@/components/booking/PublicBooking";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const host = await getHostBySlug(slug);

  if (!host || !host.isActive) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold text-brand-lea">Scheduling link not found</h1>
        <p className="mt-2 text-sm text-brand-grey">
          This booking link may have been disabled or the address is incorrect.
        </p>
      </main>
    );
  }

  return <PublicBooking slug={slug} host={toPublicHost(host)} />;
}
