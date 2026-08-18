import { randomUUID } from "node:crypto";

import { mvpRuleset, mvpRulesetHash } from "@spelsajt/config";
import {
  commandAckV2Schema,
  gameCommandV2Schema,
  gameEventV2Schema,
  gameSnapshotV2Schema,
  type CommandAckV2,
  type GameCommandV2,
  type GameEventV2,
  type GameSnapshotV2,
  type RouletteBetV2,
} from "@spelsajt/contracts";
import {
  createCommitment,
  createServerSeed,
  FairRandom,
  shuffle,
  type FairnessInput,
} from "@spelsajt/fairness";
import {
  blackjackLegalActions,
  createBlackjackShoe,
  createBlackjackState,
  createRouletteState,
  evaluateHand,
  RouletteDomainError,
  transitionBlackjack,
  transitionRoulette,
  type BlackjackCard,
  type BlackjackDomainEvent,
  type BlackjackHandId,
  type BlackjackLedgerIntent,
  type RouletteBet,
  type RouletteDomainEvent,
  type RouletteLedgerIntent,
} from "@spelsajt/game-core";

import type {
  GameRepository,
  StoredBlackjackRound,
  StoredCommandReceipt,
  StoredRound,
  StoredRouletteRound,
  StoredTable,
} from "./repository";

const nilUuid = "00000000-0000-0000-0000-000000000000";
const startingBalance = Number(mvpRuleset.currency.startingBalance);

interface FairnessContext extends FairnessInput {
  readonly serverSeed: string;
}

export interface FairnessSource {
  createServerSeed(): string;
  roulettePocket(context: FairnessContext): number;
  shuffleBlackjack(
    shoe: readonly BlackjackCard[],
    context: FairnessContext,
  ): readonly BlackjackCard[];
}

export const productionFairnessSource: FairnessSource = Object.freeze({
  createServerSeed,
  roulettePocket: (context: FairnessContext) => {
    const { serverSeed, ...input } = context;
    return new FairRandom(serverSeed, input).uniformInt(mvpRuleset.roulette.pockets);
  },
  shuffleBlackjack: (
    shoe: readonly BlackjackCard[],
    context: FairnessContext,
  ): readonly BlackjackCard[] => {
    const { serverSeed, ...input } = context;
    return shuffle(shoe, new FairRandom(serverSeed, input));
  },
});

export interface GameApplicationOptions {
  readonly clock?: () => string;
  readonly fairness?: FairnessSource;
  readonly idGenerator?: () => string;
}

interface EventEnvelope {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly revision: number;
  readonly schemaVersion: 2;
  readonly sequence: number;
  readonly tableId: string;
}

type EventDraft = GameEventV2 extends infer Event
  ? Event extends GameEventV2
    ? Omit<Event, keyof EventEnvelope>
    : never
  : never;

interface AppliedCommand {
  readonly drafts: readonly EventDraft[];
  readonly table: StoredTable;
}

type CommandErrorCode = Extract<CommandAckV2, { status: "rejected" }>["error"]["code"];

class CommandRejection extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class GameApplication {
  readonly #clock: () => string;
  readonly #fairness: FairnessSource;
  readonly #ids: () => string;
  readonly #repository: GameRepository;

  constructor(repository: GameRepository, options: GameApplicationOptions = {}) {
    this.#repository = repository;
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#fairness = options.fairness ?? productionFairnessSource;
    this.#ids = options.idGenerator ?? randomUUID;
  }

  async execute(pathTableId: string, input: unknown): Promise<CommandAckV2> {
    const parsed = gameCommandV2Schema.safeParse(input);
    if (!parsed.success) {
      const current = await this.#repository.read(pathTableId);
      return rejectedAck(
        extractCommandId(input),
        current,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Command payload is invalid.",
      );
    }

    const command = parsed.data;
    if (command.tableId !== pathTableId) {
      const current = await this.#repository.read(pathTableId);
      return rejectedAck(
        command.commandId,
        current,
        "VALIDATION_ERROR",
        "Command tableId must match the route tableId.",
      );
    }

    const fingerprint = canonicalJson(command);
    return this.#repository.transact(pathTableId, (stored) => {
      const current = stored ?? emptyTable(pathTableId);
      const receipt = current.receipts[command.commandId];
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) {
          return {
            next: current,
            result: rejectedAck(
              command.commandId,
              current,
              "IDEMPOTENCY_CONFLICT",
              "commandId was already used for a different command.",
            ),
          };
        }

