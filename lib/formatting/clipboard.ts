import type { SerializedJobPost } from "@/lib/types";
import { buildFormattedJobPostHtml, buildJobPostPlainText } from "@/lib/formatting/job-post-code";

export type ClipboardCopyMode = "formatted" | "plain";

export async function copyFormattedJobPost(job: SerializedJobPost): Promise<ClipboardCopyMode> {
  const html = buildFormattedJobPostHtml(job);
  const plainText = buildJobPostPlainText(job);

  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plainText], { type: "text/plain" })
      })
    ]);

    return "formatted";
  }

  await navigator.clipboard.writeText(plainText);
  return "plain";
}

