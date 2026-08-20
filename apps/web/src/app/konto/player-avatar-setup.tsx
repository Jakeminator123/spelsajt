"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useState } from "react";

import {
  deletePlayerAvatar,
  getPlayerAvatarStatus,
  startPlayerAvatarGeneration,
} from "../_components/player-avatar/avatar-client";
import {
  PLAYER_AVATAR_ANIMATIONS,
  type PlayerAvatarStatus,
} from "../_components/player-avatar/avatar-contract";
import { preparePlayerAvatarInput } from "../_components/player-avatar/avatar-image";
import styles from "./account.module.css";

const ACTIVE_STATES = new Set(["image", "rigging", "animating", "storing"]);

export function PlayerAvatarSetup({
  accessToken,
  isGuest,
}: {
  readonly accessToken: string;
  readonly isGuest: boolean;
}) {
  const [status, setStatus] = useState<PlayerAvatarStatus | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"delete" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobToken = status?.jobToken ?? null;
  const pipelineState = status?.state ?? "empty";

  useEffect(() => {
    if (isGuest) return;
    const controller = new AbortController();
    void getPlayerAvatarStatus(accessToken)
      .then((next) => {
        if (!controller.signal.aborted) setStatus(next);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      });
    return () => controller.abort();
  }, [accessToken, isGuest]);

  useEffect(() => {
    if (!jobToken || !ACTIVE_STATES.has(pipelineState)) return;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await getPlayerAvatarStatus(accessToken, jobToken);
        if (active) {
          setStatus(next);
          setError(next.error);
        }
      } catch (requestError) {
        if (!active) return;
        setError(errorMessage(requestError));
        try {
          const current = await getPlayerAvatarStatus(accessToken);
          if (active) setStatus(current);
        } catch {
          // The interval retries transient status failures without restarting the generation.
        }
      } finally {
        inFlight = false;
      }
    };
    const interval = window.setInterval(() => void poll(), 4_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [accessToken, jobToken, pipelineState]);

  async function start(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !consent || busy) return;
    setBusy("start");
    setError(null);
    try {
      const photo = await preparePlayerAvatarInput(file);
      const next = await startPlayerAvatarGeneration(accessToken, photo);
      setStatus(next);
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy("delete");
    setError(null);
    try {
      await deletePlayerAvatar(accessToken);
      setStatus(await getPlayerAvatarStatus(accessToken));
      setConsent(false);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy(null);
    }
  }

  if (isGuest) {
    return (
      <section className={`${styles.settingsCard} ${styles.avatarCard}`}>
        <AvatarHeading status="Kräver säkrat konto" />
        <p className={styles.settingsCopy}>
          Länka gästkontot till Google först. Då kan du alltid komma tillbaka till identiteten
          och radera både avatarfiler och ett pågående leverantörsjobb.
        </p>
      </section>
    );
  }

  const active = Boolean(status && ACTIVE_STATES.has(status.state));
  const ready = status?.state === "ready" && status.modelAvailable;
  const progress = status?.progress ?? 0;

  return (
    <section className={`${styles.settingsCard} ${styles.avatarCard}`} id="avatar">
      <AvatarHeading status={ready ? "Redo vid bordet" : active ? stageLabel(status!.state) : "Valfri"} />

      <div className={styles.avatarLayout}>
        <div>
          <p className={styles.settingsCopy}>
            Välj en tydlig helkroppsbild av dig själv. Bilden skalas om och rensas från EXIF i
            webbläsaren, skickas direkt till Meshy som privat data-URI och sparas aldrig av oss.
            Den riggade avataren och fem granskade animationer kopieras till privat Vercel Blob.
          </p>

          {status?.available === false ? (
            <p className={styles.avatarNotice}>{status.unavailableReason}</p>
          ) : (
            <label className={styles.consentRow}>
              <input
                checked={consent}
                disabled={busy !== null || active}
                onChange={(event) => setConsent(event.target.checked)}
                type="checkbox"
              />
              <span>
                Jag äger bilden, den visar bara mig och jag godkänner överföring till Meshy för
                3D-generering. Jag förstår att en generering kostar cirka 50 Meshy-krediter.
              </span>
            </label>
          )}

          <div className={styles.avatarActions}>
            {status?.available ? (
              <label aria-disabled={!consent || active || busy !== null} className={styles.avatarUpload}>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  disabled={!consent || active || busy !== null}
                  onChange={start}
                  type="file"
                />
                {busy === "start" ? "Bearbetar bilden…" : ready ? "Skapa ny avatar" : "Ta eller välj bild"}
              </label>
            ) : null}
            {(ready || active || status?.state === "failed") ? (
              <button className={styles.avatarDelete} disabled={busy !== null} onClick={remove} type="button">
                {busy === "delete" ? "Raderar…" : active ? "Avbryt och radera" : "Radera avatar"}
              </button>
            ) : null}
            {ready ? <Link className={styles.avatarLabLink} href="/3d-lab#player-avatar">Granska i 3D-labbet</Link> : null}
          </div>
          <small className={styles.avatarFinePrint}>
            JPG, PNG eller WebP · högst 8 MB/16 MP · en start per timme · högst tre per 30 dagar.
          </small>
        </div>

        <div className={styles.avatarProgress} data-ready={ready ? "true" : "false"}>
          <span>{ready ? "100" : String(progress)}%</span>
          <div aria-label={`Avatargenerering ${progress} procent`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress} role="progressbar">
            <i style={{ width: `${progress}%` }} />
          </div>
          <strong>{ready ? "Riggad GLB klar" : active ? stageLabel(status!.state) : "Ingen aktiv generering"}</strong>
          {ready ? (
            <ul>
              {PLAYER_AVATAR_ANIMATIONS.map((animation) => (
                <li data-ready={status.animationKeys.includes(animation.key)} key={animation.key}>
                  {animation.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}

function AvatarHeading({ status }: { readonly status: string }) {
  return (
    <div className={styles.cardHeading}>
      <div>
        <p className={styles.eyebrow}>PERSONLIG 3D-AVATAR</p>
        <h3>Skapa din plats vid bordet</h3>
      </div>
      <span>{status}</span>
    </div>
  );
}

function stageLabel(state: PlayerAvatarStatus["state"]): string {
  if (state === "image") return "Meshy bygger 3D-modellen";
  if (state === "rigging") return "Skelettet riggas";
  if (state === "animating") return "Animationerna skapas";
  if (state === "storing") return "Filerna säkras privat";
  return "Avatarjobbet bearbetas";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Avatarjobbet misslyckades.";
}
