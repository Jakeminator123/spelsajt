import { encodeInput, requireServerSeed, type FairnessInput } from "./shared";

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
