import { describe, expect, it } from "vitest";

import { displayNameError, initialDisplayName } from "./profile";

describe("player account profile helpers", () => {
  it("prefers the provider display name", () => {
    expect(initialDisplayName({ email: "a@example.com", user_metadata: { full_name: "Ada Lovelace" } })).toBe(
      "Ada Lovelace",
    );
  });

  it("falls back to the local part of the email", () => {
    expect(initialDisplayName({ email: "emil@example.com", user_metadata: {} })).toBe("emil");
  });

  it("validates display-name boundaries", () => {
    expect(displayNameError("a")).toContain("minst två");
    expect(displayNameError("Ada")).toBeNull();
    expect(displayNameError("x".repeat(33))).toContain("högst 32");
  });
});
