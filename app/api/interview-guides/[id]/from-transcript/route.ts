import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { resolveGuideWrite } from "@/lib/interview-guides/access.server";
import { draftAnswersFromTranscript, TRANSCRIPT_MAX_CHARS } from "@/lib/interview-guides/transcript.server";

// One model call over the whole transcript; a long interview can take a while.
export const maxDuration = 300;

const bodySchema = z.object({
  transcript: z
    .string()
    .trim()
    .min(200, "Paste the whole transcript - that looks too short to be an interview.")
    .max(TRANSCRIPT_MAX_CHARS, `That transcript is over ${TRANSCRIPT_MAX_CHARS.toLocaleString("en-US")} characters.`)
});

/**
 * Draft each question's answer from a pasted interview transcript. WRITES
 * NOTHING: it returns drafts for the guide page to preview, and the person saves
 * the ones they approve through the normal answer route. Needs the same access as
 * filling the guide in, since it is that, just faster.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;
  const access = await resolveGuideWrite(auth.user, id);
  if ("response" in access) return access.response;

  try {
    const { transcript } = bodySchema.parse(await request.json());
    const items = await prisma.interviewGuideItem.findMany({
      where: { guideId: id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, text: true }
    });
    if (items.length === 0) return NextResponse.json({ message: "This guide has no questions." }, { status: 400 });

    const drafts = await draftAnswersFromTranscript(items, transcript);
    return NextResponse.json({ ok: true, drafts });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Validation failed." }, { status: 400 });
    }
    console.error("Draft guide answers from transcript failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not read the transcript." }, { status: 502 });
  }
}
