import { z } from "zod";

import rawMvpRuleset from "../rulesets/mvp-v1.json";
import rawRulesetLock from "../rulesets/ruleset-lock.json";

const creditStringSchema = z.string().regex(/^\d+$/);

export const rulesetSchema = z.strictObject({
  $schema: z.string().min(1),
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  mode: z.literal("play-money"),
  currency: z.strictObject({
    code: z.literal("PLAY"),
    fractionDigits: z.literal(0),
    startingBalance: creditStringSchema,
  }),
  blackjack: z.strictObject({
    decks: z.int().min(1).max(8),
    dealerHitsSoft17: z.boolean(),
    blackjackPayout: z.strictObject({
      numerator: z.int().positive(),
      denominator: z.int().positive(),
    }),
    actions: z.tuple([
      z.literal("hit"),
      z.literal("stand"),
      z.literal("double"),
      z.literal("split"),
    ]).rest(z.never()),
    maxSplits: z.int().min(0).max(3),
    insurance: z.boolean(),
    surrender: z.boolean(),
    resplit: z.boolean(),
  }),
  roulette: z.strictObject({
    pockets: z.literal(37),
    minimumPocket: z.literal(0),
    maximumPocket: z.literal(36),
    zeroes: z.literal(1),
    betTypes: z.tuple([
      z.literal("straight"),
      z.literal("split"),
      z.literal("street"),
      z.literal("corner"),
      z.literal("six-line"),
      z.literal("column"),
      z.literal("dozen"),
      z.literal("red-black"),
      z.literal("odd-even"),
      z.literal("low-high"),
    ]).rest(z.never()),
  }),
  fairness: z.strictObject({
    algorithmId: z.literal("pf-v1"),
    commitment: z.literal("sha256"),
    stream: z.literal("hmac-sha256"),
    boundedInteger: z.literal("rejection-sampling"),
    blackjackShuffle: z.literal("fisher-yates"),
  }),
});

const rulesetLockSchema = z.strictObject({
  schemaVersion: z.literal(1),
  rulesets: z.record(
    z.string(),
    z.strictObject({
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});

export type Ruleset = z.infer<typeof rulesetSchema>;

export const mvpRuleset = rulesetSchema.parse(rawMvpRuleset);
const rulesetLock = rulesetLockSchema.parse(rawRulesetLock);
const lockedMvpRuleset = rulesetLock.rulesets[mvpRuleset.id];

if (!lockedMvpRuleset) {
  throw new Error(`Ruleset ${mvpRuleset.id} is missing from ruleset-lock.json.`);
}

export const mvpRulesetHash = lockedMvpRuleset.sha256;

export function semanticRulesetValue(ruleset: Ruleset): Omit<Ruleset, "$schema"> {
  const { $schema: _schemaReference, ...semanticValue } = ruleset;
  return semanticValue;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }

  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

export function buildRulesetJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(rulesetSchema, {
    io: "input",
    target: "draft-2020-12",
  });
  const serializable = JSON.parse(JSON.stringify(generated)) as Record<string, unknown>;

  return {
    ...serializable,
    $id: "https://schemas.spelsajt.local/ruleset.schema.json",
    title: "Spelsajt versioned ruleset",
  };
}
