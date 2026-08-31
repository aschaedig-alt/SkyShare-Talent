import { google, calendar_v3 } from "googleapis";

/**
 * Google Calendar integration using a service account.
 *
 * Setup: a dedicated Google Calendar is shared with the service account email
 * ("Make changes to events"). The service account authenticates with its JSON
 * key and reads/writes that calendar. No per-user OAuth needed.
 *
 * Required env vars:
 *  - GOOGLE_SERVICE_ACCOUNT_EMAIL
 *  - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  (PEM, may contain literal \n)
 *  - GOOGLE_SHARED_CALENDAR_ID           (the shared calendar's ID)
 */

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_SHARED_CALENDAR_ID
  );
}

export function getSharedCalendarId(): string {
  return process.env.GOOGLE_SHARED_CALENDAR_ID ?? "";
}

let cachedClient: calendar_v3.Calendar | null = null;

export function getCalendarClient(): calendar_v3.Calendar | null {
  if (!isGoogleCalendarConfigured()) {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"]
  });

  cachedClient = google.calendar({ version: "v3", auth });
  return cachedClient;
}

export type GoogleEventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  timezone?: string | null;
  colorId?: string;
  attendeeEmails?: string[];
  status?: "confirmed" | "cancelled";
  /** Private metadata (e.g. hostId, bookingId) — used to filter free/busy per host. */
  privateProps?: Record<string, string>;
};

export type CalendarBusy = { start: Date; end: Date };

function toEventResource(input: GoogleEventInput): calendar_v3.Schema$Event {
  const tz = input.timezone || "America/Denver";
  const resource: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    colorId: input.colorId,
    start: { dateTime: input.start.toISOString(), timeZone: tz },
    end: { dateTime: input.end.toISOString(), timeZone: tz },
    status: input.status
  };
  if (input.attendeeEmails && input.attendeeEmails.length > 0) {
    resource.attendees = input.attendeeEmails.map((email) => ({ email }));
  }
  if (input.privateProps && Object.keys(input.privateProps).length > 0) {
    resource.extendedProperties = { private: input.privateProps };
  }
  return resource;
}

/** Create an event; returns the Google event id. */
export async function createGoogleEvent(input: GoogleEventInput): Promise<string | null> {
  const client = getCalendarClient();
  if (!client) return null;

  const res = await client.events.insert({
    calendarId: getSharedCalendarId(),
    requestBody: toEventResource(input)
  });

  return res.data.id ?? null;
}

/** Update an existing event by id. */
export async function updateGoogleEvent(eventId: string, input: GoogleEventInput): Promise<void> {
  const client = getCalendarClient();
  if (!client) return;

  await client.events.patch({
    calendarId: getSharedCalendarId(),
    eventId,
    requestBody: toEventResource(input)
  });
}

/** Delete an event by id (ignores 404/410 — already gone). */
export async function deleteGoogleEvent(eventId: string): Promise<void> {
  const client = getCalendarClient();
  if (!client) return;

  try {
    await client.events.delete({
      calendarId: getSharedCalendarId(),
      eventId
    });
  } catch (error: unknown) {
    const code = (error as { code?: number })?.code;
    if (code === 404 || code === 410) {
      return; // already deleted
    }
    throw error;
  }
}

export type GoogleSyncResult = {
  events: calendar_v3.Schema$Event[];
  nextSyncToken: string | null;
};

/**
 * Incremental list of events. Pass a prior syncToken for delta, or omit for a
 * full initial sync. Returns events and the next syncToken to store.
 */
export async function listGoogleEvents(syncToken?: string | null): Promise<GoogleSyncResult> {
  const client = getCalendarClient();
  if (!client) {
    return { events: [], nextSyncToken: null };
  }

  const calendarId = getSharedCalendarId();
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      singleEvents: true,
      showDeleted: true,
      pageToken
    };

    if (syncToken) {
      params.syncToken = syncToken;
    } else {
      // Full sync: limit window to recent + upcoming to keep it bounded
      const past = new Date();
      past.setMonth(past.getMonth() - 1);
      params.timeMin = past.toISOString();
    }

    const res = await client.events.list(params);
    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
    nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

/**
 * Free/busy across one or more calendars. Pass the shared calendar id and/or a
 * host's personal @skyshare calendar id. Reading another person's calendar
 * requires the service account to have access (domain-wide delegation or
 * free/busy sharing) — degrades to empty if a calendar isn't readable.
 */
