import type { PickCard } from "./types";

export const mockPickCards: PickCard[] = [
  {
    id: "mock-weather-sengkang",
    title: "Weather near Sengkang",
    description: "Partly cloudy today with possible light rain in the evening. Prefer indoor or nearby options if the weather changes.",
    category: "weather",
    sourceName: "Mock weather fallback",
    sourceUrl: "https://www.weather.gov.sg/",
    distanceKm: 1.5,
    sourceVerified: true,
    tags: ["weather", "rainy day", "indoor"],
    score: 0.82,
    whyShown: "Shown because weather affects nearby activity and dining plans."
  },
  {
    id: "mock-food-hawker",
    title: "Hawker deals near you",
    description: "Affordable meals and local food options near popular hawker centres. Open the source to verify stalls and opening hours.",
    category: "food",
    sourceName: "GoAround mock local source",
    sourceUrl: "https://www.google.com/search?q=hawker+food+near+Sengkang",
    distanceKm: 0.75,
    sourceVerified: true,
    tags: ["food", "cheap food", "hawker", "lunch", "deal"],
    score: 0.78,
    whyShown: "Shown because it matches food, budget and nearby distance preferences."
  },
  {
    id: "mock-event-riverside",
    title: "Sengkang Riverside family activity",
    description: "A family-friendly outdoor idea near the riverfront. Verify event timing and details before going.",
    category: "event",
    sourceName: "GoAround mock event source",
    sourceUrl: "https://www.google.com/search?q=Sengkang+Riverside+events+this+weekend",
    distanceKm: 1.2,
    sourceVerified: true,
    tags: ["event", "family", "weekend", "things to do"],
    score: 0.74,
    whyShown: "Shown because it fits family and weekend activity intent within the selected radius."
  }
];
