import { createHash } from "node:crypto";

import { mvpRuleset, mvpRulesetHash } from "@spelsajt/config";
import { FairRandom, shuffle, type FairnessInput } from "@spelsajt/fairness";
import {
  FairRandom as BrowserFairRandom,
  shuffle as browserShuffle,
} from "@spelsajt/fairness/browser";
import { describe, expect, it } from "vitest";

import shoeVector from "../test-vectors/blackjack-shoe-pf-v1-mvp-v2.json";
import { createBlackjackShoe } from "./blackjack-shoe";

function shoeDigest(cardIds: readonly string[]): string {
  return createHash("sha256").update(cardIds.join("\n")).digest("hex");
}

describe("blackjack shoe fairness integration", () => {
  it("locks the physical 312-card order identically in Node and Web Crypto", async () => {
    const input = shoeVector.input as FairnessInput;
    const canonicalShoe = createBlackjackShoe(mvpRuleset);
    const nodeCards = shuffle(
      canonicalShoe,
      new FairRandom(shoeVector.serverSeed, input),
    );
    const browserCards = await browserShuffle(
      canonicalShoe,
      new BrowserFairRandom(shoeVector.serverSeed, input),
    );
    const nodeCardIds = nodeCards.map(({ cardId }) => cardId);
    const browserCardIds = browserCards.map(({ cardId }) => cardId);

    expect(shoeVector.algorithmId).toBe(mvpRuleset.fairness.algorithmId);
    expect(shoeVector.rulesetId).toBe(mvpRuleset.id);
    expect(input.rulesetHash).toBe(mvpRulesetHash);
    expect(nodeCardIds).toEqual(browserCardIds);
    expect(nodeCardIds).toHaveLength(312);
    expect(nodeCardIds.slice(0, 16)).toEqual(shoeVector.expected.firstCardIds);
    expect(shoeDigest(nodeCardIds)).toBe(shoeVector.expected.shuffledShoeSha256);
  });
});
