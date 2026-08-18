import { SupabaseAuthVerifier, type AuthVerifier } from "./auth";
import type { GameEventBusPort } from "./event-bus";
import { PostgresGameEventBus } from "./postgres-event-bus";
import { PostgresGameRepository } from "./postgres-repository";
import type { GameRepository } from "./repository";

export const defaultSocketAuthRevalidationIntervalMs = 60_000;

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
  return {
    authVerifier: new SupabaseAuthVerifier(url, key),
    eventBus: new PostgresGameEventBus({ connectionString: databaseUrl }),
    repository: new PostgresGameRepository({ connectionString: databaseUrl }),
  };
}
