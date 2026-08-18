import {
  isMvpRuleset,
  mvpRuleset,
  type RulesetV2,
} from "@spelsajt/config";

import { rouletteColour } from "./roulette";

export const rouletteBetTypes = [
  "straight",
  "split",
  "street",
  "corner",
  "six-line",
  "column",
  "dozen",
  "red-black",
  "odd-even",
  "low-high",
] as const;

export type RouletteBetType = (typeof rouletteBetTypes)[number];
export type RoulettePhase = "created" | "accepting-bets" | "locked" | "spinning" | "settled";
export type RouletteOutcome = "win" | "loss" | "push" | "mixed";

export type RouletteRuleset = RulesetV2;

/**
 * Frozen projection used by the MVP engine. A future ruleset version must be
 * added deliberately together with new engine regression vectors.
 */
export const rouletteMvpRuleset: RouletteRuleset = mvpRuleset;

/** Domain equivalent of the v2 transport selection; amounts stay numeric in core. */
export type RouletteSelection =
  | Readonly<{ type: "straight"; pocket: number }>
  | Readonly<{ type: "split"; pockets: readonly [number, number] }>
  | Readonly<{ type: "street"; start: number }>
  | Readonly<{ type: "corner"; topLeft: number }>
  | Readonly<{ type: "six-line"; start: number }>
  | Readonly<{ type: "column"; column: 1 | 2 | 3 }>
  | Readonly<{ type: "dozen"; dozen: 1 | 2 | 3 }>
  | Readonly<{ type: "red-black"; colour: "red" | "black" }>
  | Readonly<{ type: "odd-even"; parity: "odd" | "even" }>
  | Readonly<{ type: "low-high"; range: "low" | "high" }>;

export type RouletteBet = Readonly<{
  betId: string;
  amount: number;
  selection: RouletteSelection;
}>;

export interface RouletteBetSettlement {
  readonly betId: string;
  readonly type: RouletteBetType;
  readonly stake: number;
  readonly winning: boolean;
  /** Amount credited after the stake was previously reserved. */
  readonly returnAmount: number;
  /** Return minus the reserved stake. */
  readonly net: number;
}

export interface RouletteSettlement {
  readonly pocket: number;
  readonly totalStake: number;
  readonly totalReturn: number;
  readonly net: number;
  readonly outcome: RouletteOutcome;
  readonly bets: readonly RouletteBetSettlement[];
}

export interface RouletteState {
  readonly game: "roulette";
  readonly roundId: string;
  readonly rulesetId: RouletteRuleset["id"];
  readonly phase: RoulettePhase;
  readonly bets: readonly RouletteBet[];
  readonly totalStake: number;
  readonly pocket: number | null;
  readonly settlement: RouletteSettlement | null;
}

export type RouletteCommand =
  | Readonly<{ type: "OPEN_BETTING" }>
  | Readonly<{ type: "PLACE_BET"; bet: RouletteBet }>
  | Readonly<{ type: "LOCK_BETS" }>
  | Readonly<{ type: "ROULETTE_SPIN" }>
  | Readonly<{ type: "SETTLE" }>;

/** Fairness output, supplied by the server rather than by the player command. */
export interface RouletteSpinInput {
  readonly pocket: number;
}

export type RouletteDomainEvent =
  | Readonly<{
    type: "roulette.betting.opened";
    roundId: string;
    payload: Readonly<{ game: "roulette"; rulesetId: RouletteRuleset["id"] }>;
  }>
  | Readonly<{
    type: "roulette.bet.placed";
    roundId: string;
    payload: Readonly<{
      bet: RouletteBet;
      totalStake: number;
    }>;
  }>
  | Readonly<{
    type: "roulette.bets.locked";
    roundId: string;
    payload: Readonly<{ betCount: number; totalStake: number }>;
  }>
  | Readonly<{
    type: "roulette.spin.started";
    roundId: string;
    payload: Readonly<{ betCount: number; totalStake: number }>;
  }>
  | Readonly<{
    type: "roulette.result";
    roundId: string;
    payload: Readonly<{ pocket: number; colour: "red" | "black" | "green" }>;
  }>
  | Readonly<{
    type: "roulette.bet.settled";
    roundId: string;
    payload: Readonly<{ betId: string; payout: number; won: boolean }>;
  }>
  | Readonly<{
    type: "round.settled";
    roundId: string;
    payload: Readonly<{
      game: "roulette";
      pocket: number;
      outcome: RouletteOutcome;
      totalStake: number;
      payout: number;
      net: number;
      winningBetIds: readonly string[];
    }>;
  }>;

