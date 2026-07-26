# Northstar

Een iPhone-first journal en personal life guide voor zakelijke impact,
gezondheid en duurzame gedragsverandering.

## Huidige MVP

- meerdere journal-entries per dag;
- tekst en iPhone-compatibele audio-opname;
- actieve, directe coachinterface;
- verplichte avondcheck-in om 21:00;
- eerlijke lege toestanden tot er genoeg data is voor progress en memory;
- lokale PWA-persistentie met herstelbare cloudsynchronisatie;
- installeerbare PWA-basis met iPhone-appicoon;
- native Web Push met ochtend-, avond- en wekelijkse ritmes;
- conditionele avond-follow-up die stopt zodra de review klaar is;
- voorbereid Supabase-schema met Row Level Security;
- pure context compiler voor reproduceerbare AI-context.
- Google Calendar-context met per agenda instelbare leestoegang;
- concrete agenda-voorstellen die pas na menselijke bevestiging worden
  uitgevoerd.

Zolang de cloud niet operationeel is, bewaart de app entries lokaal en toont
ze geen verzonnen coachreacties. Na configuratie bewaart de API entries in Supabase,
assembleert relevante context, vraagt een gestructureerd coachantwoord aan
OpenAI en schrijft memory candidates met hun bronentry terug.

## Lokaal starten

```bash
npm install
npm run dev
```

