import type { AgentIntent } from "./types";

export function classifyIntent(message: string): AgentIntent {
  const text = message.toLowerCase();
  if (/promot|merchant|business|publish|campaign|stripe|pay/.test(text)) return "merchant_promotion";
  if (/beer|bar|pub|pint|drink|cocktail|wine|happy hour|eat|food|lunch|dinner|breakfast|hawker|restaurant|coffee|meal/.test(text)) return "food_discovery";
  if (/event|activity|activities|weekend|kids|family|do near|things to do/.test(text)) return "event_discovery";
  if (/deal|promo|discount|cheap|under|less than|below|price|cost|grocery|supermarket|offer|lobang/.test(text)) return "deal_discovery";
  if (/rain|rainy|indoor|weather|shower/.test(text)) return "rainy_day_plan";
  if (/visit|visitor|tourist|itinerary|plan|explore/.test(text)) return "visitor_plan";
  return "general_discovery";
}

export function buildSearchQuery(intent: AgentIntent, message: string, locationName: string): string {
  const base = `${message} near ${locationName} Singapore`;
  const sourceHints = "official menu price address opening hours review source";
  const priceSensitive = /\$|s\$|sgd|under|less than|below|cheap|price|cost|pint|beer|bar|happy hour|drink/i.test(message);

  switch (intent) {
    case "food_discovery":
      return priceSensitive
        ? `${base} menu prices happy hour beer pint address opening hours reviews`
        : `${base} food hawker restaurant cafe ${sourceHints}`;
    case "event_discovery":
      return `${base} events activities family this week official tickets opening hours`;
    case "deal_discovery":
      return `${base} deals promotions discount price grocery mall ${sourceHints}`;
    case "rainy_day_plan":
      return `${base} indoor rainy day activities malls cafes museums opening hours`;
    case "visitor_plan":
      return `${base} tourist visitor short itinerary attractions food transport opening hours`;
    case "merchant_promotion":
      return `${base} local business promotion examples merchant campaign Singapore`;
    default:
      return `${base} ${sourceHints}`;
  }
}
