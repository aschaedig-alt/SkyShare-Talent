"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clsx } from "clsx";
import { z } from "zod";
import { Check } from "lucide-react";
import { Card } from "@/components/compliments/Card";
import { PersonPicker } from "@/components/compliments/PersonPicker";
import { createRecognition } from "@/app/compliments/actions";
import { RecognitionStrength, STRENGTH_STOPS } from "@/lib/compliments/constants";
import { valueColorClasses } from "@/lib/compliments/value-colors";
import type { RosterPerson } from "@/lib/compliments/types";

type ValueOption = { id: string; name: string; colorKey: string };
type StrengthPoints = { GOOD: number; GREAT: number; AMAZING: number };

type Props = {
  roster: RosterPerson[];
  values: ValueOption[];
  strengthPoints: StrengthPoints;
  defaultRecipientId?: string | null;
};

const strengthValues = Object.values(RecognitionStrength) as [string, ...string[]];

const schema = z
  .object({
    giverId: z.string().min(1, "Choose who is giving the recognition."),
    recipientId: z.string().min(1, "Choose who is being recognized."),
    message: z.string().trim().min(5, "Add a short message about the impact.").max(1000),
    valueIds: z.array(z.string()).min(1, "Select at least one value."),
    strength: z.enum(strengthValues)
  })
  .refine((data) => data.giverId !== data.recipientId, {
    message: "Pick two different people.",
    path: ["recipientId"]
  });

type FormValues = z.infer<typeof schema>;

export function GiveRecognitionForm({ roster, values, strengthPoints, defaultRecipientId = null }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    register,
    watch,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { giverId: "", recipientId: defaultRecipientId ?? "", message: "", valueIds: [], strength: RecognitionStrength.GREAT }
  });

  const giverId = watch("giverId");
  const recipientId = watch("recipientId");

  function onSubmit(data: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await createRecognition(data);
      if (result.ok) {
        router.push("/compliments/feed");
      } else {
        setServerError(result.error ?? "Something went wrong. Try again.");
      }
    });
  }

  return (
    <Card padding="lg" as="section">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Controller
          control={control}
          name="giverId"
          render={({ field }) => (
            <PersonPicker
              label="Who is giving the recognition?"
              people={roster}
              value={field.value}
              onChange={field.onChange}
              excludeId={recipientId}
              error={errors.giverId?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="recipientId"
          render={({ field }) => (
            <PersonPicker
              label="Who are you recognizing?"
              people={roster}
              value={field.value}
              onChange={field.onChange}
              excludeId={giverId}
              error={errors.recipientId?.message}
            />
          )}
        />

        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-medium text-brand-lea dark:text-slate-100">
            What&apos;s this recognition about?
          </label>
          <textarea
            id="message"
            {...register("message")}
            placeholder="Share what made this special. Be specific about the impact..."
            className="min-h-[100px] w-full resize-none rounded-element border-[0.5px] border-brand-lea/20 px-3 py-2.5 text-sm text-brand-black outline-none focus:border-value-innovation focus:ring-2 focus:ring-value-innovation/30 dark:border-white/10 dark:text-slate-100"
          />
          {errors.message ? <p className="mt-1 text-xs text-brand-red">{errors.message.message}</p> : null}
        </div>

        <Controller
          control={control}
          name="valueIds"
          render={({ field }) => (
            <ValuePicker values={values} selected={field.value} onChange={field.onChange} error={errors.valueIds?.message} />
          )}
        />

        <Controller
          control={control}
          name="strength"
          render={({ field }) => (
            <StrengthSlider value={field.value} onChange={field.onChange} strengthPoints={strengthPoints} />
          )}
        />

        {serverError ? (
          <p className="rounded-element bg-value-customerFocus-light px-3 py-2 text-sm text-value-customerFocus-dark">
            {serverError}
          </p>
        ) : null}

        <div className="flex gap-3 border-t border-brand-lea/10 pt-5 dark:border-white/10">
          <button
            type="button"
            onClick={() => router.push("/compliments")}
            className="flex-1 rounded-element border-[0.5px] border-brand-lea/20 px-4 py-2.5 text-sm font-medium text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-element bg-brand-lea px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-eden disabled:opacity-60"
          >
            {pending ? "Sending..." : "Send recognition"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function ValuePicker({
  values,
  selected,
  onChange,
  error
}: {
  values: ValueOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  }

  return (
    <div>
      <p className="mb-2.5 block text-sm font-medium text-brand-lea dark:text-slate-100">
        Which value does this reflect? <span className="font-normal text-brand-grey dark:text-slate-400">(select all that apply)</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {values.map((v) => {
          const isSelected = selected.includes(v.id);
          const colors = valueColorClasses(v.colorKey);
          return (
            <button
              type="button"
              key={v.id}
              onClick={() => toggle(v.id)}
              aria-pressed={isSelected}
              className={clsx(
                "flex items-center justify-between gap-2 rounded-element border px-3 py-2.5 text-sm transition hover:shadow-glow",
                isSelected
                  ? clsx("border-2 font-medium text-brand-lea dark:text-slate-100", colors.selected)
                  : "border-[0.5px] border-brand-lea/20 text-brand-black hover:border-brand-lea/40 dark:border-white/10 dark:text-slate-100"
              )}
            >
              {v.name}
              {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-1 text-xs text-brand-red">{error}</p> : null}
    </div>
  );
}

function StrengthSlider({
  value,
  onChange,
  strengthPoints
}: {
  value: string;
  onChange: (v: string) => void;
  strengthPoints: StrengthPoints;
}) {
  const index = STRENGTH_STOPS.findIndex((s) => s.value === value);
  const current = STRENGTH_STOPS[index] ?? STRENGTH_STOPS[1];
  const points = strengthPoints[current.value];

  return (
    <div className="border-t border-brand-lea/10 pt-5 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between">
        <label htmlFor="strength" className="text-sm font-medium text-brand-lea dark:text-slate-100">
          Recognition strength
        </label>
        <span className="text-sm font-medium text-brand-lea dark:text-slate-100">
          {current.label} · +{points} points
        </span>
      </div>
      <input
        id="strength"
        type="range"
        min={1}
        max={3}
        step={1}
        value={index + 1}
        onChange={(e) => onChange(STRENGTH_STOPS[Number(e.target.value) - 1].value)}
        className="w-full accent-brand-lea"
      />
      <div className="mt-1 flex justify-between text-xs text-brand-grey dark:text-slate-400">
        {STRENGTH_STOPS.map((s) => (
          <span key={s.value} className={clsx(s.value === current.value && "font-medium text-brand-lea dark:text-slate-100")}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
