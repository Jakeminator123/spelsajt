import { mvpRuleset, type RulesetV2 } from "@spelsajt/config";
import { describe, expect, it } from "vitest";

import {
  blackjackCardCode,
  blackjackLegalActions,
  createBlackjackState,
  transitionBlackjack,
  type BlackjackAcceptedTransition,
  type BlackjackCard,
  type BlackjackEngineAction,
  type BlackjackState,
  type BlackjackTransitionResult,
} from "./blackjack-engine";
import type { CardRank } from "./blackjack";

const ruleset: RulesetV2 = mvpRuleset;
let testCardSequence = 0;

function card(
  rank: CardRank,
  suit: BlackjackCard["suit"] = "spades",
  cardId = `test-card-${testCardSequence += 1}`,
): BlackjackCard {
  return { cardId, rank, suit };
}

function accepted(result: BlackjackTransitionResult): BlackjackAcceptedTransition {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result;
}

function start(shoe: readonly BlackjackCard[], wager = 10): BlackjackAcceptedTransition {
  return accepted(
    transitionBlackjack(
      createBlackjackState(ruleset),
      { type: "place-bet", wager },
      ruleset,
      shoe,
    ),
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

describe("blackjack state machine", () => {
  it("deals in player/dealer order and never exposes the hidden card in its public event", () => {
    const holeCard = card("K", "hearts");
    const result = start([
      card("9", "clubs"),
      card("6", "diamonds"),
      card("7", "spades"),
      holeCard,
      card("5", "clubs"),
    ]);

    expect(result.state.phase).toBe("player-turn");
    expect(result.state.activeHandId).toBe("hand-1");
    expect(result.state.hands[0]?.cards.map(blackjackCardCode)).toEqual(["9C", "7S"]);
    expect(result.state.dealer.cards.map(blackjackCardCode)).toEqual(["6D", "KH"]);
    expect(result.state.dealer.holeCardRevealed).toBe(false);
    expect(result.consumedCards).toBe(4);
    expect(result.remainingShoe.map(blackjackCardCode)).toEqual(["5C"]);
    expect(result.ledgerIntents).toEqual([
      {
        amount: 10,
        direction: "debit",
        handId: "hand-1",
        reason: "initial-wager",
        type: "blackjack.wager",
      },
    ]);
    expect(result.events).toContainEqual({
      handId: "hand-1",
      totalWager: 10,
      type: "blackjack.bet.accepted",
      wager: 10,
    });

    const hiddenEvent = result.events.find(
      (event) => event.type === "blackjack.card.dealt" && !event.faceUp,
    );
    expect(hiddenEvent).toEqual({
      faceUp: false,
      handId: "dealer",
      recipient: "dealer",
      type: "blackjack.card.dealt",
    });
    expect(hiddenEvent).not.toHaveProperty("card");
  });

  it("preserves a physical cardId through state and public face-up events", () => {
    const result = start([
      card("9", "clubs", "deck-1-9C"),
      card("6", "diamonds", "deck-4-6D"),
      card("7", "spades", "deck-2-7S"),
      card("K", "hearts", "deck-6-KH"),
    ]);

    expect(result.state.hands[0]?.cards.map((item) => item.cardId)).toEqual([
      "deck-1-9C",
      "deck-2-7S",
    ]);
    expect(result.state.dealer.cards.map((item) => item.cardId)).toEqual([
      "deck-4-6D",
      "deck-6-KH",
    ]);
    expect(result.events).toContainEqual({
      card: {
        cardId: "deck-1-9C",
        rank: "9",
        suit: "clubs",
      },
      faceUp: true,
      handId: "hand-1",
      recipient: "player",
      type: "blackjack.card.dealt",
    });
  });

  it("rejects duplicate physical card identities without consuming the shoe", () => {
    const state = createBlackjackState(ruleset);
    const shoe = [
      card("9", "clubs", "duplicate-card"),
      card("6", "diamonds", "dealer-up"),
      card("9", "spades", "duplicate-card"),
      card("K", "hearts", "dealer-hole"),
    ];
    const result = transitionBlackjack(
      state,
      { type: "place-bet", wager: 10 },
      ruleset,
      shoe,
    );

    expect(result).toMatchObject({
      consumedCards: 0,
      error: { code: "INVALID_SHOE" },
      events: [],
      ledgerIntents: [],
      ok: false,
    });
    expect(result.remainingShoe).toBe(shoe);
  });

  it("publishes the active hand and legal actions as a semantic turn event", () => {
    const dealt = start([
      card("8"),
      card("10"),
      card("8"),
      card("7"),
    ]);

    expect(dealt.events.at(-1)).toEqual({
      activeHandId: "hand-1",
      allowedActions: ["hit", "stand", "double", "split"],
      phase: "player",
      type: "blackjack.turn.changed",
    });

    const settled = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "stand" },
        ruleset,
        dealt.remainingShoe,
      ),
    );
    expect(
      settled.events.filter((event) => event.type === "blackjack.turn.changed"),
    ).toEqual([
      {
        activeHandId: null,
        allowedActions: [],
        phase: "dealer",
        type: "blackjack.turn.changed",
      },
      {
        activeHandId: null,
        allowedActions: [],
        phase: "settled",
        type: "blackjack.turn.changed",
      },
    ]);
  });

  it("pays a natural blackjack as exact 5/2 gross return without drawing dealer filler cards", () => {
    const result = start([
      card("A"),
      card("9"),
      card("K"),
      card("7"),
      card("5"),
    ]);

    expect(result.state.phase).toBe("settled");
    expect(result.state.totalWager).toBe(10);
    expect(result.state.totalGrossReturn).toBe(25);
    expect(result.state.hands[0]?.settlement).toEqual({
      grossReturn: 25,
      outcome: "blackjack",
      wager: 10,
    });
    expect(result.consumedCards).toBe(4);
    expect(result.remainingShoe.map(blackjackCardCode)).toEqual(["5S"]);
    expect(result.ledgerIntents.at(-1)).toEqual({
      amount: 25,
      direction: "credit",
      handId: "hand-1",
      outcome: "blackjack",
      reason: "settlement",
      type: "blackjack.payout",
    });
  });

  it("pushes when player and dealer both have natural blackjack", () => {
    const result = start([
      card("A", "spades"),
      card("A", "hearts"),
      card("K", "clubs"),
      card("Q", "diamonds"),
    ]);

    expect(result.state.hands[0]?.settlement).toEqual({
      grossReturn: 10,
      outcome: "push",
      wager: 10,
    });
    expect(result.state.totalGrossReturn).toBe(10);
  });

  it("settles an American peek dealer blackjack before player actions", () => {
    const result = start([
      card("10"),
      card("A"),
      card("9"),
      card("K"),
    ]);

    expect(result.state.phase).toBe("settled");
    expect(result.state.hands[0]?.settlement?.outcome).toBe("loss");
    expect(result.state.totalGrossReturn).toBe(0);
    expect(result.events.some((event) => event.type === "blackjack.card.revealed")).toBe(true);
    expect(result.ledgerIntents).toEqual([{
      amount: 10,
      direction: "debit",
      handId: "hand-1",
      reason: "initial-wager",
      type: "blackjack.wager",
    }]);
  });

  it("busts after hit and settles without making the dealer draw", () => {
    const dealt = start([
      card("10"),
      card("6"),
      card("6"),
      card("10"),
      card("7"),
    ]);
    const result = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "hit" },
        ruleset,
        dealt.remainingShoe,
      ),
    );

    expect(result.state.phase).toBe("settled");
    expect(result.state.hands[0]?.status).toBe("bust");
    expect(result.state.hands[0]?.settlement?.grossReturn).toBe(0);
    expect(result.consumedCards).toBe(1);
    expect(
      result.events.filter(
        (event) => event.type === "blackjack.card.dealt" && event.recipient === "dealer" && event.faceUp,
      ),
    ).toHaveLength(0);
  });

  it("automatically stands on 21 reached by hit", () => {
    const dealt = start([
      card("10"),
      card("9"),
      card("5"),
      card("8"),
      card("6"),
    ]);
    const result = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "hit" },
        ruleset,
        dealt.remainingShoe,
      ),
    );

    expect(result.state.phase).toBe("settled");
    expect(result.state.hands[0]?.settlement).toEqual({
      grossReturn: 20,
      outcome: "win",
      wager: 10,
    });
  });

  it("stands on dealer soft 17 under S17", () => {
    const dealt = start([
      card("10"),
      card("A"),
      card("8"),
      card("6"),
      card("K"),
    ]);
    const result = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "stand" },
        ruleset,
        dealt.remainingShoe,
      ),
    );

    expect(result.state.dealer.cards).toHaveLength(2);
    expect(result.state.hands[0]?.settlement).toEqual({
      grossReturn: 20,
      outcome: "win",
      wager: 10,
    });
    expect(result.consumedCards).toBe(0);
    expect(result.remainingShoe.map(blackjackCardCode)).toEqual(["KS"]);
  });

  it("draws the dealer to 17 or above after stand", () => {
    const dealt = start([
      card("10"),
      card("10"),
      card("8"),
      card("6"),
      card("5"),
    ]);
    const result = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "stand" },
        ruleset,
        dealt.remainingShoe,
      ),
    );

    expect(result.state.dealer.cards.map(blackjackCardCode)).toEqual(["10S", "6S", "5S"]);
    expect(result.state.hands[0]?.settlement?.outcome).toBe("loss");
    expect(result.consumedCards).toBe(1);
  });

  it("doubles any initial two-card hand and uses the doubled wager for gross return", () => {
    const dealt = start([
      card("5"),
      card("10"),
      card("6"),
      card("7"),
      card("10"),
    ]);
    const result = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "double" },
        ruleset,
        dealt.remainingShoe,
      ),
    );

    expect(result.state.totalWager).toBe(20);
    expect(result.state.hands[0]).toMatchObject({
      doubled: true,
      settlement: {
        grossReturn: 40,
        outcome: "win",
        wager: 20,
      },
      wager: 20,
    });
    expect(result.ledgerIntents[0]).toEqual({
      amount: 10,
      direction: "debit",
      handId: "hand-1",
      reason: "double-wager",
      type: "blackjack.wager",
    });
  });

  it("splits equal-value face cards, settles each hand, and aggregates gross return", () => {
    const dealt = start([
      card("K", "spades"),
      card("6", "hearts"),
      card("Q", "clubs"),
      card("10", "diamonds"),
      card("A", "clubs"),
      card("8", "hearts"),
      card("5", "spades"),
    ]);

    expect(blackjackLegalActions(dealt.state, ruleset)).toEqual([
      "hit",
      "stand",
      "double",
      "split",
    ]);

    const split = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "split" },
        ruleset,
        dealt.remainingShoe,
      ),
    );
    expect(split.state.hands).toHaveLength(2);
    expect(split.state.activeHandId).toBe("hand-2");
    expect(split.state.totalWager).toBe(20);
    expect(split.ledgerIntents).toContainEqual({
      amount: 10,
      direction: "debit",
      handId: "hand-2",
      reason: "split-wager",
      type: "blackjack.wager",
    });

    const settled = accepted(
      transitionBlackjack(
        split.state,
        { handId: "hand-2", type: "stand" },
        ruleset,
        split.remainingShoe,
      ),
    );
    expect(settled.state.hands.map((hand) => hand.settlement)).toEqual([
      { grossReturn: 10, outcome: "push", wager: 10 },
      { grossReturn: 0, outcome: "loss", wager: 10 },
    ]);
    expect(settled.state.totalGrossReturn).toBe(10);
    expect(settled.state.totalWager).toBe(20);
    expect(settled.events.filter((event) => event.type === "blackjack.hand.settled")).toHaveLength(2);
    expect(settled.events.find((event) => event.type === "round.settled")).toMatchObject({
      grossReturn: 10,
      outcome: "mixed",
      totalWager: 20,
      type: "round.settled",
    });
  });

  it("classifies differing split-hand outcomes as mixed before net comparison", () => {
    const dealt = start([
      card("K", "spades"),
      card("6", "hearts"),
      card("Q", "clubs"),
      card("10", "diamonds"),
      card("A", "clubs"),
      card("8", "hearts"),
      card("5", "spades"),
    ]);
    const split = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "split" },
        ruleset,
        dealt.remainingShoe,
      ),
    );
    const settled = accepted(
      transitionBlackjack(
        split.state,
        { handId: "hand-2", type: "stand" },
        ruleset,
        split.remainingShoe,
      ),
    );
    const roundSettled = settled.events.find((event) => event.type === "round.settled");

    expect(settled.state.hands.map((hand) => hand.settlement?.outcome)).toEqual([
      "push",
      "loss",
    ]);
    expect(roundSettled).toMatchObject({
      grossReturn: 10,
      outcome: "mixed",
      totalWager: 20,
    });
  });

  it("allows double after split when the ruleset enables DAS", () => {
    const dealt = start([
      card("5"),
      card("10"),
      card("5"),
      card("7"),
      card("6"),
      card("8"),
      card("10"),
      card("3"),
    ]);
    const split = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "split" },
        ruleset,
        dealt.remainingShoe,
      ),
    );

    expect(blackjackLegalActions(split.state, ruleset)).toContain("double");
    const doubled = accepted(
      transitionBlackjack(
        split.state,
        { handId: "hand-1", type: "double" },
        ruleset,
        split.remainingShoe,
      ),
    );
    expect(doubled.state.hands[0]).toMatchObject({ doubled: true, wager: 20 });
    expect(doubled.state.activeHandId).toBe("hand-2");
  });

  it("does not permit a resplit after the configured single split", () => {
    const dealt = start([
      card("8"),
      card("10"),
      card("8"),
      card("7"),
      card("8"),
      card("8"),
    ]);
    const split = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "split" },
        ruleset,
        dealt.remainingShoe,
      ),
    );

    expect(split.state.splitCount).toBe(1);
    expect(blackjackLegalActions(split.state, ruleset)).not.toContain("split");
    const rejected = transitionBlackjack(
      split.state,
      { handId: "hand-1", type: "split" },
      ruleset,
      split.remainingShoe,
    );
    expect(rejected).toMatchObject({
      consumedCards: 0,
      error: { code: "ACTION_NOT_ALLOWED" },
      ok: false,
    });
  });

  it("deals exactly one card to split aces and treats split 21 as a normal win", () => {
    const dealt = start([
      card("A", "spades"),
      card("10", "clubs"),
      card("A", "hearts"),
      card("7", "diamonds"),
      card("K", "diamonds"),
      card("9", "clubs"),
    ]);
    const result = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "split" },
        ruleset,
        dealt.remainingShoe,
      ),
    );

    expect(result.state.phase).toBe("settled");
    expect(result.state.hands.map((hand) => hand.cards)).toHaveLength(2);
    expect(result.state.hands.every((hand) => hand.cards.length === 2)).toBe(true);
    expect(result.state.hands.map((hand) => hand.settlement)).toEqual([
      { grossReturn: 20, outcome: "win", wager: 10 },
      { grossReturn: 20, outcome: "win", wager: 10 },
    ]);
    expect(result.state.hands[0]?.settlement?.outcome).not.toBe("blackjack");
    expect(result.consumedCards).toBe(2);
  });

  it.each([
    { dealer: ["10", "8"] as const, expectedGross: 20, expectedOutcome: "win", player: ["10", "10"] as const },
    { dealer: ["10", "10"] as const, expectedGross: 10, expectedOutcome: "push", player: ["10", "10"] as const },
    { dealer: ["10", "K"] as const, expectedGross: 0, expectedOutcome: "loss", player: ["10", "9"] as const },
  ])("uses gross-return settlement semantics for $expectedOutcome", ({ dealer, expectedGross, expectedOutcome, player }) => {
    const dealt = start([
      card(player[0]),
      card(dealer[0]),
      card(player[1]),
      card(dealer[1]),
    ]);
    const result = accepted(
      transitionBlackjack(
        dealt.state,
        { handId: "hand-1", type: "stand" },
        ruleset,
        dealt.remainingShoe,
      ),
    );

    expect(result.state.hands[0]?.settlement).toEqual({
      grossReturn: expectedGross,
      outcome: expectedOutcome,
      wager: 10,
    });
  });

  it("rejects non-unit wagers before consuming cards or creating ledger intents", () => {
    const state = createBlackjackState(ruleset);
    const shoe = [card("A"), card("K"), card("Q"), card("J")];
    const result = transitionBlackjack(
      state,
      { type: "place-bet", wager: 3 },
      ruleset,
      shoe,
    );

    expect(result).toMatchObject({
      consumedCards: 0,
      error: { code: "INVALID_WAGER" },
      events: [],
      ledgerIntents: [],
      ok: false,
    });
    expect(result.state).toBe(state);
    expect(result.remainingShoe).toBe(shoe);
  });

  it("rejects amounts whose exact 3:2 gross return would overflow", () => {
    const state = createBlackjackState(ruleset);
    const wager = Number.MAX_SAFE_INTEGER - 1;
    const result = transitionBlackjack(
      state,
      { type: "place-bet", wager },
      ruleset,
      [card("A"), card("K"), card("Q"), card("J")],
    );

    expect(result).toMatchObject({
      error: { code: "AMOUNT_OVERFLOW" },
      ok: false,
    });
  });

  it("returns a transactional shoe-exhausted error during initial deal", () => {
    const state = createBlackjackState(ruleset);
    const shoe = [card("10"), card("7"), card("6")];
    const result = transitionBlackjack(
      state,
      { type: "place-bet", wager: 10 },
      ruleset,
      shoe,
    );

    expect(result).toMatchObject({
      consumedCards: 0,
      error: { code: "SHOE_EXHAUSTED" },
      events: [],
      ledgerIntents: [],
      ok: false,
    });
    expect(result.state).toBe(state);
    expect(result.remainingShoe).toBe(shoe);
  });

  it("rolls back stand, reveal, and dealer work when the injected shoe is exhausted", () => {
    const dealt = start([
      card("10"),
      card("10"),
      card("8"),
      card("6"),
    ]);
    const before = structuredClone(dealt.state);
    const result = transitionBlackjack(
      dealt.state,
      { handId: "hand-1", type: "stand" },
      ruleset,
      dealt.remainingShoe,
    );

    expect(result).toMatchObject({
      consumedCards: 0,
      error: { code: "SHOE_EXHAUSTED" },
      events: [],
      ledgerIntents: [],
      ok: false,
    });
    expect(result.state).toBe(dealt.state);
    expect(dealt.state).toEqual(before);
  });

  it("rejects commands for a non-active hand without touching the shoe", () => {
    const dealt = start([
      card("8"),
      card("10"),
      card("8"),
      card("7"),
      card("3"),
      card("4"),
    ]);
    const shoe = dealt.remainingShoe;
    const result = transitionBlackjack(
      dealt.state,
      { handId: "hand-2", type: "hit" },
      ruleset,
      shoe,
    );

    expect(result).toMatchObject({
      consumedCards: 0,
      error: { code: "INVALID_HAND_ID" },
      ok: false,
    });
    expect(result.remainingShoe).toBe(shoe);
  });

  it("rejects actions after settlement", () => {
    const settled = start([card("A"), card("9"), card("K"), card("8")]);
    expect(settled.state.phase).toBe("settled");
    const result = transitionBlackjack(
      settled.state,
      { handId: "hand-1", type: "hit" },
      ruleset,
      settled.remainingShoe,
    );

    expect(result).toMatchObject({
      error: { code: "HAND_NOT_ACTIVE" },
      ok: false,
    });
  });

  it("rejects state replay under a different ruleset identity", () => {
    const state: BlackjackState = {
      ...createBlackjackState(ruleset),
      rulesetId: "not-the-active-ruleset" as RulesetV2["id"],
    };
    const result = transitionBlackjack(
      state,
      { type: "place-bet", wager: 10 },
      ruleset,
      [card("A"), card("K"), card("Q"), card("J")],
    );

    expect(result).toMatchObject({
      error: { code: "RULESET_MISMATCH" },
      ok: false,
    });
    expect(blackjackLegalActions(state, ruleset)).toEqual([]);
  });

  it("rejects changed rule semantics hidden behind the same ruleset identity", () => {
    const tamperedRuleset = {
      ...structuredClone(ruleset),
      blackjack: {
        ...structuredClone(ruleset.blackjack),
        dealerHitsSoft17: true,
      },
    } satisfies RulesetV2;

    expect(() => createBlackjackState(tamperedRuleset)).toThrow(TypeError);

    const state = createBlackjackState(ruleset);
    const result = transitionBlackjack(
      state,
      { type: "place-bet", wager: 10 },
      tamperedRuleset,
      [card("A"), card("K"), card("Q"), card("J")],
    );
    expect(result).toMatchObject({
      consumedCards: 0,
      error: { code: "RULESET_MISMATCH" },
      ok: false,
    });
  });

  it("does not mutate frozen state, action, ruleset, or shoe inputs", () => {
    const initialState = deepFreeze(createBlackjackState(ruleset));
    const action = deepFreeze<BlackjackEngineAction>({ type: "place-bet", wager: 10 });
    const frozenRuleset = deepFreeze(structuredClone(ruleset));
    const shoe = deepFreeze([
      card("9", "clubs"),
      card("7", "diamonds"),
      card("8", "hearts"),
      card("10", "spades"),
    ]);
    const stateBefore = structuredClone(initialState);
    const shoeBefore = structuredClone(shoe);

    const result = transitionBlackjack(initialState, action, frozenRuleset, shoe);

    expect(result.ok).toBe(true);
    expect(initialState).toEqual(stateBefore);
    expect(shoe).toEqual(shoeBefore);
  });

  it("replays identical inputs to byte-equivalent observer output", () => {
    const state = createBlackjackState(ruleset);
    const action = { type: "place-bet", wager: 10 } as const;
    const shoe = [
      card("9", "clubs"),
      card("7", "diamonds"),
      card("8", "hearts"),
      card("10", "spades"),
    ];

    const first = transitionBlackjack(state, action, ruleset, shoe);
    const second = transitionBlackjack(state, action, ruleset, shoe);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
