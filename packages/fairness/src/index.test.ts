import { describe, expect, it } from "vitest";

import {
  createCommitment as createBrowserCommitment,
  deriveBlock as deriveBrowserBlock,
} from "./browser";
import { createCommitment, deriveBlock, FairRandom, shuffle } from "./index";

const serverSeed = "00".repeat(32);
const input = {
  clientSeed: "client-seed-example",
  game: "roulette" as const,
  nonce: 7,
  roundId: "round-golden-1",
  rulesetHash: "ruleset-mvp-v1",
};

describe("fairness primitives", () => {
  it("creates a stable SHA-256 commitment", () => {
    expect(createCommitment(serverSeed)).toBe(
      "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925",
    );
  });

  it("produces deterministic unbiased-range samples", () => {
    const first = new FairRandom(serverSeed, input);
    const second = new FairRandom(serverSeed, input);
    const firstRun = Array.from({ length: 16 }, () => first.uniformInt(37));
    const secondRun = Array.from({ length: 16 }, () => second.uniformInt(37));

    expect(firstRun).toEqual(secondRun);
    expect(firstRun.every((value) => value >= 0 && value < 37)).toBe(true);
  });

  it("matches the browser verifier's Web Crypto output", async () => {
    await expect(createBrowserCommitment(serverSeed)).resolves.toBe(createCommitment(serverSeed));
    const browserBlock = await deriveBrowserBlock(serverSeed, input, 0);
    expect(Buffer.from(browserBlock)).toEqual(Buffer.from(deriveBlock(serverSeed, input, 0)));
  });

  it("shuffles without losing or duplicating values", () => {
    const random = new FairRandom(serverSeed, input);
    const shuffled = shuffle([0, 1, 2, 3, 4, 5], random);

    expect([...shuffled].sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