export async function getFreeBusy(calendarIds: string[], timeMin: Date, timeMax: Date): Promise<CalendarBusy[]> {
  const client = getCalendarClient();
  const ids = calendarIds.filter(Boolean);
  if (!client || ids.length === 0) return [];

  try {
    const res = await client.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: ids.map((id) => ({ id }))
      }
    });
    const calendars = res.data.calendars ?? {};
    const out: CalendarBusy[] = [];
    for (const id of Object.keys(calendars)) {
      for (const slot of calendars[id].busy ?? []) {
        if (slot.start && slot.end) out.push({ start: new Date(slot.start), end: new Date(slot.end) });
      }
    }
    return out;
  } catch (error) {
    console.error("getFreeBusy failed:", error);
    return [];
  }
}

/**
 * Busy intervals for ONE host derived from the shared calendar, filtered to the
 * events this app created for that host (tagged with private hostId). This is how
 * per-person availability works while everyone shares a single calendar.
 */
export async function listHostBusyEvents(hostId: string, timeMin: Date, timeMax: Date): Promise<CalendarBusy[]> {
  const client = getCalendarClient();
  if (!client) return [];

  try {
    const res = await client.events.list({
      calendarId: getSharedCalendarId(),
      singleEvents: true,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      privateExtendedProperty: [`hostId=${hostId}`],
      maxResults: 2500
    });
    const out: CalendarBusy[] = [];
    for (const event of res.data.items ?? []) {
      if (event.status === "cancelled") continue;
      const start = event.start?.dateTime ?? event.start?.date;
      const end = event.end?.dateTime ?? event.end?.date;
      if (start && end) out.push({ start: new Date(start), end: new Date(end) });
    }
    return out;
  } catch (error) {
    console.error("listHostBusyEvents failed:", error);
    return [];
  }
}

// --- inviting real people ---------------------------------------------------
//
// Everything above this line writes events that NOBODY IS INVITED TO. That is not
// an oversight in those flows — the shared calendar is a team view — but it means
// the "invite the new hires" path could not reuse them, and it is worth being
// explicit about why rather than letting the next person assume attendees work:
//
//  1. attendeeEmails existed in GoogleEventInput and was mapped in toEventResource,
//     but NO CALLER HAS EVER SET IT. Untested by definition.
//  2. events.insert was never given sendUpdates, and the Google API does NOT email
//     invitations without it. Attendees would be attached silently and never told.
//  3. A plain service account CANNOT invite attendees at all. Google rejects it with
//     "Service accounts cannot invite attendees without Domain-Wide Delegation of
//     Authority".
//
// So an orientation invite must be created AS a real person (the organizer the new
// hires should see), not as the robot. That identity comes from the SIGNED-IN USER'S
// OAuth token — see lib/google/user-calendar.ts — which is why every function below
// takes a client rather than building one. It keeps this module free of any opinion
// about which identity is calling, and it is what let the app skip domain-wide
// delegation (and the Workspace admin) entirely.

// --- surviving Google's rate limiting ---------------------------------------
//
// Google returns 403 rateLimitExceeded as a TRANSIENT signal and expects the
// caller to retry with exponential backoff. Without that, one throttle fails the
// whole action — which is what happened the first time a real user added guests:
// "Rate Limit Exceeded", nothing added, no way to tell why.
//
// Worth being clear about what does NOT cause it, because the instinct is to blame
// the guest count: adding N guests is always TWO calls (one get, one patch with the
// whole merged list), so 8 guests and 20 guests are identical work. What triggers
// it is the RATE of writes to the same event — create, then add, then add again in
// quick succession, with a re-read after each.

type GoogleErrorInfo = { code: number | null; reason: string | null; message: string };

/** Pull the useful bits out of a Gaxios error. The shape varies by failure mode,
    so every access is defensive — a parse failure here must not mask the error. */
function googleErrorInfo(error: unknown): GoogleErrorInfo {
  const e = error as {
    code?: number | string;
    status?: number;
    message?: string;
    response?: { status?: number; data?: { error?: { errors?: { reason?: string }[]; message?: string } } };
  };
  const rawCode = e?.response?.status ?? e?.status ?? e?.code;
  const code = typeof rawCode === "number" ? rawCode : Number.isFinite(Number(rawCode)) ? Number(rawCode) : null;
  const reason = e?.response?.data?.error?.errors?.[0]?.reason ?? null;
  const message = e?.response?.data?.error?.message ?? e?.message ?? "Google Calendar request failed.";
  return { code, reason, message };
}

