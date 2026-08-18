import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { buildSystemModelJsonSchema } from "../src/schema";

const outputPath = fileURLToPath(new URL("../schemas/system-model.schema.json", import.meta.url));
const expected = `${JSON.stringify(buildSystemModelJsonSchema(), null, 2)}\n`;
const updateArtifacts = process.env.npm_lifecycle_event === "schemas:generate";

it("keeps the system model JSON Schema generated from runtime validation", () => {
  if (updateArtifacts) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, expected, "utf8");
  }

  expect(readFileSync(outputPath, "utf8")).toBe(expected);
});
