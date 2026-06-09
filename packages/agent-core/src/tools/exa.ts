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
  if (card.description.length > 80) score += 1;
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

function toPickCard(result: ExaResult, input: SearchToolInput, index: number): PickCard {
  const url = result.url ?? "https://exa.ai";
  const description = result.text?.slice(0, 220) || result.highlights?.join(" ").slice(0, 220) || "Source-backed local result found by Exa.";
  return {
    id: result.id ?? `exa-${Date.now()}-${index}`,
    title: result.title ?? "Local source result",
    description,
    category: inferCategory(input),
    sourceName: sourceNameFromUrl(url),
    sourceUrl: url,
    sourceVerified: url.startsWith("http"),
    score: result.score ?? 0.62,
    tags: [input.intent.replaceAll("_", " "), input.context.locationName, "exa", "live source"],
    metadata: {
      publishedDate: result.publishedDate,
      author: result.author
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
          text: true,
          highlights: true
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