const RETRYABLE_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "backendError",
  "internalError"
]);

function isRetryable(info: GoogleErrorInfo): boolean {
  if (info.code === 429) return true;
  if (info.code !== null && info.code >= 500) return true;
  // 403 is usually permanent (no permission) — retry ONLY when Google names a rate
  // limit as the reason, or we would sit in a loop against a real access problem.
  if (info.code === 403 && info.reason && RETRYABLE_REASONS.has(info.reason)) return true;
  // Some throttles arrive with no reason but an unmistakable message.
  if (info.code === 403 && /rate limit/i.test(info.message)) return true;
  return false;
}

/**
 * Run a Google Calendar call, retrying transient throttles with exponential
 * backoff and jitter. Jitter matters: two people clicking at once would otherwise
 * retry in lockstep and throttle each other again.
 *
 * On final failure the thrown message says what actually happened and what to do,
 * because "Rate Limit Exceeded" on its own is not something a user can act on.
 */
export async function withGoogleRetry<T>(what: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastInfo: GoogleErrorInfo | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const info = googleErrorInfo(error);
      lastInfo = info;
      if (!isRetryable(info) || attempt === attempts - 1) {
        break;
      }
      // 1s, 2s, 4s, 8s, plus up to a second of jitter.
      const wait = Math.min(8000, 2 ** attempt * 1000) + Math.floor(Math.random() * 1000);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  const info = lastInfo ?? { code: null, reason: null, message: "Unknown error." };
  const thrown = isRetryable(info)
    ? new Error(
        `Google is rate-limiting the calendar right now, and kept doing so across ${attempts} attempts with backoff. Nothing was changed — wait a minute and try again. (${what}${info.reason ? `, ${info.reason}` : ""})`
      )
    : new Error(`${info.message}${info.reason ? ` (${info.reason})` : ""}${info.code ? ` [HTTP ${info.code}]` : ""}`);

  // Keep the status on the error. Callers branch on it — a 404 means the event was
  // deleted in Google, which is a different outcome from "the call failed", and
  // wrapping the message would otherwise have hidden that.
  (thrown as Error & { code?: number | null; reason?: string | null }).code = info.code;
  (thrown as Error & { code?: number | null; reason?: string | null }).reason = info.reason;
  throw thrown;
}

export type InviteEventInput = {
  summary: string;
  description: string;
  location: string;
  /** ISO instants. timeZone is sent alongside so Google stores the intended zone. */
  startTime: string;
  endTime: string;
  timeZone: string;
  colorId?: string;
  attendeeEmails?: string[];
  addMeet?: boolean;
};

export type InviteEventResult = {
  id: string;
  htmlLink: string | null;
  hangoutLink: string | null;
  attendeeCount: number;
};

function inviteResource(input: InviteEventInput): calendar_v3.Schema$Event {
  const resource: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    colorId: input.colorId,
    start: { dateTime: input.startTime, timeZone: input.timeZone },
    end: { dateTime: input.endTime, timeZone: input.timeZone }
  };
  if (input.attendeeEmails?.length) {
    resource.attendees = input.attendeeEmails.map((email) => ({ email }));
  }
  return resource;
}

/**
 * Create an orientation-style invite on a real user's calendar.
 *
 * sendUpdates is the parameter that decides whether anybody is actually emailed.
 * It is REQUIRED here rather than defaulted, because "created the event" and
 * "told the new hires" are different outcomes and the caller must choose.
 */
export async function createInviteEvent(
  client: calendar_v3.Calendar,
  calendarId: string,
  input: InviteEventInput,
  sendUpdates: "all" | "externalOnly" | "none"
): Promise<InviteEventResult> {
  const requestBody = inviteResource(input);
  let conferenceDataVersion = 0;
  if (input.addMeet) {
    conferenceDataVersion = 1;
    requestBody.conferenceData = {
      createRequest: {
        // Deterministic per start-time so a retry cannot mint a second Meet room.
        requestId: `orientation-${input.startTime}`.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64),
        conferenceSolutionKey: { type: "hangoutsMeet" }
      }
    };
  }

  const res = await withGoogleRetry("creating the event", () =>
    client.events.insert({
      calendarId,
      sendUpdates,
      conferenceDataVersion,
      requestBody
    })
  );

  if (!res.data.id) throw new Error("Google created no event id.");
  return {
    id: res.data.id,
    htmlLink: res.data.htmlLink ?? null,
    hangoutLink: res.data.hangoutLink ?? null,
    attendeeCount: res.data.attendees?.length ?? 0
  };
}

