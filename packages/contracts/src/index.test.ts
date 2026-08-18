import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  gameCommandSchema,
  gameCommandTypes,
  gameEventSchema,
  gameEventTypes,
  snapshotSchema,
} from "./index";
import { buildContractJsonSchemas } from "./json-schema";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

describe("versioned network contracts", () => {
  const commandFixtures = [
    ["place-bet command", "../fixtures/v1/place-bet.command.json"],
    ["blackjack action command", "../fixtures/v1/blackjack-action.command.json"],
    ["roulette spin command", "../fixtures/v1/roulette-spin.command.json"],
  ] as const;
  const eventFixtures = [
    ["round-started event", "../fixtures/v1/round-started.event.json"],
    ["face-up blackjack card event", "../fixtures/v1/blackjack-card-dealt.event.json"],
    ["hidden blackjack card event", "../fixtures/v1/blackjack-card-hidden.event.json"],
    ["roulette result event", "../fixtures/v1/roulette-result.event.json"],
    ["settled event", "../fixtures/v1/round-settled.event.json"],
    ["reaction event", "../fixtures/v1/reaction-cue.event.json"],
  ] as const;

  it.each([
    ...commandFixtures.map(([name, path]) => [name, gameCommandSchema, path] as const),
    ...eventFixtures.map(([name, path]) => [name, gameEventSchema, path] as const),
    ["table snapshot", snapshotSchema, "../fixtures/v1/table.snapshot.json"] as const,
  ])("accepts the %s fixture", (_name, schema, path) => {
    expect(schema.safeParse(readJson(path)).success).toBe(true);
  });

  it("keeps fixture coverage aligned with every command and event discriminant", () => {
    const commandTypes = new Set(commandFixtures.map(([, path]) => {
      const fixture = readJson(path) as { type: string };
      return fixture.type;
    }));
    const eventTypes = new Set(eventFixtures.map(([, path]) => {
      const fixture = readJson(path) as { type: string };
      return fixture.type;
    }));

    expect([...commandTypes].toSorted()).toEqual([...gameCommandTypes].toSorted());
    expect([...eventTypes].toSorted()).toEqual([...gameEventTypes].toSorted());
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
