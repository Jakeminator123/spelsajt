import { SupabaseAuthVerifier, type AuthVerifier } from "./auth";
import { PostgresGameRepository } from "./postgres-repository";
import type { GameRepository } from "./repository";

export interface RuntimeDependencies {
  readonly authVerifier?: AuthVerifier;
  readonly repository?: GameRepository;
}

export function runtimeDependencies(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeDependencies {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_SECRET_KEY;
  const databaseUrl = env.SUPABASE_DATABASE_URL;
  if (!url && !key && !databaseUrl) return {};
  if (!url || !key || !databaseUrl) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_SECRET_KEY), and SUPABASE_DATABASE_URL must be configured together.",
    );
  }
  return {
    authVerifier: new SupabaseAuthVerifier(url, key),
    repository: new PostgresGameRepository({ connectionString: databaseUrl }),
  };
}
