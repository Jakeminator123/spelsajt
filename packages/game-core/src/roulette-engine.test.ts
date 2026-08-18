import { describe, expect, it } from "vitest";

import {
  createRouletteState,
  rouletteBetTypes,
  RouletteDomainError,
  rouletteMvpRuleset,
  transitionRoulette,
  validateRouletteBet,
  type RouletteBet,
  type RouletteRuleset,
  type RouletteSelection,
  type RouletteState,
  type RouletteTransitionResult,
} from "./roulette-engine";

function domainBet(betId: string, selection: RouletteSelection, amount = 10): RouletteBet {
  return { betId, amount, selection };
}

function expectDomainError(action: () => unknown, code: RouletteDomainError["code"]): void {
  try {
    action();
    throw new Error(`Expected RouletteDomainError ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(RouletteDomainError);
    expect((error as RouletteDomainError).code).toBe(code);
  }
}

function openRound(roundId = "round-roulette"): RouletteState {
  const created = createRouletteState(roundId, rouletteMvpRuleset);
  return transitionRoulette(created, { type: "OPEN_BETTING" }, rouletteMvpRuleset).state;
}

function runRound(
  bets: readonly RouletteBet[],
  pocket: number,
  ruleset: RouletteRuleset = rouletteMvpRuleset,
): RouletteTransitionResult {
  let state = transitionRoulette(
    createRouletteState(`round-${pocket}-${bets.map((bet) => bet.betId).join("-")}`, ruleset),
    { type: "OPEN_BETTING" },
    ruleset,
  ).state;

  for (const bet of bets) {
    state = transitionRoulette(state, { type: "PLACE_BET", bet }, ruleset).state;
  }

  state = transitionRoulette(state, { type: "LOCK_BETS" }, ruleset).state;
  state = transitionRoulette(state, { type: "ROULETTE_SPIN" }, ruleset, { pocket }).state;
  return transitionRoulette(state, { type: "SETTLE" }, ruleset);
}

describe("roulette state machine", () => {
  it("runs open, bet, lock, spin, and settlement with semantic events and ledger intents", () => {
    const created = createRouletteState("round-lifecycle", rouletteMvpRuleset);
    expect(created).toMatchObject({
      game: "roulette",
      phase: "created",
      rulesetId: rouletteMvpRuleset.id,
      totalStake: 0,
      pocket: null,
      settlement: null,
    });

    const opened = transitionRoulette(created, { type: "OPEN_BETTING" }, rouletteMvpRuleset);
    expect(opened.events).toEqual([{
      type: "roulette.betting.opened",
      roundId: "round-lifecycle",
      payload: { game: "roulette", rulesetId: rouletteMvpRuleset.id },
    }]);
    expect(opened.ledgerIntent).toBeNull();

    const bet = domainBet("bet-17", { type: "straight", pocket: 17 });
    const placed = transitionRoulette(opened.state, { type: "PLACE_BET", bet }, rouletteMvpRuleset);
    expect(placed.state).toMatchObject({ phase: "accepting-bets", totalStake: 10 });
    expect(placed.events[0]).toMatchObject({
      type: "roulette.bet.placed",
      payload: { bet, totalStake: 10 },
    });
    expect(placed.ledgerIntent).toEqual({
      type: "roulette.bet.reserve",
      roundId: "round-lifecycle",
      betId: "bet-17",
      currency: "PLAY",
      debitAmount: 10,
    });

    const locked = transitionRoulette(placed.state, { type: "LOCK_BETS" }, rouletteMvpRuleset);
    expect(locked.events).toEqual([{
      type: "roulette.bets.locked",
      roundId: "round-lifecycle",
      payload: { betCount: 1, totalStake: 10 },
    }]);

    const spun = transitionRoulette(
      locked.state,
      { type: "ROULETTE_SPIN" },
      rouletteMvpRuleset,
      { pocket: 17 },
    );
    expect(spun.events.map((event) => event.type)).toEqual([
      "roulette.spin.started",
      "roulette.result",
    ]);
    expect(spun.events[1]).toMatchObject({ payload: { pocket: 17, colour: "black" } });

    const settled = transitionRoulette(spun.state, { type: "SETTLE" }, rouletteMvpRuleset);
    expect(settled.state.settlement).toEqual({
      pocket: 17,
      totalStake: 10,
      totalReturn: 360,
      net: 350,
      outcome: "win",
      bets: [{
        betId: "bet-17",
        type: "straight",
        stake: 10,
        winning: true,
        returnAmount: 360,
        net: 350,
      }],
    });
    expect(settled.events.map((event) => event.type)).toEqual([
      "roulette.bet.settled",
      "round.settled",
    ]);
    expect(settled.ledgerIntent).toMatchObject({
      type: "roulette.round.settle",
      reservedAmount: 10,
      creditAmount: 360,
      net: 350,
      pocket: 17,
    });
  });

  it("settles a straight-up bet correctly for every one of the 37 pockets", () => {
    for (let pocket = 0; pocket <= 36; pocket += 1) {
      const winning = runRound([
        domainBet(`winner-${pocket}`, { type: "straight", pocket }, 1),
      ], pocket);
      expect(winning.state.settlement, `winning pocket ${pocket}`).toMatchObject({
        pocket,
        totalStake: 1,
        totalReturn: 36,
        net: 35,
        outcome: "win",
      });

      const losingPocket = (pocket + 1) % 37;
      const losing = runRound([
        domainBet(`loser-${pocket}`, { type: "straight", pocket }, 1),
      ], losingPocket);
      expect(losing.state.settlement, `losing selection ${pocket}`).toMatchObject({
        totalStake: 1,
        totalReturn: 0,
        net: -1,
        outcome: "loss",
      });
    }
  });

  it("locks the complete 37-pocket payout matrix for every supported bet type", () => {
    const redPockets = [
      1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
    ] as const;
    const cases: readonly {
      multiplier: number;
      name: string;
      selection: RouletteSelection;
      winners: readonly number[];
    }[] = [
      { name: "straight", selection: { type: "straight", pocket: 7 }, winners: [7], multiplier: 36 },
      { name: "split", selection: { type: "split", pockets: [1, 2] }, winners: [1, 2], multiplier: 18 },
      { name: "street", selection: { type: "street", start: 1 }, winners: [1, 2, 3], multiplier: 12 },
      { name: "corner", selection: { type: "corner", topLeft: 1 }, winners: [1, 2, 4, 5], multiplier: 9 },
      { name: "six-line", selection: { type: "six-line", start: 1 }, winners: [1, 2, 3, 4, 5, 6], multiplier: 6 },
      { name: "column", selection: { type: "column", column: 1 }, winners: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34], multiplier: 3 },
      { name: "dozen", selection: { type: "dozen", dozen: 2 }, winners: Array.from({ length: 12 }, (_, index) => index + 13), multiplier: 3 },
      { name: "red-black", selection: { type: "red-black", colour: "red" }, winners: redPockets, multiplier: 2 },
      { name: "odd-even", selection: { type: "odd-even", parity: "odd" }, winners: Array.from({ length: 18 }, (_, index) => index * 2 + 1), multiplier: 2 },
      { name: "low-high", selection: { type: "low-high", range: "low" }, winners: Array.from({ length: 18 }, (_, index) => index + 1), multiplier: 2 },
    ];

    expect(cases.map(({ name }) => name)).toEqual(rouletteBetTypes);

    for (const testCase of cases) {
      for (let pocket = 0; pocket <= 36; pocket += 1) {
        const result = runRound([
          domainBet(`${testCase.name}-${pocket}`, testCase.selection, 1),
        ], pocket);
        const expectedWin = testCase.winners.includes(pocket);

        expect(result.state.settlement?.totalReturn, `${testCase.name} at ${pocket}`)
          .toBe(expectedWin ? testCase.multiplier : 0);
        expect(result.state.settlement?.bets[0]?.winning, `${testCase.name} at ${pocket}`)
          .toBe(expectedWin);
      }
    }
  });

  it.each([
    ["straight", { type: "straight", pocket: 7 }, 7, 36],
    ["split", { type: "split", pockets: [1, 2] }, 2, 18],
    ["street", { type: "street", start: 1 }, 3, 12],
    ["corner", { type: "corner", topLeft: 1 }, 5, 9],
    ["six-line", { type: "six-line", start: 1 }, 6, 6],
    ["column", { type: "column", column: 1 }, 34, 3],
    ["dozen", { type: "dozen", dozen: 2 }, 24, 3],
    ["red-black", { type: "red-black", colour: "red" }, 1, 2],
    ["odd-even", { type: "odd-even", parity: "odd" }, 35, 2],
    ["low-high", { type: "low-high", range: "low" }, 18, 2],
  ] as const)("uses the ruleset gross multiplier for %s", (type, selection, pocket, multiplier) => {
    const amount = 7;
    const result = runRound([domainBet(`bet-${type}`, selection, amount)], pocket);
    expect(result.state.settlement?.totalReturn).toBe(amount * multiplier);
    expect(result.state.settlement?.bets[0]).toMatchObject({
      type,
      stake: amount,
      winning: true,
      returnAmount: amount * multiplier,
    });
  });

  it("treats zero as a loss for every outside bet", () => {
    const outsideBets: readonly RouletteBet[] = [
      domainBet("column", { type: "column", column: 1 }),
      domainBet("dozen", { type: "dozen", dozen: 1 }),
      domainBet("red", { type: "red-black", colour: "red" }),
      domainBet("odd", { type: "odd-even", parity: "odd" }),
      domainBet("low", { type: "low-high", range: "low" }),
    ];

    const result = runRound(outsideBets, 0);
    expect(result.state.settlement).toMatchObject({
      totalStake: 50,
      totalReturn: 0,
      net: -50,
      outcome: "loss",
    });
    expect(result.state.settlement?.bets.every((bet) => !bet.winning)).toBe(true);
  });

  it("reports a mixed portfolio independently of its net result", () => {
    const result = runRound([
      domainBet("red", { type: "red-black", colour: "red" }, 10),
      domainBet("black", { type: "red-black", colour: "black" }, 10),
    ], 1);

    expect(result.state.settlement).toMatchObject({
      totalStake: 20,
      totalReturn: 20,
      net: 0,
      outcome: "mixed",
    });
  });

  it("rejects an unversioned ruleset identity instead of mislabelling its events", () => {
    const versionedRuleset: RouletteRuleset = {
      ...rouletteMvpRuleset,
      id: "roulette-regression-v3",
    } as unknown as RouletteRuleset;

    expectDomainError(() => createRouletteState("round-versioned", versionedRuleset), "INVALID_RULESET");
  });

  it("does not mutate or retain mutable command inputs and is deterministic under replay", () => {
    const mutablePockets = [1, 2] as [number, number];
    const mutableBet = {
      betId: "mutable-bet",
      amount: 25,
      selection: { type: "split" as const, pockets: mutablePockets },
    };
    const command = { type: "PLACE_BET" as const, bet: mutableBet };
    const state = openRound("round-immutable");
    const beforeState = structuredClone(state);
    const beforeCommand = structuredClone(command);

    const first = transitionRoulette(state, command, rouletteMvpRuleset);
    const replay = transitionRoulette(state, command, rouletteMvpRuleset);

    expect(state).toEqual(beforeState);
    expect(command).toEqual(beforeCommand);
    expect(first).toEqual(replay);
    expect(first.state.bets[0]?.selection).not.toBe(mutableBet.selection);
    expect((first.state.bets[0]?.selection as { pockets: readonly number[] }).pockets).not.toBe(mutablePockets);
    mutablePockets[0] = 0;
    expect(first.state.bets[0]).toMatchObject({ selection: { pockets: [1, 2] } });

    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.state)).toBe(true);
    expect(Object.isFrozen(first.state.bets)).toBe(true);
    expect(Object.isFrozen(first.state.bets[0])).toBe(true);
    expect(Object.isFrozen(first.state.bets[0]?.selection)).toBe(true);
    expect(Object.isFrozen(first.events)).toBe(true);
    expect(Object.isFrozen(first.events[0]?.payload)).toBe(true);
    expect(Object.isFrozen(first.ledgerIntent)).toBe(true);
  });
});

describe("roulette bet geometry and domain failures", () => {
  it("accepts canonical inside-bet geometry including the three zero splits", () => {
    const legalSelections: readonly RouletteSelection[] = [
      { type: "straight", pocket: 0 },
      { type: "straight", pocket: 36 },
      { type: "split", pockets: [0, 1] },
      { type: "split", pockets: [0, 2] },
      { type: "split", pockets: [0, 3] },
      { type: "split", pockets: [1, 2] },
      { type: "split", pockets: [1, 4] },
      { type: "split", pockets: [35, 36] },
      { type: "split", pockets: [33, 36] },
      { type: "street", start: 1 },
      { type: "street", start: 34 },
      { type: "corner", topLeft: 1 },
      { type: "corner", topLeft: 2 },
      { type: "corner", topLeft: 31 },
      { type: "corner", topLeft: 32 },
      { type: "six-line", start: 1 },
      { type: "six-line", start: 31 },
    ];

    for (const [index, selection] of legalSelections.entries()) {
      expect(validateRouletteBet(domainBet(`legal-${index}`, selection), rouletteMvpRuleset).selection)
        .toEqual(selection);
    }
  });

  it("exhaustively locks legal and illegal European inside-bet topology", () => {
    for (let first = 0; first <= 36; first += 1) {
      for (let second = first + 1; second <= 36; second += 1) {
        const isZeroSplit = first === 0 && second >= 1 && second <= 3;
        const isHorizontal = first >= 1 && second === first + 1 && (first - 1) % 3 !== 2;
        const isVertical = first >= 1 && second === first + 3;
        const bet = domainBet(`split-${first}-${second}`, { type: "split", pockets: [first, second] });

        if (isZeroSplit || isHorizontal || isVertical) {
          expect(validateRouletteBet(bet, rouletteMvpRuleset).selection).toEqual(bet.selection);
        } else {
          expectDomainError(() => validateRouletteBet(bet, rouletteMvpRuleset), "INVALID_SELECTION");
        }
      }
    }

    for (let start = 0; start <= 36; start += 1) {
      const rowStart = start >= 1 && start <= 34 && (start - 1) % 3 === 0;
      const cornerStart = start >= 1 && start <= 32 && (start - 1) % 3 !== 2;
      const sixLineStart = start >= 1 && start <= 31 && (start - 1) % 3 === 0;
      const candidates: readonly [RouletteSelection, boolean][] = [
        [{ type: "street", start }, rowStart],
        [{ type: "corner", topLeft: start }, cornerStart],
        [{ type: "six-line", start }, sixLineStart],
      ];

      for (const [selection, legal] of candidates) {
        const bet = domainBet(`${selection.type}-${start}`, selection);
        if (legal) {
          expect(validateRouletteBet(bet, rouletteMvpRuleset).selection).toEqual(selection);
        } else {
          expectDomainError(() => validateRouletteBet(bet, rouletteMvpRuleset), "INVALID_SELECTION");
        }
      }
    }
  });

  it.each([
    { type: "straight", pocket: -1 },
    { type: "straight", pocket: 37 },
    { type: "split", pockets: [1, 3] },
    { type: "split", pockets: [2, 1] },
    { type: "split", pockets: [2, 2] },
    { type: "split", pockets: [0, 4] },
    { type: "street", start: 2 },
    { type: "street", start: 35 },
    { type: "corner", topLeft: 3 },
    { type: "corner", topLeft: 33 },
    { type: "corner", topLeft: 1.5 },
    { type: "six-line", start: 2 },
    { type: "six-line", start: 32 },
  ])("rejects non-canonical selection $type", (selection) => {
    expectDomainError(
      () => validateRouletteBet({ betId: "illegal", amount: 1, selection }, rouletteMvpRuleset),
      "INVALID_SELECTION",
    );
  });

  it("accepts each frozen bet type and rejects unsupported or malformed selections", () => {
    const selections: readonly RouletteSelection[] = [
      { type: "straight", pocket: 1 },
      { type: "split", pockets: [1, 2] },
      { type: "street", start: 1 },
      { type: "corner", topLeft: 1 },
      { type: "six-line", start: 1 },
      { type: "column", column: 1 },
      { type: "dozen", dozen: 1 },
      { type: "red-black", colour: "red" },
      { type: "odd-even", parity: "odd" },
      { type: "low-high", range: "low" },
    ];

    expect(selections.map((selection) => selection.type)).toEqual(rouletteBetTypes);
    selections.forEach((selection, index) => {
      expect(validateRouletteBet(domainBet(`type-${index}`, selection), rouletteMvpRuleset).selection.type)
        .toBe(selection.type);
    });

    expectDomainError(
      () => validateRouletteBet({
        betId: "unsupported",
        amount: 1,
        selection: { type: "basket", pockets: [0, 1, 2, 3] },
      }, rouletteMvpRuleset),
      "UNSUPPORTED_BET_TYPE",
    );
    expectDomainError(
      () => validateRouletteBet({
        betId: "bad-column",
        amount: 1,
        selection: { type: "column", column: 4 },
      }, rouletteMvpRuleset),
      "INVALID_SELECTION",
    );
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects non-positive, fractional, or unsafe amount %s",
    (amount) => {
      expectDomainError(
        () => validateRouletteBet({
          betId: "bad-amount",
          amount,
          selection: { type: "straight", pocket: 1 },
        }, rouletteMvpRuleset),
        "INVALID_AMOUNT",
      );
    },
  );

  it("detects stake and payout arithmetic overflow", () => {
    let state = openRound("round-stake-overflow");
    state = transitionRoulette(state, {
      type: "PLACE_BET",
      bet: domainBet("max", { type: "red-black", colour: "red" }, Number.MAX_SAFE_INTEGER),
    }, rouletteMvpRuleset).state;
    expectDomainError(
      () => transitionRoulette(state, {
        type: "PLACE_BET",
        bet: domainBet("one-more", { type: "red-black", colour: "black" }, 1),
      }, rouletteMvpRuleset),
      "ARITHMETIC_OVERFLOW",
    );

    const payoutOverflowAmount = Math.floor(Number.MAX_SAFE_INTEGER / 36) + 1;
    expectDomainError(
      () => runRound([
        domainBet("payout-overflow", { type: "straight", pocket: 1 }, payoutOverflowAmount),
      ], 1),
      "ARITHMETIC_OVERFLOW",
    );
  });

  it("rejects duplicate bet ids and illegal phase transitions", () => {
    const created = createRouletteState("round-illegal", rouletteMvpRuleset);
    expectDomainError(
      () => transitionRoulette(created, { type: "LOCK_BETS" }, rouletteMvpRuleset),
      "INVALID_PHASE",
    );

    let state = transitionRoulette(created, { type: "OPEN_BETTING" }, rouletteMvpRuleset).state;
    expectDomainError(
      () => transitionRoulette(state, { type: "LOCK_BETS" }, rouletteMvpRuleset),
      "NO_BETS",
    );

    const bet = domainBet("duplicate", { type: "straight", pocket: 1 });
    state = transitionRoulette(state, { type: "PLACE_BET", bet }, rouletteMvpRuleset).state;
    const stateWithBet = state;
    expectDomainError(
      () => transitionRoulette(stateWithBet, { type: "PLACE_BET", bet }, rouletteMvpRuleset),
      "DUPLICATE_BET_ID",
    );

    state = transitionRoulette(state, { type: "LOCK_BETS" }, rouletteMvpRuleset).state;
    const locked = state;
    expectDomainError(
      () => transitionRoulette(locked, { type: "ROULETTE_SPIN" }, rouletteMvpRuleset),
      "INVALID_FAIRNESS_INPUT",
    );
    for (const pocket of [-1, 37, 1.5, Number.NaN]) {
      expectDomainError(
        () => transitionRoulette(locked, { type: "ROULETTE_SPIN" }, rouletteMvpRuleset, { pocket }),
        "INVALID_FAIRNESS_INPUT",
      );
    }

    state = transitionRoulette(locked, { type: "ROULETTE_SPIN" }, rouletteMvpRuleset, { pocket: 1 }).state;
    const spinning = state;
    expectDomainError(
      () => transitionRoulette(spinning, { type: "PLACE_BET", bet: domainBet("late", { type: "straight", pocket: 1 }) }, rouletteMvpRuleset),
      "INVALID_PHASE",
    );
    const settled = transitionRoulette(spinning, { type: "SETTLE" }, rouletteMvpRuleset).state;
    expectDomainError(
      () => transitionRoulette(settled, { type: "SETTLE" }, rouletteMvpRuleset),
      "INVALID_PHASE",
    );
  });

  it("rejects malformed rulesets and tampered state", () => {
    const badTopology = {
      ...rouletteMvpRuleset,
      roulette: { ...rouletteMvpRuleset.roulette, tableTopology: "american-double-zero" },
    } as unknown as RouletteRuleset;
    expectDomainError(() => createRouletteState("bad-rules", badTopology), "INVALID_RULESET");

    const badPayout = {
      ...rouletteMvpRuleset,
      roulette: {
        ...rouletteMvpRuleset.roulette,
        grossPayoutMultipliers: {
          ...rouletteMvpRuleset.roulette.grossPayoutMultipliers,
          straight: 35,
        },
      },
    } as unknown as RouletteRuleset;
    expectDomainError(() => createRouletteState("bad-payout", badPayout), "INVALID_RULESET");

    const opened = openRound("round-tampered");
    const tampered = { ...opened, totalStake: 1 } as RouletteState;
    expectDomainError(
      () => transitionRoulette(tampered, { type: "LOCK_BETS" }, rouletteMvpRuleset),
      "INVALID_STATE",
    );
  });
});
