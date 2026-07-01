"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { ChevronUp, ChevronDown, Loader, AlertTriangle } from "lucide-react";

// Worker must match the bundled pdfjs version exactly.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type PdfViewerProps = {
  fileUrl: string;
  searchTerm?: string;
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function PdfViewer({ fileUrl, searchTerm }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(680);
  const [error, setError] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [activeMatch, setActiveMatch] = useState(0);

  const term = (searchTerm ?? "").trim();

  // Measure container width so pages render to fit.
  useEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      const w = containerRef.current?.clientWidth ?? 680;
      setWidth(Math.max(320, w - 24));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Highlight matches inside the text layer.
  const textRenderer = useCallback(
    (textItem: { str: string }) => {
      if (!term) return textItem.str;
      const re = new RegExp(escapeRegExp(term), "gi");
      return textItem.str.replace(re, (m) => `<mark class="pdf-hl">${m}</mark>`);
    },
    [term]
  );

  // Scroll a match into view WITHIN the document pane only (never scrolls the page).
  const scrollToMark = useCallback((mark: HTMLElement) => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const mRect = mark.getBoundingClientRect();
    const delta = mRect.top - cRect.top - cRect.height / 2 + mRect.height / 2;
    container.scrollBy({ top: delta, behavior: "smooth" });
  }, []);

  // Recompute match list whenever the term changes (after layers render).
  const refreshMatches = useCallback(() => {
    const marks = containerRef.current?.querySelectorAll<HTMLElement>("mark.pdf-hl") ?? [];
    setMatchCount(marks.length);
    return marks;
  }, []);

  useEffect(() => {
    setActiveMatch(0);
    if (!term) {
      setMatchCount(0);
      return;
    }
    const t = setTimeout(() => {
      const marks = refreshMatches();
      if (marks.length > 0) {
        marks.forEach((m, i) => m.classList.toggle("pdf-hl-active", i === 0));
        scrollToMark(marks[0]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [term, numPages, refreshMatches, scrollToMark]);

  function goToMatch(next: number) {
    const marks = containerRef.current?.querySelectorAll<HTMLElement>("mark.pdf-hl");
    if (!marks || marks.length === 0) return;
    const idx = ((next % marks.length) + marks.length) % marks.length;
    marks.forEach((m, i) => m.classList.toggle("pdf-hl-active", i === idx));
    scrollToMark(marks[idx]);
    setActiveMatch(idx);
  }

  if (error) {
    // Fallback to the browser's native viewer if PDF.js fails to load.
    return (
      <div className="rounded border border-brand-lea/10 bg-white dark:border-white/10 dark:bg-brand-panel">
        <div className="flex items-center gap-2 border-b border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Highlight viewer unavailable — showing the standard preview.
        </div>
        <iframe src={`${fileUrl}#zoom=100`} title="PDF preview" className="h-[1000px] w-full rounded-b bg-white dark:bg-brand-panel" />
      </div>
    );
  }

  return (
    <div className="rounded border border-brand-lea/10 bg-white dark:border-white/10 dark:bg-brand-panel">
      {/* Search match navigation (sticky so the arrows stay visible while scrolling) */}
      {term ? (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-brand-lea/10 bg-brand-cloudDancer px-3 py-1.5 text-xs text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          <span>
            {matchCount > 0 ? (
              <>
                <span className="font-semibold text-brand-lea dark:text-slate-100">{activeMatch + 1}</span> of{" "}
                <span className="font-semibold text-brand-lea dark:text-slate-100">{matchCount}</span> matches for “{term}”
              </>
            ) : (
              <>No matches for “{term}” in this document</>
            )}
          </span>
          {matchCount > 0 && (
            <span className="flex items-center gap-1">
              <button onClick={() => goToMatch(activeMatch - 1)} className="rounded p-1 hover:bg-white dark:bg-brand-panel" aria-label="Previous match">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button onClick={() => goToMatch(activeMatch + 1)} className="rounded p-1 hover:bg-white dark:bg-brand-panel" aria-label="Next match">
                <ChevronDown className="h-4 w-4" />
              </button>
            </span>
          )}
        </div>
      ) : null}

      <div ref={containerRef} className="h-[74vh] overflow-y-auto px-3 py-3">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={() => setError(true)}
          loading={
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-brand-grey dark:text-slate-400">
              <Loader className="h-5 w-5 animate-spin" /> Loading document…
            </div>
          }
          error={<div className="py-20 text-center text-sm text-brand-grey dark:text-slate-400">Could not load this document.</div>}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div key={i} className="mx-auto mb-3 w-fit shadow-sm">
              <Page
                pageNumber={i + 1}
                width={width}
                customTextRenderer={textRenderer}
                renderAnnotationLayer={false}
              />
            </div>
          ))}
        </Document>
      </div>

      <style>{`
        mark.pdf-hl { background: rgba(250,199,117,0.55); color: inherit; border-radius: 2px; }
        mark.pdf-hl-active { background: rgba(239,159,39,0.85); }
      `}</style>
    </div>
  );
}
