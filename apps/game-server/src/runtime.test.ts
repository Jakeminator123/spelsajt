import { describe, expect, it } from "vitest";

import { runtimeDependencies } from "./runtime";

describe("runtime dependencies", () => {
  it("keeps the in-memory fallback available outside production", () => {
    expect(runtimeDependencies({})).toEqual({});
    expect(runtimeDependencies({ NODE_ENV: "test" })).toEqual({});
  });

  it("fails closed when production persistence is not configured", () => {
    expect(() => runtimeDependencies({ NODE_ENV: "production" })).toThrow(
      "Supabase configuration is required when NODE_ENV is production.",
    );
  });

  it("rejects partially configured Supabase dependencies in every environment", () => {
    expect(() => runtimeDependencies({ SUPABASE_URL: "https://example.supabase.co" }))
      .toThrow(
        "SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_SECRET_KEY), and SUPABASE_DATABASE_URL must be configured together.",
      );
  });
});
