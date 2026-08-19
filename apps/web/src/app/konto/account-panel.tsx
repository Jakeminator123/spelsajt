"use client";

import type { AccountSummaryV2 } from "@spelsajt/contracts";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import {
  browserSupabaseClient,
  publicGameConfiguration,
  publicSupabaseConfiguration,
} from "../_components/live-game/game-session";
import {
  displayNameError,
  initialDisplayName,
  profileLoadPhase,
} from "./account-profile";
import { AccountDashboard, type AccountSummaryPhase } from "./account-dashboard";
import { fetchAccountSummary } from "./account-summary";
import styles from "./account.module.css";

interface ProfileRow {
  readonly display_name: string;
}

type PagePhase = "loading" | "ready" | "unconfigured";

interface SummaryRequestState {
  readonly error: string | null;
  readonly key: string;
  readonly summary: AccountSummaryV2 | null;
}

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
  const [gameServerUrl] = useState(() => publicGameConfiguration()?.gameServerUrl ?? null);
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<PagePhase>(configuration ? "loading" : "unconfigured");
  const [displayName, setDisplayName] = useState("");
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileFailedUserId, setProfileFailedUserId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryRequest, setSummaryRequest] = useState<SummaryRequestState>({
    error: null,
    key: "",
    summary: null,
  });
  const [summaryReload, setSummaryReload] = useState(0);
  const sessionUserId = session?.user.id ?? null;
  const profileSeedName = session ? initialDisplayName(session.user) : "";
  const accessToken = session?.access_token ?? null;
  const summaryRequestKey = accessToken && gameServerUrl
    ? `${accessToken}:${summaryReload}`
    : null;
  const summaryPhase: AccountSummaryPhase = !accessToken
    ? "idle"
    : !gameServerUrl
      ? "unconfigured"
      : summaryRequest.key !== summaryRequestKey
        ? "loading"
        : summaryRequest.error
          ? "error"
          : "ready";
  const summary = summaryRequest.key === summaryRequestKey ? summaryRequest.summary : null;
  const summaryError = summaryRequest.key === summaryRequestKey ? summaryRequest.error : null;

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
          setProfileFailedUserId(null);
          setProfileError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (alive) {
          setProfileFailedUserId(sessionUserId);
          setProfileError(requestError instanceof Error ? requestError.message : "Profilen kunde inte läsas.");
        }
      });
    return () => {
      alive = false;
    };
  }, [client, profileSeedName, sessionUserId]);

  useEffect(() => {
    if (!accessToken || !gameServerUrl || !summaryRequestKey) return;

    const controller = new AbortController();
    void fetchAccountSummary(gameServerUrl, accessToken, controller.signal)
      .then((nextSummary) => {
        if (!controller.signal.aborted) {
          setSummaryRequest({ error: null, key: summaryRequestKey, summary: nextSummary });
        }
      })
      .catch((summaryRequestError: unknown) => {
        if (!controller.signal.aborted) {
          setSummaryRequest({
            error: summaryRequestError instanceof Error
              ? summaryRequestError.message
              : "Spelöversikten kunde inte hämtas.",
            key: summaryRequestKey,
            summary: null,
          });
        }
      });
    return () => controller.abort();
  }, [accessToken, gameServerUrl, summaryRequestKey]);

  const currentProfilePhase = profileLoadPhase(
    sessionUserId,
    profileUserId,
    profileFailedUserId,
  );
  const profileLoading = currentProfilePhase === "loading";
  const profileFailed = currentProfilePhase === "error";

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
  const accountName = profileLoading
    ? "Laddar profil…"
    : profileFailed
      ? "Profilen kunde inte laddas"
      : displayName || "Spelare";

  return (
    <section className={styles.dashboard}>
      <header className={styles.playerHero}>
        <div className={styles.playerIdentity}>
          <div className={styles.heroAvatar} aria-hidden="true">
            {(displayName || "S").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className={styles.eyebrow}>DIN PLATS VID BORDET</p>
            <h1>{accountName}</h1>
            <div className={styles.identityMeta}>
              <span>{providerLabel(session.user)}</span>
              <span>Spelar-id {session.user.id.slice(0, 8)}</span>
            </div>
          </div>
        </div>
        <div className={styles.heroActions}>
          <span className={isGuest ? styles.guestBadge : styles.secureBadge}>
            <i /> {isGuest ? "Gästkonto" : "Säkrat konto"}
          </span>
          <Link className={styles.primaryLink} href="/blackjack">Spela blackjack</Link>
        </div>
      </header>

      <AccountDashboard
        onReload={() => setSummaryReload((current) => current + 1)}
        phase={summaryPhase}
        summary={summary}
        summaryError={summaryError}
      />

      <div className={styles.settingsGrid}>
        <section className={styles.settingsCard} id="profil">
          <div className={styles.cardHeading}>
            <div>
              <p className={styles.eyebrow}>PROFIL</p>
              <h3>Spelarnamn</h3>
            </div>
            <span>Syns vid bordet</span>
          </div>
          <form className={styles.profileForm} onSubmit={saveProfile}>
            <label htmlFor="display-name">Visningsnamn</label>
            <div className={styles.inputRow}>
              <input
                disabled={profileLoading || profileFailed || busyAction === "profile"}
                id="display-name"
                maxLength={32}
                minLength={2}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
              <button disabled={profileLoading || profileFailed || busyAction !== null} type="submit">
                {busyAction === "profile" ? "Sparar…" : "Spara"}
              </button>
            </div>
          </form>
        </section>

        {isGuest ? (
          <section className={`${styles.settingsCard} ${styles.upgradeCard}`}>
            <span className={styles.upgradeGlow} />
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.eyebrow}>BEHÅLL SAMMA SPELAR-ID</p>
                <h3>Säkra gästkontot</h3>
              </div>
            </div>
            <p>Google länkas till identiteten du redan använder. Profil, PLAY-saldo och historik stannar på samma konto.</p>
            <button className={styles.googleButton} disabled={busyAction !== null} onClick={secureGuestWithGoogle} type="button">
              <GoogleMark />
              {busyAction === "link" ? "Öppnar Google…" : "Säkra med Google"}
            </button>
            <button className={styles.textButton} disabled={busyAction !== null} onClick={signInWithGoogle} type="button">
              Jag har redan ett annat Google-konto
            </button>
            <small>Ett befintligt annat konto övertar inte gästens saldo automatiskt ännu.</small>
          </section>
        ) : (
          <section className={styles.settingsCard}>
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.eyebrow}>KONTOSÄKERHET</p>
                <h3>Google är anslutet</h3>
              </div>
              <span className={styles.secureStatus}><i /> Aktiv</span>
            </div>
            <p className={styles.settingsCopy}>Du kan komma tillbaka till samma spelar-id, saldo och historik på fler enheter.</p>
            <button className={styles.signOutButton} disabled={busyAction !== null} onClick={signOut} type="button">
              {busyAction === "signout" ? "Loggar ut…" : "Logga ut"}
            </button>
          </section>
        )}
      </div>

      <div className={styles.statusLine} aria-live="polite">
        {message ? <p className={styles.success}>{message}</p> : null}
        {profileFailed && profileError ? <p className={styles.error} role="alert">{profileError}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
