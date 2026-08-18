import {
  mvpRuleset,
  mvpRulesetHash,
  mvpV1Ruleset,
  mvpV1RulesetHash,
} from "@spelsajt/config";
import { describe, expect, it } from "vitest";

import {
  createCommitment as createBrowserCommitment,
  deriveBlock as deriveBrowserBlock,
  FairRandom as BrowserFairRandom,
  shuffle as browserShuffle,
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
import mvpV2GoldenVector from "../test-vectors/pf-v1-mvp-v2.json";

const serverSeed = goldenVector.serverSeed;
const input = goldenVector.input as FairnessInput;

async function browserUniformInts(
  random: BrowserFairRandom,
  count: number,
  maxExclusive: number,
): Promise<number[]> {
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(await random.uniformInt(maxExclusive));
  }
  return values;
}

describe("fairness primitives", () => {
  it("implements the algorithm declared by the locked ruleset", () => {
    expect(fairnessAlgorithmId).toBe(mvpV1Ruleset.fairness.algorithmId);
    expect(goldenVector.algorithmId).toBe(fairnessAlgorithmId);
    expect(input.rulesetHash).toBe(mvpV1RulesetHash);
  });

  it("locks new ruleset semantics with a cross-runtime golden vector", async () => {
    const rouletteInput = mvpV2GoldenVector.inputs.roulette as FairnessInput;
    const blackjackInput = mvpV2GoldenVector.inputs.blackjack as FairnessInput;
    const nodeRoulette = new FairRandom(mvpV2GoldenVector.serverSeed, rouletteInput);
    const browserRoulette = new BrowserFairRandom(mvpV2GoldenVector.serverSeed, rouletteInput);
    const nodeBlackjack = new FairRandom(mvpV2GoldenVector.serverSeed, blackjackInput);
    const browserBlackjack = new BrowserFairRandom(mvpV2GoldenVector.serverSeed, blackjackInput);
    const source = Array.from({ length: 16 }, (_value, index) => index);

    expect(fairnessAlgorithmId).toBe(mvpRuleset.fairness.algorithmId);
    expect(rouletteInput.rulesetHash).toBe(mvpRulesetHash);
    expect(blackjackInput.rulesetHash).toBe(mvpRulesetHash);
    expect(Buffer.from(deriveBlock(mvpV2GoldenVector.serverSeed, rouletteInput, 0)).toString("hex"))
      .toBe(mvpV2GoldenVector.expected.rouletteBlock0Hex);
    expect(Buffer.from(deriveBlock(mvpV2GoldenVector.serverSeed, blackjackInput, 0)).toString("hex"))
      .toBe(mvpV2GoldenVector.expected.blackjackBlock0Hex);
    await expect(createBrowserCommitment(mvpV2GoldenVector.serverSeed))
      .resolves.toBe(mvpV2GoldenVector.expected.commitment);
    expect(Buffer.from(await deriveBrowserBlock(mvpV2GoldenVector.serverSeed, rouletteInput, 0)).toString("hex"))
      .toBe(mvpV2GoldenVector.expected.rouletteBlock0Hex);
    expect(Buffer.from(await deriveBrowserBlock(mvpV2GoldenVector.serverSeed, blackjackInput, 0)).toString("hex"))
      .toBe(mvpV2GoldenVector.expected.blackjackBlock0Hex);

    const nodePockets = Array.from({ length: 16 }, () => nodeRoulette.uniformInt(37));
    const browserPockets = await browserUniformInts(browserRoulette, 16, 37);
    expect(nodePockets).toEqual(mvpV2GoldenVector.expected.roulettePockets);
    expect(browserPockets).toEqual(nodePockets);

    const nodeShuffle = shuffle(source, nodeBlackjack);
    const webShuffle = await browserShuffle(source, browserBlackjack);
    expect(nodeShuffle).toEqual(mvpV2GoldenVector.expected.blackjackShuffle);
    expect(webShuffle).toEqual(nodeShuffle);
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

  it("serializes concurrent browser requests into the canonical byte order", async () => {
    const sequential = new BrowserFairRandom(serverSeed, input);
    const concurrent = new BrowserFairRandom(serverSeed, input);
    const expected = await browserUniformInts(sequential, 16, 37);
    const actual = await Promise.all(
      Array.from({ length: 16 }, () => concurrent.uniformInt(37)),
    );

    expect(actual).toEqual(expected);
  });

  it("reproduces the frozen blackjack shuffle without loss or duplication", () => {
    const random = new FairRandom(serverSeed, { ...input, game: "blackjack" });
    const source = Array.from({ length: 16 }, (_value, index) => index);
    const shuffled = shuffle(source, random);

    expect(shuffled).toEqual(goldenVector.expected.blackjackShuffle);
    expect([...shuffled].sort((left, right) => left - right)).toEqual(source);
  });
});
