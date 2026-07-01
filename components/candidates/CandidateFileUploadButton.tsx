"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";

type CandidateFileUploadButtonProps = {
  candidateId: string;
};

const acceptTypes = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".gif",
  ".webp",
  ".tif",
  ".tiff",
  ".bmp",
  ".html",
  ".htm",
  ".doc",
  ".docx",
  ".txt",
  ".rtf",
  ".csv",
  ".xls",
  ".xlsx"
].join(",");

export function CandidateFileUploadButton({ candidateId }: CandidateFileUploadButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setStatus("uploading");
    setMessage(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}...`);

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    try {
      const response = await fetch(`/api/candidates/${candidateId}/files`, {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to upload file.");
      }

      setStatus("success");
      setMessage(payload.message ?? "Upload complete.");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to upload file.");
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptTypes}
        className="sr-only"
        onChange={(event) => uploadFiles(event.currentTarget.files)}
      />
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={status === "uploading"}
        className="shadow-sm disabled:cursor-wait"
      >
        {status === "uploading" ? "Uploading..." : "Upload file"}
      </Button>
      {message ? (
        <div
          role={status === "error" ? "alert" : "status"}
          aria-live={status === "error" ? undefined : "polite"}
          className={
            status === "error"
              ? "max-w-xs text-xs font-medium text-red-700"
              : "max-w-xs text-xs font-medium text-brand-grey dark:text-slate-400"
          }
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
