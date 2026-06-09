import { Lock, Sparkles } from "lucide-react";

type PagePlaceholderProps = {
  title: string;
  eyebrow: string;
  description: string;
  cards: string[];
};

export function PagePlaceholder({ title, eyebrow, description, cards }: PagePlaceholderProps) {
  return (
    <div className="px-5 py-5 lg:px-8">
      <div className="rounded bg-white p-8 shadow-panel ring-1 ring-brand-lea/10">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-brand-lea text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
              {eyebrow}
            </p>
            <h1 className="text-3xl font-semibold text-brand-lea">{title}</h1>
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-brand-black/72">{description}</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/70 p-4">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded bg-brand-gold/20 text-brand-lea">
                <Lock className="h-4 w-4" />
              </div>
              <div className="text-sm font-semibold text-brand-lea">{card}</div>
              <p className="mt-2 text-xs leading-5 text-brand-grey">
                Planned workspace area for controlled rollout.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
