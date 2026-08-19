import type { User } from "@supabase/supabase-js";

const fallbackName = "Spelare";

export function initialDisplayName(user: Pick<User, "email" | "user_metadata">): string {
  const metadataName = user.user_metadata.full_name ?? user.user_metadata.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim().slice(0, 32);
  }

  const emailName = user.email?.split("@")[0]?.trim();
  return emailName ? emailName.slice(0, 32) : fallbackName;
}

export function displayNameError(value: string): string | null {
  const normalized = value.trim();
  if (normalized.length < 2) return "Spelarnamnet måste innehålla minst två tecken.";
  if (normalized.length > 32) return "Spelarnamnet får innehålla högst 32 tecken.";
  return null;
}
