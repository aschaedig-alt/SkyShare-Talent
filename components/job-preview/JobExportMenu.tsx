"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Code2, Copy, FileText, Printer } from "lucide-react";
import type { SerializedJobPost } from "@/lib/types";
import { copyFormattedJobPost } from "@/lib/formatting/clipboard";
import {
  buildFormattedJobPostHtml,
  buildJobPostHtml
} from "@/lib/formatting/job-post-code";
import { escapeHtml } from "@/lib/formatting/rich-text";
import { Button } from "@/components/ui";

type ExportStatus = "idle" | "working" | "done" | "error";

type JobExportMenuProps = {
  job: SerializedJobPost;
  align?: "left" | "right";
  onStatusChange?: (message: string, status: ExportStatus) => void;
};

function fullHtmlDocument(job: SerializedJobPost, bodyHtml: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(job.title)}</title>
  <style>
    html, body { background: #ffffff; }
    body {
      margin: 24px;
      font-family: Verdana, Geneva, sans-serif;
      color: #302f31;
    }
    article {
      max-width: 760px !important;
      margin: 0 auto !important;
      line-height: 1.32 !important;
    }
    article header {
      padding: 20px 22px 18px !important;
      margin: 0 !important;
    }
    article header p:first-child {
      margin-bottom: 10px !important;
      padding: 5px 9px !important;
      font-size: 9px !important;
      letter-spacing: 1px !important;
    }
    article header h1 {
      font-size: 25px !important;
      line-height: 1.08 !important;
    }
    article header p:last-child {
      margin-top: 9px !important;
      font-size: 12px !important;
      line-height: 1.25 !important;
    }
    article > div {
      margin-bottom: 14px !important;
      padding: 10px 14px !important;
    }
    article table,
    article table td {
      font-size: 10.5px !important;
      line-height: 1.25 !important;
    }
    article section {
      margin: 0 0 11px !important;
    }
    article h2 {
      margin: 0 0 5px !important;
      font-size: 14px !important;
      line-height: 1.18 !important;
    }
    article p,
    article li,
    article span {
      font-size: 10.5px !important;
      line-height: 1.32 !important;
    }
    article p {
      margin-bottom: 7px !important;
    }
    article ul {
      margin: 0 0 8px 17px !important;
      line-height: 1.3 !important;
    }
    article li {
      margin-bottom: 3px !important;
    }
    @media print {
      @page { margin: 0.35in; }
      body { margin: 0; }
      article { max-width: none !important; border: 0 !important; box-shadow: none !important; }
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function JobExportMenu({ job, align = "right", onStatusChange }: JobExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ state: ExportStatus; message: string }>({
    state: "idle",
    message: "Export"
  });
  const limitedHtml = useMemo(() => buildJobPostHtml(job), [job]);
  const formattedHtml = useMemo(() => buildFormattedJobPostHtml(job), [job]);

  function updateStatus(message: string, state: ExportStatus) {
    setStatus({ message, state });
    onStatusChange?.(message, state);

    if (state === "done" || state === "error") {
      window.setTimeout(() => {
        setStatus({ state: "idle", message: "Export" });
        onStatusChange?.("", "idle");
      }, 2400);
    }
  }

  async function copyBasicHtml() {
    setOpen(false);
    updateStatus("Copying basic HTML...", "working");
    try {
      await navigator.clipboard.writeText(limitedHtml);
      updateStatus("Basic HTML copied.", "done");
    } catch {
      updateStatus("Could not copy basic HTML.", "error");
    }
  }

  async function copyFormattedText() {
    setOpen(false);
    updateStatus("Copying formatted post...", "working");
    try {
      const copyMode = await copyFormattedJobPost(job);
      updateStatus(copyMode === "formatted" ? "Formatted post copied." : "Plain text copied.", "done");
    } catch {
      updateStatus("Could not copy formatted post.", "error");
    }
  }

  function exportPdf() {
    setOpen(false);
    updateStatus("Opening PDF print view...", "working");
    const printWindow = window.open("", "_blank", "width=960,height=1100");

    if (!printWindow) {
      updateStatus("Popup blocked. Allow popups to export PDF.", "error");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(fullHtmlDocument(job, formattedHtml));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      updateStatus("PDF print view opened.", "done");
    }, 350);
  }

  return (
    <div className="relative">
      <Button variant="toolbar" onClick={() => setOpen((current) => !current)}>
        {status.state === "done" ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
        {status.state === "idle" ? "Export" : status.message}
        <ChevronDown className="h-4 w-4" />
      </Button>

      {open && (
        <div
          className={`absolute z-40 mt-2 w-72 overflow-hidden rounded border border-brand-lea/10 bg-white text-brand-lea shadow-xl dark:border-white/10 dark:bg-brand-panel dark:text-slate-100 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <button
            type="button"
            onClick={exportPdf}
            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-brand-cloudDancer/70 dark:bg-white/5"
          >
            <Printer className="mt-0.5 h-4 w-4 text-brand-eden" />
            <span>
              <span className="block text-sm font-bold">Export as PDF</span>
              <span className="mt-0.5 block text-xs leading-5 text-brand-grey dark:text-slate-400">
                Opens a print view so you can save as PDF.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={copyBasicHtml}
            className="flex w-full items-start gap-3 border-t border-brand-lea/8 px-4 py-3 text-left hover:bg-brand-cloudDancer/70 dark:border-white/10 dark:bg-white/5"
          >
            <Code2 className="mt-0.5 h-4 w-4 text-brand-eden" />
            <span>
              <span className="block text-sm font-bold">Copy basic HTML</span>
              <span className="mt-0.5 block text-xs leading-5 text-brand-grey dark:text-slate-400">
                For strict boards that only accept simple code.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={copyFormattedText}
            className="flex w-full items-start gap-3 border-t border-brand-lea/8 px-4 py-3 text-left hover:bg-brand-cloudDancer/70 dark:border-white/10 dark:bg-white/5"
          >
            <Copy className="mt-0.5 h-4 w-4 text-brand-eden" />
            <span>
              <span className="block text-sm font-bold">Copy fully formatted/color text</span>
              <span className="mt-0.5 block text-xs leading-5 text-brand-grey dark:text-slate-400">
                Keeps color, layout, and rich formatting where supported.
              </span>
            </span>
          </button>
          <div className="border-t border-brand-lea/8 bg-brand-cloudDancer/45 px-4 py-2 text-[11px] font-semibold leading-5 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            Plain text fallback is included when formatted clipboard copy is unavailable.
          </div>
        </div>
      )}
    </div>
  );
}
