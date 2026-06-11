import type { BlockBodyFormat, BlockCategory, SerializedJobPost } from "@/lib/types";
import { getReusablePublishingBlocks, hasPublishingBlockCategory } from "@/lib/blocks/content-source";
import { getInstanceBody, getInstanceFormatting, getInstanceTitle } from "@/lib/blocks/sections";
import { brandColors } from "@/lib/formatting/brand";
import { escapeHtml, richTextToHtml, richTextToLimitedHtml, richTextToPlainText } from "@/lib/formatting/rich-text";
import { formatDateForDisplay, joinPreviewParts, parseBodySegments, splitCleanLines, splitCleanParagraphs } from "@/lib/formatting/text";

const applicationNote = "Note: Please apply through our website job link. All other applications will not be considered.";

function paragraphLimitedHtml(value?: string | null) {
  return splitCleanParagraphs(value)
    .map((paragraph) => paragraph.split("\n").map(richTextToLimitedHtml).join("\n"))
    .join("\n\n");
}

function bulletListLimitedHtml(value?: string | null) {
  return splitCleanLines(value)
    .map((line) => `- ${richTextToLimitedHtml(line)}`)
    .join("\n");
}

function sectionLimitedHtml(title: string, body: string) {
  const cleanBody = body.trim();

  if (!cleanBody) {
    return "";
  }

  const separator = cleanBody.includes("\n") ? "\n" : " ";
  return `<b>${escapeHtml(title)}:</b>${separator}${cleanBody}`;
}

function mixedLimitedHtml(value?: string | null) {
  return parseBodySegments(value)
    .map((segment) =>
      segment.type === "bullets"
        ? segment.items.map((item) => `- ${richTextToLimitedHtml(item)}`).join("\n")
        : segment.lines.map(richTextToLimitedHtml).join("\n")
    )
    .join("\n");
}

function blockBodyLimitedHtml({
  value,
  bodyFormat
}: {
  value?: string | null;
  bodyFormat: BlockBodyFormat;
}) {
  if (bodyFormat === "MIXED") {
    return mixedLimitedHtml(value);
  }
  if (bodyFormat === "PARAGRAPH") {
    return paragraphLimitedHtml(value);
  }

  return bulletListLimitedHtml(value);
}

function paragraphFormattedHtml(value?: string | null) {
  return splitCleanParagraphs(value)
    .map((paragraph) => {
      const lines = paragraph.split("\n").map(richTextToHtml).join("<br>");
      return `<p style="margin: 0 0 12px; line-height: 1.55;">${lines}</p>`;
    })
    .join("");
}

function bulletListFormattedHtml(value?: string | null) {
  const lines = splitCleanLines(value);

  if (!lines.length) {
    return "";
  }

  return `<ul style="margin: 0 0 14px 20px; padding: 0; line-height: 1.55;">${lines
    .map((line) => `<li style="margin: 0 0 7px;">${richTextToHtml(line)}</li>`)
    .join("")}</ul>`;
}

function sectionFormattedHtml(title: string, body: string) {
  const cleanBody = body.trim();

  if (!cleanBody) {
    return "";
  }

  return `<section style="margin: 0 0 22px;">
  <h2 style="margin: 0 0 10px; color: ${brandColors.lea}; font-size: 18px; line-height: 1.25;">${escapeHtml(title)}</h2>
  ${cleanBody}
</section>`;
}

function formatSecondaryLocation(value?: string | null) {
  if (!value?.trim()) {
    return "";
  }

  if (/^home\s*based$/i.test(value.trim())) {
    return "Home Based Available";
  }

  return value;
}

function mixedFormattedHtml(value?: string | null) {
  return parseBodySegments(value)
    .map((segment) =>
      segment.type === "bullets"
        ? `<ul style="margin: 0 0 14px 20px; padding: 0; line-height: 1.55;">${segment.items
            .map((item) => `<li style="margin: 0 0 7px;">${richTextToHtml(item)}</li>`)
            .join("")}</ul>`
        : `<p style="margin: 0 0 12px; line-height: 1.55;">${segment.lines.map(richTextToHtml).join("<br>")}</p>`
    )
    .join("");
}

function blockBodyFormattedHtml({
  value,
  bodyFormat
}: {
  value?: string | null;
  bodyFormat: BlockBodyFormat;
}) {
  if (bodyFormat === "MIXED") {
    return mixedFormattedHtml(value);
  }
  if (bodyFormat === "PARAGRAPH") {
    return paragraphFormattedHtml(value);
  }

  return bulletListFormattedHtml(value);
}

