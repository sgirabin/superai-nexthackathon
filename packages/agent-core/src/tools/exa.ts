import type { PickCard, SearchToolInput, SearchToolResult } from "../types.js";
import { mockPickCards } from "../mock-data.js";

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

  if (!apiKey) {
    return {
      cards: mockPickCards,
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
        numResults: 8,
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
    const cards = (data.results ?? []).map((result, index) => toPickCard(result, input, index));

    if (cards.length === 0) {
      return {
        cards: mockPickCards,
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
      cards: mockPickCards,
      fallbackUsed: true,
      raw: { reason: error instanceof Error ? error.message : "Unknown Exa error" }
    };
  }
}
