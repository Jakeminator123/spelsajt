import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { buildRulesetJsonSchema } from "../src/ruleset";

const outputPath = fileURLToPath(new URL("../schemas/ruleset.schema.json", import.meta.url));
const expected = `${JSON.stringify(buildRulesetJsonSchema(), null, 2)}\n`;
const updateArtifacts = process.env.npm_lifecycle_event === "schemas:generate";

it("keeps the ruleset JSON Schema generated from runtime validation", () => {
  if (updateArtifacts) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, expected, "utf8");
  }

  const actual = readFileSync(outputPath, "utf8");
  expect(actual).toBe(expected);
});
