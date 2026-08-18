import { isMvpRuleset, type RulesetV2 } from "@spelsajt/config";

import type { CardRank } from "./blackjack";
import { blackjackSuits, type BlackjackCard } from "./blackjack-engine";

export const blackjackRanks = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const satisfies readonly CardRank[];

/**
 * Builds the canonical, unshuffled physical shoe for a versioned ruleset.
 * Fairness owns the subsequent shuffle; this function never reads RNG, time or I/O.
 */
export function createBlackjackShoe(ruleset: RulesetV2): readonly BlackjackCard[] {
  if (!isMvpRuleset(ruleset)) {
    throw new TypeError("Blackjack shoe requires the frozen mvp-v2 ruleset.");
  }

  const deckCount = ruleset.blackjack.decks;

  if (!Number.isInteger(deckCount) || deckCount < 1 || deckCount > 8) {
    throw new RangeError("Blackjack shoe requires between one and eight decks.");
  }

  const cards: BlackjackCard[] = [];

  for (let deckNumber = 1; deckNumber <= deckCount; deckNumber += 1) {
    for (const suit of blackjackSuits) {
      for (const rank of blackjackRanks) {
        cards.push(Object.freeze({
          cardId: `deck-${deckNumber}:${suit}:${rank}`,
          rank,
          suit,
        }));
      }
    }
  }

  return Object.freeze(cards);
}
