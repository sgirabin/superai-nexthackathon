import type { AgentIntent } from "./types";

export function classifyIntent(message: string): AgentIntent {
  const text = message.toLowerCase();
  if (/promot|merchant|business|publish|campaign|stripe|pay/.test(text)) return "merchant_promotion";
  if (/eat|food|lunch|dinner|breakfast|hawker|restaurant|coffee|meal/.test(text)) return "food_discovery";
  if (/event|activity|activities|weekend|kids|family|do near|things to do/.test(text)) return "event_discovery";
  if (/deal|promo|discount|cheap|grocery|supermarket|offer|lobang/.test(text)) return "deal_discovery";
  if (/rain|rainy|indoor|weather|shower/.test(text)) return "rainy_day_plan";
  if (/visit|visitor|tourist|itinerary|plan|explore/.test(text)) return "visitor_plan";
  return "general_discovery";
}

export function buildSearchQuery(intent: AgentIntent, message: string, locationName: string): string {
  const suffix = `${locationName} Singapore source official opening hours promotion event`;
  switch (intent) {
    case "food_discovery":
      return `${message} food hawker restaurant near ${suffix}`;
    case "event_discovery":
      return `${message} events activities family near ${suffix}`;
    case "deal_discovery":
      return `${message} deals promotions grocery mall near ${suffix}`;
    case "rainy_day_plan":
      return `${message} indoor rainy day activities near ${suffix}`;
    case "visitor_plan":
      return `${message} tourist visitor short itinerary near ${suffix}`;
    default:
      return `${message} near ${suffix}`;
  }
}
