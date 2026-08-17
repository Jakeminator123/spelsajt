import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { canonicalJson, mvpRuleset, semanticRulesetValue } from "../src/ruleset";

const lockPath = fileURLToPath(new URL("../rulesets/ruleset-lock.json", import.meta.url));
const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
  schemaVersion: 1;
  rulesets: Record<string, { sha256: string }>;
};
const expectedHash = createHash("sha256")
  .update(canonicalJson(semanticRulesetValue(mvpRuleset)))
  .digest("hex");
const updateArtifacts = process.env.npm_lifecycle_event === "rulesets:lock";

it("locks a published ruleset to its semantic hash", () => {
  if (updateArtifacts) {
    lock.rulesets[mvpRuleset.id] = { sha256: expectedHash };
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  }

  expect(lock.rulesets[mvpRuleset.id]?.sha256).toBe(expectedHash);
});
