import { prisma } from "@/lib/prisma";
import { getReportsData } from "@/lib/data/reports";
import { getWorkspaceBranding, resolveBrandingLogo } from "@/lib/data/branding";
import { SharedFleetProgression } from "@/components/reports/SharedFleetProgression";

export const dynamic = "force-dynamic";

// Public, read-only, revocable share of the live Fleet Progression report.
// No auth — access is controlled by the unguessable token (see /api/reports-share).
export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.reportShareLink.findFirst({
    where: { token, revokedAt: null, report: "fleet-progression" },
    select: { id: true }
  });

  if (!link) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-brand-lea dark:text-slate-100">This link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
          The report link you followed has been revoked or never existed. Ask whoever shared it for a fresh link.
        </p>
      </div>
    );
  }

  const [data, branding] = await Promise.all([getReportsData(), getWorkspaceBranding()]);
  const logo = resolveBrandingLogo(branding, "reports");

  return <SharedFleetProgression upgrades={data.pilotUpgrades} logoDataUrl={logo} />;
}
