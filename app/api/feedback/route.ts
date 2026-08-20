import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, requireApiPermission } from "@/lib/auth/route-auth";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { sanitizeFilename } from "@/lib/files/candidate-file-storage";
import {
  createFeedbackStorageKey,
  isSupportedFeedbackImage,
  MAX_FEEDBACK_IMAGE_BYTES,
  MAX_FEEDBACK_IMAGES
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
    // Several screenshots per report: a two-part bug is one report, and splitting
    // it across two submissions to attach a second picture loses the connection.
    let images: File[] = [];

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
      // getAll: the field name stays "image" so an older client posting a single
      // file still works unchanged.
      images = form.getAll("image").filter((c): c is File => isFileLike(c) && c.size > 0).slice(0, MAX_FEEDBACK_IMAGES);
    } else {
      submitted = normalize(await request.json());
    }

    if (submitted.message.length < 2) {
      return NextResponse.json({ message: "Please enter a bit more detail." }, { status: 400 });
    }
    if (submitted.message.length > 5000) {
      return NextResponse.json({ message: "Feedback is too long." }, { status: 400 });
    }

    // Validate EVERY image before saving anything, so a bad file is a clean,
    // fixable error rather than a half-saved report. All-or-nothing on purpose:
    // silently dropping the third of three attachments is worse than refusing.
    for (const image of images) {
      const filename = sanitizeFilename(image.name || "screenshot.png");
      if (!isSupportedFeedbackImage(filename, image.type || null)) {
        return NextResponse.json(
          { message: "Attach PNG, JPG, GIF or WEBP images only." },
          { status: 400 }
        );
      }
      if (image.size > MAX_FEEDBACK_IMAGE_BYTES) {
        return NextResponse.json({ message: `${filename} is larger than the 10 MB limit.` }, { status: 400 });
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
    let stored = 0;
    for (const [index, image] of images.entries()) {
      try {
        const storage = getFileStorageAdapter();
        if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
          throw new Error("Private file storage is not configured for this environment.");
        }
        const filename = sanitizeFilename(image.name || "screenshot.png");
        // Index in the key so two files named screenshot.png cannot collide.
        const storageKey = createFeedbackStorageKey(feedback.id, `${index}-${filename}`);
        await storage.write({
          storageKey,
          bytes: Buffer.from(await image.arrayBuffer()),
          contentType: image.type || null,
          metadata: { feedbackId: feedback.id, source: "feedback-image-upload", uploadedByEmail: auth.user.email ?? "" }
        });
        await prisma.feedbackImage.create({
          data: {
            feedbackId: feedback.id,
            storageKey,
            filename,
            mimeType: image.type || null,
            sizeBytes: image.size,
            sortOrder: index
          }
        });
        stored += 1;
      } catch (imageError) {
        console.error("Feedback saved but an image could not be stored:", imageError);
      }
    }
    // Counted rather than assumed: partial success has to say so, or somebody
    // believes all three pictures arrived when only two did.
    if (images.length > 0 && stored < images.length) {
      imageWarning =
        stored === 0
          ? "Your feedback was saved, but the images could not be attached."
          : `Your feedback was saved, but only ${stored} of ${images.length} images could be attached.`;
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
