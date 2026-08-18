import { describe, expect, it } from "vitest";

import {
  defaultPostgresConnectionTimeoutMs,
  defaultPostgresStatementTimeoutMs,
  defaultSocketAuthRevalidationIntervalMs,
  gameServerBinding,
  postgresRuntimeTimeouts,
  runtimeDependencies,
  socketAuthRevalidationInterval,
} from "./runtime";

describe("runtime dependencies", () => {
  it("uses Render's standard PORT while preserving local and explicit overrides", () => {
    expect(gameServerBinding({})).toEqual({ host: "127.0.0.1", port: 4_000 });
    expect(gameServerBinding({ PORT: "10000" })).toEqual({
      host: "127.0.0.1",
      port: 10_000,
    });
    expect(gameServerBinding({
      GAME_SERVER_HOST: "0.0.0.0",
      GAME_SERVER_PORT: "4100",
      PORT: "10000",
    })).toEqual({ host: "0.0.0.0", port: 4_100 });
    expect(() => gameServerBinding({ PORT: "10000-http" })).toThrow("positive integer");
    expect(() => gameServerBinding({ PORT: "65536" })).toThrow("between 1 and 65535");
  });

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
