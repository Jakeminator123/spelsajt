import type { GameEventV2, GameSnapshotV2 } from "@spelsajt/contracts";
import { describe, expect, it } from "vitest";

import { verifySettledRound } from "./fairness-verifier";

type RouletteSnapshot = Extract<GameSnapshotV2, { game: "roulette" }>;

const serverSeed = "0".repeat(64);
const commitment = "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925";
const rulesetHash = "1b10f9a7d66d5e1f5d39fe96fe95e492003494817521a3708f907b1b91ecb296";
const roundId = "round-golden-2";
const tableId = "table-verifier-1";

describe("browser fairness verifier", () => {
  it("reproduces the roulette pocket and rejects a changed result", async () => {
    const snapshot = rouletteSnapshot(13);
    const events = [settlement("roulette")];

    await expect(verifySettledRound(snapshot, events)).resolves.toMatchObject({
      status: "verified",
      title: "Rouletteutfallet är verifierat",
    });
    await expect(verifySettledRound(rouletteSnapshot(12), events)).resolves.toMatchObject({
      status: "failed",
      title: "Rouletteutfallet matchar inte",
    });
    const baseSnapshot = rouletteSnapshot(13);
    const changedRuleset: RouletteSnapshot = {
      ...baseSnapshot,
      round: { ...baseSnapshot.round!, rulesetHash: "f".repeat(64) },
    };
    await expect(verifySettledRound(changedRuleset, events)).resolves.toMatchObject({
      status: "failed",
      title: "Ruleset kan inte verifieras",
    });
  }, 15_000);

  it("recreates the six-deck shoe and matches the complete dealt order", async () => {
    const firstCards = [
      card("deck-3:diamonds:2", "2", "diamonds"),
      card("deck-1:clubs:9", "9", "clubs"),
      card("deck-6:spades:2", "2", "spades"),
      card("deck-1:clubs:J", "J", "clubs"),
    ] as const;
    const events: GameEventV2[] = [
      event(1, "round.started", { game: "blackjack", totalWager: "100" }),
      event(2, "blackjack.bet.accepted", {
        handId: "hand-1",
        totalWager: "100",
        wager: "100",
      }),
      event(3, "blackjack.card.dealt", {
        card: firstCards[0], faceUp: true, handId: "hand-1", recipient: "player",
      }),
      event(4, "blackjack.card.dealt", {
        card: firstCards[1], faceUp: true, handId: "dealer", recipient: "dealer",
      }),
      event(5, "blackjack.card.dealt", {
        card: firstCards[2], faceUp: true, handId: "hand-1", recipient: "player",
      }),
      event(6, "blackjack.card.dealt", {
        faceUp: false, handId: "dealer", recipient: "dealer",
      }),
      event(7, "blackjack.card.revealed", { card: firstCards[3], handId: "dealer" }),
      event(8, "blackjack.hand.settled", {
        blackjack: false,
        handId: "hand-1",
        outcome: "win",
        payout: "200",
        total: 20,
        wager: "100",
      }),
      settlement("blackjack", 9),
    ];

    const snapshot: GameSnapshotV2 = {
      balance: "10100",
      game: "blackjack",
      lastSequence: 9,
      revision: 3,
      round: {
        activeHandId: null,
        dealerCards: [
          { card: firstCards[1], faceUp: true },
          { card: firstCards[3], faceUp: true },
        ],
        fairness: { algorithm: "pf-v1", commitment, nonce: 8 },
        game: "blackjack",
        hands: [{
          allowedActions: [],
          cards: [
            { card: firstCards[0], faceUp: true },
            { card: firstCards[2], faceUp: true },
          ],
          handId: "hand-1",
          outcome: "win",
          payout: "200",
          status: "settled",
          wager: "100",
        }],
        phase: "settled",
        revision: 3,
        roundId,
        rulesetHash,
        rulesetId: "mvp-v2",
      },
      schemaVersion: 2,
      tableId,
    };

    await expect(verifySettledRound(snapshot, events)).resolves.toMatchObject({
      detail: expect.stringContaining("matchade alla 4 utdelade kort"),
      status: "verified",
      title: "Blackjackrundan är verifierad",
    });

    const tampered = events.map((item) => item.sequence === 3 && item.type === "blackjack.card.dealt"
      ? { ...item, payload: { ...item.payload, card: firstCards[1] } }
      : item);
    await expect(verifySettledRound(snapshot, tampered)).resolves.toMatchObject({
      status: "failed",
      title: "Blackjackskon matchar inte",
    });
  }, 15_000);

  it("reports unavailable evidence instead of claiming verification after re-anchoring", async () => {
    await expect(verifySettledRound(rouletteSnapshot(13), [])).resolves.toMatchObject({
      status: "unavailable",
      title: "Verifiering behöver live-revealen",
    });
  });
});

function rouletteSnapshot(pocket: number): RouletteSnapshot {
  return {
    balance: "10875",
    game: "roulette",
    lastSequence: 8,
    revision: 4,
    round: {
      bets: [{
        amount: "25",
        betId: "bet-1",
        currency: "PLAY",
        selection: { pocket: 13, type: "straight" },
      }],
      fairness: { algorithm: "pf-v1", commitment, nonce: 8 },
      game: "roulette",
      phase: "settled",
      result: { colour: "black", pocket },
      revision: 4,
      roundId,
      rulesetHash,
      rulesetId: "mvp-v2",
      totalWager: "25",
    },
    schemaVersion: 2,
    tableId,
  };
}

function settlement(game: "blackjack" | "roulette", sequence = 8): GameEventV2 {
  return event(sequence, "round.settled", {
    balance: "10875",
    fairness: {
      algorithm: "pf-v1",
      clientSeed: "client-seed-example",
      nonce: 8,
      serverSeed,
    },
    game,
    outcome: "win",
    totalPayout: "900",
    totalWager: "25",
  });
}

function event<T extends GameEventV2["type"]>(
  sequence: number,
  type: T,
  payload: Extract<GameEventV2, { type: T }>["payload"],
): Extract<GameEventV2, { type: T }> {
  return {
    eventId: `11111111-1111-4111-8111-${String(sequence).padStart(12, "0")}`,
    occurredAt: "2026-08-18T00:00:00.000Z",
    payload,
    revision: 1,
    roundId,
    schemaVersion: 2,
    sequence,
    tableId,
    type,
  } as Extract<GameEventV2, { type: T }>;
}

function card(
  cardId: string,
  rank: "2" | "9" | "J",
  suit: "clubs" | "diamonds" | "spades",
) {
  return { cardId, rank, suit } as const;
}
