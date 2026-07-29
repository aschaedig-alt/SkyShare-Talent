"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { MAX_UPLOAD_BYTES, tooLargeMessage } from "@/lib/files/upload-limits";

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

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }
    const files = Array.from(fileList);

    // Check sizes BEFORE sending anything. A body over the serverless cap is
    // rejected by the platform before our handler runs, so the only way the
    // person finds out what went wrong is if we tell them here.
    const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig) {
      setStatus("error");
      setMessage(tooLargeMessage(tooBig.name, tooBig.size));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setStatus("uploading");

    // ONE FILE PER REQUEST. Sending them together added their sizes into a
    // single body and blew the same cap — and made one bad file fail the whole
    // batch. This is the pattern ResumeIntake already uses.
    const failures: string[] = [];
    let uploaded = 0;
    for (const [index, file] of files.entries()) {
      setMessage(files.length === 1 ? `Uploading ${file.name}…` : `Uploading ${index + 1} of ${files.length}…`);
      const formData = new FormData();
      formData.append("files", file);
      try {
        const response = await fetch(`/api/candidates/${candidateId}/files`, {
          method: "POST",
          body: formData
        });
        // A platform-level rejection is not JSON, so parsing it throws and the
        // real reason is lost. Read it defensively and fall back to the status.
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        if (!response.ok) {
          throw new Error(
            payload?.message ??
              (response.status === 413
                ? tooLargeMessage(file.name, file.size)
                : `Upload failed (${response.status}).`)
          );
        }
        uploaded += 1;
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : "upload failed"}`);
      }
    }

    if (failures.length === 0) {
      setStatus("success");
      setMessage(`Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}.`);
    } else {
      setStatus("error");
      // Say what DID work as well as what did not, so a partial batch is clear.
      setMessage(
        (uploaded > 0 ? `Uploaded ${uploaded}. ` : "") + failures.join(" · ")
      );
    }
    if (uploaded > 0) router.refresh();
    if (inputRef.current) {
      inputRef.current.value = "";
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
              ? "max-w-xs text-xs font-medium text-red-700 dark:text-red-300"
              : "max-w-xs text-xs font-medium text-brand-grey dark:text-slate-400"
          }
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
