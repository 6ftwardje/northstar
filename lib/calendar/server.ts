import { createHash, randomBytes } from "node:crypto";
import { appConfig } from "@/lib/config";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import {
  decryptCalendarSecret,
  encryptCalendarSecret,
} from "./crypto";
import {
  createGoogleEvent,
  deterministicGoogleEventId,
  eventIsSafeToUpdate,
  getGoogleEvent,
  GoogleCalendarError,
  listGoogleEvents,
  listGoogleCalendars,
  refreshGoogleToken,
  updateGoogleEvent,
} from "./google";
import {
  CalendarProposalInputSchema,
  type CalendarProposalInput,
} from "./schemas";

type ConnectionRow = {
  id: string;
  user_id: string;
  status: "active" | "reconnect_required" | "disconnected";
  token_expires_at: string | null;
};

type CredentialRow = {
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
};

type SourceRow = {
  google_calendar_id: string;
  summary: string;
  timezone: string | null;
  access_role: string;
  selected: boolean;
  write_enabled: boolean;
};

type ProposalRow = {
  id: string;
  user_id: string;
  connection_id: string;
  action: "create" | "update";
  status: string;
  version: number;
  target_calendar_id: string;
  target_calendar_summary: string;
  google_event_id: string | null;
  event_etag: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  event_timezone: string;
  location: string | null;
  rationale: string;
  conflict_snapshot: unknown;
  risk_flags: string[];
  idempotency_key: string;
  expires_at: string;
};

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export async function syncCalendarSources(
  userId: string,
  selectedCalendarIds: string[],
  writableCalendarId: string | null,
) {
  const admin = createAdminSupabaseClient();
  const connection = await activeConnection(userId);
  const token = await accessToken(connection);
  const calendars = await listGoogleCalendars(token);
  const knownIds = new Set(calendars.map((calendar) => calendar.id));
  if (
    selectedCalendarIds.some((id) => !knownIds.has(id)) ||
    (writableCalendarId && !knownIds.has(writableCalendarId))
  ) {
    throw new GoogleCalendarError("CALENDAR_SELECTION_INVALID", 400);
  }
  const writable = writableCalendarId
    ? calendars.find((calendar) => calendar.id === writableCalendarId)
    : null;
  if (
    writable &&
    !["writer", "owner"].includes(writable.accessRole)
  ) {
    throw new GoogleCalendarError("CALENDAR_NOT_WRITABLE", 409);
  }
  if (writableCalendarId && !selectedCalendarIds.includes(writableCalendarId)) {
    throw new GoogleCalendarError("WRITABLE_CALENDAR_NOT_SELECTED", 400);
  }

  const { error: deleteError } = await admin
    .from("calendar_sources")
    .delete()
    .eq("connection_id", connection.id);
  if (deleteError) throw deleteError;
  const { error: insertError } = await admin.from("calendar_sources").insert(
    calendars.map((calendar) => ({
      connection_id: connection.id,
      user_id: userId,
      google_calendar_id: calendar.id,
      summary: cleanText(calendar.summary, 120),
      timezone: calendar.timeZone ?? null,
      access_role: calendar.accessRole,
      primary_calendar: calendar.primary ?? false,
      selected: selectedCalendarIds.includes(calendar.id),
      write_enabled: calendar.id === writableCalendarId,
    })),
  );
  if (insertError) throw insertError;
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function createPkceVerifier() {
  return randomBytes(48).toString("base64url");
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function googleAuthorizationUrl(state: string, challenge: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: appConfig.googleClientId!,
    redirect_uri: appConfig.googleCalendarRedirectUri,
    response_type: "code",
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ].join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function cleanText(value: string, max: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

async function activeConnection(userId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("calendar_connections")
    .select("id, user_id, status, token_expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new GoogleCalendarError("CALENDAR_NOT_CONNECTED", 409);
  return data as ConnectionRow;
}

async function accessToken(connection: ConnectionRow) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("calendar_credentials")
    .select("access_token_ciphertext, refresh_token_ciphertext")
    .eq("connection_id", connection.id)
    .single();
  if (error || !data) {
    throw new GoogleCalendarError("CALENDAR_CREDENTIALS_MISSING", 409);
  }
  const credential = data as CredentialRow;
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  if (expiresAt > Date.now() + 90_000) {
    return decryptCalendarSecret(credential.access_token_ciphertext);
  }
  if (!credential.refresh_token_ciphertext) {
    await admin
      .from("calendar_connections")
      .update({
        status: "reconnect_required",
        last_error_code: "REFRESH_TOKEN_MISSING",
      })
      .eq("id", connection.id);
    throw new GoogleCalendarError("GOOGLE_RECONNECT_REQUIRED", 409);
  }

  try {
    const refreshed = await refreshGoogleToken(
      decryptCalendarSecret(credential.refresh_token_ciphertext),
    );
    const nextExpiry = new Date(
      Date.now() + refreshed.expires_in * 1000,
    ).toISOString();
    await Promise.all([
      admin
        .from("calendar_credentials")
        .update({
          access_token_ciphertext: encryptCalendarSecret(
            refreshed.access_token,
          ),
          refresh_token_ciphertext: refreshed.refresh_token
            ? encryptCalendarSecret(refreshed.refresh_token)
            : credential.refresh_token_ciphertext,
        })
        .eq("connection_id", connection.id),
      admin
        .from("calendar_connections")
        .update({
          token_expires_at: nextExpiry,
          last_success_at: new Date().toISOString(),
          last_error_code: null,
        })
        .eq("id", connection.id),
    ]);
    return refreshed.access_token;
  } catch {
    await admin
      .from("calendar_connections")
      .update({
        status: "reconnect_required",
        last_error_code: "TOKEN_REFRESH_FAILED",
      })
      .eq("id", connection.id);
    throw new GoogleCalendarError("GOOGLE_RECONNECT_REQUIRED", 409);
  }
}

async function writableSource(userId: string, connectionId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("calendar_sources")
    .select(
      "google_calendar_id, summary, timezone, access_role, selected, write_enabled",
    )
    .eq("user_id", userId)
    .eq("connection_id", connectionId)
    .eq("write_enabled", true)
    .maybeSingle();
  if (error) throw error;
  if (!data || !["writer", "owner"].includes(data.access_role)) {
    throw new GoogleCalendarError("WRITABLE_CALENDAR_NOT_SELECTED", 409);
  }
  return data as SourceRow;
}

function serializeEvent(event: Awaited<ReturnType<typeof getGoogleEvent>>) {
  return {
    id: event.id,
    etag: event.etag ?? null,
    title: cleanText(event.summary ?? "Zonder titel", 160),
    location: event.location ? cleanText(event.location, 200) : null,
    startsAt: event.start.dateTime ?? event.start.date ?? null,
    endsAt: event.end.dateTime ?? event.end.date ?? null,
    recurring: Boolean(event.recurringEventId),
    hasAttendees: Boolean(event.attendees?.length),
  };
}

export async function createCalendarProposal(
  userId: string,
  rawInput: CalendarProposalInput,
) {
  const input = CalendarProposalInputSchema.parse(rawInput);
  if (new Date(input.startsAt).getTime() < Date.now() - 5 * 60 * 1000) {
    throw new GoogleCalendarError("CALENDAR_START_IN_PAST", 400);
  }
  const admin = createAdminSupabaseClient();
  const connection = await activeConnection(userId);
  const source = await writableSource(userId, connection.id);
  const token = await accessToken(connection);
  let beforeSnapshot: ReturnType<typeof serializeEvent> | null = null;
  let eventEtag: string | null = null;
  const riskFlags: string[] = [];

  if (input.action === "update") {
    const existing = await getGoogleEvent(
      token,
      source.google_calendar_id,
      input.googleEventId!,
    );
    if (!eventIsSafeToUpdate(existing)) {
      throw new GoogleCalendarError("GOOGLE_HIGH_RISK_EVENT", 409);
    }
    beforeSnapshot = serializeEvent(existing);
    eventEtag = existing.etag ?? null;
    if (!eventEtag) {
      throw new GoogleCalendarError("GOOGLE_EVENT_ETAG_MISSING", 409);
    }
  }

  const potentialConflicts = await listGoogleEvents(
    token,
    source.google_calendar_id,
    input.startsAt,
    input.endsAt,
  );
  const conflicts = potentialConflicts
    .filter((event) => event.id !== input.googleEventId)
    .slice(0, 5)
    .map((event) => ({
      id: event.id,
      title: cleanText(event.summary ?? "Bezet", 100),
      startsAt: event.start.dateTime ?? event.start.date ?? null,
      endsAt: event.end.dateTime ?? event.end.date ?? null,
    }));
  if (conflicts.length) riskFlags.push("TIME_CONFLICT");

  const { data, error } = await admin
    .from("calendar_action_proposals")
    .insert({
      user_id: userId,
      connection_id: connection.id,
      source_entry_id: input.sourceEntryId,
      action: input.action,
      target_calendar_id: source.google_calendar_id,
      target_calendar_summary: cleanText(source.summary, 120),
      google_event_id: input.googleEventId,
      event_etag: eventEtag,
      title: cleanText(input.title, 160),
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      event_timezone: input.timezone,
      location: input.location ? cleanText(input.location, 200) : null,
      rationale: cleanText(input.rationale, 500),
      before_snapshot: beforeSnapshot,
      conflict_snapshot: conflicts,
      risk_flags: riskFlags,
    })
    .select("*")
    .single();
  if (error) throw error;
  return proposalDto(data as ProposalRow);
}

export function proposalDto(proposal: ProposalRow) {
  return {
    id: proposal.id,
    action: proposal.action,
    status: proposal.status,
    version: proposal.version,
    calendar: proposal.target_calendar_summary,
    title: proposal.title,
    startsAt: proposal.starts_at,
    endsAt: proposal.ends_at,
    timezone: proposal.event_timezone,
    location: proposal.location,
    rationale: proposal.rationale,
    conflicts: Array.isArray(proposal.conflict_snapshot)
      ? proposal.conflict_snapshot
      : [],
    riskFlags: proposal.risk_flags ?? [],
    expiresAt: proposal.expires_at,
  };
}

export async function executeCalendarProposal(
  userId: string,
  proposalId: string,
  expectedVersion: number,
) {
  const admin = createAdminSupabaseClient();
  const { data: pending, error: readError } = await admin
    .from("calendar_action_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .single();
  if (readError || !pending) {
    throw new GoogleCalendarError("PROPOSAL_NOT_FOUND", 404);
  }
  const proposal = pending as ProposalRow;
  if (proposal.status === "applied") return proposalDto(proposal);
  if (
    proposal.status !== "pending_confirmation" ||
    proposal.version !== expectedVersion
  ) {
    throw new GoogleCalendarError("PROPOSAL_CHANGED", 409);
  }
  if (new Date(proposal.expires_at) <= new Date()) {
    await admin
      .from("calendar_action_proposals")
      .update({ status: "expired" })
      .eq("id", proposal.id)
      .eq("status", "pending_confirmation");
    throw new GoogleCalendarError("PROPOSAL_EXPIRED", 409);
  }

  const { data: claimed, error: claimError } = await admin
    .from("calendar_action_proposals")
    .update({
      status: "executing",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", proposal.id)
    .eq("user_id", userId)
    .eq("status", "pending_confirmation")
    .eq("version", expectedVersion)
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new GoogleCalendarError("PROPOSAL_CHANGED", 409);

  const { data: execution } = await admin
    .from("calendar_action_executions")
    .insert({
      proposal_id: proposal.id,
      user_id: userId,
      status: "started",
    })
    .select("id")
    .single();

  try {
    const connection = await activeConnection(userId);
    if (connection.id !== proposal.connection_id) {
      throw new GoogleCalendarError("PROPOSAL_CONNECTION_CHANGED", 409);
    }
    const source = await writableSource(userId, connection.id);
    if (source.google_calendar_id !== proposal.target_calendar_id) {
      throw new GoogleCalendarError("PROPOSAL_CALENDAR_CHANGED", 409);
    }
    const token = await accessToken(connection);
    let event;
    if (proposal.action === "create") {
      try {
        event = await createGoogleEvent(
          token,
          proposal.target_calendar_id,
          {
            idempotencyKey: proposal.idempotency_key,
            title: proposal.title,
            startsAt: proposal.starts_at,
            endsAt: proposal.ends_at,
            timezone: proposal.event_timezone,
            location: proposal.location,
          },
        );
      } catch (error) {
        if (
          error instanceof GoogleCalendarError &&
          error.code === "GOOGLE_EVENT_EXISTS"
        ) {
          event = await getGoogleEvent(
            token,
            proposal.target_calendar_id,
            deterministicGoogleEventId(proposal.idempotency_key),
          );
        } else {
          throw error;
        }
      }
    } else {
      const existing = await getGoogleEvent(
        token,
        proposal.target_calendar_id,
        proposal.google_event_id!,
      );
      event = await updateGoogleEvent(
        token,
        proposal.target_calendar_id,
        existing,
        proposal.event_etag!,
        {
          title: proposal.title,
          startsAt: proposal.starts_at,
          endsAt: proposal.ends_at,
          timezone: proposal.event_timezone,
          location: proposal.location,
        },
      );
    }

    const { data: applied, error: appliedError } = await admin
      .from("calendar_action_proposals")
      .update({
        status: "applied",
        executed_at: new Date().toISOString(),
        google_event_id: event.id,
        google_event_html_link: event.htmlLink ?? null,
        last_error_code: null,
      })
      .eq("id", proposal.id)
      .eq("status", "executing")
      .select("*")
      .single();
    if (appliedError) throw appliedError;
    if (execution) {
      await admin
        .from("calendar_action_executions")
        .update({ status: "applied", google_event_id: event.id })
        .eq("id", execution.id);
    }
    return proposalDto(applied as ProposalRow);
  } catch (error) {
    const code =
      error instanceof GoogleCalendarError
        ? error.code
        : "CALENDAR_EXECUTION_FAILED";
    const stale = code === "GOOGLE_EVENT_STALE";
    await Promise.all([
      admin
        .from("calendar_action_proposals")
        .update({
          status: stale ? "stale" : "failed",
          last_error_code: code,
        })
        .eq("id", proposal.id)
        .eq("status", "executing"),
      execution
        ? admin
            .from("calendar_action_executions")
            .update({
              status: stale ? "stale" : "failed",
              error_code: code,
            })
            .eq("id", execution.id)
        : Promise.resolve(),
    ]);
    throw error;
  }
}

export async function upcomingCalendarContext(userId: string) {
  try {
    const admin = createAdminSupabaseClient();
    const connection = await activeConnection(userId);
    const token = await accessToken(connection);
    const { data } = await admin
      .from("calendar_sources")
      .select(
        "google_calendar_id, summary, timezone, access_role, selected, write_enabled",
      )
      .eq("user_id", userId)
      .eq("connection_id", connection.id)
      .eq("selected", true)
      .limit(5);
    const from = new Date();
    const until = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sources = (data ?? []) as SourceRow[];
    const results = await Promise.all(
      sources.map(async (source) => ({
        calendar: cleanText(source.summary, 80),
        events: (
          await listGoogleEvents(
            token,
            source.google_calendar_id,
            from.toISOString(),
            until.toISOString(),
          )
        ).map((event) => ({
          id: event.id,
          title: cleanText(event.summary ?? "Bezet", 120),
          startsAt: event.start.dateTime ?? event.start.date ?? null,
          endsAt: event.end.dateTime ?? event.end.date ?? null,
          updateAllowed: eventIsSafeToUpdate(event),
        })),
      })),
    );
    return results;
  } catch {
    return [];
  }
}
