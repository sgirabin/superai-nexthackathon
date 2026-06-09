import { describe, expect, it } from "vitest";
import { mockPickCards, defaultUserContext } from "./mock-data";
import { rankCards } from "./ranking";

describe("rankCards", () => {
  it("returns cards sorted by score", () => {
    const ranked = rankCards(mockPickCards, defaultUserContext, 3);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].score ?? 0).toBeGreaterThanOrEqual(ranked[i].score ?? 0);
    }
  });

  it("keeps whyShown explanations", () => {
    const ranked = rankCards(mockPickCards, defaultUserContext, 3);
    expect(ranked[0].whyShown).toBeTruthy();
  });
});