export type RouletteLedgerIntent =
  | Readonly<{
    type: "roulette.bet.reserve";
    roundId: string;
    betId: string;
    currency: "PLAY";
    debitAmount: number;
  }>
  | Readonly<{
    type: "roulette.round.settle";
    roundId: string;
    currency: "PLAY";
    reservedAmount: number;
    creditAmount: number;
    net: number;
    pocket: number;
    bets: readonly RouletteBetSettlement[];
  }>;

export interface RouletteTransitionResult {
  readonly state: RouletteState;
  readonly events: readonly RouletteDomainEvent[];
  readonly ledgerIntent: RouletteLedgerIntent | null;
}

export type RouletteDomainErrorCode =
  | "INVALID_RULESET"
  | "INVALID_ROUND_ID"
  | "INVALID_STATE"
  | "INVALID_PHASE"
  | "INVALID_COMMAND"
  | "INVALID_BET_ID"
  | "DUPLICATE_BET_ID"
  | "INVALID_AMOUNT"
  | "INVALID_SELECTION"
  | "UNSUPPORTED_BET_TYPE"
  | "NO_BETS"
  | "INVALID_FAIRNESS_INPUT"
  | "ARITHMETIC_OVERFLOW";

export class RouletteDomainError extends Error {
  readonly code: RouletteDomainErrorCode;

  constructor(code: RouletteDomainErrorCode, message: string) {
    super(message);
    this.name = "RouletteDomainError";
    this.code = code;
  }
}

const phases = new Set<RoulettePhase>([
  "created",
  "accepting-bets",
  "locked",
  "spinning",
  "settled",
]);

function domainError(code: RouletteDomainErrorCode, message: string): never {
  throw new RouletteDomainError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertIdentifier(value: unknown, code: "INVALID_ROUND_ID" | "INVALID_BET_ID", label: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > 128) {
    return domainError(code, `${label} must be a non-empty, trimmed string of at most 128 characters.`);
  }

  return value;
}

function assertSafePositiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return domainError("INVALID_AMOUNT", "Roulette bet amount must be a positive safe integer in PLAY.");
  }

  return value;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    return domainError("ARITHMETIC_OVERFLOW", "Roulette PLAY arithmetic exceeded the safe integer range.");
  }

  return result;
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    return domainError("ARITHMETIC_OVERFLOW", "Roulette PLAY arithmetic exceeded the safe integer range.");
  }

  return result;
}

function assertRuleset(ruleset: RouletteRuleset): void {
  if (isMvpRuleset(ruleset)) {
    return;
  }

  domainError("INVALID_RULESET", "Roulette engine requires a supported, versioned European play-money ruleset.");
}

function assertPocket(value: unknown, ruleset: RouletteRuleset): number {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < ruleset.roulette.minimumPocket
    || value > ruleset.roulette.maximumPocket
  ) {
    return domainError(
      "INVALID_FAIRNESS_INPUT",
      `Injected roulette pocket must be an integer from ${ruleset.roulette.minimumPocket} to ${ruleset.roulette.maximumPocket}.`,
    );
  }

  return value;
}