        const replay = receipt.ack.status === "accepted"
          ? commandAckV2Schema.parse({ ...receipt.ack, status: "replayed" })
          : receipt.ack;
        return { next: current, result: replay };
      }

      if (command.expectedRevision !== current.revision) {
        return rememberRejection(
          current,
          command,
          fingerprint,
          "STALE_REVISION",
          `Expected revision ${command.expectedRevision} but table is at revision ${current.revision}.`,
        );
      }

      try {
        const applied = this.#apply(current, command);
        return this.#commit(current, applied, command, fingerprint);
      } catch (error) {
        if (error instanceof CommandRejection) {
          return rememberRejection(
            current,
            command,
            fingerprint,
            error.code,
            error.message,
          );
        }
        if (error instanceof RouletteDomainError) {
          return rememberRejection(
            current,
            command,
            fingerprint,
            "ILLEGAL_ACTION",
            error.message,
          );
        }

        return rememberRejection(
          current,
          command,
          fingerprint,
          "INTERNAL_ERROR",
          "The command could not be completed.",
        );
      }
    });
  }

  async getSnapshot(tableId: string): Promise<GameSnapshotV2 | null> {
    const table = await this.#repository.read(tableId);
    if (!table || table.game === null) {
      return null;
    }
    return buildSnapshot(table);
  }

  #apply(current: StoredTable, command: GameCommandV2): AppliedCommand {
    switch (command.type) {
      case "PREPARE_ROUND":
        return this.#prepareRound(current, command.payload.game);
      case "BLACKJACK_PLACE_BET":
        return this.#placeBlackjackBet(current, command);
      case "BLACKJACK_ACTION":
        return this.#playBlackjackAction(current, command);
      case "ROULETTE_PLACE_BETS":
        return this.#placeRouletteBets(current, command);
      case "ROULETTE_SPIN":
        return this.#spinRoulette(current, command);
    }
  }

  #prepareRound(current: StoredTable, game: "blackjack" | "roulette"): AppliedCommand {
    if (current.round && !roundIsSettled(current.round)) {
      throw new CommandRejection("ILLEGAL_ACTION", "The current round must settle before preparing another round.");
    }

    const roundId = this.#ids();
    const serverSeed = this.#fairness.createServerSeed();
    const fairness = {
      commitment: createCommitment(serverSeed),
      nonce: current.nextNonce,
      serverSeed,
    };
    const prepared: EventDraft = {
      type: "round.prepared",
      roundId,
      payload: {
        commitment: fairness.commitment,
        fairnessAlgorithm: "pf-v1",
        game,
        nonce: fairness.nonce,
        rulesetHash: mvpRulesetHash,
        rulesetId: mvpRuleset.id,
      },
    };

    if (game === "blackjack") {
      const round: StoredBlackjackRound = {
        clientSeed: null,
        fairness,
        game,
        roundId,
        shoe: [],
        state: createBlackjackState(mvpRuleset),
      };
      return {
        drafts: [prepared],
        table: { ...current, game, nextNonce: current.nextNonce + 1, round },
      };
    }

    const opened = transitionRoulette(
      createRouletteState(roundId, mvpRuleset),
      { type: "OPEN_BETTING" },
      mvpRuleset,
    );
    const round: StoredRouletteRound = {
      clientSeed: null,
      fairness,
      game,
      roundId,
      state: opened.state,
    };
    return {
      drafts: [prepared, ...rouletteEventDrafts(opened.events, round, current.balance)],
      table: { ...current, game, nextNonce: current.nextNonce + 1, round },
    };
  }

  #placeBlackjackBet(
    current: StoredTable,
    command: Extract<GameCommandV2, { type: "BLACKJACK_PLACE_BET" }>,
  ): AppliedCommand {
    const round = requireBlackjackRound(current, command.payload.roundId);
    if (round.clientSeed !== null) {
      throw new CommandRejection("ILLEGAL_ACTION", "The blackjack wager has already been placed.");
    }

    const context = fairnessContext(round, command.payload.clientSeed);
    const shoe = this.#fairness.shuffleBlackjack(createBlackjackShoe(mvpRuleset), context);
    const transition = transitionBlackjack(
      round.state,
      { type: "place-bet", wager: Number(command.payload.amount) },
      mvpRuleset,
      shoe,
    );
    if (!transition.ok) {
      throw new CommandRejection("ILLEGAL_ACTION", transition.error.message);
    }

    const balance = applyBlackjackLedger(current.balance, transition.ledgerIntents);
    const nextRound: StoredBlackjackRound = {
      ...round,
      clientSeed: command.payload.clientSeed,
      shoe: transition.remainingShoe,
      state: transition.state,
    };
    return {
      drafts: blackjackEventDrafts(transition.events, nextRound, balance),
      table: { ...current, balance, round: nextRound },
    };
  }

  #playBlackjackAction(
    current: StoredTable,
    command: Extract<GameCommandV2, { type: "BLACKJACK_ACTION" }>,
  ): AppliedCommand {
    const round = requireBlackjackRound(current, command.payload.roundId);
    if (round.clientSeed === null) {
      throw new CommandRejection("ILLEGAL_ACTION", "A wager is required before blackjack actions.");
    }
    const transition = transitionBlackjack(
      round.state,
      {
        handId: command.payload.handId as BlackjackHandId,
        type: command.payload.action,
      },
      mvpRuleset,
      round.shoe,
    );
    if (!transition.ok) {
      throw new CommandRejection("ILLEGAL_ACTION", transition.error.message);
    }

    const balance = applyBlackjackLedger(current.balance, transition.ledgerIntents);
    const nextRound: StoredBlackjackRound = {
      ...round,
      shoe: transition.remainingShoe,
      state: transition.state,
    };
    return {
      drafts: blackjackEventDrafts(transition.events, nextRound, balance),
      table: { ...current, balance, round: nextRound },
    };
  }

  #placeRouletteBets(
    current: StoredTable,
    command: Extract<GameCommandV2, { type: "ROULETTE_PLACE_BETS" }>,
  ): AppliedCommand {
    const round = requireRouletteRound(current, command.payload.roundId);
    if (round.clientSeed !== null && round.clientSeed !== command.payload.clientSeed) {
      throw new CommandRejection("IDEMPOTENCY_CONFLICT", "All bets in a roulette round must use the same clientSeed.");
    }

    let state = round.state;
    let balance = current.balance;
    const events: RouletteDomainEvent[] = [];
    for (const transportBet of command.payload.bets) {
      const transition = transitionRoulette(
        state,
        { type: "PLACE_BET", bet: toCoreBet(transportBet) },
        mvpRuleset,
      );
      state = transition.state;
      events.push(...transition.events);
      balance = applyRouletteLedger(balance, transition.ledgerIntent);
    }

    const nextRound: StoredRouletteRound = {
      ...round,
      clientSeed: command.payload.clientSeed,
      state,
    };
    const drafts = rouletteEventDrafts(events, nextRound, balance);
    if (round.state.bets.length === 0) {
      drafts.push({
        type: "round.started",
        roundId: round.roundId,
        payload: { game: "roulette", totalWager: String(state.totalStake) },
      });
    }
    return {
      drafts,
      table: { ...current, balance, round: nextRound },
    };
  }

  #spinRoulette(
    current: StoredTable,
    command: Extract<GameCommandV2, { type: "ROULETTE_SPIN" }>,
  ): AppliedCommand {
    const round = requireRouletteRound(current, command.payload.roundId);
    if (round.clientSeed === null) {
      throw new CommandRejection("ILLEGAL_ACTION", "At least one wager is required before spinning roulette.");
    }

    const locked = transitionRoulette(round.state, { type: "LOCK_BETS" }, mvpRuleset);
    const pocket = this.#fairness.roulettePocket(fairnessContext(round, round.clientSeed));
    const spun = transitionRoulette(
      locked.state,
      { type: "ROULETTE_SPIN" },
      mvpRuleset,
      { pocket },
    );
    const settled = transitionRoulette(spun.state, { type: "SETTLE" }, mvpRuleset);
    const balance = applyRouletteLedger(current.balance, settled.ledgerIntent);
    const nextRound: StoredRouletteRound = { ...round, state: settled.state };
    return {
      drafts: rouletteEventDrafts(
        [...locked.events, ...spun.events, ...settled.events],
        nextRound,
        balance,
      ),
      table: { ...current, balance, round: nextRound },
    };
  }

  #commit(
    current: StoredTable,
    applied: AppliedCommand,
    command: GameCommandV2,
    fingerprint: string,
  ): { next: StoredTable; result: CommandAckV2 } {
    const revision = current.revision + 1;
    const events = applied.drafts.map((draft, index) => gameEventV2Schema.parse({
      ...draft,
      eventId: this.#ids(),
      occurredAt: this.#clock(),
      revision,
      schemaVersion: 2,
      sequence: current.lastSequence + index + 1,
      tableId: current.tableId,
    }));
    const lastSequence = current.lastSequence + events.length;
    const nextWithoutReceipt: StoredTable = {
      ...applied.table,
      events: [...current.events, ...events],
      lastSequence,
      revision,
    };
    const ack = commandAckV2Schema.parse({
      commandId: command.commandId,
      firstSequence: events[0]?.sequence ?? null,
      lastSequence,
      revision,
      schemaVersion: 2,
      snapshot: buildSnapshot(nextWithoutReceipt),
      status: "accepted",
    });
    const receipt: StoredCommandReceipt = { ack, fingerprint };
    const next: StoredTable = {
      ...nextWithoutReceipt,
      receipts: { ...nextWithoutReceipt.receipts, [command.commandId]: receipt },
    };
    return { next, result: ack };
  }
}

