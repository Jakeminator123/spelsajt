import {
  isMvpRuleset,
  type RulesetV2,
} from "@spelsajt/config";

import { evaluateHand, type CardRank, type HandValue } from "./blackjack";

export const blackjackSuits = ["clubs", "diamonds", "hearts", "spades"] as const;

export type BlackjackSuit = (typeof blackjackSuits)[number];

export interface BlackjackCard {
  /** Stable identity of one physical card in the injected multi-deck shoe. */
  readonly cardId: string;
  readonly rank: CardRank;
  readonly suit: BlackjackSuit;
}

export type BlackjackPhase = "awaiting-bet" | "player-turn" | "settled";
export type BlackjackHandStatus = "playing" | "stood" | "bust";
export type BlackjackHandOutcome = "blackjack" | "win" | "loss" | "push";
export type BlackjackRoundOutcome = "win" | "loss" | "push" | "mixed";
export type BlackjackPlayerAction = "hit" | "stand" | "double" | "split";
export type BlackjackLegalAction = "place-bet" | BlackjackPlayerAction;
export type BlackjackHandId = `hand-${number}`;

export interface BlackjackHandSettlement {
  /** Gross return: the returned stake is included. */
  readonly grossReturn: number;
  readonly outcome: BlackjackHandOutcome;
  readonly wager: number;
}

export interface BlackjackHand {
  readonly cards: readonly BlackjackCard[];
  readonly doubled: boolean;
  readonly fromSplit: boolean;
  readonly id: BlackjackHandId;
  readonly splitAces: boolean;
  readonly status: BlackjackHandStatus;
  readonly wager: number;
  readonly settlement?: BlackjackHandSettlement;
}

export interface BlackjackDealerHand {
  readonly cards: readonly BlackjackCard[];
  readonly holeCardRevealed: boolean;
}

export interface BlackjackState {
  readonly activeHandId: BlackjackHandId | null;
  readonly dealer: BlackjackDealerHand;
  readonly hands: readonly BlackjackHand[];
  readonly phase: BlackjackPhase;
  readonly rulesetId: RulesetV2["id"];
  readonly rulesetSchemaVersion: RulesetV2["schemaVersion"];
  readonly splitCount: number;
  readonly nextHandNumber: number;
  readonly totalGrossReturn: number;
  readonly totalWager: number;
}

export type BlackjackEngineAction =
  | {
      readonly type: "place-bet";
      readonly wager: number;
    }
  | {
      readonly handId: BlackjackHandId;
      readonly type: BlackjackPlayerAction;
    };

export type BlackjackCardDealtEvent =
  | {
      readonly card: BlackjackCard;
      readonly faceUp: true;
      readonly handId: BlackjackHandId | "dealer";
      readonly recipient: "dealer" | "player";
      readonly type: "blackjack.card.dealt";
    }
  | {
      /** A hidden deal intentionally contains no card identity. */
      readonly faceUp: false;
      readonly handId: "dealer";
      readonly recipient: "dealer";
      readonly type: "blackjack.card.dealt";
    };

export type BlackjackDomainEvent =
  | {
      readonly game: "blackjack";
      readonly rulesetId: RulesetV2["id"];
      readonly type: "round.started";
      readonly wager: number;
    }
  | BlackjackCardDealtEvent
  | {
      readonly action: BlackjackPlayerAction;
      readonly handId: BlackjackHandId;
      readonly type: "blackjack.action.accepted";
    }
  | {
      readonly handId: BlackjackHandId;
      readonly totalWager: number;
      readonly type: "blackjack.bet.accepted";
      readonly wager: number;
    }
  | {
      readonly activeHandId: BlackjackHandId | null;
      readonly allowedActions: readonly BlackjackPlayerAction[];
      readonly phase: "player" | "dealer" | "settled";
      readonly type: "blackjack.turn.changed";
    }
  | {
      readonly fromHandId: BlackjackHandId;
      readonly newHandIds: readonly [BlackjackHandId, BlackjackHandId];
      readonly type: "blackjack.hand.split";
    }
  | {
      readonly card: BlackjackCard;
      readonly handId: "dealer";
      readonly recipient: "dealer";
      readonly type: "blackjack.card.revealed";
    }
  | {
      readonly grossReturn: number;
      readonly handId: BlackjackHandId;
      readonly outcome: BlackjackHandOutcome;
      readonly type: "blackjack.hand.settled";
      readonly wager: number;
    }
  | {
      readonly game: "blackjack";
      readonly grossReturn: number;
      readonly outcome: BlackjackRoundOutcome;
      readonly totalWager: number;
      readonly type: "round.settled";
    };

