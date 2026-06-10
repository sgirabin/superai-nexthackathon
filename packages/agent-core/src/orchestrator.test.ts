import { describe, expect, it } from "vitest";
import { defaultUserContext } from "./mock-data";
import { runAgent } from "./orchestrator";
import type { PickCard } from "./types";

const previousFoodCards: PickCard[] = [
  {
    id: "food-1",
    title: "Fast Lunch Noodles",
    description: "Quick noodle lunch near Sengkang.",
    category: "food",
    sourceName: "Test source",
    sourceUrl: "https://example.com/noodles",
    sourceVerified: true,
    tags: ["food", "lunch"]
  },
  {
    id: "food-2",
    title: "Budget Chicken Rice",
    description: "Affordable chicken rice near Sengkang.",
    category: "food",
    sourceName: "Test source",
    sourceUrl: "https://example.com/rice",
    sourceVerified: true,
    tags: ["food", "cheap"]
  }
];

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("runAgent", () => {
  it("returns fallback response when Exa key is not configured", async () => {
    const originalKey = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;

    const response = await runAgent({
      sessionId: "test-session",
      message: "Where can I eat cheap near me?",
      context: defaultUserContext
    });

    restoreEnv("EXA_API_KEY", originalKey);

    expect(response.runId).toMatch(/^run-/);
    expect(response.intent).toBe("food_discovery");
    expect(response.cards.length).toBeGreaterThan(0);
    expect(response.fallbackUsed).toBe(true);
    expect(response.trace.some((step) => step.tool === "exa")).toBe(true);
  });

  it("reuses previous cards for clearly referential compatible follow-ups", async () => {
    const originalExaKey = process.env.EXA_API_KEY;
    const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
    delete process.env.EXA_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;

    const response = await runAgent({
      sessionId: "test-session",
      message: "Which of these is cheapest?",
      context: defaultUserContext,
      previousCards: previousFoodCards
    });

    restoreEnv("EXA_API_KEY", originalExaKey);
    restoreEnv("AI_GATEWAY_API_KEY", originalGatewayKey);

    expect(response.trace.some((step) => step.step === "Reuse previous candidates")).toBe(true);
    expect(response.trace.some((step) => step.step === "Search live sources")).toBe(false);
    expect(response.cards.map((card) => card.id).sort()).toEqual(["food-1", "food-2"]);
  });

  it("does not reuse stale cards for a fresh incompatible domain question", async () => {
    const originalExaKey = process.env.EXA_API_KEY;
    const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
    delete process.env.EXA_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;

    const response = await runAgent({
      sessionId: "test-session",
      message: "Which events are happening this weekend?",
      context: defaultUserContext,
      previousCards: previousFoodCards
    });

    restoreEnv("EXA_API_KEY", originalExaKey);
    restoreEnv("AI_GATEWAY_API_KEY", originalGatewayKey);

    expect(response.intent).toBe("event_discovery");
    expect(response.trace.some((step) => step.step === "Reuse previous candidates")).toBe(false);
    expect(response.trace.some((step) => step.step === "Search live sources")).toBe(true);
  });
});
