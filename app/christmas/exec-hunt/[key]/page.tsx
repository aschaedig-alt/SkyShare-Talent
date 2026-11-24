import type { Metadata } from "next";
import Link from "next/link";
import { EXEC_HUNT_PUBLIC_BASE, EXEC_HUNT_TITLE } from "@/lib/exec-hunt/constants";
import { execHuntPhotoUrl, findPictureByKey } from "@/lib/exec-hunt/server";
import { execHuntLogo } from "@/lib/exec-hunt/branding";
import { FESTIVE, FestiveShell } from "@/components/exec-hunt/FestiveShell";
import { ScanClient } from "@/components/exec-hunt/ScanClient";

// PUBLIC - the page each printed QR code opens. Outside the auth wall by design
// (middleware.ts does not list /christmas; AppShell renders it bare). The key in
// the path is the picture's permanent publicKey (e.g. cory-1-k7f3p9).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${EXEC_HUNT_TITLE} - SkyShare`,
  robots: { index: false, follow: false }
};

export default async function ExecHuntScanPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [picture, logo] = await Promise.all([findPictureByKey(decodeURIComponent(key)), execHuntLogo()]);

  if (!picture) {
    return (
      <FestiveShell logoDataUrl={logo}>
        <section className={`${FESTIVE.card} text-center`}>
          <p className="text-3xl" aria-hidden>
            🤔
          </p>
          <p className="mt-2 text-lg font-bold">Hmm, we don&apos;t recognise that code.</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Try scanning the QR code next to the picture again.
          </p>
          <Link href={EXEC_HUNT_PUBLIC_BASE} className={`mt-4 ${FESTIVE.bigButton}`}>
            How to play
          </Link>
        </section>
      </FestiveShell>
    );
  }

  return (
    <FestiveShell logoDataUrl={logo}>
      <ScanClient
        publicKey={picture.publicKey}
        label={`${picture.executive.name} ${picture.number}`}
        executiveName={picture.executive.name}
        photoUrl={execHuntPhotoUrl(picture.executive)}
      />
    </FestiveShell>
  );
}
