import { describe, expect, it } from "vitest";

import { evaluateHand } from "./blackjack";

describe("evaluateHand", () => {
  it("recognises a natural blackjack", () => {
    expect(evaluateHand(["A", "K"])).toEqual({
      blackjack: true,
      bust: false,
      soft: true,
      total: 21,
    });
  });

  it("demotes aces when the hand would otherwise bust", () => {
    expect(evaluateHand(["A", "9", "8"])).toEqual({
      blackjack: false,
      bust: false,
      soft: false,
      total: 18,
    });
  });

  it("detects a bust", () => {
    expect(evaluateHand(["K", "Q", "2"]).bust).toBe(true);
  });
});
