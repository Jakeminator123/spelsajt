import { describe, expect, it } from "vitest";

import {
  defaultPostgresConnectionTimeoutMs,
  defaultPostgresStatementTimeoutMs,
  defaultSocketAuthRevalidationIntervalMs,
  postgresRuntimeTimeouts,
  runtimeDependencies,
  socketAuthRevalidationInterval,
} from "./runtime";

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

  it("validates the Socket.IO auth revalidation interval", () => {
    expect(socketAuthRevalidationInterval({})).toBe(defaultSocketAuthRevalidationIntervalMs);
    expect(socketAuthRevalidationInterval({
      GAME_SERVER_SOCKET_AUTH_REVALIDATION_MS: "30000",
    })).toBe(30_000);
    expect(() => socketAuthRevalidationInterval({
      GAME_SERVER_SOCKET_AUTH_REVALIDATION_MS: "9999",
    })).toThrow("at least 10000");
    expect(() => socketAuthRevalidationInterval({
      GAME_SERVER_SOCKET_AUTH_REVALIDATION_MS: "soon",
    })).toThrow("positive integer");
  });

  it("bounds and validates Postgres connection and statement timeouts", () => {
    expect(postgresRuntimeTimeouts({})).toEqual({
      connectionTimeoutMillis: defaultPostgresConnectionTimeoutMs,
      statementTimeoutMillis: defaultPostgresStatementTimeoutMs,
    });
    expect(postgresRuntimeTimeouts({
      GAME_SERVER_POSTGRES_CONNECTION_TIMEOUT_MS: "2500",
      GAME_SERVER_POSTGRES_STATEMENT_TIMEOUT_MS: "15000",
    })).toEqual({
      connectionTimeoutMillis: 2_500,
      statementTimeoutMillis: 15_000,
    });
    expect(() => postgresRuntimeTimeouts({
      GAME_SERVER_POSTGRES_CONNECTION_TIMEOUT_MS: "99",
    })).toThrow("between 100 and 300000");
    expect(() => postgresRuntimeTimeouts({
      GAME_SERVER_POSTGRES_STATEMENT_TIMEOUT_MS: "300001",
    })).toThrow("between 100 and 300000");
    expect(() => postgresRuntimeTimeouts({
      GAME_SERVER_POSTGRES_STATEMENT_TIMEOUT_MS: "eventually",
    })).toThrow("positive integer");
  });
});
