import { getComplimentsRoster, getRecognitionValues } from "@/lib/data/compliments";
import { getComplimentsSettings } from "@/lib/compliments/settings";
import { GiveRecognitionForm } from "@/components/compliments/GiveRecognitionForm";

export const dynamic = "force-dynamic";

export default async function GiveRecognitionPage({
  searchParams
}: {
  searchParams: Promise<{ recipient?: string }>;
}) {
  const [{ recipient }, roster, values, settings] = await Promise.all([
    searchParams,
    getComplimentsRoster(),
    getRecognitionValues(),
    getComplimentsSettings()
  ]);

  // Pre-select a recipient (e.g. from a Celebrations "Recognize" link) only if
  // they're actually in the roster.
  const defaultRecipientId = recipient && roster.some((p) => p.id === recipient) ? recipient : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-brand-lea dark:text-slate-100">Give recognition</h2>
        <p className="text-sm text-brand-grey dark:text-slate-400">Celebrate great work and reinforce our values.</p>
      </div>
      <GiveRecognitionForm roster={roster} values={values} strengthPoints={settings.strengthPoints} defaultRecipientId={defaultRecipientId} />
    </div>
  );
}
