import type { PickCard, SearchToolInput, SearchToolResult } from "../types";
import { buildFallbackPickCards } from "../mock-data";

type ExaResult = {
  id?: string;
  title?: string;
  url?: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  score?: number;
};

type ExaResponse = {
  results?: ExaResult[];
};

const GENERIC_TITLE_WORDS = new Set([
  "home",
  "official",
  "website",
  "singapore",
  "sg",
  "menu",
  "review",
  "reviews",
  "corner",
  "facebook",
  "instagram",
  "tripadvisor",
  "google",
  "maps",
  "best",
  "food",
  "restaurant",
  "restaurants",
  "cafe",
  "cafes",
  "near",
  "mall"
]);

function inferCategory(input: SearchToolInput): PickCard["category"] {
  switch (input.intent) {
    case "food_discovery":
      return "food";
    case "event_discovery":
      return "event";
    case "deal_discovery":
      return "deal";
    case "rainy_day_plan":
      return "event";
    case "merchant_promotion":
      return "promotion";
    default:
      return "other";
  }
}

function sourceNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Exa source";
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function canonicalTitle(title: string): string {
  const firstPart = title
    .toLowerCase()
    .split(/\s+[|–—-]\s+|:/)[0]
    .replace(/#[\w-]+/g, " ")
    .replace(/\b\d+[a-z]?\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = firstPart
    .split(" ")
    .filter((word) => word.length > 1 && !GENERIC_TITLE_WORDS.has(word));

  return words.slice(0, 4).join(" ") || firstPart;
}

function cardSpecificity(card: PickCard): number {
  const title = card.title.toLowerCase();
  let score = 0;
  if (/bay|centre|center|market|street|road|ave|avenue|mall|branch|outlet|gluttons/.test(title)) score += 2;
  if (card.description.length > 120) score += 2;
  if (card.description.length > 80) score += 1;
  if (card.metadata?.priceSignals) score += 2;
  if (card.metadata?.addressSignals) score += 1;
  if (card.metadata?.openingSignals) score += 1;
  if (card.sourceVerified) score += 1;
  score += Math.min(2, Math.floor(card.title.length / 35));
  return score + (card.score ?? 0);
}

function isLikelyDuplicate(left: PickCard, right: PickCard): boolean {
  const leftHost = hostFromUrl(left.sourceUrl);
  const rightHost = hostFromUrl(right.sourceUrl);
  const leftTitle = canonicalTitle(left.title);
  const rightTitle = canonicalTitle(right.title);

  if (left.sourceUrl === right.sourceUrl) return true;
  if (leftTitle && rightTitle && leftTitle === rightTitle) return true;

  const leftFirst = leftTitle.split(" ")[0];
  const rightFirst = rightTitle.split(" ")[0];
  const sameBrand = Boolean(leftFirst && rightFirst && leftFirst === rightFirst && leftFirst.length >= 5);
  const sameHost = leftHost !== "unknown" && leftHost === rightHost;

  return sameHost && sameBrand;
}

function dedupeCards(cards: PickCard[], limit = 8): PickCard[] {
  const kept: PickCard[] = [];

  for (const card of cards) {
    const duplicateIndex = kept.findIndex((candidate) => isLikelyDuplicate(candidate, card));
    if (duplicateIndex === -1) {
      kept.push(card);
      continue;
    }

    if (cardSpecificity(card) > cardSpecificity(kept[duplicateIndex])) {
      kept[duplicateIndex] = card;
    }
  }

  return kept.slice(0, limit);
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(items: string[], limit: number): string[] {
  return Array.from(new Set(items.map(compactWhitespace).filter(Boolean))).slice(0, limit);
}

function extractPriceSignals(text: string): string[] {
  return unique(
    [
      ...text.matchAll(/(?:S\$|SGD|\$)\s?\d{1,3}(?:\.\d{1,2})?(?:\s?(?:\+\+|net|nett|per\s?pint|pint|beer|drink|cocktail|set|meal))?/gi),
      ...text.matchAll(/\b(?:under|below|less than)\s?(?:S\$|SGD|\$)?\s?\d{1,3}\b/gi),
      ...text.matchAll(/\b(?:happy hour|pint|beer|drink deals?|promo(?:tion)?s?|discounts?)\b[^.\n]{0,80}/gi)
    ].map((match) => match[0]),
    4
  );
}

function extractAddressSignals(text: string): string[] {
  return unique(
    [
      ...text.matchAll(/\b\d{1,3}[A-Z]?\s+[A-Za-z0-9'’&.\- ]{3,60}\s(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Drive|Dr|Walk|Way|Quay|Boulevard|Blvd)\b[^.\n]{0,30}/g),
      ...text.matchAll(/\b(?:#\d{2}-\d{2}|B\d{1,2}-\d{2}|Level\s?\d|Singapore\s?\d{6})\b[^.\n]{0,40}/gi)
    ].map((match) => match[0]),
    3
  );
}

function extractOpeningSignals(text: string): string[] {
  return unique(
    [
      ...text.matchAll(/\b(?:open(?:ing)? hours?|hours?|daily|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)[^.\n]{0,100}/gi),
      ...text.matchAll(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm|AM|PM)\s?(?:-|to|–|—)\s?\d{1,2}(?::\d{2})?\s?(?:am|pm|AM|PM)\b/g)
    ].map((match) => match[0]),
    3
  );
}

function buildRichDescription(result: ExaResult): { description: string; priceSignals: string[]; addressSignals: string[]; openingSignals: string[]; sourceSnippet: string } {
  const sourceSnippet = compactWhitespace([...(result.highlights ?? []), result.text ?? ""].join(" "));
  const priceSignals = extractPriceSignals(sourceSnippet);
  const addressSignals = extractAddressSignals(sourceSnippet);
  const openingSignals = extractOpeningSignals(sourceSnippet);
  const evidence: string[] = [];

  if (priceSignals.length) evidence.push(`Price/deal signals: ${priceSignals.join(" · ")}`);
  if (addressSignals.length) evidence.push(`Address signals: ${addressSignals.join(" · ")}`);
  if (openingSignals.length) evidence.push(`Opening/time signals: ${openingSignals.join(" · ")}`);

  const snippet = sourceSnippet.slice(0, evidence.length ? 180 : 320);
  const description = compactWhitespace([...evidence, snippet || "Source-backed local result found by Exa."].join(" | ")).slice(0, 520);

  return { description, priceSignals, addressSignals, openingSignals, sourceSnippet };
}

function toPickCard(result: ExaResult, input: SearchToolInput, index: number): PickCard {
  const url = result.url ?? "https://exa.ai";
  const { description, priceSignals, addressSignals, openingSignals, sourceSnippet } = buildRichDescription(result);
  return {
    id: result.id ?? `exa-${Date.now()}-${index}`,
    title: result.title ?? "Local source result",
    description,
    category: inferCategory(input),
    sourceName: sourceNameFromUrl(url),
    sourceUrl: url,
    sourceVerified: url.startsWith("http"),
    score: result.score ?? 0.62,
    whyShown: priceSignals.length || addressSignals.length || openingSignals.length
      ? "Matched live source snippets with practical decision signals. Verify latest prices, hours, and availability at source."
      : "Matched live source content for your location and request. Verify details at source.",
    tags: [
      input.intent.replaceAll("_", " "),
      input.context.locationName,
      "exa",
      "live source",
      ...(priceSignals.length ? ["price signal"] : []),
      ...(addressSignals.length ? ["address signal"] : []),
      ...(openingSignals.length ? ["opening hours signal"] : [])
    ],
    metadata: {
      publishedDate: result.publishedDate,
      author: result.author,
      priceSignals,
      addressSignals,
      openingSignals,
      sourceSnippet: sourceSnippet.slice(0, 1000)
    }
  };
}

export async function searchWithExa(input: SearchToolInput): Promise<SearchToolResult> {
  const apiKey = process.env.EXA_API_KEY;
  const baseUrl = process.env.EXA_API_BASE_URL ?? "https://api.exa.ai";
  const fallbackCards = buildFallbackPickCards(input.context);

  if (!apiKey) {
    return {
      cards: fallbackCards,
      fallbackUsed: true,
      raw: { reason: "EXA_API_KEY is not configured" }
    };
  }

  try {
    const response = await fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        query: input.query,
        numResults: 12,
        useAutoprompt: true,
        contents: {
          text: {
            maxCharacters: 1600
          },
          highlights: {
            numSentences: 5,
            highlightsPerUrl: 3
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Exa search failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as ExaResponse;
    const cards = dedupeCards((data.results ?? []).map((result, index) => toPickCard(result, input, index)), 8);

    if (cards.length === 0) {
      return {
        cards: fallbackCards,
        fallbackUsed: true,
        raw: { reason: "Exa returned no results", data }
      };
    }

    return {
      cards,
      fallbackUsed: false,
      raw: data
    };
  } catch (error) {
    return {
      cards: fallbackCards,
      fallbackUsed: true,
      raw: { reason: error instanceof Error ? error.message : "Unknown Exa error" }
    };
  }
}
