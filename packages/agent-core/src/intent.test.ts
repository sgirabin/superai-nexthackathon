import { describe, expect, it } from "vitest";
import { buildSearchQuery, classifyIntent } from "./intent";

describe("classifyIntent", () => {
  it("detects food discovery", () => {
    expect(classifyIntent("Where can I eat cheap near me for lunch?")).toBe("food_discovery");
  });

  it("detects event discovery", () => {
    expect(classifyIntent("What family activities are happening this weekend?")).toBe("event_discovery");
  });

  it("detects deal discovery", () => {
    expect(classifyIntent("Any grocery discount or promo nearby?")).toBe("deal_discovery");
  });

  it("detects rainy day plan", () => {
    expect(classifyIntent("Indoor ideas if it rains tonight")).toBe("rainy_day_plan");
  });

  it("detects merchant promotion", () => {
    expect(classifyIntent("I want to publish a business promotion and pay")).toBe("merchant_promotion");
  });
});

describe("buildSearchQuery", () => {
  it("includes location and Singapore context", () => {
    const query = buildSearchQuery("food_discovery", "cheap food", "Sengkang");
    expect(query).toContain("Sengkang");
    expect(query).toContain("Singapore");
    expect(query).toContain("food");
  });
});
