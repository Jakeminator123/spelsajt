import { z } from "zod";

import rawMvpV1Ruleset from "../rulesets/mvp-v1.json";
import rawMvpV2Ruleset from "../rulesets/mvp-v2.json";
import rawRulesetLock from "../rulesets/ruleset-lock.json";

const creditStringSchema = z.string().regex(/^\d+$/);

const currencySchema = z.strictObject({
  code: z.literal("PLAY"),
  fractionDigits: z.literal(0),
  startingBalance: creditStringSchema,
});

const blackjackPayoutSchema = z.strictObject({
  numerator: z.int().positive(),
  denominator: z.int().positive(),
});

const blackjackActionsSchema = z.tuple([
  z.literal("hit"),
  z.literal("stand"),
  z.literal("double"),
  z.literal("split"),
]).rest(z.never());

const rouletteBetTypesSchema = z.tuple([
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
]).rest(z.never());

const fairnessSchema = z.strictObject({
  algorithmId: z.literal("pf-v1"),
  commitment: z.literal("sha256"),
  stream: z.literal("hmac-sha256"),
  boundedInteger: z.literal("rejection-sampling"),
  blackjackShuffle: z.literal("fisher-yates"),
});

const baseRulesetShape = {
  $schema: z.string().min(1),
  mode: z.literal("play-money"),
  currency: currencySchema,
  fairness: fairnessSchema,
} as const;

export const rulesetV1Schema = z.strictObject({
  ...baseRulesetShape,
  schemaVersion: z.literal(1),
  id: z.literal("mvp-v1"),
  blackjack: z.strictObject({
    decks: z.int().min(1).max(8),
    dealerHitsSoft17: z.boolean(),
    blackjackPayout: blackjackPayoutSchema,
    actions: blackjackActionsSchema,
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
    betTypes: rouletteBetTypesSchema,
  }),
});

export const rulesetV2Schema = z.strictObject({
  ...baseRulesetShape,
  schemaVersion: z.literal(2),
  id: z.literal("mvp-v2"),
  blackjack: z.strictObject({
    decks: z.int().min(1).max(8),
    dealerHitsSoft17: z.boolean(),
    dealerHoleCard: z.literal("american"),
    dealerPeek: z.literal("ace-or-ten"),
    blackjackPayout: blackjackPayoutSchema,
    actions: blackjackActionsSchema,
    doublePolicy: z.literal("any-two-card"),
    doubleAfterSplit: z.boolean(),
    maxSplits: z.int().min(0).max(3),
    insurance: z.boolean(),
    surrender: z.boolean(),
    resplit: z.boolean(),
    splitMatch: z.literal("same-value"),
    splitAcesOneCardOnly: z.boolean(),
    splitTwentyOneIsBlackjack: z.boolean(),
    wagerUnit: z.int().positive(),
  }),
  roulette: z.strictObject({
    pockets: z.literal(37),
    minimumPocket: z.literal(0),
    maximumPocket: z.literal(36),
    zeroes: z.literal(1),
    tableTopology: z.literal("european-single-zero-v1"),
    zeroRule: z.literal("outside-bets-lose"),
    betTypes: rouletteBetTypesSchema,
    grossPayoutMultipliers: z.strictObject({
      straight: z.literal(36),
      split: z.literal(18),
      street: z.literal(12),
      corner: z.literal(9),
      "six-line": z.literal(6),
      column: z.literal(3),
      dozen: z.literal(3),
      "red-black": z.literal(2),
      "odd-even": z.literal(2),
      "low-high": z.literal(2),
    }),
  }),
});

export const rulesetSchema = z.discriminatedUnion("schemaVersion", [
  rulesetV1Schema,
  rulesetV2Schema,
]);

const rulesetLockSchema = z.strictObject({
  schemaVersion: z.literal(1),
  rulesets: z.record(
    z.string(),
    z.strictObject({
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});

export type RulesetV1 = z.infer<typeof rulesetV1Schema>;
export type RulesetV2 = z.infer<typeof rulesetV2Schema>;
export type Ruleset = z.infer<typeof rulesetSchema>;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export const mvpV1Ruleset = deepFreeze(rulesetV1Schema.parse(rawMvpV1Ruleset));
export const mvpRuleset = deepFreeze(rulesetV2Schema.parse(rawMvpV2Ruleset));
export const publishedRulesets = Object.freeze([mvpV1Ruleset, mvpRuleset] as const);

const rulesetLock = rulesetLockSchema.parse(rawRulesetLock);

function requireLockedHash(rulesetId: string): string {
  const lockedRuleset = rulesetLock.rulesets[rulesetId];
  if (!lockedRuleset) {
    throw new Error(`Ruleset ${rulesetId} is missing from ruleset-lock.json.`);
  }
  return lockedRuleset.sha256;
}

export const mvpV1RulesetHash = requireLockedHash(mvpV1Ruleset.id);
export const mvpRulesetHash = requireLockedHash(mvpRuleset.id);

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

const mvpRulesetCanonical = canonicalJson(semanticRulesetValue(mvpRuleset));

export function isMvpRuleset(value: unknown): value is RulesetV2 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  try {
    return canonicalJson(semanticRulesetValue(value as Ruleset)) === mvpRulesetCanonical;
  } catch {
    return false;
  }
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
