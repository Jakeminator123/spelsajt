import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(128);
const uuidSchema = z.uuid();
const positiveCreditAmountSchema = z.string().regex(/^[1-9]\d*$/);

const commandBaseSchema = z.object({
  commandId: uuidSchema,
  issuedAt: z.iso.datetime(),
  tableId: identifierSchema,
});

export const gameCommandSchema = z.discriminatedUnion("type", [
  commandBaseSchema.extend({
    type: z.literal("PLACE_BET"),
    payload: z.object({
      game: z.enum(["blackjack", "roulette"]),
      amount: positiveCreditAmountSchema,
      currency: z.literal("PLAY"),
    }),
  }),
  commandBaseSchema.extend({
    type: z.literal("BLACKJACK_ACTION"),
    payload: z.object({
      roundId: uuidSchema,
      action: z.enum(["hit", "stand", "double", "split"]),
      handIndex: z.int().min(0).max(3),
    }),
  }),
  commandBaseSchema.extend({
    type: z.literal("ROULETTE_SPIN"),
    payload: z.object({
      roundId: uuidSchema,
    }),
  }),
]);

const eventBaseSchema = z.object({
  eventId: uuidSchema,
  occurredAt: z.iso.datetime(),
  roundId: uuidSchema,
  schemaVersion: z.literal(1),
  sequence: z.int().positive(),
  tableId: identifierSchema,
});

export const gameEventSchema = z.discriminatedUnion("type", [
  eventBaseSchema.extend({
    type: z.literal("round.started"),
    payload: z.object({
      commitment: z.string().regex(/^[a-f0-9]{64}$/),
      game: z.enum(["blackjack", "roulette"]),
      ruleset: z.literal("mvp-v1"),
    }),
  }),
  eventBaseSchema.extend({
    type: z.literal("blackjack.card.dealt"),
    payload: z.object({
      card: z.string().min(2).max(3),
      faceUp: z.boolean(),
      handIndex: z.int().min(0).max(3),
      recipient: z.enum(["dealer", "player"]),
    }),
  }),
  eventBaseSchema.extend({
    type: z.literal("roulette.result"),
    payload: z.object({
      pocket: z.int().min(0).max(36),
    }),
  }),
  eventBaseSchema.extend({
    type: z.literal("round.settled"),
    payload: z.object({
      balance: z.string().regex(/^\d+$/),
      game: z.enum(["blackjack", "roulette"]),
      outcome: z.enum(["win", "loss", "push"]),
      payout: z.string().regex(/^\d+$/),
      revealedServerSeed: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  }),
  eventBaseSchema.extend({
    type: z.literal("reaction.cue"),
    payload: z.object({
      actor: z.enum(["dealer", "player", "table"]),
      intensity: z.number().min(0).max(1),
      mood: z.enum(["celebratory", "focused", "neutral", "sympathetic"]),
    }),
  }),
]);

export const snapshotSchema = z.object({
  balance: z.string().regex(/^\d+$/),
  lastSequence: z.int().nonnegative(),
  openRoundId: uuidSchema.nullable(),
  tableId: identifierSchema,
});

export type GameCommand = z.infer<typeof gameCommandSchema>;
export type GameEvent = z.infer<typeof gameEventSchema>;
export type GameSnapshot = z.infer<typeof snapshotSchema>;
