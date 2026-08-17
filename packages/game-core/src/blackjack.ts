export const blackjackRuleset = {
  blackjackPayout: "3:2",
  dealerHitsSoft17: false,
  decks: 6,
  insurance: false,
  maxSplits: 1,
  resplit: false,
  rulesetId: "mvp-v1",
  surrender: false,
} as const;

export type CardRank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface HandValue {
  blackjack: boolean;
  bust: boolean;
  soft: boolean;
  total: number;
}

const hardValueByRank: Record<CardRank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  A: 1,
  J: 10,
  K: 10,
  Q: 10,
};

export function evaluateHand(cards: readonly CardRank[]): HandValue {
  let total = cards.reduce((sum, rank) => sum + hardValueByRank[rank], 0);
  const aces = cards.filter((rank) => rank === "A").length;
  let soft = false;

  if (aces > 0 && total + 10 <= 21) {
    total += 10;
    soft = true;
  }

  return {
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
    soft,
    total,
  };
}
