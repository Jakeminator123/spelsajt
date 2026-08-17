export interface FairnessInput {
  clientSeed: string;
  game: "blackjack" | "roulette";
  nonce: number;
  roundId: string;
  rulesetHash: string;
}

export const fairnessAlgorithmId = "pf-v1" as const;

const HEX_32_BYTES = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();

export function requireServerSeed(serverSeed: string): void {
  if (!HEX_32_BYTES.test(serverSeed)) {
    throw new TypeError("Server seed must be a lowercase 32-byte hex string.");
  }
}

function encodeField(value: string): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(value);
  const encoded = new Uint8Array(4 + bytes.length);
  new DataView(encoded.buffer).setUint32(0, bytes.length, false);
  encoded.set(bytes, 4);
  return encoded;
}

export function encodeInput(
  input: FairnessInput,
  blockCounter: number,
): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(input.nonce) || input.nonce < 0) {
    throw new RangeError("Nonce must be a non-negative safe integer.");
  }

  if (!Number.isSafeInteger(blockCounter) || blockCounter < 0) {
    throw new RangeError("Block counter must be a non-negative safe integer.");
  }

  const fields = [
    fairnessAlgorithmId,
    input.game,
    input.roundId,
    input.clientSeed,
    input.nonce.toString(10),
    blockCounter.toString(10),
    input.rulesetHash,
  ].map(encodeField);
  const length = fields.reduce((total, field) => total + field.length, 0);
  const encoded = new Uint8Array(length);
  let offset = 0;

  for (const field of fields) {
    encoded.set(field, offset);
    offset += field.length;
  }

  return encoded;
}