function assertCanonicalPocketSelection(
  selection: unknown,
  expectedLength: number,
  ruleset: RouletteRuleset,
): readonly number[] {
  if (!Array.isArray(selection) || selection.length !== expectedLength) {
    return domainError("INVALID_SELECTION", `Selection must contain exactly ${expectedLength} pockets.`);
  }

  const pockets = selection.map((pocket) => {
    if (
      typeof pocket !== "number"
      || !Number.isInteger(pocket)
      || pocket < ruleset.roulette.minimumPocket
      || pocket > ruleset.roulette.maximumPocket
    ) {
      return domainError("INVALID_SELECTION", "Bet selections may only contain integer pockets from 0 to 36.");
    }

    return pocket;
  });

  for (let index = 1; index < pockets.length; index += 1) {
    const previous = pockets[index - 1];
    const current = pockets[index];
    if (previous === undefined || current === undefined || current <= previous) {
      return domainError("INVALID_SELECTION", "Pocket selections must be unique and in ascending canonical order.");
    }
  }

  return Object.freeze(pockets);
}

function isSplit(selection: readonly number[]): boolean {
  const [first, second] = selection;
  if (first === undefined || second === undefined) {
    return false;
  }

  if (first === 0) {
    return second >= 1 && second <= 3;
  }

  const sameRow = second - first === 1 && Math.floor((first - 1) / 3) === Math.floor((second - 1) / 3);
  const sameColumn = second - first === 3;
  return sameRow || sameColumn;
}

function isStreet(selection: readonly number[]): boolean {
  const first = selection[0];
  return first !== undefined
    && Number.isInteger(first)
    && first >= 1
    && first <= 34
    && (first - 1) % 3 === 0
    && selection.every((pocket, index) => pocket === first + index);
}

function isCorner(selection: readonly number[]): boolean {
  const first = selection[0];
  return first !== undefined
    && Number.isInteger(first)
    && first >= 1
    && first <= 32
    && (first - 1) % 3 <= 1
    && selection[1] === first + 1
    && selection[2] === first + 3
    && selection[3] === first + 4;
}

function isSixLine(selection: readonly number[]): boolean {
  const first = selection[0];
  return first !== undefined
    && Number.isInteger(first)
    && first >= 1
    && first <= 31
    && (first - 1) % 3 === 0
    && selection.every((pocket, index) => pocket === first + index);
}

function freezeBet(betId: string, amount: number, selection: RouletteSelection): RouletteBet {
  return Object.freeze({ betId, amount, selection: Object.freeze(selection) });
}

