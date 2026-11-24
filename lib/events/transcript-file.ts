import { strFromU8, unzipSync } from "fflate";

// Turn an uploaded meeting transcript into plain text, in the browser, before it
// is sent anywhere. Covers what meeting tools actually export: plain text and
// Markdown, Zoom/Teams/Meet captions (.vtt, .srt), and Word (.docx).
//
// .docx is a zip; the words are in word/document.xml. Paragraph and line breaks
// become newlines and every other tag is dropped — good enough for a transcript,
// which is just lines of speech.

export const TRANSCRIPT_FILE_ACCEPT = ".txt,.md,.vtt,.srt,.docx,text/plain,text/vtt";

/** 5 MB of transcript is many hours of speech; anything bigger is the wrong file. */
export const MAX_TRANSCRIPT_FILE_BYTES = 5 * 1024 * 1024;

function decodeEntities(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function docxToText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (file) => file.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("That Word file has no document text in it.");
  return decodeEntities(
    strFromU8(xml)
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Caption files: drop the header, cue numbers and timestamp lines; keep the words. */
function captionsToText(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^WEBVTT/i.test(t) || /^NOTE\b/.test(t)) return false;
      if (/^\d+$/.test(t)) return false;
      if (/-->/.test(t)) return false;
      return true;
    })
    .map((line) => line.replace(/<v\s+([^>]+)>/g, "$1: ").replace(/<\/?[^>]+>/g, ""))
    .join("\n");
}

export async function readTranscriptFile(file: File): Promise<string> {
  if (file.size > MAX_TRANSCRIPT_FILE_BYTES) {
    throw new Error("That file is over 5 MB. A transcript should be much smaller. Is it the right file?");
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    return docxToText(new Uint8Array(await file.arrayBuffer()));
  }
  if (name.endsWith(".doc") || name.endsWith(".pdf")) {
    throw new Error("Save it as .docx or .txt first, or copy the text and paste it in.");
  }
  const text = await file.text();
  if (name.endsWith(".vtt") || name.endsWith(".srt")) return captionsToText(text);
  return text;
}
