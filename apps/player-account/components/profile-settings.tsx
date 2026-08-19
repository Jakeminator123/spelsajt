"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Link as LinkIcon, Save, ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { displayNameError, initialDisplayName } from "@/lib/profile";
import { oauthRedirectUrl } from "@/lib/supabase";

import { useAuth } from "./auth/auth-provider";

interface ProfileRow {
  readonly display_name: string;
}

async function readOrCreateProfile(
  client: SupabaseClient,
  userId: string,
  seedName: string,
): Promise<string> {
  const selected = await client
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle<ProfileRow>();
  if (selected.error) throw selected.error;
  if (selected.data) return selected.data.display_name;

  const inserted = await client
    .from("profiles")
    .insert({ display_name: seedName, user_id: userId })
    .select("display_name")
    .single<ProfileRow>();
  if (inserted.error?.code === "23505") {
    const raced = await client
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .single<ProfileRow>();
    if (raced.error) throw raced.error;
    return raced.data.display_name;
  }
  if (inserted.error) throw inserted.error;
  return inserted.data.display_name;
}

export function ProfileSettings() {
  const { client, session } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"profile" | "link" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id ?? null;
  const seedName = session ? initialDisplayName(session.user) : "Spelare";
  const isGuest = session?.user.is_anonymous === true;

  useEffect(() => {
    if (!client || !userId) return;
    let active = true;

    void readOrCreateProfile(client, userId, seedName)
      .then((name) => {
        if (active) {
          setDisplayName(name);
          setLoadedUserId(userId);
        }
      })
      .catch((profileError: unknown) => {
        if (active) {
          setError(profileError instanceof Error ? profileError.message : "Profilen kunde inte läsas.");
        }
      });

    return () => {
      active = false;
    };
  }, [client, seedName, userId]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !userId) return;
    const validationError = displayNameError(displayName);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy("profile");
    setError(null);
    setMessage(null);
    const normalized = displayName.trim();
    const result = await client
      .from("profiles")
      .update({ display_name: normalized, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .select("display_name")
      .single<ProfileRow>();
    if (result.error) {
      setError(result.error.message);
    } else {
      setDisplayName(result.data.display_name);
      setMessage("Spelarnamnet är sparat.");
    }
    setBusy(null);
  }

  async function linkGoogle() {
    if (!client) return;
    setBusy("link");
    setError(null);
    const result = await client.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: oauthRedirectUrl(window.location.origin, "/settings") },
    });
    if (result.error) {
      setError(result.error.message);
      setBusy(null);
    }
  }

  const profileLoading = Boolean(userId && loadedUserId !== userId);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-xl shadow-black/10 sm:p-7">
      <form className="space-y-5" onSubmit={saveProfile}>
        <div>
          <label className="mb-2 block text-sm font-semibold" htmlFor="display-name">Spelarnamn</label>
          <input className="h-12 w-full rounded-xl border border-input bg-[#0b0c11] px-4 text-sm text-white placeholder:text-muted-foreground disabled:opacity-50" disabled={profileLoading || busy !== null} id="display-name" maxLength={32} onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
          <p className="mt-2 text-xs text-muted-foreground">Visas vid bordet. 2–32 tecken.</p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Inloggningsmetod</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
              {isGuest ? "Gästidentitet" : session?.user.email ?? "Google-konto"}
            </span>
            {isGuest ? (
              <button className="inline-flex items-center rounded-full border border-[#7c5cff]/40 bg-[#7c5cff]/10 px-4 py-2 text-xs font-bold text-[#c9bdff] transition hover:bg-[#7c5cff]/20 disabled:opacity-50" disabled={busy !== null} onClick={linkGoogle} type="button">
                <LinkIcon aria-hidden="true" className="mr-2 h-4 w-4" />
                {busy === "link" ? "Öppnar Google…" : "Säkra med Google"}
              </button>
            ) : null}
          </div>
        </div>

        <button className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-50" disabled={profileLoading || busy !== null} type="submit">
          <Save aria-hidden="true" className="mr-2 h-4 w-4" />
          {busy === "profile" ? "Sparar…" : "Spara profil"}
        </button>
      </form>

      {message ? <p className="mt-4 text-sm text-primary" role="status">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}