function emptyTable(tableId: string): StoredTable {
  return {
    balance: startingBalance,
    events: [],
    game: null,
    lastSequence: 0,
    nextNonce: 0,
    receipts: {},
    revision: 0,
    round: null,
    tableId,
  };
}

function rememberRejection(
  current: StoredTable,
  command: GameCommandV2,
  fingerprint: string,
  code: CommandErrorCode,
  detail: string,
): { next: StoredTable; result: CommandAckV2 } {
  const ack = rejectedAck(command.commandId, current, code, detail);
  return {
    next: {
      ...current,
      receipts: {
        ...current.receipts,
        [command.commandId]: { ack, fingerprint },
      },
    },
    result: ack,
  };
}

function rejectedAck(
  commandId: string,
  current: Pick<StoredTable, "lastSequence" | "revision"> | null,
  code: CommandErrorCode,
  detail: string,
): CommandAckV2 {
  return commandAckV2Schema.parse({
    commandId,
    error: { code, detail: detail.slice(0, 256) },
    lastSequence: current?.lastSequence ?? 0,
    revision: current?.revision ?? 0,
    schemaVersion: 2,
    status: "rejected",
  });
}

function extractCommandId(input: unknown): string {
  if (
    typeof input === "object"
    && input !== null
    && "commandId" in input
    && typeof input.commandId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.commandId)
  ) {
    return input.commandId;
  }
  return nilUuid;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function roundIsSettled(round: StoredRound): boolean {
  return round.state.phase === "settled";
}

