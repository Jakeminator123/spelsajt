import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildRulesetJsonSchema,
  canonicalJson,
  isMvpRuleset,
  mvpRuleset,
  mvpRulesetHash,
  mvpV1Ruleset,
  mvpV1RulesetHash,
  publishedRulesets,
  rulesetSchema,
  semanticRulesetValue,
} from "./ruleset";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

describe("versioned MVP rulesets", () => {
  it("validates every published machine-readable ruleset", () => {
    expect(rulesetSchema.parse(readJson("../rulesets/mvp-v1.json"))).toEqual(mvpV1Ruleset);
    expect(rulesetSchema.parse(readJson("../rulesets/mvp-v2.json"))).toEqual(mvpRuleset);
    expect(publishedRulesets.map((ruleset) => ruleset.id)).toEqual(["mvp-v1", "mvp-v2"]);
  });

  it("rejects undeclared fields", () => {
    expect(() => rulesetSchema.parse({ ...mvpRuleset, houseOverride: true })).toThrow();
  });

  it("freezes every published semantic value against in-process mutation", () => {
    expect(Object.isFrozen(publishedRulesets)).toBe(true);
    for (const ruleset of publishedRulesets) {
      expect(Object.isFrozen(ruleset)).toBe(true);
      expect(Object.isFrozen(ruleset.blackjack)).toBe(true);
      expect(Object.isFrozen(ruleset.roulette)).toBe(true);
      expect(Object.isFrozen(ruleset.fairness)).toBe(true);
    }
  });

  it("recognises only the exact locked active ruleset semantics", () => {
    expect(isMvpRuleset(mvpRuleset)).toBe(true);
    expect(isMvpRuleset({
      ...structuredClone(mvpRuleset),
      blackjack: { ...mvpRuleset.blackjack, decks: 1 },
    })).toBe(false);
  });

  it.each([
    [mvpV1Ruleset, mvpV1RulesetHash],
    [mvpRuleset, mvpRulesetHash],
  ] as const)("matches the locked semantic hash for $id", (ruleset, lockedHash) => {
    const actual = createHash("sha256")
      .update(canonicalJson(semanticRulesetValue(ruleset)))
      .digest("hex");

    expect(actual).toBe(lockedHash);
  });

  it("keeps the checked-in JSON Schema generated from runtime validation", () => {
    expect(readJson("../schemas/ruleset.schema.json")).toEqual(buildRulesetJsonSchema());
  });
});