export type BlackjackLedgerIntent =
  | {
      readonly amount: number;
      readonly direction: "debit";
      readonly handId: BlackjackHandId;
      readonly reason: "initial-wager" | "split-wager" | "double-wager";
      readonly type: "blackjack.wager";
    }
  | {
      /** Gross return; losses emit no zero-value ledger entry. */
      readonly amount: number;
      readonly direction: "credit";
      readonly handId: BlackjackHandId;
      readonly outcome: BlackjackHandOutcome;
      readonly reason: "settlement";
      readonly type: "blackjack.payout";
    };

export type BlackjackDomainErrorCode =
  | "ACTION_NOT_ALLOWED"
  | "AMOUNT_OVERFLOW"
  | "HAND_NOT_ACTIVE"
  | "INVALID_HAND_ID"
  | "INVALID_SHOE"
  | "INVALID_WAGER"
  | "RULESET_MISMATCH"
  | "SHOE_EXHAUSTED";

export interface BlackjackDomainError {
  readonly action: BlackjackEngineAction["type"];
  readonly code: BlackjackDomainErrorCode;
  readonly message: string;
  readonly phase: BlackjackPhase;
}

export interface BlackjackAcceptedTransition {
  readonly consumedCards: number;
  readonly events: readonly BlackjackDomainEvent[];
  readonly ledgerIntents: readonly BlackjackLedgerIntent[];
  readonly ok: true;
  readonly remainingShoe: readonly BlackjackCard[];
  readonly state: BlackjackState;
}

export interface BlackjackRejectedTransition {
  readonly consumedCards: 0;
  readonly error: BlackjackDomainError;
  readonly events: readonly [];
  readonly ledgerIntents: readonly [];
  readonly ok: false;
  readonly remainingShoe: readonly BlackjackCard[];
  readonly state: BlackjackState;
}

export type BlackjackTransitionResult =
  | BlackjackAcceptedTransition
  | BlackjackRejectedTransition;

const EMPTY_EVENTS = [] as const;
const EMPTY_LEDGER_INTENTS = [] as const;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

