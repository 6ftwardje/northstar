"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  MapPin,
  X,
} from "lucide-react";
import { calendarActionHeaders } from "@/lib/calendar/client";

export type CalendarProposal = {
  id: string;
  action: "create" | "update";
  status: string;
  version: number;
  calendar: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string | null;
  rationale: string;
  conflicts: Array<{
    id: string;
    title: string;
    startsAt: string | null;
    endsAt: string | null;
  }>;
  riskFlags: string[];
  expiresAt: string;
};

function dateLabel(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = new Intl.DateTimeFormat("nl-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(start);
  const time = new Intl.DateTimeFormat("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${time.format(start)}–${time.format(end)}`;
}

export function CalendarProposalCard({
  proposal,
  onChanged,
  onToast,
}: {
  proposal: CalendarProposal;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);

  async function act(action: "confirm" | "cancel") {
    if (busy) return;
    setBusy(action);
    try {
      const response = await fetch(
        `/api/calendar/proposals/${encodeURIComponent(proposal.id)}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...calendarActionHeaders(),
          },
          body:
            action === "confirm"
              ? JSON.stringify({ version: proposal.version })
              : undefined,
        },
      );
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        if (
          result?.error === "PROPOSAL_CHANGED" ||
          result?.error === "GOOGLE_EVENT_STALE"
        ) {
          throw new Error("Dit voorstel is intussen gewijzigd. Bekijk het opnieuw.");
        }
        throw new Error(
          action === "confirm"
            ? "Agenda kon niet worden aangepast."
            : "Voorstel kon niet worden gesloten.",
        );
      }
      onToast(
        action === "confirm"
          ? "Bevestigd en in Google Calendar gezet"
          : "Agendavoorstel verwijderd",
      );
      onChanged();
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Actie is niet gelukt",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="calendar-proposal">
      <header>
        <span className="calendar-proposal-icon">
          <CalendarDays size={17} />
        </span>
        <div>
          <small>
            Voorstel · {proposal.action === "create" ? "nieuw" : "wijzigen"}
          </small>
          <strong>{proposal.title}</strong>
        </div>
      </header>
      <div className="calendar-proposal-details">
        <span>
          <Clock3 size={14} />
          {dateLabel(proposal.startsAt, proposal.endsAt)}
        </span>
        <span>
          <CalendarDays size={14} />
          {proposal.calendar}
        </span>
        {proposal.location && (
          <span>
            <MapPin size={14} />
            {proposal.location}
          </span>
        )}
      </div>
      {proposal.rationale && <p>{proposal.rationale}</p>}
      {proposal.conflicts.length > 0 && (
        <div className="calendar-conflict">
          <AlertTriangle size={15} />
          <span>
            Overlap met {proposal.conflicts.length === 1
              ? proposal.conflicts[0].title
              : `${proposal.conflicts.length} bestaande afspraken`}
          </span>
        </div>
      )}
      <div className="calendar-proposal-actions">
        <button
          type="button"
          className="calendar-cancel"
          disabled={Boolean(busy)}
          onClick={() => void act("cancel")}
        >
          {busy === "cancel" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <X size={16} />
          )}
          Niet doen
        </button>
        <button
          type="button"
          className="calendar-confirm"
          disabled={Boolean(busy)}
          onClick={() => void act("confirm")}
        >
          {busy === "confirm" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          Bevestig
        </button>
      </div>
      <small className="calendar-human-note">
        Northstar voert dit pas uit na jouw bevestiging.
      </small>
    </article>
  );
}
