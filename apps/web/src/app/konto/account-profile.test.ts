import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISPLAY_NAME,
  displayNameError,
  initialDisplayName,
  profileLoadPhase,
} from "./account-profile";

describe("account profile helpers", () => {
  it("normalizes a safe provider name", () => {
    expect(initialDisplayName({ email: "anna@example.test", user_metadata: { full_name: "  Anna  " } }))
      .toBe("Anna");
  });

  it("falls back to the email prefix and then the neutral player name", () => {
    expect(initialDisplayName({ email: "emil@example.test", user_metadata: {} })).toBe("emil");
    expect(initialDisplayName({ email: "x@example.test", user_metadata: {} })).toBe(DEFAULT_DISPLAY_NAME);
  });

  it("enforces the database display-name limits", () => {
    expect(displayNameError("A")).toContain("minst 2");
    expect(displayNameError("a".repeat(33))).toContain("högst 32");
    expect(displayNameError("Dealer Ava")).toBeNull();
  });

  it("stops showing a loading state when the active profile request fails", () => {
    expect(profileLoadPhase(null, null, null)).toBe("idle");
    expect(profileLoadPhase("user-1", null, null)).toBe("loading");
    expect(profileLoadPhase("user-1", "user-1", null)).toBe("ready");
    expect(profileLoadPhase("user-1", null, "user-1")).toBe("error");
    expect(profileLoadPhase("user-2", null, "user-1")).toBe("loading");
  });
});
