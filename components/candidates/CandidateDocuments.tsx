"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  FileWarning
} from "lucide-react";
import { clsx } from "clsx";

export type CandidateFileItem = {
  id: string;
  originalFilename: string;
  displayFilename: string;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  source: string | null;
  uploadedAt: string;
};

type CandidateDocumentsProps = {
  candidateId: string;
  files: CandidateFileItem[];
};

const UPLOAD_ACCEPT = ".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff";

function isPdf(file: CandidateFileItem) {
  return (file.mimeType ?? "").includes("pdf") || file.displayFilename.toLowerCase().endsWith(".pdf");
}

function isImage(file: CandidateFileItem) {
  return (file.mimeType ?? "").startsWith("image/");
}

function fileIcon(file: CandidateFileItem) {
  const name = file.displayFilename.toLowerCase();
  if (name.includes("pilot") || name.includes("application") || name.includes("app")) return Plane;
  if (name.includes("resume") || name.includes("cv")) return FileText;
  if (name.includes("medical") || name.includes("cert")) return FileCheck2;
  return FileText;
}

function formatBytes(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function CandidateDocuments({ candidateId, files }: CandidateDocumentsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeId, setActiveId] = useState<string | null>(files[0]?.id ?? null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a valid active tab when the file list changes (after add/delete refresh)
  useEffect(() => {
    if (files.length === 0) {
      setActiveId(null);
    } else if (!files.some((f) => f.id === activeId)) {
      setActiveId(files[0].id);
    }
  }, [files, activeId]);

  const activeFile = files.find((f) => f.id === activeId) ?? files[0] ?? null;

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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Rename failed.");
      }
      setRenamingId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidate-files/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Delete failed.");
      }
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Upload failed.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-xl bg-white shadow-panel ring-1 ring-brand-lea/10">
      {/* Hidden upload input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        onChange={(e) => handleUpload(e.currentTarget.files)}
      />

      {/* Tab strip */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-brand-lea/10 px-2 py-1.5">
        {files.map((file) => {
          const Icon = fileIcon(file);
          const active = file.id === activeFile?.id;
          return (
            <button
              key={file.id}
              onClick={() => setActiveId(file.id)}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                active ? "bg-brand-lea text-white" : "text-brand-grey hover:bg-brand-cloudDancer/40 hover:text-brand-lea"
              )}
              title={file.displayFilename}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="max-w-[160px] truncate">{file.displayFilename}</span>
            </button>
          );
        })}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-brand-lea/30 px-3 py-2 text-sm font-medium text-brand-grey transition hover:border-brand-gold hover:text-brand-lea disabled:opacity-60"
        >
          {uploading ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Add"}
        </button>
      </div>

      {error && (
        <div className="mx-3 mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {!activeFile ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <FileText className="h-10 w-10 text-brand-grey/50" />
          <p className="font-semibold text-brand-lea">No documents yet</p>
          <p className="max-w-sm text-sm text-brand-grey">
            Add a resume, pilot app, or other PDF. It will preview right here — no need to open a new tab.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-1 rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white hover:bg-brand-eden"
          >
            Upload document
          </button>
        </div>
      ) : (
        <>
          {/* Toolbar for the active doc */}
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
                <button onClick={() => handleRename(activeFile.id)} disabled={busy} className="rounded p-1 text-emerald-700 hover:bg-emerald-50" aria-label="Save name">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setRenamingId(null)} className="rounded p-1 text-brand-grey hover:bg-brand-cloudDancer/40" aria-label="Cancel rename">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <span className="flex-1 truncate text-sm font-medium text-brand-lea">{activeFile.displayFilename}</span>
                {activeFile.sizeBytes ? (
                  <span className="text-xs text-brand-grey">{formatBytes(activeFile.sizeBytes)}</span>
                ) : null}
                <button
                  onClick={() => {
                    setRenamingId(activeFile.id);
                    setRenameValue(activeFile.displayFilename);
                  }}
                  className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/40 hover:text-brand-lea"
                  aria-label="Rename"
                  title="Rename"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {activeFile.storageKey && (
                  <a
                    href={`/api/candidate-files/${activeFile.id}`}
                    download
                    className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/40 hover:text-brand-lea"
                    aria-label="Download"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => setConfirmDeleteId(activeFile.id)}
                  className="rounded p-1.5 text-red-600 transition hover:bg-red-50"
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Delete confirm bar */}
          {confirmDeleteId === activeFile.id && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <span>Remove “{activeFile.displayFilename}” from this candidate?</span>
              <div className="flex gap-2">
                <button onClick={() => handleDelete(activeFile.id)} disabled={busy} className="flex items-center gap-1 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {busy ? <Loader className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
                </button>
                <button onClick={() => setConfirmDeleteId(null)} className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="bg-brand-cloudDancer/30 p-3">
            {!activeFile.storageKey ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-brand-lea/10 bg-white py-16 text-center">
                <FileWarning className="h-8 w-8 text-brand-grey/50" />
                <p className="font-semibold text-brand-lea">File content not stored</p>
                <p className="text-sm text-brand-grey">This record has metadata only — re-upload the file to preview it.</p>
              </div>
            ) : isPdf(activeFile) ? (
              <iframe
                key={activeFile.id}
                src={`/api/candidate-files/${activeFile.id}#view=FitH`}
                title={activeFile.displayFilename}
                className="h-[640px] w-full rounded-lg border border-brand-lea/10 bg-white"
              />
            ) : isImage(activeFile) ? (
              <div className="flex justify-center rounded-lg border border-brand-lea/10 bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/candidate-files/${activeFile.id}`}
                  alt={activeFile.displayFilename}
                  className="max-h-[620px] w-auto rounded"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-brand-lea/10 bg-white py-16 text-center">
                <FileText className="h-8 w-8 text-brand-grey/50" />
                <p className="font-semibold text-brand-lea">Inline preview not available</p>
                <p className="max-w-sm text-sm text-brand-grey">
                  {activeFile.displayFilename} can&apos;t be previewed in the browser. Download it to view.
                </p>
                <a
                  href={`/api/candidate-files/${activeFile.id}`}
                  download
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-lea px-4 py-2 text-sm font-semibold text-white hover:bg-brand-eden"
                >
                  <Download className="h-4 w-4" /> Download
                </a>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
