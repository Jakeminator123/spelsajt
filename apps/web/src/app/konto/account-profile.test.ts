import { describe, expect, it } from "vitest";

import { DEFAULT_DISPLAY_NAME, displayNameError, initialDisplayName } from "./account-profile";

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
});
