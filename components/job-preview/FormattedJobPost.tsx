import {
  BriefcaseBusiness,
  CalendarDays,
  MapPin,
  Plane,
  ShieldCheck
} from "lucide-react";
import type { BlockBodyFormat, BlockCategory, BlockTextColor, BlockTextWeight, SerializedJobPost } from "@/lib/types";
import {
  getBlockSourceLabel,
  getReusablePublishingBlocks,
  hasPublishingBlockCategory
} from "@/lib/blocks/content-source";
import {
  getInstanceBody,
  getInstanceFormatting,
  getInstanceTitle,
  isInstanceOutdated
} from "@/lib/blocks/sections";
import { formatDateForDisplay, joinPreviewParts, splitCleanLines } from "@/lib/formatting/text";
import { RichText, RichTextParagraphs, RichTextMixed } from "@/components/shared/RichText";

type FormattedJobPostProps = {
  job: SerializedJobPost;
  showVersionBadges?: boolean;
  showSourceBadges?: boolean;
  className?: string;
};

function SourceBadge({ label, tone = "block" }: { label: string; tone?: "block" | "field" | "warning" }) {
  const toneClass = {
    block: "bg-brand-sweet/40 text-brand-lea dark:text-slate-100",
    field: "bg-emerald-50 text-emerald-800",
    warning: "bg-brand-gold/25 text-brand-lea dark:text-slate-100"
  }[tone];

  return (
    <span className={`rounded px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${toneClass}`}>
      {label}
    </span>
  );
}

function Section({
  title,
  sourceBadges,
  children
}: {
  title: string;
  sourceBadges?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-brand-lea/10 pt-5 dark:border-white/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-8 rounded-full bg-brand-gold" />
          <h3 className="text-lg font-bold text-brand-lea dark:text-slate-100">{title}</h3>
        </div>
        {sourceBadges && <div className="flex flex-wrap gap-2">{sourceBadges}</div>}
      </div>
      {children}
    </section>
  );
}

