import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDecisionPrompts } from "./decision-prompts";
import { defaultUserContext } from "./mock-data";
import { runAgent } from "./orchestrator";

describe("decision engine integration", () => {
  const originalExaKey = process.env.EXA_API_KEY;
  const originalGatewayKey = process.env.VERCEL_AI_GATEWAY_API_KEY;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    process.env.EXA_API_KEY = originalExaKey;
    process.env.VERCEL_AI_GATEWAY_API_KEY = originalGatewayKey;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("generates first-load prompts from masked location, time, weather and persona", () => {
    const prompts = buildDecisionPrompts(
      {
        ...defaultUserContext,
        locationName: "near MASKED_AREA",
        weather: "Clear",
        timeOfDay: "evening"
      },
      new Date("2026-06-10T19:30:00+08:00"),
      { condition: "Clear" }
    );

    expect(prompts).toHaveLength(4);
    expect(prompts[0]).toContain("chill dinner or bar");
    expect(prompts[0]).toContain("MASKED_AREA");
    expect(prompts[1]).toContain("pint of beer under $15");
    expect(prompts.join(" ")).toContain("male 30s");
  });

  it("returns rich source-backed decision output for a price-sensitive Exa query", async () => {
    process.env.EXA_API_KEY = "test-exa-key";
    process.env.VERCEL_AI_GATEWAY_API_KEY = "test-ai-gateway-key";

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);

      if (href.includes("/search")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
        expect(body.query).toMatch(/beer|pint|happy hour|prices/i);

        return new Response(
          JSON.stringify({
            results: [
              {
                id: "exa-bar-1",
                title: "Good Value Taproom - Beer Menu and Happy Hour",
                url: "https://example.com/good-value-taproom",
                text:
                  "Good Value Taproom serves lager from S$12 per pint during happy hour. Address: 12 Example Road Singapore 123456. Opening hours: Mon-Fri 4pm-11pm, Sat-Sun 12pm-11pm. Check source for latest menu prices.",
                highlights: [
                  "S$12 per pint during happy hour",
                  "12 Example Road Singapore 123456",
                  "Opening hours: Mon-Fri 4pm-11pm"
                ],
                score: 0.91
              },
              {
                id: "exa-bar-2",
                title: "Neighbourhood Pub Beer Prices",
                url: "https://example.com/neighbourhood-pub",
                text:
                  "Neighbourhood Pub lists selected beers below $15. Address: 88 Sample Street Singapore 654321. Daily happy hour 5pm-8pm.",
                highlights: ["selected beers below $15", "88 Sample Street Singapore 654321", "Daily happy hour 5pm-8pm"],
                score: 0.84
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (href.includes("/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ content: string }> };
        const userPayload = JSON.parse(body.messages?.[1]?.content ?? "{}") as {
          cards?: Array<{ metadata?: { priceSignals?: string[]; addressSignals?: string[]; openingSignals?: string[] } }>;
        };

        expect(userPayload.cards?.[0]?.metadata?.priceSignals?.join(" ")).toContain("S$12");
        expect(userPayload.cards?.[0]?.metadata?.addressSignals?.join(" ")).toContain("Example Road");
        expect(userPayload.cards?.[0]?.metadata?.openingSignals?.join(" ")).toContain("Opening hours");

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer:
                      "Best pick: Good Value Taproom because the source snippet shows S$12 per pint, an address on Example Road, and opening hours. Verify the latest happy-hour price at source before going.",
                    followUps: [
                      "Show only bars with price signals",
                      "Which option is closest?",
                      "Find happy hour timings",
                      "Compare by value"
                    ]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch URL: ${href}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const response = await runAgent({
      sessionId: "integration-test-session",
      message: "find me a bar where a pint of beer less than $15",
      context: {
        ...defaultUserContext,
        locationName: "near MASKED_AREA",
        interests: ["Food & Dining", "Deals", "Coffee"],
        weather: "Clear",
        timeOfDay: "evening"
      }
    });

    expect(response.fallbackUsed).toBe(false);
    expect(response.intent).toBe("food_discovery");
    expect(response.answer).toContain("S$12");
    expect(response.answer).toContain("Example Road");
    expect(response.followUps).toHaveLength(4);
    expect(response.cards.length).toBeGreaterThanOrEqual(2);
    expect(response.cards[0].description).toContain("Price/deal signals");
    expect(response.cards[0].description).toContain("Address signals");
    expect(response.cards[0].metadata?.priceSignals).toEqual(expect.arrayContaining([expect.stringContaining("S$12")]));
    expect(response.cards[0].metadata?.addressSignals).toEqual(expect.arrayContaining([expect.stringContaining("Example Road")]));
    expect(response.cards[0].metadata?.openingSignals).toEqual(expect.arrayContaining([expect.stringContaining("Opening hours")]));
    expect(response.trace.some((step) => step.tool === "exa" && step.status === "success")).toBe(true);
    expect(response.trace.some((step) => step.tool === "ai-gateway" && step.status === "success")).toBe(true);
  });

  it("reuses previous ranked cards for comparison follow-ups instead of starting a new Exa search", async () => {
    process.env.EXA_API_KEY = "test-exa-key";
    process.env.VERCEL_AI_GATEWAY_API_KEY = "test-ai-gateway-key";

    let exaCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/search")) {
        exaCalls += 1;
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "lunch-1",
                title: "Lunch Place A",
                url: "https://lunch-a.example.com/menu",
                text: "Lunch Place A has chicken rice at S$8. Address: 1 Masked Road Singapore 111111. Opening hours: Daily 11am-8pm.",
                highlights: ["S$8", "1 Masked Road Singapore 111111", "Daily 11am-8pm"],
                score: 0.9
              },
              {
                id: "lunch-2",
                title: "Noodle House B",
                url: "https://lunch-b.example.com/menu",
                text: "Noodle House B has noodles at S$12. Address: 2 Masked Street Singapore 222222. Opening hours: Daily 10am-9pm.",
                highlights: ["S$12", "2 Masked Street Singapore 222222", "Daily 10am-9pm"],
                score: 0.82
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (href.includes("/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ content: string }> };
        const payload = JSON.parse(body.messages?.[1]?.content ?? "{}") as { message?: string; cards?: Array<{ title?: string }> };
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: `Comparing the same cards for: ${payload.message}. Options: ${payload.cards?.map((card) => card.title).join(", ")}.`,
                    followUps: ["Pick cheapest", "Pick nearest", "Show opening hours", "Give final choice"]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fetch URL: ${href}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await runAgent({
      sessionId: "integration-test-session",
      message: "lunch near me under $16",
      context: { ...defaultUserContext, locationName: "near MASKED_AREA", timeOfDay: "lunch" }
    });

    const followUp = await runAgent({
      sessionId: "integration-test-session",
      message: "compare price and distance",
      context: { ...defaultUserContext, locationName: "near MASKED_AREA", timeOfDay: "lunch" },
      previousCards: first.cards,
      conversationHistory: [
        { role: "user", content: "lunch near me under $16" },
        { role: "assistant", content: first.answer }
      ]
    });

    expect(exaCalls).toBe(1);
    expect(followUp.cards.map((card) => card.id)).toEqual(first.cards.map((card) => card.id));
    expect(followUp.answer).toContain("Lunch Place A");
    expect(followUp.answer).toContain("Noodle House B");
    expect(followUp.trace.some((step) => step.step === "Reuse previous candidates" && step.status === "success")).toBe(true);
  });
});
