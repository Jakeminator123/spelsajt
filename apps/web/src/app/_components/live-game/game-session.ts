import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

export interface PublicSupabaseConfiguration {
  readonly supabasePublishableKey: string;
  readonly supabaseUrl: string;
}

export interface PublicGameConfiguration extends PublicSupabaseConfiguration {
  readonly gameServerUrl: string;
}

let browserClient: SupabaseClient | null = null;

export function publicSupabaseConfiguration(): PublicSupabaseConfiguration | null {
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabasePublishableKey || !supabaseUrl) return null;
  return { supabasePublishableKey, supabaseUrl };
}

export function publicGameConfiguration(): PublicGameConfiguration | null {
  const gameServerUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL?.trim();
  const supabase = publicSupabaseConfiguration();
  if (!gameServerUrl || !supabase) return null;
  return { gameServerUrl, ...supabase };
}

export function browserSupabaseClient(
  configuration: PublicSupabaseConfiguration,
): SupabaseClient {
  browserClient ??= createClient(
    configuration.supabaseUrl,
    configuration.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    },
  );
  return browserClient;
}

export async function ensurePlaySession(client: SupabaseClient): Promise<Session> {
  const current = await client.auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session) return current.data.session;

  const signedIn = await client.auth.signInAnonymously();
  if (signedIn.error) throw signedIn.error;
  if (!signedIn.data.session) {
    throw new Error("Supabase skapade ingen gästsession.");
  }
  return signedIn.data.session;
}

export function tableIdForUser(game: "blackjack" | "roulette", userId: string): string {
  return `${game}-${userId}`;
}
