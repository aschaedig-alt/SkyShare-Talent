"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  FileText,
  Plane,
  FileCheck2,
  Pencil,
  Trash2,
  Download,
  Plus,
  Loader,
  Check,
  X,
  Search,
  Link2,
  FileWarning
} from "lucide-react";
import { clsx } from "clsx";
import { DOCUMENT_TYPES, detectDocumentType, isExpirableType } from "@/lib/files/document-types";

function effectiveType(file: { documentType: string | null; displayFilename: string }): string {
  return file.documentType || detectDocumentType(file.displayFilename);
}

// PDF.js highlight viewer — client-only, loaded on demand (used during search).
const PdfViewer = dynamic(() => import("@/components/candidates/PdfViewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => <div className="py-20 text-center text-sm text-brand-grey">Loading highlight viewer…</div>
});

export type CandidateFileItem = {
  id: string;
  originalFilename: string;
  displayFilename: string;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  source: string | null;
  documentType: string | null;
  expiresAt: string | null;
  uploadedAt: string;
  extractedText: string | null;
};

type CandidateDocumentsProps = {
  candidateId: string;
  files: CandidateFileItem[];
};

type Layout = "single" | "compare";

const UPLOAD_ACCEPT = ".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff";

function isPdf(file: CandidateFileItem) {
  return (file.mimeType ?? "").includes("pdf") || file.displayFilename.toLowerCase().endsWith(".pdf");
}
function isImage(file: CandidateFileItem) {
  return (file.mimeType ?? "").startsWith("image/");
}
function fileIcon(file: CandidateFileItem) {
  const name = file.displayFilename.toLowerCase();
  if (name.includes("pilot") || name.includes("application")) return Plane;
  if (name.includes("resume") || name.includes("cv")) return FileText;
  if (name.includes("medical") || name.includes("cert")) return FileCheck2;
  return FileText;
}
function formatBytes(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function findResume(files: CandidateFileItem[]) {
  return files.find((f) => /resume|cv/i.test(f.displayFilename)) ?? files[0] ?? null;
}
function findPilotApp(files: CandidateFileItem[], excludeId?: string) {
  return (
    files.find((f) => f.id !== excludeId && /pilot|application/i.test(f.displayFilename)) ??
    files.find((f) => f.id !== excludeId) ??
    null
  );
}

/** Inner preview surface for a single file (used by both single and compare layouts). */
function FilePreview({ file, mode, searchTerm }: { file: CandidateFileItem; mode: "actual" | "fit"; searchTerm?: string }) {
  if (!file.storageKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-brand-lea/10 bg-white py-16 text-center">
        <FileWarning className="h-8 w-8 text-brand-grey/50" />
        <p className="font-semibold text-brand-lea">File content not stored</p>
        <p className="text-sm text-brand-grey">Metadata only — re-upload to preview.</p>
      </div>
    );
  }
  if (isPdf(file)) {
    // Searching → use the PDF.js highlight viewer; otherwise the fast native viewer.
    if (searchTerm && searchTerm.trim()) {
      return <PdfViewer key={file.id} fileUrl={`/api/candidate-files/${file.id}`} searchTerm={searchTerm} />;
    }
    const hash = mode === "actual" ? "#zoom=100" : "#view=FitH";
    const heightClass = mode === "actual" ? "h-[1120px]" : "h-[760px]";
    return (
      <iframe
        key={file.id}
        src={`/api/candidate-files/${file.id}${hash}`}
        title={file.displayFilename}
        className={clsx("w-full rounded-lg border border-brand-lea/10 bg-white", heightClass)}
      />
    );
  }
  if (isImage(file)) {
    return (
      <div className="flex justify-center rounded-lg border border-brand-lea/10 bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/candidate-files/${file.id}`} alt={file.displayFilename} className="max-h-[82vh] w-auto rounded" />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-brand-lea/10 bg-white py-16 text-center">
      <FileText className="h-8 w-8 text-brand-grey/50" />
      <p className="font-semibold text-brand-lea">Inline preview not available</p>
      <p className="max-w-sm text-sm text-brand-grey">{file.displayFilename} can&apos;t preview in the browser.</p>
      <a href={`/api/candidate-files/${file.id}`} download className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white hover:bg-brand-eden">
        <Download className="h-4 w-4" /> Download
      </a>
    </div>
  );
}

export function CandidateDocuments({ candidateId, files }: CandidateDocumentsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [layout, setLayout] = useState<Layout>("single");
  const [activeId, setActiveId] = useState<string | null>(() => findResume(files)?.id ?? null);
  const [leftId, setLeftId] = useState<string | null>(() => findResume(files)?.id ?? null);
  const [rightId, setRightId] = useState<string | null>(() => {
    const resume = findResume(files);
    return findPilotApp(files, resume?.id)?.id ?? null;
  });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [showLink, setShowLink] = useState(false);
  const [unassigned, setUnassigned] = useState<Array<{ id: string; displayFilename: string; uploadedAt: string }>>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const trimmedSearch = docSearch.trim();
  const matchingIds = useMemo(() => {
    if (!trimmedSearch) return new Set<string>();
    const q = trimmedSearch.toLowerCase();
    return new Set(files.filter((f) => f.extractedText?.toLowerCase().includes(q)).map((f) => f.id));
  }, [files, trimmedSearch]);

  // When searching, jump to the first document that contains the term.
  useEffect(() => {
    if (trimmedSearch && matchingIds.size > 0 && activeId && !matchingIds.has(activeId)) {
      const first = files.find((f) => matchingIds.has(f.id));
      if (first) setActiveId(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedSearch, matchingIds]);

  // Keep selections valid (default to resume) when the file list changes.
  useEffect(() => {
    const resume = findResume(files);
    if (files.length === 0) {
      setActiveId(null);
    } else if (!files.some((f) => f.id === activeId)) {
      setActiveId(resume?.id ?? files[0].id);
    }
    if (!files.some((f) => f.id === leftId)) setLeftId(resume?.id ?? files[0]?.id ?? null);
    if (rightId && !files.some((f) => f.id === rightId)) setRightId(findPilotApp(files, resume?.id)?.id ?? null);
  }, [files, activeId, leftId, rightId]);

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of files) {
      const t = effectiveType(f);
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [files]);
  const presentTypes = DOCUMENT_TYPES.filter((t) => typeCounts.has(t));
  const filteredFiles = typeFilter === "All" ? files : files.filter((f) => effectiveType(f) === typeFilter);

  // Keep the open document inside the active filter.
  useEffect(() => {
    if (typeFilter !== "All" && filteredFiles.length > 0 && !filteredFiles.some((f) => f.id === activeId)) {
      setActiveId(filteredFiles[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  const activeFile = files.find((f) => f.id === activeId) ?? files[0] ?? null;
  const leftFile = files.find((f) => f.id === leftId) ?? null;
  const rightFile = files.find((f) => f.id === rightId) ?? null;

  async function handleRename(id: string) {
    const name = renameValue.trim();
    if (name.length < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidate-files/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayFilename: name })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Rename failed.");
      setRenamingId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetType(id: string, documentType: string) {
    setError(null);
    try {
      const res = await fetch(`/api/candidate-files/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Could not set type.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set type.");
    }
  }

  async function handleSetExpiry(id: string, value: string) {
    setError(null);
    try {
      const res = await fetch(`/api/candidate-files/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: value || null })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Could not set expiry.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set expiry.");
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidate-files/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Delete failed.");
      setConfirmDeleteId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    Array.from(fileList).forEach((f) => formData.append("files", f));
    try {
      const res = await fetch(`/api/candidates/${candidateId}/files`, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Upload failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openLink() {
    setShowLink(true);
    setLinkLoading(true);
    try {
      const res = await fetch("/api/candidate-files/unassigned");
      const data = await res.json();
      setUnassigned(data.files ?? []);
    } catch {
      setUnassigned([]);
    } finally {
      setLinkLoading(false);
    }
  }

  async function linkFile(fileId: string) {
    setLinkingId(fileId);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/files/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? "Could not attach file.");
      setShowLink(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach file.");
    } finally {
      setLinkingId(null);
    }
  }

  const canCompare = files.length >= 2;
  const effectiveLayout: Layout = trimmedSearch ? "single" : layout;

  return (
    <section className="rounded-xl bg-white shadow-panel ring-1 ring-brand-lea/10">
      <input ref={fileInputRef} type="file" multiple accept={UPLOAD_ACCEPT} className="sr-only" onChange={(e) => handleUpload(e.currentTarget.files)} />

      {/* In-document search */}
      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-lea/10 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-brand-lea/20 px-2.5 py-1.5">
            <Search className="h-4 w-4 shrink-0 text-brand-grey" />
            <input
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="Search inside this candidate's documents…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {docSearch && (
              <button onClick={() => setDocSearch("")} className="text-brand-grey hover:text-brand-lea" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {trimmedSearch && (
            <span className="text-xs text-brand-grey">
              {matchingIds.size > 0 ? (
                <>Found in <span className="font-semibold text-brand-lea">{matchingIds.size}</span> document{matchingIds.size === 1 ? "" : "s"}</>
              ) : (
                <>No documents contain “{trimmedSearch}”</>
              )}
            </span>
          )}
        </div>
      )}

      {/* Type filter chips */}
      {files.length > 0 && presentTypes.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-brand-lea/10 px-3 py-2">
          <button
            onClick={() => setTypeFilter("All")}
            className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold transition", typeFilter === "All" ? "bg-brand-lea text-white" : "bg-brand-cloudDancer/60 text-brand-grey hover:text-brand-lea")}
          >
            All <span className="opacity-70">{files.length}</span>
          </button>
          {presentTypes.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold transition", typeFilter === t ? "bg-brand-lea text-white" : "bg-brand-cloudDancer/60 text-brand-grey hover:text-brand-lea")}
            >
              {t} <span className="opacity-70">{typeCounts.get(t)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tab strip + layout toggle (only when there are documents) */}
      {files.length > 0 && (
      <div className="flex items-center gap-2 border-b border-brand-lea/10 px-2 py-1.5">
        <div className="flex items-center gap-1 overflow-x-auto">
          {filteredFiles.map((file) => {
            const Icon = fileIcon(file);
            const active = effectiveLayout === "single" && file.id === activeFile?.id;
            const isMatch = matchingIds.has(file.id);
            return (
              <button
                key={file.id}
                onClick={() => {
                  setLayout("single");
                  setActiveId(file.id);
                }}
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "bg-brand-lea text-white" : "text-brand-grey hover:bg-brand-cloudDancer/40 hover:text-brand-lea"
                )}
                title={file.displayFilename}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="max-w-[150px] truncate">{file.displayFilename}</span>
                {isMatch && <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-white" : "bg-brand-gold")} />}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {canCompare && (
            <div className="flex items-center rounded-lg border border-brand-lea/15 p-0.5">
              <button
                onClick={() => setLayout("single")}
                className={clsx("rounded px-2.5 py-1 text-xs font-semibold transition", layout === "single" ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea")}
              >
                Single
              </button>
              <button
                onClick={() => setLayout("compare")}
                className={clsx("rounded px-2.5 py-1 text-xs font-semibold transition", layout === "compare" ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea")}
              >
                Side by side
              </button>
            </div>
          )}
          <button
            onClick={openLink}
            className="flex items-center gap-1.5 rounded-lg border border-brand-lea/20 px-3 py-2 text-sm font-medium text-brand-grey transition hover:text-brand-lea"
            title="Attach a file that was uploaded via Imports"
          >
            <Link2 className="h-4 w-4" /> Link
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand-lea/30 px-3 py-2 text-sm font-medium text-brand-grey transition hover:border-brand-gold hover:text-brand-lea disabled:opacity-60"
          >
            {uploading ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Add"}
          </button>
        </div>
      </div>
      )}

      {error && <div className="mx-3 mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      {/* Link an unassigned (Imports-uploaded) file */}
      {showLink && (
        <div className="m-3 rounded-lg border border-brand-lea/15 bg-brand-cloudDancer/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-lea">Attach a file uploaded via Imports</span>
            <button onClick={() => setShowLink(false)} className="text-brand-grey hover:text-brand-lea" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {linkLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-brand-grey"><Loader className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : unassigned.length === 0 ? (
            <p className="py-3 text-xs text-brand-grey">No unassigned uploaded files. Files uploaded here attach automatically.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {unassigned.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded border border-brand-lea/10 bg-white px-2.5 py-1.5">
                  <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-800">PDF</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-brand-lea">{f.displayFilename}</span>
                  <button
                    onClick={() => linkFile(f.id)}
                    disabled={linkingId === f.id}
                    className="flex items-center gap-1 rounded bg-brand-lea px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-eden disabled:opacity-60"
                  >
                    {linkingId === f.id ? <Loader className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />} Attach
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!activeFile ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <FileText className="h-10 w-10 text-brand-grey/50" />
          <p className="font-semibold text-brand-lea">No documents yet</p>
          <p className="max-w-sm text-sm text-brand-grey">Add a resume, pilot app, or other PDF — it previews right here.</p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white hover:bg-brand-eden">
              Upload document
            </button>
            <button onClick={openLink} className="flex items-center gap-1.5 rounded-lg border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea hover:bg-brand-cloudDancer/40">
              <Link2 className="h-4 w-4" /> Link an uploaded file
            </button>
          </div>
        </div>
      ) : effectiveLayout === "compare" ? (
        /* Side-by-side compare */
        <div className="grid gap-3 p-3 lg:grid-cols-2">
          {[
            { file: leftFile, set: setLeftId, fallback: "Left document" },
            { file: rightFile, set: setRightId, fallback: "Right document" }
          ].map((pane, idx) => (
            <div key={idx} className="rounded-lg border border-brand-lea/10">
              <div className="flex items-center gap-2 border-b border-brand-lea/10 px-2 py-2">
                <select
                  value={pane.file?.id ?? ""}
                  onChange={(e) => pane.set(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-brand-lea/20 bg-white px-2 py-1 text-sm font-medium text-brand-lea"
                >
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.displayFilename}
                    </option>
                  ))}
                </select>
                {pane.file?.storageKey && (
                  <a href={`/api/candidate-files/${pane.file.id}`} download className="rounded p-1.5 text-brand-grey hover:bg-brand-cloudDancer/40 hover:text-brand-lea" aria-label="Download">
                    <Download className="h-4 w-4" />
                  </a>
                )}
              </div>
              <div className="bg-brand-cloudDancer/30 p-2">
                {pane.file ? <FilePreview file={pane.file} mode="fit" /> : <div className="py-16 text-center text-sm text-brand-grey">{pane.fallback}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Single focus view */
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-brand-lea/10 px-4 py-2.5">
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
              {isPdf(activeFile) ? "PDF" : (activeFile.mimeType?.split("/")[1] ?? "FILE").toUpperCase().slice(0, 4)}
            </span>
            {renamingId === activeFile.id ? (
              <div className="flex flex-1 items-center gap-1">
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(activeFile.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-brand-lea/30 px-2 py-1 text-sm focus:border-brand-gold focus:outline-none"
                />
                <button onClick={() => handleRename(activeFile.id)} disabled={busy} className="rounded p-1 text-emerald-700 hover:bg-emerald-50" aria-label="Save name"><Check className="h-4 w-4" /></button>
                <button onClick={() => setRenamingId(null)} className="rounded p-1 text-brand-grey hover:bg-brand-cloudDancer/40" aria-label="Cancel"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <>
                <span className="flex-1 truncate text-sm font-medium text-brand-lea">{activeFile.displayFilename}</span>
                {activeFile.sizeBytes ? <span className="text-xs text-brand-grey">{formatBytes(activeFile.sizeBytes)}</span> : null}
                <select
                  value={activeFile.documentType ?? ""}
                  onChange={(e) => handleSetType(activeFile.id, e.target.value)}
                  className="rounded border border-brand-lea/20 bg-white px-2 py-1 text-xs font-semibold text-brand-lea outline-none transition focus:border-brand-gold"
                  title="Document type"
                  aria-label="Document type"
                >
                  <option value="" disabled>Set type…</option>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {isExpirableType(effectiveType(activeFile)) && (
                  <label className="flex items-center gap-1 text-[11px] text-brand-grey" title="Expiry date">
                    <span className="hidden sm:inline">Exp</span>
                    <input
                      type="date"
                      value={activeFile.expiresAt ? activeFile.expiresAt.slice(0, 10) : ""}
                      onChange={(e) => handleSetExpiry(activeFile.id, e.target.value)}
                      className="rounded border border-brand-lea/20 bg-white px-1.5 py-1 text-xs text-brand-lea outline-none focus:border-brand-gold"
                    />
                  </label>
                )}
                <button onClick={() => { setRenamingId(activeFile.id); setRenameValue(activeFile.displayFilename); }} className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/40 hover:text-brand-lea" aria-label="Rename" title="Rename"><Pencil className="h-4 w-4" /></button>
                {activeFile.storageKey && (
                  <a href={`/api/candidate-files/${activeFile.id}`} download className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/40 hover:text-brand-lea" aria-label="Download" title="Download"><Download className="h-4 w-4" /></a>
                )}
                <button onClick={() => setConfirmDeleteId(activeFile.id)} className="rounded p-1.5 text-red-600 transition hover:bg-red-50" aria-label="Delete" title="Delete"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </div>

          {confirmDeleteId === activeFile.id && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <span>Remove “{activeFile.displayFilename}” from this candidate?</span>
              <div className="flex gap-2">
                <button onClick={() => handleDelete(activeFile.id)} disabled={busy} className="flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {busy ? <Loader className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
                </button>
                <button onClick={() => setConfirmDeleteId(null)} className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-brand-cloudDancer/30 p-3">
            <FilePreview file={activeFile} mode="actual" searchTerm={trimmedSearch} />
          </div>
        </>
      )}
    </section>
  );
}
