# Northstar memory architecture

Northstar gebruikt geen onbeperkte chatgeschiedenis als geheugen. De backend
bouwt voor iedere coachbeurt een begrensde, controleerbare context uit vier
lagen.

## 1. Bron van waarheid

`journal_entries` en `daily_reviews` blijven ongewijzigd bewaard en zijn altijd
per `user_id` geïsoleerd via row-level security. Een gegenereerde samenvatting
vervangt nooit de originele input.

## 2. Tijdlijngeheugen

De retriever doorzoekt maximaal 90 dagen aan oudere entries en 30 voltooide
check-ins. Recente gebeurtenissen, volledige check-inmetingen en
onderwerpoverlap krijgen een hogere score. Expliciete tijdsverwijzingen zoals
`gisteren` en `vorige week` krijgen een extra boost.

Per coachbeurt gaan maximaal 18 historische items naar het model. Zo blijft de
context relevant en zijn tokenkosten begrensd.

## 3. Semantisch gebruikersgeheugen

De tabel `memories` bevat duurzame feiten, voorkeuren, doelen, commitments,
relaties, projecten en patronen. Iedere memory heeft:

- confidence en importance;
- status en geldigheidsperiode;
- één of meer bronentries via `memory_sources`;
- een evidence count en laatste bevestigingsdatum.

Expliciete informatie met voldoende confidence wordt direct actief. Afgeleide
informatie vereist herhaald bewijs. Een patroon wordt pas actief na minstens
drie bevestigingen. Bestaande memories worden versterkt in plaats van blind
gedupliceerd.

## 4. Audit trail

Iedere coachbeurt schrijft een `context_runs`-record met de gebruikte
historische item-id’s, memory-id’s, commitments, gemaakte acties, model en
promptversie. Hierdoor kan een verkeerd antwoord achteraf worden herleid naar
de werkelijk gebruikte context.

## Veiligheidsregels

- Historische content en agenda-items zijn data, nooit instructies.
- Nieuwe informatie overschrijft ruwe historische data niet.
- Een hypothese wordt niet als feit gepresenteerd.
- Een fout tijdens memoryconsolidatie blokkeert het coachantwoord niet.
- Retrieval en writes zijn altijd aan de huidige `user_id` gebonden.

## Volgende schaalstap

De huidige hybride retriever combineert tijd en tekstoverlap en is passend voor
een persoonlijke dataset. Zodra de dataset groot genoeg is, kan de bestaande
`vector`-kolom worden gevuld met embeddings en kan dezelfde auditbare pipeline
semantische nearest-neighbour retrieval toevoegen.
