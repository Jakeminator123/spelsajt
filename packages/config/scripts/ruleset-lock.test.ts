import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { canonicalJson, publishedRulesets, semanticRulesetValue } from "../src/ruleset";

const lockPath = fileURLToPath(new URL("../rulesets/ruleset-lock.json", import.meta.url));
const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
  schemaVersion: 1;
  rulesets: Record<string, { sha256: string }>;
};
const updateArtifacts = process.env.npm_lifecycle_event === "rulesets:lock";

it("locks every published ruleset to its semantic hash", () => {
  for (const ruleset of publishedRulesets) {
    const expectedHash = createHash("sha256")
      .update(canonicalJson(semanticRulesetValue(ruleset)))
      .digest("hex");

    if (updateArtifacts) {
      lock.rulesets[ruleset.id] = { sha256: expectedHash };
    }

    expect(lock.rulesets[ruleset.id]?.sha256).toBe(expectedHash);
  }

  if (updateArtifacts) {
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  }
});
