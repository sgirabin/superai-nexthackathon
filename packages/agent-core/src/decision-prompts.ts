import type { UserContext } from "./types";

export const defaultDecisionPersona = "male 30s, foodie, likes to chill, value-conscious, prefers practical nearby options";

export type DecisionPromptWeather = {
  condition?: string;
};

export function inferTimeLabel(date: Date): "morning" | "lunch" | "evening" | "weekend" {
  const day = date.getDay();
  const hour = date.getHours();
  if (day === 0 || day === 6) return "weekend";
  if (hour < 11) return "morning";
  if (hour < 15) return "lunch";
  return "evening";
}

export function buildDecisionPrompts(context: UserContext, localTime: Date, weather: DecisionPromptWeather = {}, persona = defaultDecisionPersona): string[] {
  const area = context.locationName.replace(/^near\s+/i, "") || "my area";
  const hour = localTime.getHours();
  const isRainy = /rain|shower|thunder/i.test(weather.condition ?? "");
  const base = [
    `What is the best thing to do around ${area} now for a ${persona}?`,
    `Compare food, drinks, and chill options near ${area} for right now`,
    `Find me something good value near ${area} with source-backed prices`,
    `Build a short plan around ${area} using live sources`
  ];

  if (isRainy) {
    return [
      `What should I do near ${area} if it may rain?`,
      `Find indoor food and chill options near ${area}`,
      ...base.slice(1, 3)
    ].slice(0, 4);
  }

  if (hour >= 17) {
    return [
      `Find me a chill dinner or bar near ${area} with good value`,
      `Where can I get a pint of beer under $15 near ${area}?`,
      ...base.slice(0, 2)
    ].slice(0, 4);
  }

  if (hour >= 11 && hour < 15) {
    return [
      `Pick the best lunch near ${area} under $15`,
      `Compare quick lunch options near ${area}`,
      ...base.slice(0, 2)
    ].slice(0, 4);
  }

  return [
    `Find coffee or breakfast near ${area}`,
    `What is worth doing near ${area} this morning?`,
    ...base.slice(0, 2)
  ].slice(0, 4);
}