/** Runtime validation for commands crossing a trust boundary. */
export function validateRouletteBet(value: unknown, ruleset: RouletteRuleset): RouletteBet {
  assertRuleset(ruleset);

  if (!isRecord(value)) {
    return domainError("INVALID_SELECTION", "Roulette bet must be an object.");
  }

  const betId = assertIdentifier(value.betId, "INVALID_BET_ID", "Bet id");
  const amount = assertSafePositiveInteger(value.amount);
  if (!isRecord(value.selection)) {
    return domainError("INVALID_SELECTION", "Roulette selection must be a discriminated object.");
  }

  const rawSelection = value.selection;
  const type = rawSelection.type;

  if (typeof type !== "string" || !(rouletteBetTypes as readonly string[]).includes(type)) {
    return domainError("UNSUPPORTED_BET_TYPE", "Bet type is not enabled by this roulette ruleset.");
  }

  if (!ruleset.roulette.betTypes.includes(type as RouletteBetType)) {
    return domainError("UNSUPPORTED_BET_TYPE", `Bet type ${type} is not enabled by ruleset ${ruleset.id}.`);
  }

  switch (type) {
    case "straight": {
      const [pocket] = assertCanonicalPocketSelection([rawSelection.pocket], 1, ruleset);
      return freezeBet(betId, amount, { type, pocket: pocket as number });
    }
    case "split": {
      const pockets = assertCanonicalPocketSelection(rawSelection.pockets, 2, ruleset);
      if (!isSplit(pockets)) {
        return domainError("INVALID_SELECTION", "Split selection must contain two adjacent pockets on the European layout.");
      }
      return freezeBet(betId, amount, {
        type,
        pockets: pockets as readonly [number, number],
      });
    }
    case "street": {
      if (typeof rawSelection.start !== "number") {
        return domainError("INVALID_SELECTION", "Street selection requires a numeric start pocket.");
      }
      const pockets = [rawSelection.start, rawSelection.start + 1, rawSelection.start + 2];
      if (!isStreet(pockets)) {
        return domainError("INVALID_SELECTION", "Street selection must be one complete canonical row.");
      }
      return freezeBet(betId, amount, { type, start: rawSelection.start });
    }
    case "corner": {
      if (typeof rawSelection.topLeft !== "number") {
        return domainError("INVALID_SELECTION", "Corner selection requires a numeric top-left pocket.");
      }
      const pockets = [
        rawSelection.topLeft,
        rawSelection.topLeft + 1,
        rawSelection.topLeft + 3,
        rawSelection.topLeft + 4,
      ];
      if (!isCorner(pockets)) {
        return domainError("INVALID_SELECTION", "Corner selection must form a canonical two-by-two block.");
      }
      return freezeBet(betId, amount, { type, topLeft: rawSelection.topLeft });
    }
    case "six-line": {
      if (typeof rawSelection.start !== "number") {
        return domainError("INVALID_SELECTION", "Six-line selection requires a numeric start pocket.");
      }
      const start = rawSelection.start;
      const pockets = Array.from({ length: 6 }, (_, index) => start + index);
      if (!isSixLine(pockets)) {
        return domainError("INVALID_SELECTION", "Six-line selection must contain two adjacent complete streets.");
      }
      return freezeBet(betId, amount, { type, start: rawSelection.start });
    }
    case "column": {
      if (rawSelection.column !== 1 && rawSelection.column !== 2 && rawSelection.column !== 3) {
        return domainError("INVALID_SELECTION", "Column selection must be 1, 2, or 3.");
      }
      return freezeBet(betId, amount, { type, column: rawSelection.column });
    }
    case "dozen": {
      if (rawSelection.dozen !== 1 && rawSelection.dozen !== 2 && rawSelection.dozen !== 3) {
        return domainError("INVALID_SELECTION", "Dozen selection must be 1, 2, or 3.");
      }
      return freezeBet(betId, amount, { type, dozen: rawSelection.dozen });
    }
    case "red-black": {
      if (rawSelection.colour !== "red" && rawSelection.colour !== "black") {
        return domainError("INVALID_SELECTION", "Red-black selection must be red or black.");
      }
      return freezeBet(betId, amount, { type, colour: rawSelection.colour });
    }
    case "odd-even": {
      if (rawSelection.parity !== "odd" && rawSelection.parity !== "even") {
        return domainError("INVALID_SELECTION", "Odd-even selection must be odd or even.");
      }
      return freezeBet(betId, amount, { type, parity: rawSelection.parity });
    }
    case "low-high": {
      if (rawSelection.range !== "low" && rawSelection.range !== "high") {
        return domainError("INVALID_SELECTION", "Low-high selection must be low or high.");
      }
      return freezeBet(betId, amount, { type, range: rawSelection.range });
    }
    default:
      return domainError("UNSUPPORTED_BET_TYPE", "Unsupported roulette bet type.");
  }
}

