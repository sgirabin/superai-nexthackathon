import type { PickCard, UserContext } from "./types";

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function distanceScore(distanceKm: number | undefined, radiusKm: number): number {
  if (distanceKm === undefined) return 0.45;
  if (distanceKm <= 0.25) return 1;
  if (distanceKm <= radiusKm) return Math.max(0.2, 1 - (distanceKm / Math.max(radiusKm, 0.1)) * 0.75);
  return 0;
}

function interestScore(card: PickCard, context: UserContext): number {
  const interests = new Set(context.interests.map((item) => item.toLowerCase()));
  const haystack = [card.category, card.title, card.description, ...card.tags].join(" ").toLowerCase();
  for (const interest of interests) {
    if (haystack.includes(interest.toLowerCase())) return 1;
  }
  if (context.mode === "visitor" && /tourist|visitor|things to do|local food/.test(haystack)) return 0.9;
  if (context.mode === "worker" && /lunch|coffee|after work|transport/.test(haystack)) return 0.9;
  if (context.mode === "resident" && /grocery|deal|community|family/.test(haystack)) return 0.85;
  return 0.45;
}

function timeScore(card: PickCard, context: UserContext): number {
  const tod = context.timeOfDay ?? "evening";
  const haystack = [card.category, ...card.tags].join(" ").toLowerCase();
  if (tod === "morning" && /breakfast|coffee|commute|weather/.test(haystack)) return 1;
  if (tod === "lunch" && /lunch|food|deal|cheap food/.test(haystack)) return 1;
  if (tod === "evening" && /dinner|grocery|event|family|deal/.test(haystack)) return 1;
  if (tod === "weekend" && /weekend|family|event|tourist|fitness/.test(haystack)) return 1;
  return 0.55;
}

function weatherBoost(card: PickCard, context: UserContext): number {
  const weather = context.weather?.toLowerCase() ?? "";
  const haystack = [card.category, ...card.tags].join(" ").toLowerCase();
  if (/rain|shower|thunder/.test(weather)) {
    if (/indoor|rainy day|mall|transport|weather/.test(haystack)) return 0.15;
    if (/outdoor|jogging/.test(haystack)) return -0.2;
  }
  return 0;
}

function sourceScore(card: PickCard): number {
  if (!card.sourceUrl?.startsWith("http")) return 0;
  return card.sourceVerified ? 0.9 : 0.45;
}

function explain(card: PickCard, context: UserContext): string {
  const reasons: string[] = [];
  if (card.distanceKm !== undefined) reasons.push(`within ${card.distanceKm.toFixed(1)} km of ${context.locationName}`);
  const interestMatch = context.interests.find((interest) =>
    [card.category, card.title, card.description, ...card.tags].join(" ").toLowerCase().includes(interest.toLowerCase())
  );
  if (interestMatch) reasons.push(`matches your interest: ${interestMatch}`);
  if (card.sourceVerified) reasons.push("has a source link to verify details");
  if (reasons.length === 0) reasons.push("ranked as a useful local pick from source-backed data");
  return `Shown because it is ${reasons.join("; ")}.`;
}

export function rankCards(cards: PickCard[], context: UserContext, limit = 6): PickCard[] {
  return cards
    .map((card) => {
      const score =
        0.3 * distanceScore(card.distanceKm, context.radiusKm) +
        0.25 * interestScore(card, context) +
        0.18 * timeScore(card, context) +
        0.15 * sourceScore(card) +
        0.12 * clamp(card.score ?? 0.55) +
        weatherBoost(card, context);

      return {
        ...card,
        score: Number(clamp(score).toFixed(4)),
        whyShown: card.whyShown ?? explain(card, context)
      };
    })
    .filter((card) => card.distanceKm === undefined || card.distanceKm <= context.radiusKm * 1.5)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}
