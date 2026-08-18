import { mvpRuleset, type RulesetV2 } from "@spelsajt/config";
import { describe, expect, it } from "vitest";

import { blackjackRanks, createBlackjackShoe } from "./blackjack-shoe";
import { blackjackSuits } from "./blackjack-engine";

describe("canonical blackjack shoe", () => {
  it("builds all 312 uniquely identified physical cards for the MVP ruleset", () => {
    const shoe = createBlackjackShoe(mvpRuleset);

    expect(shoe).toHaveLength(312);
    expect(new Set(shoe.map(({ cardId }) => cardId)).size).toBe(312);

    for (const suit of blackjackSuits) {
      for (const rank of blackjackRanks) {
        expect(shoe.filter((card) => card.suit === suit && card.rank === rank)).toHaveLength(6);
      }
    }
  });

  it("is deterministic, immutable and does not shuffle the fairness input", () => {
    const first = createBlackjackShoe(mvpRuleset);
    const second = createBlackjackShoe(mvpRuleset);

    expect(first).toEqual(second);
    expect(first[0]).toEqual({ cardId: "deck-1:clubs:2", rank: "2", suit: "clubs" });
    expect(first.at(-1)).toEqual({ cardId: "deck-6:spades:A", rank: "A", suit: "spades" });
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every(Object.isFrozen)).toBe(true);
  });

  it("rejects an invalid deck count at the runtime boundary", () => {
    const invalid = {
      ...mvpRuleset,
      blackjack: { ...mvpRuleset.blackjack, decks: 0 },
    } as unknown as RulesetV2;

    expect(() => createBlackjackShoe(invalid)).toThrow(TypeError);
  });

  it("rejects plausible but changed semantics hidden behind mvp-v2", () => {
    const tampered = {
      ...structuredClone(mvpRuleset),
      blackjack: { ...structuredClone(mvpRuleset.blackjack), decks: 1 },
    } as RulesetV2;

    expect(() => createBlackjackShoe(tampered)).toThrow(TypeError);
  });
});