function requireBlackjackRound(table: StoredTable, roundId: string): StoredBlackjackRound {
  if (!table.round || table.round.game !== "blackjack" || table.round.roundId !== roundId) {
    throw new CommandRejection("ROUND_NOT_FOUND", "The blackjack round does not exist on this table.");
  }
  return table.round;
}

function requireRouletteRound(table: StoredTable, roundId: string): StoredRouletteRound {
  if (!table.round || table.round.game !== "roulette" || table.round.roundId !== roundId) {
    throw new CommandRejection("ROUND_NOT_FOUND", "The roulette round does not exist on this table.");
  }
  return table.round;
}

function fairnessContext(round: StoredRound, clientSeed: string): FairnessContext {
  return {
    clientSeed,
    game: round.game,
    nonce: round.fairness.nonce,
    roundId: round.roundId,
    rulesetHash: mvpRulesetHash,
    serverSeed: round.fairness.serverSeed,
  };
}

function applyBlackjackLedger(
  initialBalance: number,
  intents: readonly BlackjackLedgerIntent[],
): number {
  let balance = initialBalance;
  for (const intent of intents) {
    if (intent.direction === "debit") {
      if (balance < intent.amount) {
        throw new CommandRejection("INSUFFICIENT_FUNDS", "The PLAY balance cannot cover this wager.");
      }
      balance -= intent.amount;
    } else {
      balance += intent.amount;
    }
    if (!Number.isSafeInteger(balance)) {
      throw new CommandRejection("INTERNAL_ERROR", "The resulting PLAY balance is outside the supported range.");
    }
  }
  return balance;
}

