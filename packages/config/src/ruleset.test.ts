import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildRulesetJsonSchema,
  canonicalJson,
  mvpRuleset,
  mvpRulesetHash,
  rulesetSchema,
  semanticRulesetValue,
} from "./ruleset";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

describe("MVP ruleset", () => {
  it("validates the machine-readable ruleset", () => {
    expect(rulesetSchema.parse(readJson("../rulesets/mvp-v1.json"))).toEqual(mvpRuleset);
  });

  it("rejects undeclared fields", () => {
    expect(() => rulesetSchema.parse({ ...mvpRuleset, houseOverride: true })).toThrow();
  });

  it("matches the locked semantic hash", () => {
    const actual = createHash("sha256")
      .update(canonicalJson(semanticRulesetValue(mvpRuleset)))
      .digest("hex");

    expect(actual).toBe(mvpRulesetHash);
  });

  it("keeps the checked-in JSON Schema generated from runtime validation", () => {
    expect(readJson("../schemas/ruleset.schema.json")).toEqual(buildRulesetJsonSchema());
  });
});
