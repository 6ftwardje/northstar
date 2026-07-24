import Link from "next/link";

export default async function GoogleCalendarComplete({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const connected = status === "connected";
  const cancelled = status === "cancelled";

  return (
    <main className="integration-complete">
      <div className="integration-complete-card">
        <span className="brand-mark">N</span>
        <p className="eyebrow">Google Calendar</p>
        <h1>
          {connected
            ? "Agenda gekoppeld"
            : cancelled
              ? "Koppeling geannuleerd"
              : "Koppeling niet gelukt"}
        </h1>
        <p>
          {connected
            ? "Northstar kan nu je geselecteerde planning begrijpen. Elke wijziging blijft een voorstel tot jij bevestigt."
            : "Er is niets gewijzigd. Open Northstar en probeer opnieuw wanneer je wilt."}
        </p>
        <Link href="/?calendar=return">Terug naar Northstar</Link>
        <small>Gebruik je de iPhone-app? Sluit dit venster en keer terug naar de PWA.</small>
      </div>
    </main>
  );
}
