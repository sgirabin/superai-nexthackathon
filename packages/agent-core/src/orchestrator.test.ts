import { describe, expect, it } from "vitest";
import { defaultUserContext } from "./mock-data";
import { runAgent } from "./orchestrator";

describe("runAgent", () => {
  it("returns fallback response when Exa key is not configured", async () => {
    const originalKey = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;

    const response = await runAgent({
      sessionId: "test-session",
      message: "Where can I eat cheap near me?",
      context: defaultUserContext
    });

    process.env.EXA_API_KEY = originalKey;

    expect(response.runId).toMatch(/^run-/);
    expect(response.intent).toBe("food_discovery");
    expect(response.cards.length).toBeGreaterThan(0);
    expect(response.fallbackUsed).toBe(true);
    expect(response.trace.some((step) => step.tool === "exa")).toBe(true);
  });
});
