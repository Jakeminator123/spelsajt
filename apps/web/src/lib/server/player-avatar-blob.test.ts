import { describe, expect, it } from "vitest";

import { isOwnedPlayerAvatarBlobPath, playerAvatarBlobPath } from "../player-avatar-blob-path";

const USER = "10000000-0000-4000-8000-000000000001";
const GENERATION = "20000000-0000-4000-8000-000000000002";

describe("private player avatar blob paths", () => {
  it("builds an owner-scoped deterministic asset path", () => {
    expect(playerAvatarBlobPath(USER, GENERATION, "idle"))
      .toBe(`player-avatars/${USER}/${GENERATION}/idle.glb`);
  });

  it("rejects cross-owner, traversal and unknown asset paths", () => {
    expect(isOwnedPlayerAvatarBlobPath(USER, `player-avatars/${USER}/${GENERATION}/victory.glb`)).toBe(true);
    expect(isOwnedPlayerAvatarBlobPath(USER, `player-avatars/30000000-0000-4000-8000-000000000003/${GENERATION}/idle.glb`)).toBe(false);
    expect(isOwnedPlayerAvatarBlobPath(USER, `player-avatars/${USER}/${GENERATION}/../idle.glb`)).toBe(false);
    expect(isOwnedPlayerAvatarBlobPath(USER, `player-avatars/${USER}/${GENERATION}/arbitrary.glb`)).toBe(false);
  });
});
