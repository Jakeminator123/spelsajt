import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface PublicSupabaseConfiguration {
  readonly publishableKey: string;
  readonly url: string;
}

export function publicSupabaseConfiguration(): PublicSupabaseConfiguration | null {
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  ).trim();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  return publishableKey && url ? { publishableKey, url } : null;
}

export function createBrowserSupabaseClient(
  configuration: PublicSupabaseConfiguration,
): SupabaseClient {
  return createClient(configuration.url, configuration.publishableKey);
}

export function oauthRedirectUrl(origin: string, path: string): string {
  const configured = (process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? "").trim();
  return configured || new URL(path, origin).toString();
}