class TransitionFailure extends Error {
  constructor(
    readonly code: BlackjackDomainErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface ShoeCursor {
  consumed(): number;
  draw(): BlackjackCard;
  remaining(): readonly BlackjackCard[];
}

interface ResolutionContext {
  readonly events: BlackjackDomainEvent[];
  readonly ledgerIntents: BlackjackLedgerIntent[];
  readonly ruleset: RulesetV2;
  readonly shoe: ShoeCursor;
}

export function createBlackjackState(ruleset: RulesetV2): BlackjackState {
  if (!isSupportedRuleset(ruleset)) {
    throw new TypeError("Blackjack engine requires the frozen mvp-v2 ruleset.");
  }

  return {
    activeHandId: null,
    dealer: {
      cards: [],
      holeCardRevealed: false,
    },
    hands: [],
    phase: "awaiting-bet",
    nextHandNumber: 1,
    rulesetId: ruleset.id,
    rulesetSchemaVersion: ruleset.schemaVersion,
    splitCount: 0,
    totalGrossReturn: 0,
    totalWager: 0,
  };
}

/**
 * Returns rule-legal actions only. Funding checks for split and double belong to
 * the server transaction that applies the returned debit intent.
 */
export function blackjackLegalActions(
  state: BlackjackState,
  ruleset: RulesetV2,
): readonly BlackjackLegalAction[] {
  if (!rulesetMatchesState(state, ruleset)) {
    return [];
  }

  if (state.phase === "awaiting-bet") {
    return ["place-bet"];
  }

  if (state.phase !== "player-turn" || state.activeHandId === null) {
    return [];
  }

  const hand = state.hands.find((candidate) => candidate.id === state.activeHandId);
  if (!hand || hand.status !== "playing") {
    return [];
  }

  const actions: BlackjackLegalAction[] = ["hit", "stand"];
  const configuredActions = ruleset.blackjack.actions;

  if (
    configuredActions.includes("double") &&
    canDouble(hand, ruleset)
  ) {
    actions.push("double");
  }

  if (
    configuredActions.includes("split") &&
    canSplit(hand, state, ruleset)
  ) {
    actions.push("split");
  }

  return actions;
}

/**
 * Pure blackjack transition. The caller supplies the previous state, action,
 * immutable ruleset and the exact next cards. No clock, I/O or RNG is read.
 */
export function transitionBlackjack(
  state: BlackjackState,
  action: BlackjackEngineAction,
  ruleset: RulesetV2,
  shoe: readonly BlackjackCard[],
): BlackjackTransitionResult {
  const cursor = createShoeCursor(shoe);
  const events: BlackjackDomainEvent[] = [];
  const ledgerIntents: BlackjackLedgerIntent[] = [];

  try {
    if (!rulesetMatchesState(state, ruleset)) {
      throw new TransitionFailure(
        "RULESET_MISMATCH",
        `State uses ${state.rulesetId}/v${state.rulesetSchemaVersion}, but the transition received ${ruleset.id}/v${ruleset.schemaVersion}.`,
      );
    }

    requireUniqueCardIds(state, shoe);

    const nextState = action.type === "place-bet"
      ? placeBet(state, action.wager, ruleset, cursor, events, ledgerIntents)
      : playAction(state, action, ruleset, cursor, events, ledgerIntents);

    return {
      consumedCards: cursor.consumed(),
      events,
      ledgerIntents,
      ok: true,
      remainingShoe: cursor.remaining(),
      state: nextState,
    };
  } catch (error) {
    if (!(error instanceof TransitionFailure)) {
      throw error;
    }

    return rejectTransition(state, action, shoe, error.code, error.message);
  }
}

export function blackjackCardCode(card: BlackjackCard): string {
  const suitCode: Record<BlackjackSuit, string> = {
    clubs: "C",
    diamonds: "D",
    hearts: "H",
    spades: "S",
  };

  return `${card.rank}${suitCode[card.suit]}`;
}

function placeBet(
  state: BlackjackState,
  wager: number,
  ruleset: RulesetV2,
  shoe: ShoeCursor,
  events: BlackjackDomainEvent[],
  ledgerIntents: BlackjackLedgerIntent[],
): BlackjackState {
  requireLegalAction(state, ruleset, "place-bet");
  requireValidWager(wager, ruleset);

  const playerFirst = shoe.draw();
  const dealerUp = shoe.draw();
  const playerSecond = shoe.draw();
  const dealerHole = shoe.draw();

  const initialHandId = createHandId(1);
  events.push({
    game: "blackjack",
    rulesetId: ruleset.id,
    type: "round.started",
    wager,
  });
  events.push({
    handId: initialHandId,
    totalWager: wager,
    type: "blackjack.bet.accepted",
    wager,
  });
  events.push(faceUpDeal("player", initialHandId, playerFirst));
  events.push(faceUpDeal("dealer", "dealer", dealerUp));
  events.push(faceUpDeal("player", initialHandId, playerSecond));
  events.push({
    faceUp: false,
    handId: "dealer",
    recipient: "dealer",
    type: "blackjack.card.dealt",
  });

  ledgerIntents.push({
    amount: wager,
    direction: "debit",
    handId: initialHandId,
    reason: "initial-wager",
    type: "blackjack.wager",
  });

  const playerCards = [playerFirst, playerSecond] as const;
  const dealerCards = [dealerUp, dealerHole] as const;
  const playerValue = valueHand(playerCards);
  const dealerValue = valueHand(dealerCards);

  let nextState: BlackjackState = {
    activeHandId: initialHandId,
    dealer: {
      cards: dealerCards,
      holeCardRevealed: false,
    },
    hands: [
      {
        cards: playerCards,
        doubled: false,
        fromSplit: false,
        id: initialHandId,
        splitAces: false,
        status: playerValue.total === 21 ? "stood" : "playing",
        wager,
      },
    ],
    phase: "player-turn",
    nextHandNumber: 2,
    rulesetId: ruleset.id,
    rulesetSchemaVersion: ruleset.schemaVersion,
    splitCount: 0,
    totalGrossReturn: 0,
    totalWager: wager,
  };

  const dealerCanPeek = ruleset.blackjack.dealerPeek === "ace-or-ten" &&
    (dealerUp.rank === "A" || cardSplitValue(dealerUp) === 10);

  if (playerValue.blackjack || (dealerCanPeek && dealerValue.blackjack)) {
    nextState = resolveRound(nextState, {
      events,
      ledgerIntents,
      ruleset,
      shoe,
    });
  } else {
    emitPlayerTurnChanged(nextState, ruleset, events);
  }

  return nextState;
}

function playAction(
  state: BlackjackState,
  action: Exclude<BlackjackEngineAction, { readonly type: "place-bet" }>,
  ruleset: RulesetV2,
  shoe: ShoeCursor,
  events: BlackjackDomainEvent[],
  ledgerIntents: BlackjackLedgerIntent[],
): BlackjackState {
  requireHandId(action.handId);
  requireActiveHand(state, action.handId);
  requireLegalAction(state, ruleset, action.type);

  events.push({
    action: action.type,
    handId: action.handId,
    type: "blackjack.action.accepted",
  });

  const context: ResolutionContext = {
    events,
    ledgerIntents,
    ruleset,
    shoe,
  };

  switch (action.type) {
    case "hit":
      return hit(state, action.handId, context);
    case "stand":
      return stand(state, action.handId, context);
    case "double":
      return doubleDown(state, action.handId, context);
    case "split":
      return splitHand(state, action.handId, context);
  }
}

function hit(
  state: BlackjackState,
  handId: BlackjackHandId,
  context: ResolutionContext,
): BlackjackState {
  const card = context.shoe.draw();
  const hand = requireHand(state, handId);
  const cards = [...hand.cards, card];
  const value = valueHand(cards);
  const nextHand: BlackjackHand = {
    ...copyHand(hand),
    cards,
    status: value.bust ? "bust" : value.total === 21 ? "stood" : "playing",
  };

  context.events.push(faceUpDeal("player", handId, card));

  const nextState = replaceHand(state, handId, nextHand);
  const handIndex = handArrayIndex(nextState, handId);
  if (nextHand.status === "playing") {
    emitPlayerTurnChanged(nextState, context.ruleset, context.events);
    return nextState;
  }

  return advanceOrResolve(nextState, handIndex + 1, context);
}

function stand(
  state: BlackjackState,
  handId: BlackjackHandId,
  context: ResolutionContext,
): BlackjackState {
  const hand = requireHand(state, handId);
  const nextState = replaceHand(state, handId, {
    ...copyHand(hand),
    status: "stood",
  });

  return advanceOrResolve(nextState, handArrayIndex(nextState, handId) + 1, context);
}

function doubleDown(
  state: BlackjackState,
  handId: BlackjackHandId,
  context: ResolutionContext,
): BlackjackState {
  const hand = requireHand(state, handId);
  const doubledWager = safeMultiply(hand.wager, 2);
  const totalWager = safeAdd(state.totalWager, hand.wager);
  const card = context.shoe.draw();
  const cards = [...hand.cards, card];
  const value = valueHand(cards);

  context.ledgerIntents.push({
    amount: hand.wager,
    direction: "debit",
    handId,
    reason: "double-wager",
    type: "blackjack.wager",
  });
  context.events.push(faceUpDeal("player", handId, card));

  const nextState = replaceHand(
    {
      ...copyState(state),
      totalWager,
    },
    handId,
    {
      ...copyHand(hand),
      cards,
      doubled: true,
      status: value.bust ? "bust" : "stood",
      wager: doubledWager,
    },
  );

  return advanceOrResolve(nextState, handArrayIndex(nextState, handId) + 1, context);
}

function splitHand(
  state: BlackjackState,
  handId: BlackjackHandId,
  context: ResolutionContext,
): BlackjackState {
  const hand = requireHand(state, handId);
  const handIndex = handArrayIndex(state, handId);
  const firstOriginal = hand.cards[0];
  const secondOriginal = hand.cards[1];

  if (!firstOriginal || !secondOriginal) {
    throw new TransitionFailure("ACTION_NOT_ALLOWED", "A split requires exactly two cards.");
  }

  const firstDraw = context.shoe.draw();
  const secondDraw = context.shoe.draw();
  const splitAces = firstOriginal.rank === "A" && secondOriginal.rank === "A";
  const secondHandId = createHandId(state.nextHandNumber);
  const firstHand = createSplitHand(hand.id, hand.wager, firstOriginal, firstDraw, splitAces, context.ruleset);
  const secondHand = createSplitHand(secondHandId, hand.wager, secondOriginal, secondDraw, splitAces, context.ruleset);
  const hands = state.hands.flatMap((candidate, index) =>
    index === handIndex ? [firstHand, secondHand] : [copyHand(candidate)],
  );
  const newHandIds = [hand.id, secondHandId] as const;

  context.ledgerIntents.push({
    amount: hand.wager,
    direction: "debit",
    handId: secondHandId,
    reason: "split-wager",
    type: "blackjack.wager",
  });
  context.events.push({
    fromHandId: hand.id,
    newHandIds,
    type: "blackjack.hand.split",
  });
  context.events.push(faceUpDeal("player", hand.id, firstDraw));
  context.events.push(faceUpDeal("player", secondHandId, secondDraw));

  const nextState: BlackjackState = {
    ...copyState(state),
    activeHandId: firstHand.status === "playing"
      ? firstHand.id
      : secondHand.status === "playing"
        ? secondHand.id
        : null,
    hands,
    nextHandNumber: state.nextHandNumber + 1,
    splitCount: state.splitCount + 1,
    totalWager: safeAdd(state.totalWager, hand.wager),
  };

  if (nextState.activeHandId === null) {
    return resolveRound(nextState, context);
  }

  emitPlayerTurnChanged(nextState, context.ruleset, context.events);
  return nextState;
}

function createSplitHand(
  id: BlackjackHandId,
  wager: number,
  originalCard: BlackjackCard,
  drawnCard: BlackjackCard,
  splitAces: boolean,
  ruleset: RulesetV2,
): BlackjackHand {
  const cards = [originalCard, drawnCard] as const;
  const value = valueHand(cards);
  const mustStand = value.total === 21 ||
    (splitAces && ruleset.blackjack.splitAcesOneCardOnly);

  return {
    cards,
    doubled: false,
    fromSplit: true,
    id,
    splitAces,
    status: mustStand ? "stood" : "playing",
    wager,
  };
}

function advanceOrResolve(
  state: BlackjackState,
  searchFrom: number,
  context: ResolutionContext,
): BlackjackState {
  const nextIndex = state.hands.findIndex(
    (hand, index) => index >= searchFrom && hand.status === "playing",
  );

  if (nextIndex >= 0) {
    const nextHand = state.hands[nextIndex];
    if (!nextHand) {
      throw new TransitionFailure("INVALID_HAND_ID", "Active hand could not be resolved.");
    }
    const nextState: BlackjackState = {
      ...copyState(state),
      activeHandId: nextHand.id,
    };
    emitPlayerTurnChanged(nextState, context.ruleset, context.events);
    return nextState;
  }

  return resolveRound(
    {
      ...copyState(state),
      activeHandId: null,
    },
    context,
  );
}

function resolveRound(
  state: BlackjackState,
  context: ResolutionContext,
): BlackjackState {
  context.events.push({
    activeHandId: null,
    allowedActions: [],
    phase: "dealer",
    type: "blackjack.turn.changed",
  });
  let dealer = revealDealerHoleCard(state.dealer, context.events);
  const hasComparableHand = state.hands.some((hand) => {
    const value = valueHand(hand.cards);
    const isBlackjack = value.blackjack &&
      (!hand.fromSplit || context.ruleset.blackjack.splitTwentyOneIsBlackjack);
    return !value.bust && !isBlackjack;
  });

  if (hasComparableHand) {
    let dealerValue = valueHand(dealer.cards);
    while (dealerMustHit(dealerValue, context.ruleset)) {
      const card = context.shoe.draw();
      dealer = {
        cards: [...dealer.cards, card],
        holeCardRevealed: true,
      };
      context.events.push(faceUpDeal("dealer", "dealer", card));
      dealerValue = valueHand(dealer.cards);
    }
  }

  const dealerValue = valueHand(dealer.cards);
  const hands = state.hands.map((hand) => {
    const settlement = settleHand(hand, dealerValue, context.ruleset);
    context.events.push({
      grossReturn: settlement.grossReturn,
      handId: hand.id,
      outcome: settlement.outcome,
      type: "blackjack.hand.settled",
      wager: settlement.wager,
    });
    if (settlement.grossReturn > 0) {
      context.ledgerIntents.push({
        amount: settlement.grossReturn,
        direction: "credit",
        handId: hand.id,
        outcome: settlement.outcome,
        reason: "settlement",
        type: "blackjack.payout",
      });
    }

    return {
      ...copyHand(hand),
      settlement,
      status: valueHand(hand.cards).bust ? "bust" as const : "stood" as const,
    };
  });
  const totalGrossReturn = sumSafe(hands.map((hand) => hand.settlement.grossReturn));
  const outcome = roundOutcome(
    hands.map((hand) => hand.settlement.outcome),
    totalGrossReturn,
    state.totalWager,
  );

  context.events.push({
    game: "blackjack",
    grossReturn: totalGrossReturn,
    outcome,
    totalWager: state.totalWager,
    type: "round.settled",
  });
  context.events.push({
    activeHandId: null,
    allowedActions: [],
    phase: "settled",
    type: "blackjack.turn.changed",
  });

  return {
    ...copyState(state),
    activeHandId: null,
    dealer,
    hands,
    phase: "settled",
    totalGrossReturn,
  };
}

function revealDealerHoleCard(
  dealer: BlackjackDealerHand,
  events: BlackjackDomainEvent[],
): BlackjackDealerHand {
  if (dealer.holeCardRevealed) {
    return copyDealer(dealer);
  }

  const holeCard = dealer.cards[1];
  if (!holeCard) {
    throw new TransitionFailure("SHOE_EXHAUSTED", "Dealer hole card is missing.");
  }

  events.push({
    card: copyCard(holeCard),
    handId: "dealer",
    recipient: "dealer",
    type: "blackjack.card.revealed",
  });

  return {
    cards: dealer.cards.map(copyCard),
    holeCardRevealed: true,
  };
}

function settleHand(
  hand: BlackjackHand,
  dealerValue: HandValue,
  ruleset: RulesetV2,
): BlackjackHandSettlement {
  const playerValue = valueHand(hand.cards);
  const playerBlackjack = playerValue.blackjack &&
    (!hand.fromSplit || ruleset.blackjack.splitTwentyOneIsBlackjack);
  const dealerBlackjack = dealerValue.blackjack;
  let outcome: BlackjackHandOutcome;
  let grossReturn: number;

  if (playerValue.bust) {
    outcome = "loss";
    grossReturn = 0;
  } else if (playerBlackjack && dealerBlackjack) {
    outcome = "push";
    grossReturn = hand.wager;
  } else if (playerBlackjack) {
    outcome = "blackjack";
    grossReturn = naturalBlackjackGrossReturn(hand.wager, ruleset);
  } else if (dealerBlackjack) {
    outcome = "loss";
    grossReturn = 0;
  } else if (dealerValue.bust || playerValue.total > dealerValue.total) {
    outcome = "win";
    grossReturn = safeMultiply(hand.wager, 2);
  } else if (playerValue.total < dealerValue.total) {
    outcome = "loss";
    grossReturn = 0;
  } else {
    outcome = "push";
    grossReturn = hand.wager;
  }

  return {
    grossReturn,
    outcome,
    wager: hand.wager,
  };
}

function naturalBlackjackGrossReturn(wager: number, ruleset: RulesetV2): number {
  const numerator = BigInt(ruleset.blackjack.blackjackPayout.numerator);
  const denominator = BigInt(ruleset.blackjack.blackjackPayout.denominator);
  const profitNumerator = BigInt(wager) * numerator;

  if (profitNumerator % denominator !== 0n) {
    throw new TransitionFailure(
      "INVALID_WAGER",
      "Wager cannot produce an exact whole-PLAY blackjack payout.",
    );
  }

  return safeBigIntToNumber(BigInt(wager) + profitNumerator / denominator);
}

function dealerMustHit(value: HandValue, ruleset: RulesetV2): boolean {
  return value.total < 17 ||
    (value.total === 17 && value.soft && ruleset.blackjack.dealerHitsSoft17);
}

function canDouble(hand: BlackjackHand, ruleset: RulesetV2): boolean {
  return hand.cards.length === 2 &&
    hand.status === "playing" &&
    ruleset.blackjack.doublePolicy === "any-two-card" &&
    (!hand.fromSplit || ruleset.blackjack.doubleAfterSplit) &&
    !(hand.splitAces && ruleset.blackjack.splitAcesOneCardOnly);
}

function canSplit(
  hand: BlackjackHand,
  state: BlackjackState,
  ruleset: RulesetV2,
): boolean {
  if (
    hand.cards.length !== 2 ||
    hand.status !== "playing" ||
    state.splitCount >= ruleset.blackjack.maxSplits ||
    (hand.fromSplit && !ruleset.blackjack.resplit)
  ) {
    return false;
  }

  const first = hand.cards[0];
  const second = hand.cards[1];
  return first !== undefined &&
    second !== undefined &&
    ruleset.blackjack.splitMatch === "same-value" &&
    cardSplitValue(first) === cardSplitValue(second);
}

function cardSplitValue(card: BlackjackCard): number {
  switch (card.rank) {
    case "A":
      return 11;
    case "K":
    case "Q":
    case "J":
    case "10":
      return 10;
    default:
      return Number(card.rank);
  }
}

function valueHand(cards: readonly BlackjackCard[]): HandValue {
  return evaluateHand(cards.map((card) => card.rank));
}

function requireValidWager(wager: number, ruleset: RulesetV2): void {
  if (
    !Number.isSafeInteger(wager) ||
    wager <= 0 ||
    wager % ruleset.blackjack.wagerUnit !== 0
  ) {
    throw new TransitionFailure(
      "INVALID_WAGER",
      `Wager must be a positive safe integer divisible by ${ruleset.blackjack.wagerUnit} PLAY.`,
    );
  }

  // Validate the highest special payout before any cards or ledger intent are consumed.
  naturalBlackjackGrossReturn(wager, ruleset);
}

function requireLegalAction(
  state: BlackjackState,
  ruleset: RulesetV2,
  action: BlackjackLegalAction,
): void {
  if (!blackjackLegalActions(state, ruleset).includes(action)) {
    throw new TransitionFailure(
      "ACTION_NOT_ALLOWED",
      `Action ${action} is not legal during ${state.phase}.`,
    );
  }
}

function requireHandId(handId: BlackjackHandId): void {
  if (!/^hand-[1-9]\d*$/.test(handId)) {
    throw new TransitionFailure(
      "INVALID_HAND_ID",
      "Hand id must use the deterministic hand-N format.",
    );
  }
}

function requireActiveHand(state: BlackjackState, handId: BlackjackHandId): void {
  if (!state.hands.some((hand) => hand.id === handId)) {
    throw new TransitionFailure(
      "INVALID_HAND_ID",
      `Hand ${handId} does not exist.`,
    );
  }

  if (state.phase !== "player-turn" || state.activeHandId !== handId) {
    throw new TransitionFailure(
      "HAND_NOT_ACTIVE",
      `Hand ${handId} is not the active hand.`,
    );
  }
}

function requireHand(state: BlackjackState, handId: BlackjackHandId): BlackjackHand {
  const hand = state.hands.find((candidate) => candidate.id === handId);
  if (!hand) {
    throw new TransitionFailure("INVALID_HAND_ID", `Hand ${handId} does not exist.`);
  }
  return hand;
}

function replaceHand(
  state: BlackjackState,
  handId: BlackjackHandId,
  hand: BlackjackHand,
): BlackjackState {
  return {
    ...copyState(state),
    hands: state.hands.map((candidate) =>
      candidate.id === handId ? copyHand(hand) : copyHand(candidate),
    ),
  };
}

function faceUpDeal(
  recipient: "dealer" | "player",
  handId: BlackjackHandId | "dealer",
  card: BlackjackCard,
): BlackjackCardDealtEvent {
  return {
    card: copyCard(card),
    faceUp: true,
    handId,
    recipient,
    type: "blackjack.card.dealt",
  };
}

function createShoeCursor(shoe: readonly BlackjackCard[]): ShoeCursor {
  let offset = 0;

  return {
    consumed: () => offset,
    draw: () => {
      const card = shoe[offset];
      if (!card) {
        throw new TransitionFailure("SHOE_EXHAUSTED", "The injected shoe has no remaining card.");
      }
      offset += 1;
      return copyCard(card);
    },
    remaining: () => shoe.slice(offset),
  };
}

function rejectTransition(
  state: BlackjackState,
  action: BlackjackEngineAction,
  shoe: readonly BlackjackCard[],
  code: BlackjackDomainErrorCode,
  message: string,
): BlackjackRejectedTransition {
  return {
    consumedCards: 0,
    error: {
      action: action.type,
      code,
      message,
      phase: state.phase,
    },
    events: EMPTY_EVENTS,
    ledgerIntents: EMPTY_LEDGER_INTENTS,
    ok: false,
    remainingShoe: shoe,
    state,
  };
}

function emitPlayerTurnChanged(
  state: BlackjackState,
  ruleset: RulesetV2,
  events: BlackjackDomainEvent[],
): void {
  const allowedActions = blackjackLegalActions(state, ruleset).filter(
    (action): action is BlackjackPlayerAction => action !== "place-bet",
  );
  events.push({
    activeHandId: state.activeHandId,
    allowedActions,
    phase: "player",
    type: "blackjack.turn.changed",
  });
}

function roundOutcome(
  handOutcomes: readonly BlackjackHandOutcome[],
  grossReturn: number,
  totalWager: number,
): BlackjackRoundOutcome {
  if (new Set(handOutcomes).size > 1) {
    return "mixed";
  }
  if (grossReturn > totalWager) {
    return "win";
  }
  if (grossReturn < totalWager) {
    return "loss";
  }
  return "push";
}

function rulesetMatchesState(state: BlackjackState, ruleset: RulesetV2): boolean {
  return isSupportedRuleset(ruleset) &&
    state.rulesetId === ruleset.id &&
    state.rulesetSchemaVersion === ruleset.schemaVersion;
}

function isSupportedRuleset(ruleset: RulesetV2): boolean {
  return isMvpRuleset(ruleset);
}

function requireUniqueCardIds(
  state: BlackjackState,
  shoe: readonly BlackjackCard[],
): void {
  const dealtCards = [
    ...state.dealer.cards,
    ...state.hands.flatMap((hand) => hand.cards),
  ];
  const cardIds = new Set<string>();

  for (const card of [...dealtCards, ...shoe]) {
    if (card.cardId.trim().length === 0 || cardIds.has(card.cardId)) {
      throw new TransitionFailure(
        "INVALID_SHOE",
        `Card id ${JSON.stringify(card.cardId)} must be non-empty and unique across state and shoe.`,
      );
    }
    cardIds.add(card.cardId);
  }
}

function createHandId(handNumber: number): BlackjackHandId {
  if (!Number.isSafeInteger(handNumber) || handNumber < 1) {
    throw new TransitionFailure("INVALID_HAND_ID", "Next hand number is invalid.");
  }
  return `hand-${handNumber}`;
}

function handArrayIndex(state: BlackjackState, handId: BlackjackHandId): number {
  const index = state.hands.findIndex((hand) => hand.id === handId);
  if (index < 0) {
    throw new TransitionFailure("INVALID_HAND_ID", `Hand ${handId} does not exist.`);
  }
  return index;
}

function safeAdd(left: number, right: number): number {
  return safeBigIntToNumber(BigInt(left) + BigInt(right));
}

function safeMultiply(value: number, multiplier: number): number {
  return safeBigIntToNumber(BigInt(value) * BigInt(multiplier));
}

function sumSafe(values: readonly number[]): number {
  return safeBigIntToNumber(values.reduce((sum, value) => sum + BigInt(value), 0n));
}

function safeBigIntToNumber(value: bigint): number {
  if (value < 0n || value > MAX_SAFE_BIGINT) {
    throw new TransitionFailure("AMOUNT_OVERFLOW", "PLAY amount exceeds the safe integer range.");
  }
  return Number(value);
}

function copyCard(card: BlackjackCard): BlackjackCard {
  return {
    cardId: card.cardId,
    rank: card.rank,
    suit: card.suit,
  };
}

function copyDealer(dealer: BlackjackDealerHand): BlackjackDealerHand {
  return {
    cards: dealer.cards.map(copyCard),
    holeCardRevealed: dealer.holeCardRevealed,
  };
}

function copyHand(hand: BlackjackHand): BlackjackHand {
  return {
    cards: hand.cards.map(copyCard),
    doubled: hand.doubled,
    fromSplit: hand.fromSplit,
    id: hand.id,
    splitAces: hand.splitAces,
    status: hand.status,
    wager: hand.wager,
    ...(hand.settlement ? { settlement: { ...hand.settlement } } : {}),
  };
}

function copyState(state: BlackjackState): BlackjackState {
  return {
    activeHandId: state.activeHandId,
    dealer: copyDealer(state.dealer),
    hands: state.hands.map(copyHand),
    nextHandNumber: state.nextHandNumber,
    phase: state.phase,
    rulesetId: state.rulesetId,
    rulesetSchemaVersion: state.rulesetSchemaVersion,
    splitCount: state.splitCount,
    totalGrossReturn: state.totalGrossReturn,
    totalWager: state.totalWager,
  };
}
