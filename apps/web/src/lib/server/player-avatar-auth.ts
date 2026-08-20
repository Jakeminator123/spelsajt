import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export interface AuthenticatedAvatarRequest {
  readonly client: SupabaseClient;
  readonly user: User;
}

export class AvatarHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AvatarHttpError";
  }
}

export async function authenticateAvatarRequest(request: Request): Promise<AuthenticatedAvatarRequest> {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new AvatarHttpError("Du behöver vara inloggad.", 401);
  const accessToken = match[1]!;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !publishableKey) {
    throw new AvatarHttpError("Supabase är inte konfigurerat på servern.", 503);
  }
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { authorization: `Bearer ${accessToken}` } },
  });
  const result = await client.auth.getUser(accessToken);
  if (result.error || !result.data.user) throw new AvatarHttpError("Spelarsessionen är ogiltig.", 401);
  if (result.data.user.is_anonymous) {
    throw new AvatarHttpError("Säkra gästkontot innan du skapar en personlig avatar.", 403);
  }
  return { client, user: result.data.user };
}
