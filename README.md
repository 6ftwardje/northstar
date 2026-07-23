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
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/callback`
5. Laat e-mail magic links ingeschakeld.

De service-role key is server-only en mag nooit in een `NEXT_PUBLIC_` variabele
terechtkomen.

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
