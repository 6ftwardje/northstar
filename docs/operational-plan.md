# Northstar operationeel plan

## Huidige stand

De app bewaart nieuwe entries eerst lokaal in de PWA en probeert ze daarna
idempotent naar Supabase te synchroniseren. Daardoor blijft tekst behouden als
de database, het netwerk of de coach tijdelijk niet beschikbaar is.

De productieconfiguratie verwijst naar Supabase-project
`kslwsaguwgskevepafrq`. Dat project bevat op dit moment nog niet het
Northstar-schema. De ingelogde Supabase-account `6ftwardje` heeft bovendien
geen toegang tot die projectreferentie. De eerste iPhone-entry kan daarom nog
niet in de cloud staan; hij blijft lokaal in die PWA-installatie.

## Fase 1 — operationele basis

- Voer `0001_initial.sql` en `0002_operational_hardening.sql` uit in het juiste
  Supabase-project.
- Controleer de database en beide OpenAI-modellen met `npm run health`.
- Open de bestaande iPhone-PWA. De lokale entry krijgt een knop
  **Synchroniseer opnieuw** zodra database en coach actief zijn.
- Test daarna één getypte entry en één audio-entry van minstens drie seconden.
- Controleer in Supabase dat per client-entry exact één journal-entry en één
  coachantwoord bestaan.

## Fase 2 — betrouwbare regressietests

- Unit-tests bewaken audioformaten en de gestructureerde coachcontracten.
- Playwright test de login en PWA-layout op desktop en iPhone-formaat.
- CI voert lint, unit-tests, build, Chromium en WebKit uit bij iedere push.
- Voeg een afzonderlijk Supabase-testproject en een apart testaccount toe voor
  volledige login-, opslag- en coachtests. Productiedata wordt nooit in CI
  gebruikt.

## Fase 3 — coaching en memory

- Bouw een reviewflow voor kandidaat-memories: bevestigen, corrigeren,
  samenvoegen of verwijderen.
- Consolideer de avondcheck-in naar een dagsamenvatting en concrete
  commitment voor morgen.
- Voeg een job toe die mislukte coachantwoorden veilig opnieuw probeert.
- Meet eerst minimaal zeven dagen voordat Progress correlaties of patronen
  toont.

## Fase 4 — iPhone-integraties

- Web push voor de check-in van 21:00, met een in-app fallback.
- Agenda en Reminders via expliciete, afzonderlijke toestemming.
- Apple Health vereist uiteindelijk een kleine native iOS-container; een
  gewone PWA kan HealthKit niet rechtstreeks uitlezen.

## Wat Ward moet leveren

1. Toegang tot het Supabase-project `kslwsaguwgskevepafrq` voor de huidige
   ingelogde account, of opnieuw inloggen met de account die eigenaar is.
2. Een apart Supabase-testproject met URL, anon key en service-role key.
3. Een apart test-e-mailadres/account voor geautomatiseerde authenticatietests.
4. Een OpenAI-projectkey voor tests met een lage maandlimiet.
5. Na de databasefix: de bestaande Northstar-PWA op de iPhone openen en de
   lokale entry één keer laten synchroniseren. Verwijder de PWA voordien niet.
