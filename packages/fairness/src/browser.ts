import {
  encodeInput,
  mapUint32ToBoundedInteger,
  requireServerSeed,
  type FairnessInput,
} from "./shared";

export type { FairnessInput } from "./shared";

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function subtleCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is unavailable in this environment.");
  }
  return globalThis.crypto.subtle;
}

export function createClientSeed(): string {
  if (!globalThis.crypto) {
    throw new Error("Web Crypto is unavailable in this environment.");
  }
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

export async function createCommitment(serverSeed: string): Promise<string> {
  requireServerSeed(serverSeed);
  const digest = await subtleCrypto().digest("SHA-256", hexToBytes(serverSeed));
  return bytesToHex(new Uint8Array(digest));
}

export async function deriveBlock(
  serverSeed: string,
  input: FairnessInput,
  blockCounter: number,
): Promise<Uint8Array<ArrayBuffer>> {
  requireServerSeed(serverSeed);
  const subtle = subtleCrypto();
  const key = await subtle.importKey(
    "raw",
    hexToBytes(serverSeed),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", key, encodeInput(input, blockCounter));
  return new Uint8Array(signature);
}

export class FairRandom {
  readonly #input: FairnessInput;
  readonly #serverSeed: string;
  #block: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  #blockCounter = 0;
  #offset = 0;
  #sequence: Promise<void> = Promise.resolve();

  constructor(serverSeed: string, input: FairnessInput) {
    requireServerSeed(serverSeed);
    this.#serverSeed = serverSeed;
    this.#input = input;
  }

  async #nextUint32(): Promise<number> {
    if (this.#offset + 4 > this.#block.length) {
      this.#block = await deriveBlock(this.#serverSeed, this.#input, this.#blockCounter);
      this.#blockCounter += 1;
      this.#offset = 0;
    }

    const view = new DataView(this.#block.buffer, this.#block.byteOffset + this.#offset, 4);
    const value = view.getUint32(0, false);
    this.#offset += 4;
    return value;
  }

  uniformInt(maxExclusive: number): Promise<number> {
    const result = this.#sequence.then(() => this.#uniformInt(maxExclusive));
    this.#sequence = result.then(() => undefined, () => undefined);
    return result;
  }

  async #uniformInt(maxExclusive: number): Promise<number> {
    for (;;) {
      const mapped = mapUint32ToBoundedInteger(await this.#nextUint32(), maxExclusive);
      if (mapped !== null) {
        return mapped;
      }
    }
  }
}

export async function shuffle<T>(items: readonly T[], random: FairRandom): Promise<T[]> {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = await random.uniformInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex] as T, result[index] as T];
  }

  return result;
}
