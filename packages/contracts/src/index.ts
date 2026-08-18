import { z } from "zod";

export const contractSchemaVersion = 1 as const;
export const gameNames = ["blackjack", "roulette"] as const;
export const gameCommandTypes = ["PLACE_BET", "BLACKJACK_ACTION", "ROULETTE_SPIN"] as const;
export const gameEventTypes = [
  "round.started",
  "blackjack.card.dealt",
  "roulette.result",
  "round.settled",
  "reaction.cue",
] as const;

const identifierSchema = z.string().trim().min(1).max(128);
const uuidSchema = z.uuid();
const positiveCreditAmountSchema = z.string().regex(/^[1-9]\d*$/);

const commandBaseSchema = z.strictObject({
  commandId: uuidSchema,
  issuedAt: z.iso.datetime(),
  schemaVersion: z.literal(contractSchemaVersion),
  tableId: identifierSchema,
});

export const gameCommandSchema = z.discriminatedUnion("type", [
  commandBaseSchema.extend({
    type: z.literal(gameCommandTypes[0]),
    payload: z.strictObject({
      game: z.enum(gameNames),
      amount: positiveCreditAmountSchema,
      currency: z.literal("PLAY"),
    }),
  }),
  commandBaseSchema.extend({
    type: z.literal(gameCommandTypes[1]),
    payload: z.strictObject({
      roundId: uuidSchema,
      action: z.enum(["hit", "stand", "double", "split"]),
      handIndex: z.int().min(0).max(3),
    }),
  }),
  commandBaseSchema.extend({
    type: z.literal(gameCommandTypes[2]),
    payload: z.strictObject({
      roundId: uuidSchema,
    }),
  }),
]);

const eventBaseSchema = z.strictObject({
  eventId: uuidSchema,
  occurredAt: z.iso.datetime(),
  roundId: uuidSchema,
  schemaVersion: z.literal(contractSchemaVersion),
  sequence: z.int().positive(),
  tableId: identifierSchema,
});

export const gameEventSchema = z.discriminatedUnion("type", [
  eventBaseSchema.extend({
    type: z.literal(gameEventTypes[0]),
    payload: z.strictObject({
      commitment: z.string().regex(/^[a-f0-9]{64}$/),
      game: z.enum(gameNames),
      ruleset: z.literal("mvp-v1"),
    }),
  }),
  eventBaseSchema.extend({
    type: z.literal(gameEventTypes[1]),
    payload: z.strictObject({
      card: z.string().min(2).max(3),
      faceUp: z.boolean(),
      handIndex: z.int().min(0).max(3),
      recipient: z.enum(["dealer", "player"]),
    }),
  }),
  eventBaseSchema.extend({
    type: z.literal(gameEventTypes[2]),
    payload: z.strictObject({
      pocket: z.int().min(0).max(36),
    }),
  }),
  eventBaseSchema.extend({
    type: z.literal(gameEventTypes[3]),
    payload: z.strictObject({
      balance: z.string().regex(/^\d+$/),
      game: z.enum(gameNames),
      outcome: z.enum(["win", "loss", "push"]),
      payout: z.string().regex(/^\d+$/),
      revealedServerSeed: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  }),
  eventBaseSchema.extend({
    type: z.literal(gameEventTypes[4]),
    payload: z.strictObject({
      actor: z.enum(["dealer", "player", "table"]),
      intensity: z.number().min(0).max(1),
      mood: z.enum(["celebratory", "focused", "neutral", "sympathetic"]),
    }),
  }),
]);

export const snapshotSchema = z.strictObject({
  balance: z.string().regex(/^\d+$/),
  lastSequence: z.int().nonnegative(),
  openRoundId: uuidSchema.nullable(),
  schemaVersion: z.literal(contractSchemaVersion),
  tableId: identifierSchema,
});

export type GameCommand = z.infer<typeof gameCommandSchema>;
export type GameEvent = z.infer<typeof gameEventSchema>;
export type GameSnapshot = z.infer<typeof snapshotSchema>;

export * from "./v2";
