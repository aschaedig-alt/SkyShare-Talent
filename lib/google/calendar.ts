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

  const res = await client.events.insert({
    calendarId,
    sendUpdates,
    conferenceDataVersion,
    requestBody
  });

  if (!res.data.id) throw new Error("Google created no event id.");
  return {
    id: res.data.id,
    htmlLink: res.data.htmlLink ?? null,
    hangoutLink: res.data.hangoutLink ?? null,
    attendeeCount: res.data.attendees?.length ?? 0
  };
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
  const existing = await client.events.get({ calendarId, eventId });
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

  const res = await client.events.patch({
    calendarId,
    eventId,
    sendUpdates,
    requestBody: { attendees: [...current, ...added.map((email) => ({ email }))] }
  });

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
    const res = await client.events.get({ calendarId, eventId });
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
