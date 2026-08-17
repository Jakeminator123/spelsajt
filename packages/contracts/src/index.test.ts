import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { gameCommandSchema, gameEventSchema, snapshotSchema } from "./index";
import { buildContractJsonSchemas } from "./json-schema";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

describe("versioned network contracts", () => {
  it.each([
    ["place-bet command", gameCommandSchema, "../fixtures/v1/place-bet.command.json"],
    ["settled event", gameEventSchema, "../fixtures/v1/round-settled.event.json"],
    ["reaction event", gameEventSchema, "../fixtures/v1/reaction-cue.event.json"],
    ["table snapshot", snapshotSchema, "../fixtures/v1/table.snapshot.json"],
  ])("accepts the %s fixture", (_name, schema, path) => {
    expect(schema.safeParse(readJson(path)).success).toBe(true);
  });

  it("rejects unknown fields at protocol boundaries", () => {
    const fixture = readJson("../fixtures/v1/place-bet.command.json") as Record<string, unknown>;
    expect(gameCommandSchema.safeParse({ ...fixture, debugOverride: true }).success).toBe(false);
  });

  it("rejects non-canonical credit strings", () => {
    const fixture = readJson("../fixtures/v1/place-bet.command.json") as {
      payload: Record<string, unknown>;
    } & Record<string, unknown>;
    const candidate = {
      ...fixture,
      payload: { ...fixture.payload, amount: "0100" },
    };

    expect(gameCommandSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects unsupported schema versions", () => {
    const fixture = readJson("../fixtures/v1/round-settled.event.json") as Record<string, unknown>;
    expect(gameEventSchema.safeParse({ ...fixture, schemaVersion: 2 }).success).toBe(false);
  });

  it("keeps checked-in JSON Schemas generated from Zod", () => {
    for (const [fileName, expected] of buildContractJsonSchemas()) {
      expect(readJson(`../schemas/${fileName}`)).toEqual(expected);
    }
  });
});
