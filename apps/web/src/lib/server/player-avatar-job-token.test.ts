import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PLAYER_AVATAR_ANIMATIONS } from "../../app/_components/player-avatar/avatar-contract";
import { playerAvatarBlobPath } from "../player-avatar-blob-path";
import {
  createPlayerAvatarJobToken,
  verifyPlayerAvatarJobToken,
  type PlayerAvatarJobClaims,
} from "./player-avatar-job-token";

const USER = "10000000-0000-4000-8000-000000000001";
const OTHER_USER = "10000000-0000-4000-8000-000000000002";
const GENERATION = "20000000-0000-4000-8000-000000000002";
const IMAGE_TASK = "30000000-0000-4000-8000-000000000003";
const RIG_TASK = "40000000-0000-4000-8000-000000000004";
const SECRET = "avatar-test-secret-that-is-at-least-32-characters";

function claims(now: number): Omit<PlayerAvatarJobClaims, "version"> {
  return {
    animationTaskIds: {},
    generationId: GENERATION,
    imageTaskId: IMAGE_TASK,
    issuedAt: now,
    rigTaskId: null,
    stage: "image",
    storedPaths: {},
    userId: USER,
  };
}

describe("signed player avatar jobs", () => {
  it("round-trips an owner-bound token and rejects tampering or another owner", () => {
    const now = Date.now();
    const token = createPlayerAvatarJobToken(claims(now), SECRET);
    expect(verifyPlayerAvatarJobToken(token, USER, SECRET, now).stage).toBe("image");
    expect(() => verifyPlayerAvatarJobToken(`${token.slice(0, -1)}x`, USER, SECRET, now)).toThrow(/ogiltigt/i);
    expect(() => verifyPlayerAvatarJobToken(token, OTHER_USER, SECRET, now)).toThrow(/annan spelare/i);
  });

  it("rejects expired jobs and non-owner Blob paths before signing", () => {
    const now = Date.now();
    const old = createPlayerAvatarJobToken(claims(now - 5 * 24 * 60 * 60 * 1000), SECRET);
    expect(() => verifyPlayerAvatarJobToken(old, USER, SECRET, now)).toThrow(/gått ut/i);

    const animationTaskIds = Object.fromEntries(PLAYER_AVATAR_ANIMATIONS.map(({ key }, index) => [
      key,
      `${String(index + 5).padStart(8, "0")}-0000-4000-8000-000000000005`,
    ]));
    expect(() => createPlayerAvatarJobToken({
      ...claims(now),
      animationTaskIds,
      rigTaskId: RIG_TASK,
      stage: "storing",
      storedPaths: { idle: playerAvatarBlobPath(OTHER_USER, GENERATION, "idle") },
    }, SECRET)).toThrow(/lagringssökväg/i);
  });
});