export function rouletteBetWins(bet: RouletteBet, pocket: number, ruleset: RouletteRuleset): boolean {
  const validatedBet = validateRouletteBet(bet, ruleset);
  const validatedPocket = assertPocket(pocket, ruleset);

  switch (validatedBet.selection.type) {
    case "straight":
      return validatedPocket === validatedBet.selection.pocket;
    case "split":
      return validatedBet.selection.pockets.includes(validatedPocket);
    case "street":
      return validatedPocket >= validatedBet.selection.start && validatedPocket <= validatedBet.selection.start + 2;
    case "corner":
      return [
        validatedBet.selection.topLeft,
        validatedBet.selection.topLeft + 1,
        validatedBet.selection.topLeft + 3,
        validatedBet.selection.topLeft + 4,
      ].includes(validatedPocket);
    case "six-line":
      return validatedPocket >= validatedBet.selection.start && validatedPocket <= validatedBet.selection.start + 5;
    case "column":
      return validatedPocket !== 0 && ((validatedPocket - 1) % 3) + 1 === validatedBet.selection.column;
    case "dozen":
      return validatedPocket >= (validatedBet.selection.dozen - 1) * 12 + 1
        && validatedPocket <= validatedBet.selection.dozen * 12;
    case "red-black":
      return validatedPocket !== 0 && rouletteColour(validatedPocket) === validatedBet.selection.colour;
    case "odd-even":
      return validatedPocket !== 0
        && (validatedPocket % 2 === 0 ? "even" : "odd") === validatedBet.selection.parity;
    case "low-high":
      return validatedPocket !== 0
        && (validatedPocket <= 18 ? "low" : "high") === validatedBet.selection.range;
  }
}

function buildSettlement(
  bets: readonly RouletteBet[],
  pocket: number,
  totalStake: number,
  ruleset: RouletteRuleset,
): RouletteSettlement {
  let totalReturn = 0;
  const betSettlements = bets.map((bet): RouletteBetSettlement => {
    const winning = rouletteBetWins(bet, pocket, ruleset);
    const returnAmount = winning
      ? safeMultiply(bet.amount, ruleset.roulette.grossPayoutMultipliers[bet.selection.type])
      : 0;
    totalReturn = safeAdd(totalReturn, returnAmount);

    return Object.freeze({
      betId: bet.betId,
      type: bet.selection.type,
      stake: bet.amount,
      winning,
      returnAmount,
      net: returnAmount - bet.amount,
    });
  });
  const net = totalReturn - totalStake;
  const winningBetCount = betSettlements.filter((bet) => bet.winning).length;
  const outcome: RouletteOutcome = winningBetCount === 0
    ? "loss"
    : winningBetCount === betSettlements.length
      ? "win"
      : "mixed";

  return Object.freeze({
    pocket,
    totalStake,
    totalReturn,
    net,
    outcome,
    bets: Object.freeze(betSettlements),
  });
}

function freezeState(value: Omit<RouletteState, "game">): RouletteState {
  return Object.freeze({ game: "roulette", ...value });
}

