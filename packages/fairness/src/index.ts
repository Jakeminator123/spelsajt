import { createHash, createHmac, randomBytes } from "node:crypto";

import { encodeInput, requireServerSeed, type FairnessInput } from "./shared";

export { fairnessAlgorithmId, type FairnessInput } from "./shared";

export function createServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function createCommitment(serverSeed: string): string {
  requireServerSeed(serverSeed);
  return createHash("sha256").update(Buffer.from(serverSeed, "hex")).digest("hex");
}

export function deriveBlock(
  serverSeed: string,
  input: FairnessInput,
  blockCounter: number,
): Uint8Array {
  requireServerSeed(serverSeed);
  return createHmac("sha256", Buffer.from(serverSeed, "hex"))
    .update(Buffer.from(encodeInput(input, blockCounter)))
    .digest();
}

export class FairRandom {
  readonly #input: FairnessInput;
  readonly #serverSeed: string;
  #block: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  #blockCounter = 0;
  #offset = 0;

  constructor(serverSeed: string, input: FairnessInput) {
    requireServerSeed(serverSeed);
    this.#serverSeed = serverSeed;
    this.#input = input;
  }

  #nextUint32(): number {
    if (this.#offset + 4 > this.#block.length) {
      this.#block = deriveBlock(this.#serverSeed, this.#input, this.#blockCounter);
      this.#blockCounter += 1;
      this.#offset = 0;
    }

    const view = new DataView(
      this.#block.buffer,
      this.#block.byteOffset + this.#offset,
      4,
    );
    const value = view.getUint32(0, false);
    this.#offset += 4;
    return value;
  }

  uniformInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) {
      throw new RangeError("maxExclusive must be an integer from 1 through 2^32.");
    }

    const range = 0x1_0000_0000;
    const acceptanceLimit = Math.floor(range / maxExclusive) * maxExclusive;

    for (;;) {
      const candidate = this.#nextUint32();
      if (candidate < acceptanceLimit) {
        return candidate % maxExclusive;
      }
    }
  }
}

export function shuffle<T>(items: readonly T[], random: FairRandom): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = random.uniformInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex] as T, result[index] as T];
  }

  return result;
}
