import { describe, expect, it } from "vitest";

import { readImageDimensions } from "./avatar-image";

describe("player avatar image headers", () => {
  it("reads PNG, JPEG and extended WebP dimensions", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    writeAscii(png, 12, "IHDR");
    const pngView = new DataView(png.buffer);
    pngView.setUint32(16, 512);
    pngView.setUint32(20, 768);

    const jpeg = new Uint8Array(21);
    jpeg.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x03, 0x00]);

    const webp = new Uint8Array(30);
    writeAscii(webp, 0, "RIFF");
    writeAscii(webp, 8, "WEBP");
    writeAscii(webp, 12, "VP8X");
    writeUint24(webp, 24, 511);
    writeUint24(webp, 27, 767);

    expect(readImageDimensions(png)).toEqual({ height: 768, type: "image/png", width: 512 });
    expect(readImageDimensions(jpeg)).toEqual({ height: 512, type: "image/jpeg", width: 768 });
    expect(readImageDimensions(webp)).toEqual({ height: 768, type: "image/webp", width: 512 });
  });

  it("rejects spoofed or truncated bytes", () => {
    expect(readImageDimensions(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    expect(readImageDimensions(new TextEncoder().encode("not an image"))).toBeNull();
  });
});

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (const [index, character] of Array.from(value).entries()) {
    bytes[offset + index] = character.charCodeAt(0);
  }
}

function writeUint24(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}
