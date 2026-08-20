import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sanitizePlayerAvatarJpeg } from "./player-avatar-input";

function jpeg(width: number, height: number, includeMetadata = false): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    ...(includeMetadata ? [0xff, 0xe1, 0x00, 0x06, 0x45, 0x58, 0x49, 0x46] : []),
    0xff, 0xc0, 0x00, 0x07, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0xff, 0xda, 0x00, 0xff, 0xd9,
  ]);
}

describe("server-side player avatar JPEG sanitation", () => {
  it("keeps dimensions and removes APP metadata before provider upload", () => {
    const source = jpeg(512, 768, true);
    const result = sanitizePlayerAvatarJpeg(source.buffer as ArrayBuffer);
    expect({ height: result.height, width: result.width }).toEqual({ height: 768, width: 512 });
    expect([...result.bytes]).not.toContain(0xe1);
    expect(result.bytes.byteLength).toBeLessThan(source.byteLength);
  });

  it("rejects undersized or malformed input", () => {
    expect(() => sanitizePlayerAvatarJpeg(jpeg(511, 512).buffer as ArrayBuffer)).toThrow(/minst 512/i);
    expect(() => sanitizePlayerAvatarJpeg(Uint8Array.from([1, 2, 3]).buffer as ArrayBuffer)).toThrow(/giltig JPEG/i);
  });
});
