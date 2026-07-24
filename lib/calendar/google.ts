import { createHash } from "node:crypto";
import { z } from "zod";
import { appConfig } from "../config";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REQUEST_TIMEOUT_MS = 12_000;

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const UserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
});

const CalendarListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string(),
        timeZone: z.string().optional(),
        accessRole: z.string(),
        primary: z.boolean().optional(),
        selected: z.boolean().optional(),
      }),
    )
    .default([]),
});

const GoogleEventSchema = z
  .object({
    id: z.string(),
    etag: z.string().optional(),
    summary: z.string().optional(),
    location: z.string().optional(),
    htmlLink: z.string().url().optional(),
    recurringEventId: z.string().optional(),
    attendees: z.array(z.unknown()).optional(),
    organizer: z.object({ self: z.boolean().optional() }).optional(),
    start: z.object({
      dateTime: z.string().optional(),
      date: z.string().optional(),
      timeZone: z.string().optional(),
    }),
    end: z.object({
      dateTime: z.string().optional(),
      date: z.string().optional(),
      timeZone: z.string().optional(),
    }),
  })
  .passthrough();

const EventsListSchema = z.object({
  items: z.array(GoogleEventSchema).default([]),
});

export type GoogleTokenResponse = z.infer<typeof TokenResponseSchema>;
export type GoogleCalendar = z.infer<typeof CalendarListSchema>["items"][number];
export type GoogleEvent = z.infer<typeof GoogleEventSchema>;

export class GoogleCalendarError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 502,
  ) {
    super(code);
  }
}

async function parseGoogleResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GoogleCalendarError("GOOGLE_RECONNECT_REQUIRED", 409);
    }
    if (response.status === 412) {
      throw new GoogleCalendarError("GOOGLE_EVENT_STALE", 409);
    }
    if (response.status === 409) {
      throw new GoogleCalendarError("GOOGLE_EVENT_EXISTS", 409);
    }
    if (response.status === 429) {
      throw new GoogleCalendarError("GOOGLE_RATE_LIMITED", 503);
    }
    throw new GoogleCalendarError("GOOGLE_REQUEST_FAILED", 502);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GoogleCalendarError("GOOGLE_RESPONSE_INVALID", 502);
  }
  return parsed.data;
}

async function googleFetch(url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function oauthBody(values: Record<string, string>) {
  return new URLSearchParams({
    client_id: appConfig.googleClientId!,
    client_secret: appConfig.googleClientSecret!,
    ...values,
  });
}

export async function exchangeGoogleCode(code: string, verifier: string) {
  const response = await googleFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: oauthBody({
      code,
      code_verifier: verifier,
      redirect_uri: appConfig.googleCalendarRedirectUri,
      grant_type: "authorization_code",
    }),
  });
  return parseGoogleResponse(response, TokenResponseSchema);
}

export async function refreshGoogleToken(refreshToken: string) {
  const response = await googleFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: oauthBody({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  return parseGoogleResponse(response, TokenResponseSchema);
}

export async function getGoogleUser(accessToken: string) {
  const response = await googleFetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseGoogleResponse(response, UserInfoSchema);
}

export async function listGoogleCalendars(accessToken: string) {
  const response = await googleFetch(
    `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&showHidden=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return (await parseGoogleResponse(response, CalendarListSchema)).items;
}

export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
) {
  const query = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "30",
  });
  const response = await googleFetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return (await parseGoogleResponse(response, EventsListSchema)).items;
}

export async function getGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
) {
  const response = await googleFetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return parseGoogleResponse(response, GoogleEventSchema);
}

export function deterministicGoogleEventId(idempotencyKey: string) {
  return createHash("sha256")
    .update(`northstar:${idempotencyKey}`)
    .digest("hex")
    .slice(0, 32);
}

export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  input: {
    idempotencyKey: string;
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    location: string | null;
  },
) {
  const response = await googleFetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: deterministicGoogleEventId(input.idempotencyKey),
        summary: input.title,
        location: input.location || undefined,
        start: { dateTime: input.startsAt, timeZone: input.timezone },
        end: { dateTime: input.endsAt, timeZone: input.timezone },
        extendedProperties: {
          private: { northstarProposalId: input.idempotencyKey },
        },
      }),
    },
  );
  return parseGoogleResponse(response, GoogleEventSchema);
}

export function eventIsSafeToUpdate(event: GoogleEvent) {
  return (
    !event.recurringEventId &&
    (!event.attendees || event.attendees.length === 0) &&
    event.organizer?.self !== false &&
    Boolean(event.start.dateTime && event.end.dateTime)
  );
}

export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  existing: GoogleEvent,
  expectedEtag: string,
  input: {
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    location: string | null;
  },
) {
  if (!eventIsSafeToUpdate(existing)) {
    throw new GoogleCalendarError("GOOGLE_HIGH_RISK_EVENT", 409);
  }
  if (!existing.etag || existing.etag !== expectedEtag) {
    throw new GoogleCalendarError("GOOGLE_EVENT_STALE", 409);
  }

  const response = await googleFetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.id)}?sendUpdates=none`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "If-Match": expectedEtag,
      },
      body: JSON.stringify({
        ...existing,
        summary: input.title,
        location: input.location || undefined,
        start: { dateTime: input.startsAt, timeZone: input.timezone },
        end: { dateTime: input.endsAt, timeZone: input.timezone },
      }),
    },
  );
  return parseGoogleResponse(response, GoogleEventSchema);
}

export async function revokeGoogleToken(token: string) {
  await googleFetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}
