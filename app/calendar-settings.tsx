"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Unplug,
  X,
} from "lucide-react";
import { calendarActionHeaders } from "@/lib/calendar/client";

type CalendarSource = {
  google_calendar_id: string;
  summary: string;
  timezone: string | null;
  access_role: string;
  primary_calendar: boolean;
  selected: boolean;
  write_enabled: boolean;
};

type CalendarStatus = {
  configured: boolean;
  connected: boolean;
  status:
    | "active"
    | "reconnect_required"
    | "disconnected"
    | "not_configured";
  connection: {
    email: string;
    displayName: string | null;
    lastConnectedAt: string;
  } | null;
  calendars: CalendarSource[];
};

export function CalendarSettings({
  open,
  onClose,
  onToast,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [writable, setWritable] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/integrations/google/status", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("STATUS_FAILED");
    const next = (await response.json()) as CalendarStatus;
    setStatus(next);
    setSelected(
      new Set(
        next.calendars
          .filter((calendar) => calendar.selected)
          .map((calendar) => calendar.google_calendar_id),
      ),
    );
    setWritable(
      next.calendars.find((calendar) => calendar.write_enabled)
        ?.google_calendar_id ?? null,
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      void load().catch(() =>
        onToast("Agenda-instellingen konden niet laden"),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [load, onToast, open]);

  async function connect() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/google/connect", {
        method: "POST",
        headers: calendarActionHeaders(),
      });
      const result = (await response.json().catch(() => null)) as {
        authorizationUrl?: string;
      } | null;
      if (!response.ok || !result?.authorizationUrl) {
        throw new Error("Koppeling kon niet starten");
      }
      const destination = new URL(result.authorizationUrl);
      if (
        destination.protocol !== "https:" ||
        destination.origin !== "https://accounts.google.com"
      ) {
        throw new Error("Onveilige doorverwijzing geblokkeerd");
      }
      window.location.assign(destination.toString());
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Koppeling kon niet starten",
      );
      setBusy(false);
    }
  }

  async function save() {
    if (busy || !status) return;
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/google/sources", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...calendarActionHeaders(),
        },
        body: JSON.stringify({
          selectedCalendarIds: [...selected],
          writableCalendarId: writable,
        }),
      });
      if (!response.ok) throw new Error("Agenda-keuze kon niet worden bewaard");
      await load();
      onChanged();
      onToast("Agenda-keuze bewaard");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Wijziging niet bewaard",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy) return;
    if (
      !window.confirm(
        "Google Calendar loskoppelen? Northstar verwijdert de opgeslagen toegangstokens en stopt met agenda-informatie lezen.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/google/disconnect", {
        method: "POST",
        headers: calendarActionHeaders(),
      });
      if (!response.ok) throw new Error("Loskoppelen is niet gelukt");
      await load();
      onChanged();
      onToast("Google Calendar losgekoppeld");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Loskoppelen is niet gelukt",
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleRead(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      if (writable === id) setWritable(null);
    } else {
      next.add(id);
    }
    setSelected(next);
  }

  function chooseWritable(id: string) {
    const next = new Set(selected);
    next.add(id);
    setSelected(next);
    setWritable(id);
  }

  if (!open) return null;

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <section
        className="calendar-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="notification-header">
          <div>
            <span className="eyebrow">Integratie</span>
            <h2 id="calendar-title">Google Calendar</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Sluiten">
            <X size={21} />
          </button>
        </header>

        {!status ? (
          <div className="settings-loading">
            <LoaderCircle className="spin" size={18} /> Agenda laden…
          </div>
        ) : !status.configured ? (
          <div className="calendar-setup-notice">
            <CalendarDays size={24} />
            <h3>Nog één technische stap</h3>
            <p>
              Voeg de Google OAuth-waarden en encryptiesleutel toe aan de
              productieomgeving. Daarna kan iedere gebruiker zijn eigen Google
              account koppelen.
            </p>
          </div>
        ) : !status.connected ? (
          <div className="calendar-connect-state">
            <span className="calendar-google-mark">G</span>
            <h3>
              {status.status === "reconnect_required"
                ? "Opnieuw verbinden"
                : "Koppel je planning"}
            </h3>
            <p>
              Northstar gebruikt je agenda om realistische voorstellen te doen.
              Een event toevoegen of wijzigen vraagt altijd jouw bevestiging.
            </p>
            <button onClick={() => void connect()} disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : status.status === "reconnect_required" ? (
                <RefreshCw size={18} />
              ) : (
                <CalendarDays size={18} />
              )}
              {status.status === "reconnect_required"
                ? "Verbind opnieuw"
                : "Koppel Google Calendar"}
            </button>
          </div>
        ) : (
          <>
            <div className="calendar-account">
              <span className="calendar-google-mark">G</span>
              <div>
                <strong>{status.connection?.displayName ?? "Google account"}</strong>
                <small>{status.connection?.email}</small>
              </div>
              <span className="connected-label">
                <Check size={13} /> Gekoppeld
              </span>
            </div>

            <div className="settings-section calendar-source-section">
              <h3>Agenda’s die Northstar mag lezen</h3>
              <p>
                Selecteer alleen wat nuttig is. Eventbeschrijvingen worden niet
                naar de coach gestuurd.
              </p>
              <div className="calendar-source-list">
                {status.calendars.map((calendar) => {
                  const canWrite = ["writer", "owner"].includes(
                    calendar.access_role,
                  );
                  return (
                    <div className="calendar-source" key={calendar.google_calendar_id}>
                      <button
                        type="button"
                        className="calendar-source-main"
                        onClick={() => toggleRead(calendar.google_calendar_id)}
                      >
                        <span
                          className={
                            selected.has(calendar.google_calendar_id)
                              ? "calendar-check is-selected"
                              : "calendar-check"
                          }
                        >
                          {selected.has(calendar.google_calendar_id) && (
                            <Check size={13} />
                          )}
                        </span>
                        <span>
                          <strong>{calendar.summary}</strong>
                          <small>
                            {calendar.primary_calendar
                              ? "Primaire agenda"
                              : calendar.timezone ?? "Google Calendar"}
                          </small>
                        </span>
                      </button>
                      {canWrite && selected.has(calendar.google_calendar_id) && (
                        <button
                          type="button"
                          className={
                            writable === calendar.google_calendar_id
                              ? "calendar-write is-selected"
                              : "calendar-write"
                          }
                          onClick={() =>
                            chooseWritable(calendar.google_calendar_id)
                          }
                        >
                          {writable === calendar.google_calendar_id
                            ? "Voorstellen hier"
                            : "Gebruik voor voorstellen"}
                          <ChevronRight size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="calendar-security-note">
              <LockKeyhole size={17} />
              <p>
                Toegangstokens staan versleuteld op de server. De coach kan
                alleen voorstellen maken; bevestigen gebeurt in deze app.
              </p>
            </div>

            <button
              className="notification-primary"
              onClick={() => void save()}
              disabled={busy || !writable || selected.size === 0}
            >
              {busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}
              Bewaar agenda-keuze
            </button>
            <button
              className="calendar-disconnect"
              onClick={() => void disconnect()}
              disabled={busy}
            >
              <Unplug size={16} /> Koppel Google Calendar los
            </button>
          </>
        )}
      </section>
    </div>
  );
}