function assertState(state: RouletteState, ruleset: RouletteRuleset): RouletteState {
  if (!isRecord(state) || state.game !== "roulette") {
    return domainError("INVALID_STATE", "Roulette state is malformed.");
  }

  const roundId = assertIdentifier(state.roundId, "INVALID_ROUND_ID", "Round id");
  if (state.rulesetId !== ruleset.id) {
    return domainError("INVALID_STATE", "Roulette state and injected ruleset versions do not match.");
  }

  if (typeof state.phase !== "string" || !phases.has(state.phase as RoulettePhase) || !Array.isArray(state.bets)) {
    return domainError("INVALID_STATE", "Roulette state has an invalid phase or bet collection.");
  }

  const phase = state.phase as RoulettePhase;
  const bets = Object.freeze(state.bets.map((bet) => validateRouletteBet(bet, ruleset)));
  const uniqueIds = new Set(bets.map((bet) => bet.betId));
  if (uniqueIds.size !== bets.length) {
    return domainError("INVALID_STATE", "Roulette state contains duplicate bet ids.");
  }

  const totalStake = bets.reduce((sum, bet) => safeAdd(sum, bet.amount), 0);
  if (state.totalStake !== totalStake) {
    return domainError("INVALID_STATE", "Roulette state's total stake does not equal its bets.");
  }

  if (phase === "created" && bets.length > 0) {
    return domainError("INVALID_STATE", "A newly created roulette round cannot contain bets.");
  }

  if ((phase === "locked" || phase === "spinning" || phase === "settled") && bets.length === 0) {
    return domainError("INVALID_STATE", `Roulette phase ${phase} requires at least one bet.`);
  }

  const shouldHavePocket = phase === "spinning" || phase === "settled";
  let pocket: number | null = null;
  if (shouldHavePocket) {
    pocket = assertPocket(state.pocket, ruleset);
  } else if (state.pocket !== null) {
    return domainError("INVALID_STATE", `Roulette phase ${phase} cannot contain a result pocket.`);
  }

  let settlement: RouletteSettlement | null = null;
  if (phase === "settled") {
    const expected = buildSettlement(bets, pocket as number, totalStake, ruleset);
    if (
      !isRecord(state.settlement)
      || state.settlement.pocket !== expected.pocket
      || state.settlement.totalStake !== expected.totalStake
      || state.settlement.totalReturn !== expected.totalReturn
      || state.settlement.net !== expected.net
      || state.settlement.outcome !== expected.outcome
      || !Array.isArray(state.settlement.bets)
      || state.settlement.bets.length !== expected.bets.length
      || state.settlement.bets.some((entry, index) => {
        const expectedEntry = expected.bets[index];
        return !isRecord(entry)
          || expectedEntry === undefined
          || entry.betId !== expectedEntry.betId
          || entry.type !== expectedEntry.type
          || entry.stake !== expectedEntry.stake
          || entry.winning !== expectedEntry.winning
          || entry.returnAmount !== expectedEntry.returnAmount
          || entry.net !== expectedEntry.net;
      })
    ) {
      return domainError("INVALID_STATE", "Roulette settlement does not match its bets and pocket.");
    }
    settlement = expected;
  } else if (state.settlement !== null) {
    return domainError("INVALID_STATE", `Roulette phase ${phase} cannot contain settlement data.`);
  }

  return freezeState({
    roundId,
    rulesetId: ruleset.id,
    phase,
    bets,
    totalStake,
    pocket,
    settlement,
  });
}

function freezeEvent<T extends RouletteDomainEvent>(event: T): T {
  Object.freeze(event.payload);
  return Object.freeze(event);
}

function transitionResult(
  state: RouletteState,
  events: readonly RouletteDomainEvent[],
  ledgerIntent: RouletteLedgerIntent | null,
): RouletteTransitionResult {
  return Object.freeze({
    state,
    events: Object.freeze([...events]),
    ledgerIntent,
  });
}

function requirePhase(state: RouletteState, expected: RoulettePhase, command: string): void {
  if (state.phase !== expected) {
    domainError("INVALID_PHASE", `${command} requires phase ${expected}; current phase is ${state.phase}.`);
  }
}

export function createRouletteState(roundId: string, ruleset: RouletteRuleset): RouletteState {
  assertRuleset(ruleset);

  return freezeState({
    roundId: assertIdentifier(roundId, "INVALID_ROUND_ID", "Round id"),
    rulesetId: ruleset.id,
    phase: "created",
    bets: Object.freeze([]),
    totalStake: 0,
    pocket: null,
    settlement: null,
  });
}

