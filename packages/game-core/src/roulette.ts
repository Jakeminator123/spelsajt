import { mvpRuleset, mvpRulesetHash } from "@spelsajt/config";

export const europeanRouletteRuleset = {
  pockets: mvpRuleset.roulette.pockets,
  rulesetHash: mvpRulesetHash,
  rulesetId: mvpRuleset.id,
  zeroes: mvpRuleset.roulette.zeroes,
} as const;

const redPockets = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteColour = "black" | "green" | "red";

export function rouletteColour(pocket: number): RouletteColour {
  if (
    !Number.isInteger(pocket)
    || pocket < mvpRuleset.roulette.minimumPocket
    || pocket > mvpRuleset.roulette.maximumPocket
  ) {
    throw new RangeError("Roulette pocket must be an integer from 0 to 36.");
  }

  if (pocket === 0) {
    return "green";
  }

  return redPockets.has(pocket) ? "red" : "black";
}
