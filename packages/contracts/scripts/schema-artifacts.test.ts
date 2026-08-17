import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { buildContractJsonSchemas } from "../src/json-schema";

const outputDirectory = fileURLToPath(new URL("../schemas/", import.meta.url));
const updateArtifacts = process.env.npm_lifecycle_event === "schemas:generate";

it("keeps contract JSON Schemas generated from Zod", () => {
  for (const [fileName, schema] of buildContractJsonSchemas()) {
    const outputPath = join(outputDirectory, fileName);
    const expected = `${JSON.stringify(schema, null, 2)}\n`;

    if (updateArtifacts) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, expected, "utf8");
    }

    expect(readFileSync(outputPath, "utf8"), `${fileName} is stale`).toBe(expected);
  }
});
