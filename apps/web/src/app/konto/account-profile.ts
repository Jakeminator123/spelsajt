import type { User } from "@supabase/supabase-js";

export const DEFAULT_DISPLAY_NAME = "Spelare";

export function displayNameError(value: string): string | null {
  const normalized = value.trim();
  if (normalized.length < 2) return "Namnet måste vara minst 2 tecken.";
  if (normalized.length > 32) return "Namnet får vara högst 32 tecken.";
  return null;
}

export function initialDisplayName(
  user: Pick<User, "email" | "user_metadata">,
): string {
  const metadataName = [user.user_metadata.full_name, user.user_metadata.name]
    .find((value): value is string => typeof value === "string" && !displayNameError(value));
  if (metadataName) return metadataName.trim();

  const emailPrefix = user.email?.split("@", 1)[0];
  if (emailPrefix && !displayNameError(emailPrefix)) return emailPrefix.trim();
  return DEFAULT_DISPLAY_NAME;
}