function applyRouletteLedger(
  initialBalance: number,
  intent: RouletteLedgerIntent | null,
): number {
  if (intent === null) {
    return initialBalance;
  }
  if (intent.type === "roulette.bet.reserve") {
    if (initialBalance < intent.debitAmount) {
      throw new CommandRejection("INSUFFICIENT_FUNDS", "The PLAY balance cannot cover these bets.");
    }
    return initialBalance - intent.debitAmount;
  }
  const balance = initialBalance + intent.creditAmount;
  if (!Number.isSafeInteger(balance)) {
    throw new CommandRejection("INTERNAL_ERROR", "The resulting PLAY balance is outside the supported range.");
  }
  return balance;
}

function toCoreBet(bet: RouletteBetV2): RouletteBet {
  return {
    amount: Number(bet.amount),
    betId: bet.betId,
    selection: bet.selection,
  };
}

function blackjackEventDrafts(
  events: readonly BlackjackDomainEvent[],
  round: StoredBlackjackRound,
  balance: number,
): EventDraft[] {
  return events.map((event): EventDraft => {
    switch (event.type) {
      case "round.started":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: { game: "blackjack", totalWager: String(event.wager) },
        };
      case "blackjack.bet.accepted":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: {
            handId: event.handId,
            totalWager: String(event.totalWager),
            wager: String(event.wager),
          },
        };
      case "blackjack.card.dealt":
        return event.faceUp
          ? {
              type: event.type,
              roundId: round.roundId,
              payload: {
                card: event.card,
                faceUp: true,
                handId: event.handId,
                recipient: event.recipient,
              },
            }
          : {
              type: event.type,
              roundId: round.roundId,
              payload: { faceUp: false, handId: "dealer", recipient: "dealer" },
            };
      case "blackjack.card.revealed":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: { card: event.card, handId: "dealer" },
        };
      case "blackjack.action.accepted":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: { action: event.action, handId: event.handId },
        };
      case "blackjack.hand.split":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: {
            sourceHandId: event.fromHandId,
            splitHandIds: [...event.newHandIds],
          },
        };
      case "blackjack.turn.changed":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: {
            activeHandId: event.activeHandId,
            allowedActions: [...event.allowedActions],
            phase: event.phase,
          },
        };
      case "blackjack.hand.settled": {
        const hand = round.state.hands.find((candidate) => candidate.id === event.handId);
        if (!hand) {
          throw new Error(`Settled hand ${event.handId} is missing from state.`);
        }
        return {
          type: event.type,
          roundId: round.roundId,
          payload: {
            blackjack: event.outcome === "blackjack",
            handId: event.handId,
            outcome: event.outcome === "blackjack" ? "win" : event.outcome,
            payout: String(event.grossReturn),
            total: evaluateHand(hand.cards.map((card) => card.rank)).total,
            wager: String(event.wager),
          },
        };
      }
      case "round.settled":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: {
            balance: String(balance),
            fairness: {
              algorithm: "pf-v1",
              clientSeed: requireClientSeed(round),
              nonce: round.fairness.nonce,
              serverSeed: round.fairness.serverSeed,
            },
            game: "blackjack",
            outcome: event.outcome,
            totalPayout: String(event.grossReturn),
            totalWager: String(event.totalWager),
          },
        };
    }
  });
}

function rouletteEventDrafts(
  events: readonly RouletteDomainEvent[],
  round: StoredRouletteRound,
  balance: number,
): EventDraft[] {
  return events.map((event): EventDraft => {
    switch (event.type) {
      case "roulette.betting.opened":
        return { type: event.type, roundId: round.roundId, payload: {} };
      case "roulette.bet.placed":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: {
            bet: toTransportBet(event.payload.bet),
            totalWager: String(event.payload.totalStake),
          },
        };
      case "roulette.bets.locked":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: {
            betCount: event.payload.betCount,
            totalWager: String(event.payload.totalStake),
          },
        };
      case "roulette.spin.started":
        return { type: event.type, roundId: round.roundId, payload: {} };
      case "roulette.result":
        return { type: event.type, roundId: round.roundId, payload: event.payload };
      case "roulette.bet.settled":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: {
            betId: event.payload.betId,
            payout: String(event.payload.payout),
            won: event.payload.won,
          },
        };
      case "round.settled":
        return {
          type: event.type,
          roundId: round.roundId,
          payload: {
            balance: String(balance),
            fairness: {
              algorithm: "pf-v1",
              clientSeed: requireClientSeed(round),
              nonce: round.fairness.nonce,
              serverSeed: round.fairness.serverSeed,
            },
            game: "roulette",
            outcome: event.payload.outcome,
            totalPayout: String(event.payload.payout),
            totalWager: String(event.payload.totalStake),
          },
        };
    }
  });
}

