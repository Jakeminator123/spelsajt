import "server-only";

export const PLAYER_AVATAR_INPUT_MAX_BYTES = 4 * 1024 * 1024;
export const PLAYER_AVATAR_INPUT_MAX_PIXELS = 16_000_000;
export const PLAYER_AVATAR_INPUT_MIN_EDGE = 512;

export interface SanitizedPlayerAvatarJpeg {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly width: number;
}

export function sanitizePlayerAvatarJpeg(input: ArrayBuffer): SanitizedPlayerAvatarJpeg {
  if (input.byteLength <= 0 || input.byteLength > PLAYER_AVATAR_INPUT_MAX_BYTES) {
    throw new Error("Avatarbilden får vara högst 4 MB efter bearbetning.");
  }
  const source = new Uint8Array(input);
  const dimensions = jpegDimensions(source);
  if (!dimensions) throw new Error("Avatarbilden måste vara en giltig JPEG.");
  if (
    Math.min(dimensions.width, dimensions.height) < PLAYER_AVATAR_INPUT_MIN_EDGE
    || dimensions.width * dimensions.height > PLAYER_AVATAR_INPUT_MAX_PIXELS
  ) {
    throw new Error("Avatarbilden måste vara minst 512 px och högst 16 megapixlar.");
  }

  const chunks: Uint8Array[] = [source.subarray(0, 2)];
  let outputLength = 2;
  let offset = 2;
  let reachedImageData = false;
  while (offset < source.length) {
    const markerStart = offset;
    if (source[offset] !== 0xff) throw new Error("Avatarbilden är skadad.");
    while (source[offset] === 0xff) offset += 1;
    const marker = source[offset];
    if (marker === undefined) throw new Error("Avatarbilden är skadad.");
    offset += 1;

    if (marker === 0xda || marker === 0xd9) {
      const remainder = source.subarray(markerStart);
      chunks.push(remainder);
      outputLength += remainder.length;
      reachedImageData = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      const standalone = source.subarray(markerStart, offset);
      chunks.push(standalone);
      outputLength += standalone.length;
      continue;
    }
    if (offset + 1 >= source.length) throw new Error("Avatarbilden är skadad.");
    const segmentLength = (source[offset]! << 8) | source[offset + 1]!;
    if (segmentLength < 2 || offset + segmentLength > source.length) {
      throw new Error("Avatarbilden är skadad.");
    }
    const segmentEnd = offset + segmentLength;
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) {
      const segment = source.subarray(markerStart, segmentEnd);
      chunks.push(segment);
      outputLength += segment.length;
    }
    offset = segmentEnd;
  }
  if (!reachedImageData) throw new Error("Avatarbilden saknar bilddata.");

  const bytes = new Uint8Array(outputLength);
  let writeOffset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return { bytes, ...dimensions };
}

function jpegDimensions(bytes: Uint8Array): { readonly height: number; readonly width: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) return null;
    if (isStartOfFrame(marker) && length >= 7) {
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      return width > 0 && height > 0 ? { height, width } : null;
    }
    offset += length;
  }
  return null;
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}
