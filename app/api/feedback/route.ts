import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, requireApiPermission } from "@/lib/auth/route-auth";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { sanitizeFilename } from "@/lib/files/candidate-file-storage";
import {
  createFeedbackStorageKey,
  isSupportedFeedbackImage,
  MAX_FEEDBACK_IMAGE_BYTES
} from "@/lib/files/feedback-file-storage";

const VALID_TYPES = ["IDEA", "BUG", "QUESTION"];

type SubmittedFeedback = {
  type: string;
  message: string;
  page: string | null;
  contextJson: string | null;
};

function isFileLike(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}

// Browser-supplied context (full URL, viewport, browser, theme, recent errors).
// Stored as-is but size-capped; never trusted for anything but display.
function packContext(context: unknown): string | null {
  if (!context || typeof context !== "object") return null;
  const serialized = JSON.stringify(context);
  return serialized.length <= 4000 ? serialized : serialized.slice(0, 4000);
}

function normalize(raw: { type?: unknown; message?: unknown; page?: unknown; context?: unknown }): SubmittedFeedback {
  return {
    type: VALID_TYPES.includes(String(raw.type ?? "")) ? String(raw.type) : "IDEA",
    message: String(raw.message ?? "").trim(),
    page: typeof raw.page === "string" ? raw.page.slice(0, 300) : null,
    contextJson: packContext(raw.context)
  };
}

// Submit feedback — any authenticated user.
// Accepts multipart/form-data (when a screenshot is attached) or JSON (no image).
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  try {
    const isMultipart = (request.headers.get("content-type") ?? "").includes("multipart/form-data");

    let submitted: SubmittedFeedback;
    let image: File | null = null;

    if (isMultipart) {
      const form = await request.formData();
      const rawContext = form.get("context");
      submitted = normalize({
        type: form.get("type"),
        message: form.get("message"),
        page: form.get("page"),
        // In a form post the context arrives as a JSON string, not an object.
        context: typeof rawContext === "string" && rawContext ? safeParse(rawContext) : null
      });
      const candidate = form.get("image");
      image = isFileLike(candidate) && candidate.size > 0 ? candidate : null;
    } else {
      submitted = normalize(await request.json());
    }

    if (submitted.message.length < 2) {
      return NextResponse.json({ message: "Please enter a bit more detail." }, { status: 400 });
    }
    if (submitted.message.length > 5000) {
      return NextResponse.json({ message: "Feedback is too long." }, { status: 400 });
    }

    // Validate the image BEFORE saving anything, so a bad file is a clean, fixable
    // error rather than a half-saved report.
    if (image) {
      const filename = sanitizeFilename(image.name || "screenshot.png");
      if (!isSupportedFeedbackImage(filename, image.type || null)) {
        return NextResponse.json(
          { message: "Attach a PNG, JPG, GIF or WEBP image." },
          { status: 400 }
        );
      }
      if (image.size > MAX_FEEDBACK_IMAGE_BYTES) {
        return NextResponse.json({ message: "That image is larger than the 10 MB limit." }, { status: 400 });
      }
    }

    const feedback = await prisma.feedback.create({
      data: {
        type: submitted.type,
        message: submitted.message,
        page: submitted.page,
        contextJson: submitted.contextJson,
        userId: auth.user.id,
        userEmail: auth.user.email,
        userName: auth.user.name ?? null
      },
      select: { id: true }
    });

    // The report is now safe. Attach the screenshot as a SEPARATE step so that a
    // storage failure costs the picture, never the words — losing what someone
    // took the trouble to write is the worse outcome by far.
    let imageWarning: string | null = null;
    if (image) {
      try {
        const storage = getFileStorageAdapter();
        if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
          throw new Error("Private file storage is not configured for this environment.");
        }
        const filename = sanitizeFilename(image.name || "screenshot.png");
        const storageKey = createFeedbackStorageKey(feedback.id, filename);
        await storage.write({
          storageKey,
          bytes: Buffer.from(await image.arrayBuffer()),
          contentType: image.type || null,
          metadata: { feedbackId: feedback.id, source: "feedback-image-upload", uploadedByEmail: auth.user.email ?? "" }
        });
        await prisma.feedback.update({
          where: { id: feedback.id },
          data: {
            imageKey: storageKey,
            imageName: filename,
            imageMime: image.type || null,
            imageSizeBytes: image.size
          }
        });
      } catch (imageError) {
        console.error("Feedback saved but the image could not be stored:", imageError);
        imageWarning = "Your feedback was saved, but the image could not be attached.";
      }
    }

    return NextResponse.json({
      ok: true,
      id: feedback.id,
      message: imageWarning ?? "Thanks for the feedback!",
      imageWarning
    });
  } catch (error) {
    console.error("Error saving feedback:", error);
    return NextResponse.json({ message: "Unable to save feedback." }, { status: 500 });
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// List feedback — admins only
export async function GET() {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  const items = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 500
  });

  return NextResponse.json({ items });
}