function toTransportBet(bet: RouletteBet): RouletteBetV2 {
  return {
    amount: String(bet.amount),
    betId: bet.betId,
    currency: "PLAY",
    selection: bet.selection.type === "split"
      ? { type: "split", pockets: [...bet.selection.pockets] }
      : { ...bet.selection },
  };
}

function buildSnapshot(table: StoredTable): GameSnapshotV2 {
  if (table.game === null) {
    throw new Error("A table without a selected game has no v2 snapshot.");
  }
  return gameSnapshotV2Schema.parse({
    balance: String(table.balance),
    game: table.game,
    lastSequence: table.lastSequence,
    revision: table.revision,
    round: table.round ? buildRoundSnapshot(table.round, table.revision) : null,
    schemaVersion: 2,
    tableId: table.tableId,
  });
}

function buildRoundSnapshot(round: StoredRound, revision: number): unknown {
  const base = {
    fairness: {
      algorithm: "pf-v1" as const,
      commitment: round.fairness.commitment,
      nonce: round.fairness.nonce,
    },
    revision,
    roundId: round.roundId,
    rulesetHash: mvpRulesetHash,
    rulesetId: mvpRuleset.id,
  };

  if (round.game === "roulette") {
    const state = round.state;
    const phase = state.phase === "created"
      ? "prepared"
      : state.phase === "accepting-bets"
        ? "betting"
        : state.phase;
    const result = state.pocket === null
      ? null
      : { colour: rouletteColourForSnapshot(state.pocket), pocket: state.pocket };
    return {
      ...base,
      bets: state.bets.map(toTransportBet),
      game: "roulette",
      phase,
      result,
      totalWager: String(state.totalStake),
    };
  }

  const state = round.state;
  if (state.phase === "awaiting-bet") {
    return {
      ...base,
      activeHandId: null,
      dealerCards: [],
      game: "blackjack",
      hands: [],
      phase: "prepared",
    };
  }

  if (state.phase === "settled") {
    const hands = state.hands.map((hand) => {
      if (!hand.settlement) {
        throw new Error(`Settled hand ${hand.id} has no settlement.`);
      }
      return {
        allowedActions: [] as const,
        cards: hand.cards.map((card) => ({ card, faceUp: true as const })),
        handId: hand.id,
        outcome: hand.settlement.outcome === "blackjack" ? "win" : hand.settlement.outcome,
        payout: String(hand.settlement.grossReturn),
        status: "settled" as const,
        wager: String(hand.wager),
      };
    });
    return {
      ...base,
      activeHandId: null,
      dealerCards: state.dealer.cards.map((card) => ({ card, faceUp: true as const })),
      game: "blackjack",
      hands,
      phase: "settled",
    };
  }

  return {
    ...base,
    activeHandId: state.activeHandId,
    dealerCards: [
      { card: state.dealer.cards[0], faceUp: true as const },
      { faceUp: false as const },
    ],
    game: "blackjack",
    hands: state.hands.map((hand) => ({
      allowedActions: hand.id === state.activeHandId
        ? blackjackLegalActions(state, mvpRuleset).filter((action) => action !== "place-bet")
        : [],
      cards: hand.cards.map((card) => ({ card, faceUp: true as const })),
      handId: hand.id,
      outcome: null,
      payout: null,
      status: hand.status === "playing" ? "active" : hand.status === "stood" ? "standing" : "bust",
      wager: String(hand.wager),
    })),
    phase: "player",
  };
}

function rouletteColourForSnapshot(pocket: number): "red" | "black" | "green" {
  if (pocket === 0) return "green";
  const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  return reds.has(pocket) ? "red" : "black";
}

function requireClientSeed(round: StoredRound): string {
  if (round.clientSeed === null) {
    throw new Error(`Round ${round.roundId} cannot reveal fairness before receiving a client seed.`);
  }
  return round.clientSeed;
}
