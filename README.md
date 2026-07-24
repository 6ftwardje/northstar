# Northstar

Een iPhone-first journal en personal life guide voor zakelijke impact,
gezondheid en duurzame gedragsverandering.

## Huidige MVP

- meerdere journal-entries per dag;
- tekst en een prototype van de spraakflow;
- één dagelijkse Impact Move;
- actieve, directe coachinterface;
- verplichte avondcheck-in om 21:00;
- progress-overzicht voor impact, slaap, cannabis en training;
- transparant Memory-overzicht;
- lokale browserpersistentie voor snelle productvalidatie;
- installeerbare PWA-basis met iPhone-appicoon;
- voorbereid Supabase-schema met Row Level Security;
- pure context compiler voor reproduceerbare AI-context.

Zolang de placeholders niet zijn ingevuld, gebruikt de app demo-reacties en
lokale browseropslag. Na configuratie bewaart de API entries in Supabase,
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
```

Plaats secrets nooit in clientcomponenten of in git.

Controleer daarna de configuratie zonder waarden te tonen:

```bash
npm run check:setup
```

## Supabase instellen

1. Maak een project op [Supabase](https://supabase.com/dashboard).
2. Open **SQL Editor** en voer de volledige inhoud van
   `supabase/migrations/0001_initial.sql` uit.
3. Kopieer bij **Project Settings → API** de project URL, publishable/anon key
   en service-role key naar `.env.local`.
4. Zet bij **Authentication → URL Configuration**:
   - Site URL: `https://northstar-ward.netlify.app`
   - Redirect URL lokaal: `http://localhost:3000/auth/callback`
   - Redirect URL productie:
     `https://northstar-ward.netlify.app/auth/callback`
5. Open **Authentication → Email Templates → Magic Link**. Verander de
   template zodat Supabase een zescijferige code stuurt in plaats van een
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
3. Lees of kopieer de zescijferige code uit je inbox.
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

## Datamodel

De eerste migratie staat in `supabase/migrations/0001_initial.sql`. Ruwe
journal-entries blijven de bron van waarheid. Afgeleide memories bevatten
zekerheid, belang, geldigheid en verwijzingen naar hun bronentries.

De context compiler in `lib/context.ts` assembleert per coachbeurt:

1. de huidige entry;
2. de entries van vandaag;
3. recente dagsamenvattingen;
4. actieve commitments en doelen;
5. relevante historische memories;
6. expliciete regels rond zekerheid en coaching.

## Volgende implementatiestappen

1. Browserstate hydrateren vanuit Supabase na login.
2. Echte MediaRecorder-opname aansluiten op `/api/transcribe`.
3. Candidate memories reviewen, dedupliceren en activeren.
4. Avondreview server-side opslaan en consolideren.
5. Web push en de 21:00 reminderflow.
6. Productie-installatietest op iPhone.