export function buildJobPostHtml(job: SerializedJobPost) {
  const reusableBlocks = getReusablePublishingBlocks(job);
  const hasBlockCategory = (categories: BlockCategory[]) => hasPublishingBlockCategory(job, categories);
  const sections = [
    `<b>${escapeHtml(applicationNote)}</b>`,
    sectionLimitedHtml("Location", escapeHtml(job.location || "Location required")),
    job.secondaryLocation ? sectionLimitedHtml("Secondary Location", escapeHtml(formatSecondaryLocation(job.secondaryLocation))) : "",
    job.positionType ? sectionLimitedHtml("Job Type", escapeHtml(job.positionType)) : "",
    job.salaryRange ? sectionLimitedHtml("Pay Range", escapeHtml(job.salaryRange)) : "",
    job.workSchedule ? sectionLimitedHtml("Work Schedule", escapeHtml(job.workSchedule)) : "",
    sectionLimitedHtml("About the Role", paragraphLimitedHtml(job.summary || "Add a concise, role-specific job summary.")),
    ...reusableBlocks.map((instance) => {
      const formatting = getInstanceFormatting(instance);
      return sectionLimitedHtml(
        getInstanceTitle(instance),
        blockBodyLimitedHtml({
          value: getInstanceBody(instance),
          bodyFormat: formatting.bodyFormat
        })
      );
    }),
    !hasBlockCategory(["RESPONSIBILITIES"])
      ? sectionLimitedHtml("Key Responsibilities", bulletListLimitedHtml(job.keyResponsibilities))
      : "",
    !hasBlockCategory(["QUALIFICATIONS", "SKILLS"])
      ? sectionLimitedHtml("Qualifications", bulletListLimitedHtml(job.qualificationsText))
      : "",
    !hasBlockCategory(["BENEFITS"]) ? sectionLimitedHtml("Benefits", bulletListLimitedHtml(job.benefitsText)) : "",
    !hasBlockCategory(["LOCATION"])
      ? sectionLimitedHtml(
          "Location",
          paragraphLimitedHtml(
            job.secondaryLocation
              ? `${job.location}. Secondary location: ${job.secondaryLocation}.`
              : job.location || "Add the primary location before publishing."
          )
        )
      : ""
  ];

  return sections.filter(Boolean).join("\n\n");
}

export function buildFormattedJobPostHtml(job: SerializedJobPost) {
  const reusableBlocks = getReusablePublishingBlocks(job);
  const hasBlockCategory = (categories: BlockCategory[]) => hasPublishingBlockCategory(job, categories);
  const candidateSummary = joinPreviewParts([job.salaryRange, job.workSchedule]);
  const secondaryLocation = formatSecondaryLocation(job.secondaryLocation);
  const sections = [
    sectionFormattedHtml("Job Summary", paragraphFormattedHtml(job.summary || "Add a concise, role-specific job summary.")),
    ...reusableBlocks.map((instance) => {
      const formatting = getInstanceFormatting(instance);

      return sectionFormattedHtml(
        getInstanceTitle(instance),
        blockBodyFormattedHtml({
          value: getInstanceBody(instance),
          bodyFormat: formatting.bodyFormat
        })
      );
    }),
    !hasBlockCategory(["RESPONSIBILITIES"])
      ? sectionFormattedHtml("Key Responsibilities", bulletListFormattedHtml(job.keyResponsibilities))
      : "",
    !hasBlockCategory(["QUALIFICATIONS", "SKILLS"])
      ? sectionFormattedHtml("Qualifications", bulletListFormattedHtml(job.qualificationsText))
      : "",
    !hasBlockCategory(["BENEFITS"]) ? sectionFormattedHtml("Benefits", bulletListFormattedHtml(job.benefitsText)) : "",
    !hasBlockCategory(["LOCATION"])
      ? sectionFormattedHtml(
          "Location",
          paragraphFormattedHtml(
            job.secondaryLocation
              ? `${job.location}. Secondary location: ${job.secondaryLocation}.`
              : job.location || "Add the primary location before publishing."
          )
        )
      : ""
  ];

  return `<article style="font-family: Verdana, Geneva, sans-serif; color: ${brandColors.black}; max-width: 820px; line-height: 1.5;">
  <header style="margin: 0; padding: 30px 28px 28px; background: ${brandColors.lea}; color: #ffffff;">
    <p style="display: inline-block; margin: 0 0 16px; padding: 7px 12px; background: rgba(255,255,255,0.10); color: ${brandColors.sweet}; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">SkyShare Careers</p>
    <h1 style="margin: 0; color: #ffffff; font-size: 34px; line-height: 1.12; font-weight: 700;">${escapeHtml(job.title)}</h1>
    <p style="margin: 14px 0 0; color: rgba(255,255,255,0.78); font-size: 16px; font-weight: 700;">${escapeHtml(candidateSummary || "Pay range and schedule pending")}</p>
  </header>
  <div style="margin: 0 0 24px; padding: 16px 20px; background: ${brandColors.cloudDancer}; border: 1px solid rgba(13,44,67,0.12);">
    <table role="presentation" style="width: 100%; border-collapse: collapse; font-size: 15px; color: ${brandColors.lea}; font-weight: 700;">
      <tr>
        <td style="width: 50%; padding: 4px 10px 8px 0;">Location: ${escapeHtml(job.location || "Location required")}</td>
        <td style="width: 50%; padding: 4px 0 8px 10px;">${escapeHtml(secondaryLocation || "Secondary location not listed")}</td>
      </tr>
      <tr>
        <td style="width: 50%; padding: 8px 10px 4px 0;">${escapeHtml(job.positionType || "Position type required")}</td>
        <td style="width: 50%; padding: 8px 0 4px 10px;">Posted: ${escapeHtml(formatDateForDisplay(job.postedDate))}</td>
      </tr>
    </table>
  </div>
  ${sections.filter(Boolean).join("\n")}
</article>`;
}

