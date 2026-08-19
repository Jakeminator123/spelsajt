import { z } from "zod";

export const contractV2SchemaVersion = 2 as const;
export const gameNamesV2 = ["blackjack", "roulette"] as const;
export const blackjackActionsV2 = ["hit", "stand", "double", "split"] as const;
export const rouletteBetTypesV2 = [
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
export const gameCommandTypesV2 = [
  "PREPARE_ROUND",
  "BLACKJACK_PLACE_BET",
  "BLACKJACK_ACTION",
  "ROULETTE_PLACE_BETS",
  "ROULETTE_SPIN",
] as const;
export const gameEventTypesV2 = [
  "round.prepared",
  "round.started",
  "blackjack.bet.accepted",
  "blackjack.card.dealt",
  "blackjack.card.revealed",
  "blackjack.action.accepted",
  "blackjack.hand.split",
  "blackjack.turn.changed",
  "blackjack.hand.settled",
  "roulette.betting.opened",
  "roulette.bet.placed",
  "roulette.bets.locked",
  "roulette.spin.started",
  "roulette.result",
  "roulette.bet.settled",
  "round.settled",
] as const;

const identifierSchema = z.string().trim().min(1).max(128);
const uuidSchema = z.uuid();
function boundedCreditPattern(includeZero: boolean): RegExp {
  const maximum = String(Number.MAX_SAFE_INTEGER);
  const alternatives = includeZero ? ["0"] : [];
  alternatives.push(`[1-9]\\d{0,${maximum.length - 2}}`);

  for (let index = 0; index < maximum.length; index += 1) {
    const maximumDigit = Number(maximum[index]);
    const minimumDigit = index === 0 ? 1 : 0;
    if (maximumDigit <= minimumDigit) {
      continue;
    }

    const lowerMaximum = maximumDigit - 1;
    const digit = lowerMaximum === minimumDigit
      ? String(minimumDigit)
      : `[${minimumDigit}-${lowerMaximum}]`;
    const remaining = maximum.length - index - 1;
    alternatives.push(
      `${maximum.slice(0, index)}${digit}${remaining > 0 ? `\\d{${remaining}}` : ""}`,
    );
  }
  alternatives.push(maximum);

  return new RegExp(`^(?:${alternatives.join("|")})$`);
}

/** Every transport amount remains exactly representable by the numeric MVP core. */
const creditAmountSchema = z.string().regex(boundedCreditPattern(true));
const positiveCreditAmountSchema = z.string().regex(boundedCreditPattern(false));
const aggregateCreditAmountSchema = z.string().regex(/^(?:0|[1-9]\d*)$/).max(64);
const signedAggregateCreditAmountSchema = z.string().regex(/^(?:0|-?[1-9]\d*)$/).max(65);
/** 100 roulette bets at this bound still settle below the 15-digit aggregate bound. */
const wagerAmountSchema = z.string().regex(/^[1-9]\d*$/).max(11);
const blackjackWagerAmountSchema = z.string().regex(/^(?:[2468]|[1-9]\d*[02468])$/).max(11);
const clientSeedSchema = z.string().min(1).max(128);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const emptyPayloadSchema = z.strictObject({});

export const socketAuthV2Schema = z.strictObject({
  accessToken: z.string().min(1).max(4096),
  schemaVersion: z.literal(contractV2SchemaVersion),
});

export const serverReadyV2Schema = z.strictObject({
  connectionId: identifierSchema,
  schemaVersion: z.literal(contractV2SchemaVersion),
  timestamp: z.iso.datetime(),
});

export const tableSubscriptionV2Schema = z.strictObject({
  lastSequence: z.int().nonnegative(),
  schemaVersion: z.literal(contractV2SchemaVersion),
  tableId: identifierSchema,
});

export const tableSubscriptionAckV2Schema = z.discriminatedUnion("status", [
  z.strictObject({
    lastSequence: z.int().nonnegative(),
    schemaVersion: z.literal(contractV2SchemaVersion),
    status: z.literal("accepted"),
    tableId: identifierSchema,
  }),
  z.strictObject({
    error: z.strictObject({
      code: z.enum(["VALIDATION_ERROR", "TABLE_NOT_FOUND", "INTERNAL_ERROR"]),
      detail: z.string().max(256).optional(),
    }),
    schemaVersion: z.literal(contractV2SchemaVersion),
    status: z.literal("rejected"),
  }),
]);

export const cardV2Schema = z.strictObject({
  cardId: identifierSchema,
  rank: z.enum(["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]),
  suit: z.enum(["clubs", "diamonds", "hearts", "spades"]),
});

const faceUpPublicCardV2Schema = z.strictObject({
  faceUp: z.literal(true),
  card: cardV2Schema,
});
const faceDownPublicCardV2Schema = z.strictObject({
  faceUp: z.literal(false),
});
export const publicCardV2Schema = z.discriminatedUnion("faceUp", [
  faceUpPublicCardV2Schema,
  faceDownPublicCardV2Schema,
]);

export const rouletteSelectionV2Schema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("straight"),
    pocket: z.int().min(0).max(36),
  }),
  z.strictObject({
    type: z.literal("split"),
    pockets: z.tuple([z.int().min(0).max(36), z.int().min(0).max(36)]),
  }),
  z.strictObject({
    type: z.literal("street"),
    start: z.int().min(1).max(34),
  }),
  z.strictObject({
    type: z.literal("corner"),
    topLeft: z.int().min(1).max(32),
  }),
  z.strictObject({
    type: z.literal("six-line"),
    start: z.int().min(1).max(31),
  }),
  z.strictObject({
    type: z.literal("column"),
    column: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.strictObject({
    type: z.literal("dozen"),
    dozen: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.strictObject({
    type: z.literal("red-black"),
    colour: z.enum(["red", "black"]),
  }),
  z.strictObject({
    type: z.literal("odd-even"),
    parity: z.enum(["odd", "even"]),
  }),
  z.strictObject({
    type: z.literal("low-high"),
    range: z.enum(["low", "high"]),
  }),
]);

export const rouletteBetV2Schema = z.strictObject({
  betId: identifierSchema,
  amount: wagerAmountSchema,
  currency: z.literal("PLAY"),
  selection: rouletteSelectionV2Schema,
});

const commandBaseV2Schema = z.strictObject({
  commandId: uuidSchema,
  expectedRevision: z.int().nonnegative(),
  issuedAt: z.iso.datetime(),
  schemaVersion: z.literal(contractV2SchemaVersion),
  tableId: identifierSchema,
});

export const gameCommandV2Schema = z.discriminatedUnion("type", [
  commandBaseV2Schema.extend({
    type: z.literal(gameCommandTypesV2[0]),
    payload: z.strictObject({
      game: z.enum(gameNamesV2),
    }),
  }),
  commandBaseV2Schema.extend({
    type: z.literal(gameCommandTypesV2[1]),
    payload: z.strictObject({
      amount: blackjackWagerAmountSchema,
      clientSeed: clientSeedSchema,
      currency: z.literal("PLAY"),
      roundId: uuidSchema,
    }),
  }),
  commandBaseV2Schema.extend({
    type: z.literal(gameCommandTypesV2[2]),
    payload: z.strictObject({
      action: z.enum(blackjackActionsV2),
      handId: identifierSchema,
      roundId: uuidSchema,
    }),
  }),
  commandBaseV2Schema.extend({
    type: z.literal(gameCommandTypesV2[3]),
    payload: z.strictObject({
      bets: z.array(rouletteBetV2Schema).min(1).max(100),
      clientSeed: clientSeedSchema,
      roundId: uuidSchema,
    }),
  }),
  commandBaseV2Schema.extend({
    type: z.literal(gameCommandTypesV2[4]),
    payload: z.strictObject({
      roundId: uuidSchema,
    }),
  }),
]);

const eventBaseV2Schema = z.strictObject({
  eventId: uuidSchema,
  occurredAt: z.iso.datetime(),
  revision: z.int().positive(),
  roundId: uuidSchema,
  schemaVersion: z.literal(contractV2SchemaVersion),
  sequence: z.int().positive(),
  tableId: identifierSchema,
});

const outcomeSchema = z.enum(["win", "loss", "push"]);

export const gameEventV2Schema = z.discriminatedUnion("type", [
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[0]),
    payload: z.strictObject({
      commitment: hashSchema,
      fairnessAlgorithm: z.literal("pf-v1"),
      game: z.enum(gameNamesV2),
      nonce: z.int().nonnegative(),
      rulesetHash: hashSchema,
      rulesetId: z.literal("mvp-v2"),
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[1]),
    payload: z.strictObject({
      game: z.enum(gameNamesV2),
      totalWager: positiveCreditAmountSchema,
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[2]),
    payload: z.strictObject({
      handId: identifierSchema,
      totalWager: positiveCreditAmountSchema,
      wager: positiveCreditAmountSchema,
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[3]),
    payload: z.discriminatedUnion("faceUp", [
      z.strictObject({
        card: cardV2Schema,
        faceUp: z.literal(true),
        handId: identifierSchema,
        recipient: z.enum(["dealer", "player"]),
      }),
      z.strictObject({
        faceUp: z.literal(false),
        handId: z.literal("dealer"),
        recipient: z.literal("dealer"),
      }),
    ]),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[4]),
    payload: z.strictObject({
      card: cardV2Schema,
      handId: z.literal("dealer"),
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[5]),
    payload: z.strictObject({
      action: z.enum(blackjackActionsV2),
      handId: identifierSchema,
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[6]),
    payload: z.strictObject({
      sourceHandId: identifierSchema,
      splitHandIds: z.tuple([identifierSchema, identifierSchema]),
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[7]),
    payload: z.strictObject({
      activeHandId: identifierSchema.nullable(),
      allowedActions: z.array(z.enum(blackjackActionsV2)).max(4),
      phase: z.enum(["player", "dealer", "settled"]),
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[8]),
    payload: z.strictObject({
      blackjack: z.boolean(),
      handId: identifierSchema,
      outcome: outcomeSchema,
      payout: creditAmountSchema,
      total: z.int().nonnegative(),
      wager: positiveCreditAmountSchema,
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[9]),
    payload: emptyPayloadSchema,
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[10]),
    payload: z.strictObject({
      bet: rouletteBetV2Schema,
      totalWager: positiveCreditAmountSchema,
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[11]),
    payload: z.strictObject({
      betCount: z.int().positive(),
      totalWager: positiveCreditAmountSchema,
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[12]),
    payload: emptyPayloadSchema,
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[13]),
    payload: z.strictObject({
      colour: z.enum(["red", "black", "green"]),
      pocket: z.int().min(0).max(36),
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[14]),
    payload: z.strictObject({
      betId: identifierSchema,
      payout: creditAmountSchema,
      won: z.boolean(),
    }),
  }),
  eventBaseV2Schema.extend({
    type: z.literal(gameEventTypesV2[15]),
    payload: z.strictObject({
      balance: creditAmountSchema,
      fairness: z.strictObject({
        algorithm: z.literal("pf-v1"),
        clientSeed: clientSeedSchema,
        nonce: z.int().nonnegative(),
        serverSeed: hashSchema,
      }),
      game: z.enum(gameNamesV2),
      outcome: z.enum(["win", "loss", "push", "mixed"]),
      totalPayout: creditAmountSchema,
      totalWager: positiveCreditAmountSchema,
    }),
  }),
]);

const snapshotBaseV2Shape = {
  fairness: z.strictObject({
    algorithm: z.literal("pf-v1"),
    commitment: hashSchema,
    nonce: z.int().nonnegative(),
  }),
  revision: z.int().nonnegative(),
  roundId: uuidSchema,
  rulesetHash: hashSchema,
  rulesetId: z.literal("mvp-v2"),
} as const;

const blackjackActiveHandSnapshotV2Schema = z.strictObject({
  allowedActions: z.array(z.enum(blackjackActionsV2)).max(4),
  cards: z.array(faceUpPublicCardV2Schema).min(2),
  handId: identifierSchema,
  outcome: z.null(),
  payout: z.null(),
  status: z.enum(["active", "standing", "bust", "blackjack"]),
  wager: positiveCreditAmountSchema,
});

const blackjackDealerHandSnapshotV2Schema = z.strictObject({
  allowedActions: z.tuple([]),
  cards: z.array(faceUpPublicCardV2Schema).min(2),
  handId: identifierSchema,
  outcome: z.null(),
  payout: z.null(),
  status: z.enum(["standing", "bust", "blackjack"]),
  wager: positiveCreditAmountSchema,
});

const blackjackSettledHandSnapshotV2Schema = z.strictObject({
  allowedActions: z.tuple([]),
  cards: z.array(faceUpPublicCardV2Schema).min(2),
  handId: identifierSchema,
  outcome: outcomeSchema,
  payout: creditAmountSchema,
  status: z.literal("settled"),
  wager: positiveCreditAmountSchema,
});

const blackjackRoundBaseV2Shape = {
  ...snapshotBaseV2Shape,
  game: z.literal("blackjack"),
} as const;

export const blackjackRoundSnapshotV2Schema = z.discriminatedUnion("phase", [
  z.strictObject({
    ...blackjackRoundBaseV2Shape,
    activeHandId: identifierSchema,
    dealerCards: z.tuple([faceUpPublicCardV2Schema, faceDownPublicCardV2Schema]),
    hands: z.array(blackjackActiveHandSnapshotV2Schema).min(1).max(2),
    phase: z.literal("player"),
  }),
  z.strictObject({
    ...blackjackRoundBaseV2Shape,
    activeHandId: z.null(),
    dealerCards: z.array(faceUpPublicCardV2Schema).min(2),
    hands: z.array(blackjackDealerHandSnapshotV2Schema).min(1).max(2),
    phase: z.literal("dealer"),
  }),
  z.strictObject({
    ...blackjackRoundBaseV2Shape,
    activeHandId: z.null(),
    dealerCards: z.array(publicCardV2Schema).length(0),
    hands: z.array(blackjackActiveHandSnapshotV2Schema).length(0),
    phase: z.literal("prepared"),
  }),
  z.strictObject({
    ...blackjackRoundBaseV2Shape,
    activeHandId: z.null(),
    dealerCards: z.array(faceUpPublicCardV2Schema).min(2),
    hands: z.array(blackjackSettledHandSnapshotV2Schema).min(1).max(2),
    phase: z.literal("settled"),
  }),
]);

const rouletteRoundBaseV2Shape = {
  ...snapshotBaseV2Shape,
  game: z.literal("roulette"),
} as const;
const rouletteResultV2Schema = z.strictObject({
  colour: z.enum(["red", "black", "green"]),
  pocket: z.int().min(0).max(36),
});

export const rouletteRoundSnapshotV2Schema = z.discriminatedUnion("phase", [
  z.strictObject({
    ...rouletteRoundBaseV2Shape,
    bets: z.array(rouletteBetV2Schema).length(0),
    phase: z.literal("prepared"),
    result: z.null(),
    totalWager: z.literal("0"),
  }),
  z.strictObject({
    ...rouletteRoundBaseV2Shape,
    bets: z.array(rouletteBetV2Schema).max(100),
    phase: z.literal("betting"),
    result: z.null(),
    totalWager: creditAmountSchema,
  }),
  z.strictObject({
    ...rouletteRoundBaseV2Shape,
    bets: z.array(rouletteBetV2Schema).min(1).max(100),
    phase: z.literal("locked"),
    result: z.null(),
    totalWager: positiveCreditAmountSchema,
  }),
  z.strictObject({
    ...rouletteRoundBaseV2Shape,
    bets: z.array(rouletteBetV2Schema).min(1).max(100),
    phase: z.literal("spinning"),
    result: rouletteResultV2Schema,
    totalWager: positiveCreditAmountSchema,
  }),
  z.strictObject({
    ...rouletteRoundBaseV2Shape,
    bets: z.array(rouletteBetV2Schema).min(1).max(100),
    phase: z.literal("settled"),
    result: rouletteResultV2Schema,
    totalWager: positiveCreditAmountSchema,
  }),
]);

export const roundSnapshotV2Schema = z.union([
  blackjackRoundSnapshotV2Schema,
  rouletteRoundSnapshotV2Schema,
]);

const gameSnapshotBaseV2Shape = {
  balance: creditAmountSchema,
  lastSequence: z.int().nonnegative(),
  revision: z.int().nonnegative(),
  schemaVersion: z.literal(contractV2SchemaVersion),
  tableId: identifierSchema,
} as const;

export const gameSnapshotV2Schema = z.discriminatedUnion("game", [
  z.strictObject({
    ...gameSnapshotBaseV2Shape,
    game: z.literal("blackjack"),
    round: blackjackRoundSnapshotV2Schema.nullable(),
  }),
  z.strictObject({
    ...gameSnapshotBaseV2Shape,
    game: z.literal("roulette"),
    round: rouletteRoundSnapshotV2Schema.nullable(),
  }),
]);

const commandErrorV2Schema = z.strictObject({
  code: z.enum([
    "VALIDATION_ERROR",
    "ROUND_NOT_FOUND",
    "ILLEGAL_ACTION",
    "INSUFFICIENT_FUNDS",
    "STALE_REVISION",
    "IDEMPOTENCY_CONFLICT",
    "INTERNAL_ERROR",
  ]),
  detail: z.string().max(256).optional(),
});

export const commandAckV2Schema = z.discriminatedUnion("status", [
  z.strictObject({
    commandId: uuidSchema,
    firstSequence: z.int().positive().nullable(),
    lastSequence: z.int().nonnegative(),
    revision: z.int().nonnegative(),
    schemaVersion: z.literal(contractV2SchemaVersion),
    snapshot: gameSnapshotV2Schema,
    status: z.enum(["accepted", "replayed"]),
  }),
  z.strictObject({
    commandId: uuidSchema,
    error: commandErrorV2Schema,
    lastSequence: z.int().nonnegative(),
    revision: z.int().nonnegative(),
    schemaVersion: z.literal(contractV2SchemaVersion),
    status: z.literal("rejected"),
  }),
]);

export const accountRoundOutcomeV2Schema = z.enum(["win", "loss", "push", "mixed"]);

export const accountGameSummaryV2Schema = z.strictObject({
  game: z.enum(gameNamesV2),
  lostRounds: z.int().nonnegative(),
  mixedRounds: z.int().nonnegative(),
  net: signedAggregateCreditAmountSchema,
  pushedRounds: z.int().nonnegative(),
  returned: aggregateCreditAmountSchema,
  rounds: z.int().nonnegative(),
  wagered: aggregateCreditAmountSchema,
  wonRounds: z.int().nonnegative(),
});

export const accountRecentRoundV2Schema = z.strictObject({
  game: z.enum(gameNamesV2),
  outcome: accountRoundOutcomeV2Schema,
  payout: aggregateCreditAmountSchema,
  roundId: uuidSchema,
  settledAt: z.iso.datetime(),
  wager: aggregateCreditAmountSchema,
});

export const accountSummaryV2Schema = z.strictObject({
  balance: creditAmountSchema,
  currency: z.literal("PLAY"),
  games: z.array(accountGameSummaryV2Schema).length(gameNamesV2.length),
  recentRounds: z.array(accountRecentRoundV2Schema).max(20),
  schemaVersion: z.literal(contractV2SchemaVersion),
  totals: accountGameSummaryV2Schema.omit({ game: true }),
});

export type CardV2 = z.infer<typeof cardV2Schema>;
export type PublicCardV2 = z.infer<typeof publicCardV2Schema>;
export type RouletteSelectionV2 = z.infer<typeof rouletteSelectionV2Schema>;
export type RouletteBetV2 = z.infer<typeof rouletteBetV2Schema>;
export type GameCommandV2 = z.infer<typeof gameCommandV2Schema>;
export type GameEventV2 = z.infer<typeof gameEventV2Schema>;
export type RoundSnapshotV2 = z.infer<typeof roundSnapshotV2Schema>;
export type GameSnapshotV2 = z.infer<typeof gameSnapshotV2Schema>;
export type CommandAckV2 = z.infer<typeof commandAckV2Schema>;
export type AccountRoundOutcomeV2 = z.infer<typeof accountRoundOutcomeV2Schema>;
export type AccountGameSummaryV2 = z.infer<typeof accountGameSummaryV2Schema>;
export type AccountRecentRoundV2 = z.infer<typeof accountRecentRoundV2Schema>;
export type AccountSummaryV2 = z.infer<typeof accountSummaryV2Schema>;
export type SocketAuthV2 = z.infer<typeof socketAuthV2Schema>;
export type ServerReadyV2 = z.infer<typeof serverReadyV2Schema>;
export type TableSubscriptionV2 = z.infer<typeof tableSubscriptionV2Schema>;
export type TableSubscriptionAckV2 = z.infer<typeof tableSubscriptionAckV2Schema>;