export function transitionRoulette(
  previousState: RouletteState,
  command: RouletteCommand,
  ruleset: RouletteRuleset,
  spinInput?: RouletteSpinInput,
): RouletteTransitionResult {
  assertRuleset(ruleset);
  const state = assertState(previousState, ruleset);

  if (!isRecord(command) || typeof command.type !== "string") {
    return domainError("INVALID_COMMAND", "Roulette command is malformed.");
  }

  switch (command.type) {
    case "OPEN_BETTING": {
      requirePhase(state, "created", command.type);
      const nextState = freezeState({ ...state, phase: "accepting-bets" });
      const event = freezeEvent({
        type: "roulette.betting.opened",
        roundId: state.roundId,
        payload: Object.freeze({ game: "roulette", rulesetId: ruleset.id }),
      });
      return transitionResult(nextState, [event], null);
    }
    case "PLACE_BET": {
      requirePhase(state, "accepting-bets", command.type);
      const bet = validateRouletteBet(command.bet, ruleset);
      if (state.bets.some((existing) => existing.betId === bet.betId)) {
        return domainError("DUPLICATE_BET_ID", `Bet id ${bet.betId} already exists in this round.`);
      }

      const totalStake = safeAdd(state.totalStake, bet.amount);
      const nextState = freezeState({
        ...state,
        bets: Object.freeze([...state.bets, bet]),
        totalStake,
      });
      const event = freezeEvent({
        type: "roulette.bet.placed",
        roundId: state.roundId,
        payload: Object.freeze({ bet, totalStake }),
      });
      const ledgerIntent = Object.freeze({
        type: "roulette.bet.reserve" as const,
        roundId: state.roundId,
        betId: bet.betId,
        currency: "PLAY" as const,
        debitAmount: bet.amount,
      });
      return transitionResult(nextState, [event], ledgerIntent);
    }
    case "LOCK_BETS": {
      requirePhase(state, "accepting-bets", command.type);
      if (state.bets.length === 0) {
        return domainError("NO_BETS", "Roulette bets cannot be locked before at least one bet is placed.");
      }

      const nextState = freezeState({ ...state, phase: "locked" });
      const event = freezeEvent({
        type: "roulette.bets.locked",
        roundId: state.roundId,
        payload: Object.freeze({ betCount: state.bets.length, totalStake: state.totalStake }),
      });
      return transitionResult(nextState, [event], null);
    }
    case "ROULETTE_SPIN": {
      requirePhase(state, "locked", command.type);
      if (!isRecord(spinInput)) {
        return domainError("INVALID_FAIRNESS_INPUT", "ROULETTE_SPIN requires an injected fairness pocket.");
      }
      const pocket = assertPocket(spinInput.pocket, ruleset);
      const nextState = freezeState({ ...state, phase: "spinning", pocket });
      const started = freezeEvent({
        type: "roulette.spin.started",
        roundId: state.roundId,
        payload: Object.freeze({ betCount: state.bets.length, totalStake: state.totalStake }),
      });
      const result = freezeEvent({
        type: "roulette.result",
        roundId: state.roundId,
        payload: Object.freeze({ pocket, colour: rouletteColour(pocket) }),
      });
      return transitionResult(nextState, [started, result], null);
    }
    case "SETTLE": {
      requirePhase(state, "spinning", command.type);
      const pocket = state.pocket as number;
      const settlement = buildSettlement(state.bets, pocket, state.totalStake, ruleset);
      const nextState = freezeState({ ...state, phase: "settled", settlement });
      const winningBetIds = Object.freeze(
        settlement.bets.filter((bet) => bet.winning).map((bet) => bet.betId),
      );
      const betEvents = settlement.bets.map((bet) => freezeEvent({
        type: "roulette.bet.settled" as const,
        roundId: state.roundId,
        payload: Object.freeze({
          betId: bet.betId,
          payout: bet.returnAmount,
          won: bet.winning,
        }),
      }));
      const event = freezeEvent({
        type: "round.settled",
        roundId: state.roundId,
        payload: Object.freeze({
          game: "roulette",
          pocket,
          outcome: settlement.outcome,
          totalStake: settlement.totalStake,
          payout: settlement.totalReturn,
          net: settlement.net,
          winningBetIds,
        }),
      });
      const ledgerIntent = Object.freeze({
        type: "roulette.round.settle" as const,
        roundId: state.roundId,
        currency: "PLAY" as const,
        reservedAmount: settlement.totalStake,
        creditAmount: settlement.totalReturn,
        net: settlement.net,
        pocket,
        bets: settlement.bets,
      });
      return transitionResult(nextState, [...betEvents, event], ledgerIntent);
    }
    default:
      return domainError("INVALID_COMMAND", "Unsupported roulette command.");
  }
}
