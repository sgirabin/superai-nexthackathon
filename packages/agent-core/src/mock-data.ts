import type { AgentResponse, PickCard, PromotionDraft, UserContext } from "./types";

export const defaultUserContext: UserContext = {
  mode: "resident",
  locationName: "Sengkang",
  lat: 1.38771,
  lon: 103.89154,
  radiusKm: 1.5,
  interests: ["Food & Dining", "Events", "Groceries", "Deals"],
  weather: "Partly cloudy, light rain possible in the evening",
  timeOfDay: "evening"
};

function areaLabel(context: UserContext): string {
  return context.locationName?.replace(/^near\s+/i, "") || "your area";
}

export function buildFallbackPickCards(context: UserContext = defaultUserContext): PickCard[] {
  const area = areaLabel(context);
  const encodedArea = encodeURIComponent(`${area} Singapore`);
  const weatherText = context.weather ?? "Local weather context is available for ranking.";

  return [
    {
      id: `weather-${encodedArea}`,
      title: `Weather near ${area}`,
      description: weatherText,
      category: "weather",
      sourceName: "GoAround Weather Context",
      sourceUrl: "https://www.weather.gov.sg/",
      distanceKm: Math.min(context.radiusKm, 1.5),
      score: 0.91,
      whyShown: "Shown because weather affects nearby food, event, and indoor activity choices.",
      sourceVerified: true,
      tags: ["weather", "rainy day", "nearby", area]
    },
    {
      id: `event-${encodedArea}`,
      title: `Events near ${area}`,
      description: `Source-backed community activities and events around ${area}. Open the source to verify timing and details.`,
      category: "event",
      sourceName: "OnePA events",
      sourceUrl: `https://www.onepa.gov.sg/events?search=${encodedArea}`,
      distanceKm: Math.min(context.radiusKm, 1.2),
      score: 0.86,
      whyShown: `Shown because it matches event and family interests around ${area}.`,
      sourceVerified: true,
      tags: ["event", "family", "weekend", area]
    },
    {
      id: `food-${encodedArea}`,
      title: `Food deals near ${area}`,
      description: `Affordable food and dining options around ${area}. Open the source before relying on prices or opening hours.`,
      category: "food",
      sourceName: "Google local source search",
      sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(`${area} Singapore hawker food deals`)}`,
      distanceKm: Math.min(context.radiusKm, 0.75),
      score: 0.84,
      whyShown: `Shown because it is nearby and matches your food and deal interests around ${area}.`,
      sourceVerified: true,
      tags: ["food", "cheap food", "deal", "hawker", area]
    }
  ];
}

export const mockPickCards: PickCard[] = buildFallbackPickCards(defaultUserContext);

export const mockPromotionDraft: PromotionDraft = {
  id: "promo-demo-001",
  businessName: "Ah Boyz Chicken Rice",
  title: "50% Off Signature Chicken Rice (Dinner Special)",
  description: "Enjoy our signature Hainanese Chicken Rice at 50% off for dinner. Freshly steamed chicken, fragrant rice, and our homemade chilli.",
  category: "promotion",
  locationName: "Sengkang",
  sourceUrl: "https://ahboyzchickenrice.sg/promos/dinner-special",
  validFrom: "2026-06-09",
  validTo: "2026-06-16",
  status: "review_required"
};

export const mockAgentResponse: AgentResponse = {
  runId: "mock-run-001",
  intent: "general_discovery",
  answer: "I found a few useful source-backed picks near Sengkang. The best match is nearby food because it is close, affordable, and matches your food and deal interests. I also included weather context and an event option.",
  cards: mockPickCards,
  fallbackUsed: true,
  trace: [
    {
      step: "Classify request",
      status: "success",
      detail: "Intent classified as general local discovery.",
      tool: "orchestrator"
    },
    {
      step: "Search live sources",
      status: "skipped",
      detail: "EXA_API_KEY is not configured, so source-backed fallback cards were used.",
      tool: "exa"
    },
    {
      step: "Rank candidate cards",
      status: "success",
      detail: "Cards ranked by distance, interests, time, freshness, and source reliability.",
      tool: "ranking"
    }
  ]
};
