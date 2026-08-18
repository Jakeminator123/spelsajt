import { SupabaseAuthVerifier, type AuthVerifier } from "./auth";
import type { GameEventBusPort } from "./event-bus";
import { PostgresGameEventBus } from "./postgres-event-bus";
import { PostgresGameRepository } from "./postgres-repository";
import type { GameRepository } from "./repository";

export const defaultSocketAuthRevalidationIntervalMs = 60_000;
export const defaultPostgresConnectionTimeoutMs = 5_000;
export const defaultPostgresStatementTimeoutMs = 10_000;

export interface GameServerBinding {
  readonly host: string;
  readonly port: number;
}

export function gameServerBinding(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GameServerBinding {
  const host = env.GAME_SERVER_HOST ?? "127.0.0.1";
  const configuredPort = env.GAME_SERVER_PORT ?? env.PORT ?? "4000";
  if (!/^\d+$/.test(configuredPort)) {
    throw new Error("GAME_SERVER_PORT or PORT must be a positive integer.");
  }
  const port = Number(configuredPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("GAME_SERVER_PORT or PORT must be a safe integer between 1 and 65535.");
  }
  return { host, port };
}

export interface PostgresRuntimeTimeouts {
  readonly connectionTimeoutMillis: number;
  readonly statementTimeoutMillis: number;
}

export function postgresRuntimeTimeouts(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PostgresRuntimeTimeouts {
  return {
    connectionTimeoutMillis: configuredMilliseconds(
      env,
      "GAME_SERVER_POSTGRES_CONNECTION_TIMEOUT_MS",
      defaultPostgresConnectionTimeoutMs,
      100,
      300_000,
    ),
    statementTimeoutMillis: configuredMilliseconds(
      env,
      "GAME_SERVER_POSTGRES_STATEMENT_TIMEOUT_MS",
      defaultPostgresStatementTimeoutMs,
      100,
      300_000,
    ),
  };
}

export function socketAuthRevalidationInterval(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const configured = env.GAME_SERVER_SOCKET_AUTH_REVALIDATION_MS;
  if (configured === undefined) return defaultSocketAuthRevalidationIntervalMs;
  if (!/^\d+$/.test(configured)) {
    throw new Error("GAME_SERVER_SOCKET_AUTH_REVALIDATION_MS must be a positive integer.");
  }
  const milliseconds = Number(configured);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 10_000) {
    throw new Error(
      "GAME_SERVER_SOCKET_AUTH_REVALIDATION_MS must be a safe integer of at least 10000.",
    );
  }
  return milliseconds;
}

export interface RuntimeDependencies {
  readonly authVerifier?: AuthVerifier;
  readonly eventBus?: GameEventBusPort;
  readonly repository?: GameRepository;
}

export function runtimeDependencies(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeDependencies {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_SECRET_KEY;
  const databaseUrl = env.SUPABASE_DATABASE_URL;
  if (!url && !key && !databaseUrl) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "Supabase configuration is required when NODE_ENV is production.",
      );
    }
    return {};
  }
  if (!url || !key || !databaseUrl) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_SECRET_KEY), and SUPABASE_DATABASE_URL must be configured together.",
    );
  }
  const timeouts = postgresRuntimeTimeouts(env);
  const postgresOptions = {
    connectionString: databaseUrl,
    connectionTimeoutMillis: timeouts.connectionTimeoutMillis,
    query_timeout: timeouts.statementTimeoutMillis,
    statement_timeout: timeouts.statementTimeoutMillis,
  };
  return {
    authVerifier: new SupabaseAuthVerifier(url, key),
    eventBus: new PostgresGameEventBus(postgresOptions),
    repository: new PostgresGameRepository(postgresOptions),
  };
}

function configuredMilliseconds(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const configured = env[name];
  if (configured === undefined) return fallback;
  if (!/^\d+$/.test(configured)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  const milliseconds = Number(configured);
  if (
    !Number.isSafeInteger(milliseconds)
    || milliseconds < minimum
    || milliseconds > maximum
  ) {
    throw new Error(`${name} must be a safe integer between ${minimum} and ${maximum}.`);
  }
  return milliseconds;
}
