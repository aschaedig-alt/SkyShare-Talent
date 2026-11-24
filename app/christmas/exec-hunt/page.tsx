import type { Metadata } from "next";
import { EXEC_HUNT_TITLE, EXEC_HUNT_TOTAL } from "@/lib/exec-hunt/constants";
import { execHuntOpenState, execHuntPhotoUrl, getExecHuntConfig } from "@/lib/exec-hunt/server";
import { execHuntLogo } from "@/lib/exec-hunt/branding";
import { prisma } from "@/lib/prisma";
import { ExecPhoto, FESTIVE, FestiveShell } from "@/components/exec-hunt/FestiveShell";
import { MyProgress } from "@/components/exec-hunt/MyProgress";

// PUBLIC - how to play, plus this phone's own progress.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${EXEC_HUNT_TITLE} - SkyShare`,
  robots: { index: false, follow: false }
};

export default async function ExecHuntHomePage() {
  const [config, logo] = await Promise.all([getExecHuntConfig(), execHuntLogo()]);
  const executives = await prisma.execHuntExecutive.findMany({ orderBy: { sortOrder: "asc" } });
  const state = execHuntOpenState(config);

  return (
    <FestiveShell logoDataUrl={logo}>
      <div className="space-y-4">
        <section className={`${FESTIVE.card} space-y-3`}>
          <p
            className={`rounded px-3 py-2 text-center text-sm font-bold ${
              state.open
                ? "bg-emerald-50 text-[#0f5132] dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-red-50 text-[#c8102e] dark:bg-red-500/15 dark:text-red-300"
            }`}
          >
            {state.message}
          </p>
          <h2 className="text-xl font-extrabold">How to play</h2>
          <ol className="list-decimal space-y-1 pl-5 text-base">
            <li>Our five executives are hiding around the hangar, three pictures each.</li>
            <li>Find a picture and scan the QR code next to it with your phone camera.</li>
            <li>Enter your name the first time. After that, we remember you.</li>
            <li>Find all {EXEC_HUNT_TOTAL} to become a legend!</li>
          </ol>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {executives.map((exec) => (
              <div key={exec.id} className="text-center">
                <ExecPhoto name={exec.name} photoUrl={execHuntPhotoUrl(exec)} className="h-14 w-14" showName={false} />
                <p className="mt-1 text-xs font-semibold">{exec.name}</p>
              </div>
            ))}
          </div>
        </section>
        <MyProgress />
      </div>
    </FestiveShell>
  );
}