function paragraphPlainText(value?: string | null) {
  return splitCleanParagraphs(value)
    .map((paragraph) => paragraph.split("\n").map(richTextToPlainText).join("\n"))
    .join("\n\n");
}

function bulletListPlainText(value?: string | null) {
  return splitCleanLines(value)
    .map((line) => `- ${richTextToPlainText(line)}`)
    .join("\n");
}

function mixedPlainText(value?: string | null) {
  return parseBodySegments(value)
    .map((segment) =>
      segment.type === "bullets"
        ? segment.items.map((item) => `- ${richTextToPlainText(item)}`).join("\n")
        : segment.lines.map(richTextToPlainText).join("\n")
    )
    .join("\n");
}

function blockBodyPlainText({
  value,
  bodyFormat
}: {
  value?: string | null;
  bodyFormat: BlockBodyFormat;
}) {
  if (bodyFormat === "MIXED") {
    return mixedPlainText(value);
  }
  if (bodyFormat === "PARAGRAPH") {
    return paragraphPlainText(value);
  }

  return bulletListPlainText(value);
}

export function buildJobPostPlainText(job: SerializedJobPost) {
  const reusableBlocks = getReusablePublishingBlocks(job);
  const hasBlockCategory = (categories: BlockCategory[]) => hasPublishingBlockCategory(job, categories);
  const lines: string[] = [
    applicationNote,
    "",
    job.title,
    joinPreviewParts([job.salaryRange, job.workSchedule]),
    "",
    `Location: ${job.location || "Location required"}`,
    job.secondaryLocation ? `Secondary Location: ${formatSecondaryLocation(job.secondaryLocation)}` : "",
    job.positionType ? `Job Type: ${job.positionType}` : "",
    job.salaryRange ? `Pay Range: ${job.salaryRange}` : "",
    job.workSchedule ? `Work Schedule: ${job.workSchedule}` : "",
    "",
    "ABOUT THE ROLE",
    paragraphPlainText(job.summary || "Add a concise, role-specific job summary.")
  ];

  for (const instance of reusableBlocks) {
    const formatting = getInstanceFormatting(instance);
    const body = blockBodyPlainText({
      value: getInstanceBody(instance),
      bodyFormat: formatting.bodyFormat
    });

    lines.push("", getInstanceTitle(instance).toUpperCase(), body);
  }

  if (!hasBlockCategory(["RESPONSIBILITIES"])) {
    lines.push("", "KEY RESPONSIBILITIES", bulletListPlainText(job.keyResponsibilities));
  }

  if (!hasBlockCategory(["QUALIFICATIONS", "SKILLS"])) {
    lines.push("", "QUALIFICATIONS", bulletListPlainText(job.qualificationsText));
  }

  if (!hasBlockCategory(["BENEFITS"])) {
    lines.push("", "BENEFITS", bulletListPlainText(job.benefitsText));
  }

  if (!hasBlockCategory(["LOCATION"])) {
    lines.push(
      "",
      "LOCATION",
      paragraphPlainText(
        job.secondaryLocation
          ? `${job.location}. Secondary location: ${job.secondaryLocation}.`
          : job.location || "Add the primary location before publishing."
      )
    );
  }

  return lines.filter((line, index, allLines) => line || allLines[index - 1]).join("\n").trim();
}
