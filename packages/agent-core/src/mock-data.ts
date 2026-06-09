import type { AgentResponse, PickCard, PromotionDraft, UserContext } from "./types.js";

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

export const mockPickCards: PickCard[] = [
  {
    id: "weather-sengkang",
    title: "Weather near Sengkang",
    description: "Partly cloudy today with a high of 33°C. Light rain possible in the evening.",
    category: "weather",
    sourceName: "GoAround Weather Context",
    sourceUrl: "https://www.weather.gov.sg/",
    distanceKm: 1.5,
    score: 0.91,
    whyShown: "Shown because rainy-day context may affect nearby food and activity choices.",
    sourceVerified: true,
    tags: ["weather", "rainy day", "nearby"]
  },
  {
    id: "event-sengkang-riverside",
    title: "Sengkang Riverside Festival",
    description: "Family-friendly activities, live music and riverfront fun this weekend.",
    category: "event",
    sourceName: "Mock community event source",
    sourceUrl: "https://www.onepa.gov.sg/events",
    distanceKm: 1.2,
    score: 0.86,
    whyShown: "Shown because it matches your event and family interests within your selected radius.",
    sourceVerified: true,
    tags: ["event", "family", "weekend"]
  },
  {
    id: "food-hawker-deals",
    title: "Hawker Deals Near You",
    description: "Affordable meals under $5 at popular hawker centres nearby.",
    category: "food",
    sourceName: "Mock food source",
    sourceUrl: "https://www.google.com/search?q=Sengkang+hawker+food+deals",
    distanceKm: 0.75,
    score: 0.84,
    whyShown: "Shown because it is nearby and matches your food and deal interests.",
    sourceVerified: true,
    tags: ["food", "cheap food", "deal", "hawker"]
  }
];

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
  answer: "I found a few useful source-backed picks near Sengkang. The best match is the nearby hawker deal because it is close, affordable, and matches your food and deal interests. I also included rainy-day context and a weekend event option.",
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
      detail: "EXA_API_KEY is not configured, so mock source-backed cards were used.",
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
