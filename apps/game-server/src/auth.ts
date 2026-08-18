import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface AuthVerifier {
  verify(accessToken: string): Promise<string | null>;
}

export class SupabaseAuthVerifier implements AuthVerifier {
  readonly #client: SupabaseClient;

  constructor(url: string, publishableKey: string) {
    this.#client = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  async verify(accessToken: string): Promise<string | null> {
    const { data, error } = await this.#client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user.id;
  }
}

export const rejectAllAuthVerifier: AuthVerifier = Object.freeze({
  verify: async () => null,
});

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}
