const STOP_WORDS = new Set([
  "aan",
  "als",
  "dan",
  "dat",
  "de",
  "die",
  "dit",
  "een",
  "en",
  "er",
  "heb",
  "het",
  "hier",
  "hoe",
  "ik",
  "in",
  "is",
  "je",
  "kan",
  "maken",
  "me",
  "met",
  "mijn",
  "naar",
  "om",
  "op",
  "te",
  "van",
  "voor",
  "wat",
  "wil",
  "the",
  "this",
  "with",
]);

export type HistoricalContextItem = {
  id: string;
  type: "entry" | "review";
  occurredAt: string;
  content: string;
  metadata?: Record<string, unknown>;
};

function terms(value: string) {
  return new Set(
    value
      .toLocaleLowerCase("nl-BE")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((term) => term.length >= 3 && !STOP_WORDS.has(term)) ?? [],
  );
}

function daysOld(value: string, now: Date) {
  return Math.max(
    0,
    (now.getTime() - new Date(value).getTime()) / (24 * 60 * 60 * 1000),
  );
}

export function selectRelevantHistory({
  query,
  items,
  now = new Date(),
  limit = 18,
}: {
  query: string;
  items: HistoricalContextItem[];
  now?: Date;
  limit?: number;
}) {
  const queryTerms = terms(query);
  const asksForYesterday = /\b(gisteren|yesterday)\b/i.test(query);
  const asksForWeek = /\b(vorige|afgelopen|week|last week)\b/i.test(query);

  return items
    .map((item) => {
      const age = daysOld(item.occurredAt, now);
      const itemTerms = terms(item.content);
      let overlap = 0;
      queryTerms.forEach((term) => {
        if (itemTerms.has(term)) overlap += 1;
      });
      const isYesterday = age >= 0.55 && age < 1.75;
      const temporalBoost =
        (asksForYesterday && isYesterday ? 12 : 0) +
        (asksForWeek && age <= 8 ? 4 : 0);
      const typeBoost = item.type === "review" ? 1.5 : 0;
      const recency = Math.max(0, 5 - age / 2);
      return {
        item,
        score: overlap * 5 + temporalBoost + typeBoost + recency,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.item.occurredAt).getTime() -
          new Date(a.item.occurredAt).getTime(),
    )
    .slice(0, limit)
    .map(({ item }) => ({
      ...item,
      content: item.content.slice(0, 2_500),
    }))
    .sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() -
        new Date(b.occurredAt).getTime(),
    );
}