function BulletList({ value }: { value?: string | null }) {
  const lines = splitCleanLines(value);
  if (!lines.length) {
    return <p className="text-sm italic text-brand-grey dark:text-slate-400">No clean text entered yet.</p>;
  }

  return (
    <ul className="space-y-2 text-sm leading-6 text-brand-black/82">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-eden" />
          <span>
            <RichText value={line} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatSecondaryLocation(value?: string | null) {
  if (!value?.trim()) {
    return "Secondary location not listed";
  }

  if (/^home\s*based$/i.test(value.trim())) {
    return "Home Based Available";
  }

  return value;
}

const blockColorClasses: Record<BlockTextColor, string> = {
  BLACK: "text-brand-black/82",
  LEA: "text-brand-lea dark:text-slate-100",
  EDEN: "text-brand-eden",
  GREY: "text-brand-grey dark:text-slate-400",
  GOLD: "text-brand-gold",
  RED: "text-brand-red",
  SWEET: "text-brand-sweet",
  CLOUD_DANCER: "text-brand-cloudDancer"
};

const blockWeightClasses: Record<BlockTextWeight, string> = {
  NORMAL: "font-normal",
  SEMIBOLD: "font-semibold",
  BOLD: "font-bold"
};

function FormattedBlockBody({
  value,
  bodyFormat,
  textWeight,
  textColor
}: {
  value?: string | null;
  bodyFormat: BlockBodyFormat;
  textWeight: BlockTextWeight;
  textColor: BlockTextColor;
}) {
  const lines = splitCleanLines(value);
  const textClass = `${blockColorClasses[textColor]} ${blockWeightClasses[textWeight]}`;

  if (!lines.length) {
    return <p className="text-sm italic text-brand-grey dark:text-slate-400">No clean text entered yet.</p>;
  }

  if (bodyFormat === "MIXED") {
    return <RichTextMixed value={value} textClass={textClass} />;
  }

  if (bodyFormat === "PARAGRAPH") {
    return (
      <RichTextParagraphs
        value={value}
        className="space-y-3"
        paragraphClassName={`text-sm leading-6 ${textClass}`}
      />
    );
  }

  return (
    <ul className={`space-y-2 text-sm leading-6 ${textClass}`}>
      {lines.map((line, index) => (
        <li key={`${line}-${index}`} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-eden" />
          <span>
            <RichText value={line} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FormattedJobPost({
  job,
  showVersionBadges = true,
  showSourceBadges = showVersionBadges,
  className = ""
}: FormattedJobPostProps) {
  const reusableBlocks = getReusablePublishingBlocks(job);
  const hasBlockCategory = (categories: BlockCategory[]) => hasPublishingBlockCategory(job, categories);
  const candidateSummary = joinPreviewParts([job.salaryRange, job.workSchedule]);

  return (
    <article className={`preview-paper overflow-hidden rounded border border-brand-lea/12 shadow-sm dark:border-white/10 ${className}`}>
      <div className="relative overflow-hidden bg-brand-lea px-6 py-7 text-white">
        <div className="absolute inset-0 opacity-25">
          <div className="absolute -right-16 top-6 h-44 w-44 rounded-full border border-brand-sweet/45" />
          <div className="absolute right-10 top-14 h-px w-48 rotate-[-18deg] bg-brand-gold/70" />
          <div className="absolute bottom-0 left-0 h-16 w-full bg-gradient-to-t from-black/20 to-transparent" />
        </div>
        <div className="relative flex items-start justify-between gap-5">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-brand-sweet">
              <Plane className="h-3.5 w-3.5" />
              SkyShare Careers
            </div>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight">{job.title}</h1>
            <p className="mt-4 text-base font-semibold text-white/78">
              {candidateSummary || "Pay range and schedule pending"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-brand-lea/10 bg-brand-cloudDancer/70 px-6 py-4 sm:grid-cols-2 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
          <MapPin className="h-4 w-4 text-brand-eden" />
          {job.location || "Location required"}
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
          <MapPin className="h-4 w-4 text-brand-eden" />
          {formatSecondaryLocation(job.secondaryLocation)}
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
          <BriefcaseBusiness className="h-4 w-4 text-brand-eden" />
          {job.positionType || "Position type required"}
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
          <CalendarDays className="h-4 w-4 text-brand-eden" />
          {formatDateForDisplay(job.postedDate)}
        </div>
      </div>

      <div className="space-y-7 px-6 py-6">
        <Section
          title="Job Summary"
          sourceBadges={showSourceBadges ? <SourceBadge label="From Job Field" tone="field" /> : null}
        >
          <RichTextParagraphs value={job.summary || "Add a concise, role-specific job summary."} />
        </Section>

        {reusableBlocks.map((instance) => {
          const content = {
            title: getInstanceTitle(instance),
            body: getInstanceBody(instance)
          };
          const formatting = getInstanceFormatting(instance);
          const outdated = isInstanceOutdated(instance);

          return (
            <Section key={instance.id} title={content.title}>
              {showSourceBadges && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <SourceBadge
                    label={getBlockSourceLabel(instance)}
                    tone={instance.mode === "FORKED_CUSTOM" ? "warning" : "block"}
                  />
                  {showVersionBadges && (
                    <SourceBadge label={`v${instance.blockVersion?.versionNumber ?? 1}`} tone="block" />
                  )}
                  {outdated && <SourceBadge label="Older Version" tone="warning" />}
                </div>
              )}
              <FormattedBlockBody value={content.body} {...formatting} />
            </Section>
          );
        })}

        {!hasBlockCategory(["RESPONSIBILITIES"]) && (
          <Section
            title="Key Responsibilities"
            sourceBadges={showSourceBadges ? <SourceBadge label="From Job Field" tone="field" /> : null}
          >
            <BulletList value={job.keyResponsibilities} />
          </Section>
        )}
        {!hasBlockCategory(["QUALIFICATIONS", "SKILLS"]) && (
          <Section
            title="Qualifications"
            sourceBadges={showSourceBadges ? <SourceBadge label="From Job Field" tone="field" /> : null}
          >
            <BulletList value={job.qualificationsText} />
          </Section>
        )}
        {!hasBlockCategory(["BENEFITS"]) && (
          <Section
            title="Benefits"
            sourceBadges={showSourceBadges ? <SourceBadge label="From Job Field" tone="field" /> : null}
          >
            <BulletList value={job.benefitsText} />
          </Section>
        )}
        {!hasBlockCategory(["LOCATION"]) && (
          <Section
            title="Location"
            sourceBadges={showSourceBadges ? <SourceBadge label="From Job Field" tone="field" /> : null}
          >
            <RichTextParagraphs
              value={
                job.secondaryLocation
                  ? `${job.location}. Secondary location: ${job.secondaryLocation}.`
                  : job.location || "Add the primary location before publishing."
              }
            />
          </Section>
        )}
      </div>

      <footer className="bg-brand-lea px-6 py-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <ShieldCheck className="h-4 w-4 text-brand-gold" />
              Ready for a consistent posting workflow
            </div>
            <p className="mt-1 text-xs text-white/68">Website copy, Paycom notes, and PDF export can share this layout.</p>
          </div>
          <div className="rounded bg-brand-gold px-4 py-2 text-sm font-bold text-brand-lea dark:text-slate-100">
            Visit SkyShare.com
          </div>
        </div>
      </footer>
    </article>
  );
}