/**
 * Push a session's CURRENT details onto an event that already exists.
 *
 * WHY: rescheduling an orientation wrote the database and nothing else, so the
 * Google event kept its old title, description, location and times. There was no
 * update path at all — the route offered only create, add-attendees and
 * add-guests. updateGoogleEvent further up this file is NOT usable here: it goes
 * through the service-account client and the shared calendar id, and orientation
 * events live on the clicking user's own calendar under per-user OAuth.
 *
 * ATTENDEES ARE DELIBERATELY NOT SENT. events.patch REPLACES the attendees array,
 * exactly as addInviteAttendees warns below, so including them here — or omitting
 * them from a body that named them — would silently uninvite everybody already on
 * the event. This patches only the fields a reschedule actually changes.
 *
 * sendUpdates is required rather than defaulted, for the same reason it is on
 * createInviteEvent: "the invite now says the right time" and "seven new hires
 * were just emailed about a change" are different outcomes and the caller chooses.
 */
export async function updateInviteEvent(
  client: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  input: Omit<InviteEventInput, "attendeeEmails" | "addMeet">,
  sendUpdates: "all" | "externalOnly" | "none"
): Promise<{ id: string; htmlLink: string | null }> {
  const requestBody: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    colorId: input.colorId,
    start: { dateTime: input.startTime, timeZone: input.timeZone },
    end: { dateTime: input.endTime, timeZone: input.timeZone }
  };

  const res = await withGoogleRetry("updating the event", () =>
    client.events.patch({ calendarId, eventId, sendUpdates, requestBody })
  );

  return { id: res.data.id ?? eventId, htmlLink: res.data.htmlLink ?? null };
}

/**
 * Add guests to an existing event, keeping whoever is already on it.
 *
 * Reads the current attendee list first and merges: events.patch REPLACES the
 * attendees array, so sending only the new people would silently uninvite
 * everybody already there.
 */
export async function addInviteAttendees(
  client: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  emails: string[],
  sendUpdates: "all" | "externalOnly" | "none"
): Promise<{ added: string[]; alreadyThere: string[]; total: number }> {
  const existing = await withGoogleRetry("reading the event", () => client.events.get({ calendarId, eventId }));
  const current = existing.data.attendees ?? [];
  const have = new Set(current.map((a) => (a.email ?? "").toLowerCase()).filter(Boolean));

  const added: string[] = [];
  const alreadyThere: string[] = [];
  for (const email of emails) {
    const e = email.trim();
    if (!e) continue;
    if (have.has(e.toLowerCase())) {
      alreadyThere.push(e);
      continue;
    }
    have.add(e.toLowerCase());
    added.push(e);
  }

  if (added.length === 0) {
    return { added, alreadyThere, total: current.length };
  }

  // ONE patch carrying the whole merged list, however many guests. This is why
  // guest count does not affect the rate limit — 8 and 20 are the same single call.
  const res = await withGoogleRetry(`adding ${added.length} guests`, () =>
    client.events.patch({
      calendarId,
      eventId,
      sendUpdates,
      requestBody: { attendees: [...current, ...added.map((email) => ({ email }))] }
    })
  );

  return { added, alreadyThere, total: res.data.attendees?.length ?? current.length + added.length };
}

/** Read an event back, so the UI can show what is really on it rather than what
    the app believes it wrote. Returns null if it was deleted in Google. */
export async function getInviteEvent(
  client: calendar_v3.Calendar,
  calendarId: string,
  eventId: string
): Promise<{ summary: string; htmlLink: string | null; hangoutLink: string | null; attendees: string[] } | null> {
  try {
    const res = await withGoogleRetry("reading the event", () => client.events.get({ calendarId, eventId }));
    if (res.data.status === "cancelled") return null;
    return {
      summary: res.data.summary ?? "",
      htmlLink: res.data.htmlLink ?? null,
      hangoutLink: res.data.hangoutLink ?? null,
      attendees: (res.data.attendees ?? []).map((a) => a.email ?? "").filter(Boolean)
    };
  } catch (error: unknown) {
    const code = (error as { code?: number })?.code;
    if (code === 404 || code === 410) return null;
    throw error;
  }
}
