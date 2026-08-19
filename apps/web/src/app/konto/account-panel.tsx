"use client";

import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import {
  browserSupabaseClient,
  publicSupabaseConfiguration,
} from "../_components/live-game/game-session";
import { displayNameError, initialDisplayName } from "./account-profile";
import styles from "./account.module.css";

interface ProfileRow {
  readonly display_name: string;
}

type PagePhase = "loading" | "ready" | "unconfigured";

function providerLabel(user: User): string {
  const providers = user.app_metadata.providers;
  if (providers?.includes("google")) return "Google";
  if (user.email) return user.email;
  return "Gästidentitet";
}

async function readOrCreateProfile(
  client: SupabaseClient,
  userId: string,
  seedDisplayName: string,
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
    .insert({ display_name: seedDisplayName, user_id: userId })
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

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M21.35 12.2c0-.7-.06-1.2-.19-1.74H12v3.32h5.38a4.6 4.6 0 0 1-1.99 2.93v2.15h3.22c1.89-1.74 2.74-4.31 2.74-6.66Z" fill="#4285F4" />
      <path d="M12 21.7c2.7 0 4.96-.89 6.61-2.42l-3.22-2.57c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.13H3.08v2.23A9.99 9.99 0 0 0 12 21.7Z" fill="#34A853" />
      <path d="M6.4 13.54a6 6 0 0 1 0-3.83V7.48H3.08a9.99 9.99 0 0 0 0 8.29l3.32-2.23Z" fill="#FBBC04" />
      <path d="M12 5.58c1.47 0 2.79.5 3.83 1.5l2.85-2.85A9.56 9.56 0 0 0 12 1.55a9.99 9.99 0 0 0-8.92 5.93L6.4 9.71C7.19 7.34 9.4 5.58 12 5.58Z" fill="#EA4335" />
    </svg>
  );
}

