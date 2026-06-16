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
