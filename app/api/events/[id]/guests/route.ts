import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  applyResponses,
  getGuestList,
  linkSheet,
  matchAddress,
  previewResponses,
  previewSheet,
  sendReminder,
  setGuest,
  syncSheet,
  undoLast,
  unlinkSheet
} from "@/lib/events/guest-list";
import type { GuestStatus, ResponseRow } from "@/lib/events/guest-list-shared";

// The party guest list (Aimee's feedback cmwwjwama + cmwwk53m7). Rules in
// lib/events/guest-list.ts.
//
//   GET  ?sync=1                       the list; with sync=1 the linked sheet is re-read first (at most once a minute)
//   POST { action: "set", newHireId, status?, plusOne?, guestName?, allergies? }
//   POST { action: "previewSheet", url, tab? }       what linking would change (writes nothing)
//   POST { action: "linkSheet", url, tab? }          link it and apply it
//   POST { action: "unlinkSheet" }
//   POST { action: "sync" }                          re-read the linked sheet now
//   POST { action: "undo" }                          put back what the last sync or import changed
//   POST { action: "match", email, newHireId }       an address the sheet could not match
//   POST { action: "previewRows" | "applyRows", rows, fileName }   rows from ./upload
//   POST { action: "remind", newHireIds, subject, body }   one email, everyone in BCC

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const STATUSES: GuestStatus[] = ["CONFIRMED", "DECLINED", "NO_RESPONSE"];
const str = (v: unknown) => (typeof v === "string" ? v : "");
const fail = (e: unknown, status = 400) => NextResponse.json({ message: e instanceof Error ? e.message : "That did not work." }, { status });

/** Rows posted back from an upload preview, checked field by field. */
function cleanRows(raw: unknown): ResponseRow[] {
  if (!Array.isArray(raw)) return [];
  const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return raw.slice(0, 3000).flatMap((r): ResponseRow[] => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const status = STATUSES.includes(o.status as GuestStatus) ? (o.status as GuestStatus) : "NO_RESPONSE";
    const answers = Array.isArray(o.answers)
      ? (o.answers as unknown[]).slice(0, 30).flatMap((a) => {
          const x = (a ?? {}) as Record<string, unknown>;
          const q = s(x.q, 300);
          const v = s(x.a, 2000);
          return q && v ? [{ q, a: v }] : [];
        })
      : [];
    const email = s(o.email, 200)?.toLowerCase() ?? null;
    const name = s(o.name, 200);
    if (!email && !name) return [];
    return [{ email, name, status, plusOne: typeof o.plusOne === "boolean" ? o.plusOne : null, guestName: s(o.guestName, 120), allergies: s(o.allergies, 300), answers, respondedAt: s(o.respondedAt, 40) }];
  });
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  let syncError: string | null = null;
  if (new URL(request.url).searchParams.get("sync") === "1") {
    // Reading the sheet writes the answers it finds - only for people who can edit events.
    const write = await requireApiPermission("events:write");
    if (write.ok) await syncSheet(id).catch((e: unknown) => (syncError = e instanceof Error ? e.message : "Could not read the sheet."));
  }
  try {
    return NextResponse.json({ ...(await getGuestList(id)), syncError });
  } catch (e) {
    return fail(e, 404);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  const actor = auth.user.email ?? auth.user.name ?? null;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (body.action) {
      case "set": {
        const patch: Parameters<typeof setGuest>[2] = {};
        if (STATUSES.includes(body.status as GuestStatus)) patch.status = body.status as GuestStatus;
        if (body.plusOne === null || typeof body.plusOne === "boolean") patch.plusOne = body.plusOne as boolean | null;
        if (typeof body.guestName === "string") patch.guestName = body.guestName;
        if (typeof body.allergies === "string") patch.allergies = body.allergies;
        await setGuest(id, str(body.newHireId), patch, actor);
        return NextResponse.json({ ok: true, list: await getGuestList(id) });
      }
      case "previewSheet":
        return NextResponse.json({ ok: true, preview: await previewSheet(id, str(body.url), str(body.tab).trim() || undefined) });
      case "linkSheet": {
        const summary = await linkSheet(id, str(body.url), str(body.tab).trim() || "RSVP", actor);
        return NextResponse.json({ ok: true, summary, list: await getGuestList(id) });
      }
      case "unlinkSheet":
        await unlinkSheet(id);
        return NextResponse.json({ ok: true, list: await getGuestList(id) });
      case "sync": {
        const summary = await syncSheet(id, true);
        return NextResponse.json({ ok: true, summary, list: await getGuestList(id) });
      }
      case "undo": {
        const restored = await undoLast(id);
        return NextResponse.json({ ok: true, restored, list: await getGuestList(id) });
      }
      case "match":
        await matchAddress(id, str(body.email), str(body.newHireId));
        await syncSheet(id, true).catch(() => null);
        return NextResponse.json({ ok: true, list: await getGuestList(id) });
      case "previewRows":
        return NextResponse.json({ ok: true, preview: await previewResponses(id, cleanRows(body.rows), "upload") });
      case "applyRows": {
        const summary = await applyResponses(id, cleanRows(body.rows), "upload", `Uploaded ${str(body.fileName).slice(0, 80) || "a file"}`);
        return NextResponse.json({ ok: true, summary, list: await getGuestList(id) });
      }
      case "remind": {
        const ids = Array.isArray(body.newHireIds) ? (body.newHireIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 1000) : [];
        const result = await sendReminder({ eventId: id, newHireIds: ids, subject: str(body.subject), bodyHtml: str(body.body), actor });
        return NextResponse.json({ ok: true, ...result, list: await getGuestList(id) });
      }
      default:
        return fail(new Error("Unknown action."));
    }
  } catch (e) {
    return fail(e);
  }
}
