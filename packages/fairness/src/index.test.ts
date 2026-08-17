import { mvpRuleset, mvpRulesetHash } from "@spelsajt/config";
import { describe, expect, it } from "vitest";

import {
  createCommitment as createBrowserCommitment,
  deriveBlock as deriveBrowserBlock,
} from "./browser";
import {
  createCommitment,
  deriveBlock,
  FairRandom,
  shuffle,
  type FairnessInput,
} from "./index";
import { fairnessAlgorithmId } from "./shared";

import goldenVector from "../test-vectors/pf-v1.json";

const serverSeed = goldenVector.serverSeed;
const input = goldenVector.input as FairnessInput;

describe("fairness primitives", () => {
  it("implements the algorithm declared by the locked ruleset", () => {
    expect(fairnessAlgorithmId).toBe(mvpRuleset.fairness.algorithmId);
    expect(goldenVector.algorithmId).toBe(fairnessAlgorithmId);
    expect(input.rulesetHash).toBe(mvpRulesetHash);
  });

  it("creates a stable SHA-256 commitment", () => {
    expect(createCommitment(serverSeed)).toBe(goldenVector.expected.commitment);
  });

  it("reproduces the frozen roulette samples", () => {
    const first = new FairRandom(serverSeed, input);
    const second = new FairRandom(serverSeed, input);
    const firstRun = Array.from({ length: 16 }, () => first.uniformInt(37));
    const secondRun = Array.from({ length: 16 }, () => second.uniformInt(37));

    expect(firstRun).toEqual(goldenVector.expected.roulettePockets);
    expect(firstRun).toEqual(secondRun);
    expect(firstRun.every((value) => value >= 0 && value < 37)).toBe(true);
  });

  it("matches the browser verifier's Web Crypto output", async () => {
    await expect(createBrowserCommitment(serverSeed)).resolves.toBe(createCommitment(serverSeed));
    const browserBlock = await deriveBrowserBlock(serverSeed, input, 0);
    expect(Buffer.from(browserBlock)).toEqual(Buffer.from(deriveBlock(serverSeed, input, 0)));
    expect(Buffer.from(browserBlock).toString("hex")).toBe(goldenVector.expected.block0Hex);
  });

  it("reproduces the frozen blackjack shuffle without loss or duplication", () => {
    const random = new FairRandom(serverSeed, { ...input, game: "blackjack" });
    const source = Array.from({ length: 16 }, (_value, index) => index);
    const shuffled = shuffle(source, random);

    expect(shuffled).toEqual(goldenVector.expected.blackjackShuffle);
    expect([...shuffled].sort((left, right) => left - right)).toEqual(source);
  });
});
