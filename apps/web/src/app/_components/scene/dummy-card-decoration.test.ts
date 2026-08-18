import { describe, expect, it } from "vitest";

import { DUMMY_HERO_CARD_CONFIGS } from "./dummy-card-decoration";

describe("dummy hero card decoration", () => {
  it("is explicitly named as dummy artwork", () => {
    expect(DUMMY_HERO_CARD_CONFIGS.every(({ decorativeId }) => decorativeId.startsWith("dummy-hero-card-"))).toBe(true);
  });

  it("cannot be mistaken for authoritative card data", () => {
    for (const config of DUMMY_HERO_CARD_CONFIGS) {
      expect(config.face).not.toHaveProperty("cardId");
    }
  });
});