export function AccountPanel() {
  const [configuration] = useState(publicSupabaseConfiguration);
  const [client] = useState<SupabaseClient | null>(() => (
    configuration ? browserSupabaseClient(configuration) : null
  ));
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<PagePhase>(configuration ? "loading" : "unconfigured");
  const [displayName, setDisplayName] = useState("");
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionUserId = session?.user.id ?? null;
  const profileSeedName = session ? initialDisplayName(session.user) : "";

  useEffect(() => {
    if (!client) return;
    let alive = true;

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setPhase("ready");
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) {
        setSession(nextSession);
        setPhase("ready");
      }
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!client || !sessionUserId) return;

    let alive = true;
    void readOrCreateProfile(client, sessionUserId, profileSeedName)
      .then((name) => {
        if (alive) {
          setDisplayName(name);
          setProfileUserId(sessionUserId);
        }
      })
      .catch((profileError: unknown) => {
        if (alive) {
          setError(profileError instanceof Error ? profileError.message : "Profilen kunde inte läsas.");
        }
      });
    return () => {
      alive = false;
    };
  }, [client, profileSeedName, sessionUserId]);

  const profileLoading = Boolean(sessionUserId && profileUserId !== sessionUserId);

  async function runAuthAction(label: string, action: () => Promise<{ error: Error | null }>) {
    setBusyAction(label);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      if (result.error) setError(result.error.message);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Inloggningen kunde inte startas.");
    } finally {
      setBusyAction(null);
    }
  }

  function googleRedirect() {
    return `${window.location.origin}/konto`;
  }

  async function continueAsGuest() {
    if (!client) return;
    await runAuthAction("guest", async () => {
      const result = await client.auth.signInAnonymously();
      return { error: result.error };
    });
  }

  async function signInWithGoogle() {
    if (!client) return;
    await runAuthAction("signin", async () => {
      const result = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: googleRedirect() },
      });
      return { error: result.error };
    });
  }

  async function secureGuestWithGoogle() {
    if (!client) return;
    await runAuthAction("link", async () => {
      const result = await client.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: googleRedirect() },
      });
      return { error: result.error };
    });
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !session) return;
    const validationError = displayNameError(displayName);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusyAction("profile");
    setError(null);
    setMessage(null);
    const normalized = displayName.trim();
    const result = await client
      .from("profiles")
      .update({ display_name: normalized, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id)
      .select("display_name")
      .single<ProfileRow>();
    if (result.error) {
      setError(result.error.message);
    } else {
      setDisplayName(result.data.display_name);
      setMessage("Spelarnamnet är sparat.");
    }
    setBusyAction(null);
  }

  async function signOut() {
    if (!client) return;
    await runAuthAction("signout", async () => {
      const result = await client.auth.signOut();
      return { error: result.error };
    });
  }

  if (phase === "loading") {
    return (
      <section className={styles.panel} aria-busy="true">
        <span className={styles.loadingDot} />
        <p className={styles.loadingText}>Läser din spelarsession…</p>
      </section>
    );
  }

  if (phase === "unconfigured") {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>KONTO EJ ANSLUTET</p>
        <h2>Auth saknas i den här miljön.</h2>
        <p className={styles.bodyCopy}>Supabase URL och publishable key behöver finnas som publika miljövariabler.</p>
        <Link className={styles.secondaryButton} href="/">Till startsidan</Link>
      </section>
    );
  }

  if (!session) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>ENKELT OCH SÄKERT</p>
        <h2>Välj hur du vill fortsätta.</h2>
        <p className={styles.bodyCopy}>Google gör kontot tillgängligt på fler enheter. Gästläget tar dig direkt till bordet utan personuppgifter.</p>

        <div className={styles.authStack}>
          <button className={styles.googleButton} disabled={busyAction !== null} onClick={signInWithGoogle} type="button">
            <GoogleMark />
            {busyAction === "signin" ? "Öppnar Google…" : "Fortsätt med Google"}
          </button>
          <button className={styles.secondaryButton} disabled={busyAction !== null} onClick={continueAsGuest} type="button">
            {busyAction === "guest" ? "Skapar gästkonto…" : "Fortsätt som gäst"}
          </button>
        </div>

        <p className={styles.finePrint}>Endast play money. Inga köp, insättningar eller uttag.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    );
  }

  const isGuest = session.user.is_anonymous === true;

  return (
    <section className={styles.panel}>
      <div className={styles.accountHeading}>
        <div>
          <p className={styles.eyebrow}>DITT SPELARKONTO</p>
          <h2>{profileLoading ? "Laddar profil…" : displayName || "Spelare"}</h2>
        </div>
        <span className={isGuest ? styles.guestBadge : styles.secureBadge}>
          <i /> {isGuest ? "Gäst" : "Säkrat"}
        </span>
      </div>

      <div className={styles.identityCard}>
        <div className={styles.avatar}>{(displayName || "S").slice(0, 1).toUpperCase()}</div>
        <div>
          <span>Inloggning</span>
          <strong>{providerLabel(session.user)}</strong>
          <small>Spelar-id · {session.user.id.slice(0, 8)}</small>
        </div>
      </div>

      <form className={styles.profileForm} onSubmit={saveProfile}>
        <label htmlFor="display-name">Spelarnamn vid bordet</label>
        <div className={styles.inputRow}>
          <input
            disabled={profileLoading || busyAction === "profile"}
            id="display-name"
            maxLength={32}
            minLength={2}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
          <button disabled={profileLoading || busyAction !== null} type="submit">
            {busyAction === "profile" ? "Sparar…" : "Spara"}
          </button>
        </div>
      </form>

      {isGuest ? (
        <div className={styles.upgradeCard}>
          <span className={styles.upgradeGlow} />
          <p className={styles.eyebrow}>BEHÅLL SAMMA SPELAR-ID</p>
          <h3>Säkra gästkontot.</h3>
          <p>Google länkas till den här identiteten, så bord, profil och PLAY-historik fortsätter på samma konto.</p>
          <button className={styles.googleButton} disabled={busyAction !== null} onClick={secureGuestWithGoogle} type="button">
            <GoogleMark />
            {busyAction === "link" ? "Öppnar Google…" : "Säkra med Google"}
          </button>
          <button className={styles.textButton} disabled={busyAction !== null} onClick={signInWithGoogle} type="button">
            Jag har redan ett Google-konto
          </button>
          <small>Väljer du ett befintligt konto flyttas inte den här gästens saldo automatiskt ännu.</small>
        </div>
      ) : (
        <div className={styles.accountActions}>
          <Link className={styles.primaryLink} href="/blackjack">Spela blackjack</Link>
          <button className={styles.textButton} disabled={busyAction !== null} onClick={signOut} type="button">
            {busyAction === "signout" ? "Loggar ut…" : "Logga ut"}
          </button>
        </div>
      )}

      <div className={styles.statusLine} aria-live="polite">
        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
