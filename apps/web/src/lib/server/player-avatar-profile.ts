import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PlayerAvatarAnimationKey,
  PlayerAvatarPipelineState,
} from "../../app/_components/player-avatar/avatar-contract";

export interface PlayerAvatarRow {
  readonly active_job_token: string | null;
  readonly animation_paths: Partial<Record<PlayerAvatarAnimationKey, string>>;
  readonly error_message: string | null;
  readonly model_path: string | null;
  readonly state: PlayerAvatarPipelineState;
  readonly user_id: string;
}

export async function readPlayerAvatarRow(
  client: SupabaseClient,
  userId: string,
): Promise<PlayerAvatarRow | null> {
  const result = await client
    .from("player_avatars")
    .select("user_id,state,active_job_token,model_path,animation_paths,error_message")
    .eq("user_id", userId)
    .maybeSingle<PlayerAvatarRow>();
  if (result.error) throw result.error;
  return result.data;
}

export async function upsertPlayerAvatarRow(
  client: SupabaseClient,
  values: Partial<PlayerAvatarRow> & Pick<PlayerAvatarRow, "user_id">,
): Promise<void> {
  const result = await client.from("player_avatars").upsert(values, { onConflict: "user_id" });
  if (result.error) throw result.error;
}

export async function replaceActiveAvatarJobToken(
  client: SupabaseClient,
  userId: string,
  currentToken: string,
  nextToken: string,
  state: PlayerAvatarPipelineState,
): Promise<boolean> {
  const result = await client
    .from("player_avatars")
    .update({ active_job_token: nextToken, state, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("active_job_token", currentToken)
    .select("user_id");
  if (result.error) throw result.error;
  return result.data.length === 1;
}
