import { AnimationClip, Box3, Vector3, VectorKeyframeTrack } from "three";
import { describe, expect, it } from "vitest";

import {
  chooseGeneratedAvatarIdleClip,
  generatedAvatarPlacement,
  sanitizeGeneratedAvatarIdleClip,
  validatePrivateGeneratedAvatarGlb,
} from "./generated-player-avatar-utils";

function privateGlb(json: object): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = Math.ceil(encoded.length / 4) * 4;
  const totalLength = 20 + paddedLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(buffer, 20, paddedLength);
  bytes.fill(0x20);
  bytes.set(encoded);
  return buffer;
}

describe("generated player avatar utilities", () => {
  it("chooses standing idle without locomotion", () => {
    const clips = [
      new AnimationClip("Walking", 1),
      new AnimationClip("Chair_Sit_Idle_F", 2),
      new AnimationClip("Idle", 3),
    ];
    expect(chooseGeneratedAvatarIdleClip(clips)?.name).toBe("Idle");
    expect(chooseGeneratedAvatarIdleClip([clips[0]!])).toBeNull();
  });

  it("normalizes around the feet and freezes root translation", () => {
    const bounds = new Box3(new Vector3(-1, 2, -0.5), new Vector3(1, 4, 0.5));
    expect(generatedAvatarPlacement(bounds, 1.4)).toEqual({ offset: [-0, -1.4, -0], scale: 0.7 });

    const source = new AnimationClip("Idle", 1, [
      new VectorKeyframeTrack("mixamorigHips.position", [0, 1], [1, 2, 3, 7, 8, 9]),
    ]);
    const sanitized = sanitizeGeneratedAvatarIdleClip(source);
    expect(Array.from(sanitized.tracks[0]!.values)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(Array.from(source.tracks[0]!.values)).toEqual([1, 2, 3, 7, 8, 9]);
  });

  it("accepts self-contained glTF 2.0 and rejects external resources", () => {
    expect(() => validatePrivateGeneratedAvatarGlb(privateGlb({
      asset: { version: "2.0" },
      buffers: [{ byteLength: 0 }],
      images: [{ uri: "data:image/png;base64," }],
    }))).not.toThrow();
    expect(() => validatePrivateGeneratedAvatarGlb(privateGlb({
      asset: { version: "2.0" },
      images: [{ uri: "https://example.test/private-face.png" }],
    }))).toThrow("får inte hämta externa resurser");
  });
});
