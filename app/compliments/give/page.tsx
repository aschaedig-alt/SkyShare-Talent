import { getComplimentsRoster, getRecognitionValues } from "@/lib/data/compliments";
import { GiveRecognitionForm } from "@/components/compliments/GiveRecognitionForm";

export const dynamic = "force-dynamic";

export default async function GiveRecognitionPage() {
  const [roster, values] = await Promise.all([getComplimentsRoster(), getRecognitionValues()]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-brand-lea">Give recognition</h2>
        <p className="text-sm text-brand-grey">Celebrate great work and reinforce our values.</p>
      </div>
      <GiveRecognitionForm roster={roster} values={values} />
    </div>
  );
}