Open daarna [http://localhost:3000](http://localhost:3000).

## Configuratie

Er staat al een lokale `.env.local` met veilige placeholders. Vul daarin in:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
CRON_SECRET
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALENDAR_REDIRECT_URI
CALENDAR_TOKEN_ENCRYPTION_KEY
```

Plaats secrets nooit in clientcomponenten of in git.

Controleer daarna de configuratie zonder waarden te tonen:

```bash
npm run check:setup
```

## Supabase instellen

1. Maak een project op [Supabase](https://supabase.com/dashboard).
2. Open **SQL Editor** en voer achtereenvolgens de volledige inhoud uit van
   `supabase/migrations/0001_initial.sql` en
   `supabase/migrations/0002_operational_hardening.sql` en
   `supabase/migrations/0003_notification_loop.sql` en
   `supabase/migrations/0004_google_calendar.sql` en
   `supabase/migrations/0005_daily_loop.sql`.
3. Kopieer bij **Project Settings → API** de project URL, publishable/anon key
   en service-role key naar `.env.local`.
4. Zet bij **Authentication → URL Configuration**:
   - Site URL: `https://northstar-ward.netlify.app`
   - Redirect URL lokaal: `http://localhost:3000/auth/callback`
   - Redirect URL productie:
     `https://northstar-ward.netlify.app/auth/callback`
5. Open **Authentication → Email Templates → Magic Link**. Verander de
   template zodat Supabase een eenmalige code stuurt in plaats van een
   browserlink. Bijvoorbeeld:

   ```html
   <h2>Je Northstar-inlogcode</h2>
   <p>Voer deze code in de Northstar-app in:</p>
   <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px;">
     {{ .Token }}
   </p>
   <p>Deze code verloopt snel. Deel hem met niemand.</p>
   ```

   Gebruik bijvoorbeeld `{{ .Token }} is je Northstar-code` als onderwerp.
   De template moet `{{ .Token }}` bevatten en mag voor deze flow geen
   `{{ .ConfirmationURL }}` bevatten.
6. Maak eerst je eigen account. Open daarna **Authentication → Providers →
   Email** en schakel nieuwe registraties uit. Northstar stuurt ook
   `shouldCreateUser: false`, maar deze Supabase-instelling sluit directe
   registratie via de publieke API eveneens af.

Supabase kan het aanpassen van templates beperken op nieuwe gratis projecten
die de standaard mailserver gebruiken. Als de editor vergrendeld is,
configureer je custom SMTP of gebruik je de wachtwoordoptie in Northstar.

De service-role key is server-only en mag nooit in een `NEXT_PUBLIC_` variabele
terechtkomen.

### Inloggen in de iPhone-PWA

De geïnstalleerde iPhone-PWA heeft eigen, afgeschermde sessieopslag. Een magic
link die Mail in Chrome of Safari opent, kan de geïnstalleerde Northstar-app
daarom niet inloggen. Northstar vermijdt die browserwissel:

1. Open Northstar via het beginscherm.
2. Kies **E-mailcode**, vul je adres in en tik op **Stuur inlogcode**.
3. Lees of kopieer de volledige code uit je inbox.
4. Keer terug naar hetzelfde Northstar-venster en voer de code in.

Je kunt ook **Wachtwoord** kiezen. Beide methodes maken de sessie aan binnen
de geïnstalleerde PWA.

## OpenAI instellen

1. Maak een API key op [OpenAI Platform](https://platform.openai.com/api-keys).
2. Plaats de key in `OPENAI_API_KEY`.
3. Laat `OPENAI_MODEL=gpt-5.6-terra` en
   `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe` voorlopig staan.
4. Controleer dat API billing actief is.

Genereer ten slotte een cronsecret:

```bash
openssl rand -hex 32
```

Plaats de uitvoer in `CRON_SECRET` en herstart `npm run dev`.

## Pushnotificaties

Northstar gebruikt native Web Push vanuit de geïnstalleerde iPhone-PWA. De
standaardmomenten zijn 08:30 voor de belangrijkste impactzet, 21:00 voor de
avondcheck-in, een conditionele follow-up na 45 minuten en zondag 19:00 voor
de weekreview.

1. Genereer één VAPID-sleutelpaar:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Plaats de publieke key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, de private key in
   `VAPID_PRIVATE_KEY` en gebruik je e-mailadres als
   `VAPID_SUBJECT=mailto:jij@example.com`.
3. Plan iedere vijf minuten een beveiligde `POST` naar
   `/api/notifications/dispatch` met
   `Authorization: Bearer <CRON_SECRET>`. Supabase Cron is hiervoor voorzien.
4. Open in Northstar **Notificaties & dagritme**, activeer push vanuit de
   geïnstalleerde PWA en stuur een testmelding.

De private VAPID-key en `CRON_SECRET` blijven uitsluitend server-side.

## Google Calendar

De integratie gebruikt Google OAuth met PKCE en bewaart access- en
refresh-tokens uitsluitend server-side, versleuteld met AES-256-GCM. De coach
ontvangt alleen begrensde eventgegevens uit de geselecteerde agenda’s:
eventtitel, start, einde en locatie. Beschrijvingen worden niet doorgestuurd.

1. Maak in Google Cloud een project en configureer het OAuth consent screen.
2. Activeer **Google Calendar API**.
3. Maak onder **Credentials** een OAuth client van het type **Web application**.
4. Voeg exact deze Authorized redirect URI’s toe:

   ```text
   http://localhost:3000/api/integrations/google/callback
   https://northstar-ward.netlify.app/api/integrations/google/callback
   ```

5. Plaats de client-ID en het client-secret in de gelijknamige
   servervariabelen. Zet op productie:

   ```text
   GOOGLE_CALENDAR_REDIRECT_URI=https://northstar-ward.netlify.app/api/integrations/google/callback
   ```

6. Genereer één server-only encryptiesleutel:

   ```bash
   openssl rand -base64 32
   ```

   Plaats de uitvoer in `CALENDAR_TOKEN_ENCRYPTION_KEY`. Wijzig deze sleutel
   niet zonder een tokenmigratie; bestaande koppelingen zijn er mee
   versleuteld.

7. Publiceer de OAuth-app voor de bedoelde testgebruikers. In Google OAuth
   **Testing** kunnen refresh-tokens na korte tijd verlopen; gebruik die modus
   alleen tijdens de beperkte testfase.

Na configuratie opent iedere gebruiker onder **Jij → Google Calendar** zijn
eigen beveiligde Google-flow. De gebruiker kiest welke agenda’s Northstar mag
lezen en precies één beschrijfbare agenda voor voorstellen.

Northstar verwijdert geen events, nodigt geen gasten uit en past geen
terugkerende reeks aan. Updates met gasten, recurrence of een gewijzigde ETag
worden geblokkeerd en moeten opnieuw worden beoordeeld.

## Kwaliteitscontrole

```bash
npm run verify
npm run test:e2e
npm run health
```

`verify` voert lint, unit-tests en de productiebuild uit. De browsertests
draaien lokaal in Chromium met een iPhone-profiel; CI voegt WebKit toe.
`health` doet veilige live reads op het databaseschema en controleert of de
gekozen OpenAI-modellen bereikbaar zijn.

Voor integratietests zonder productiedata staat een apart contract in
`.env.test.example`. De volledige aanpak en resterende vereisten staan in
`docs/operational-plan.md`.

## Datamodel

De migraties staan in `supabase/migrations/`. Ruwe journal-entries blijven de
bron van waarheid. Afgeleide memories bevatten zekerheid, belang, geldigheid
en verwijzingen naar hun bronentries. De dagelijkse planlus combineert
concrete taken, avondreviews en de activiteitenhistoriek zonder de ruwe
input te overschrijven.

De context compiler in `lib/context.ts` assembleert per coachbeurt:

1. de huidige entry;
2. de entries van vandaag;
3. relevante oudere entries en volledige check-ins;
4. recente dagsamenvattingen;
5. actieve commitments en doelen;
6. relevante, brongebonden memories;
7. expliciete regels rond zekerheid en coaching.

De consolidatie- en retrievalregels staan in
[docs/memory-architecture.md](docs/memory-architecture.md).

## Volgende implementatiestappen

Zie [docs/operational-plan.md](docs/operational-plan.md).
