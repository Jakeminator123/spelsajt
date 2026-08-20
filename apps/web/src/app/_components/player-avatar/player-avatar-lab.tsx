"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";

import {
  browserSupabaseClient,
  publicSupabaseConfiguration,
} from "../live-game/game-session";
import { GeneratedPlayerAvatar } from "../scene/generated-player-avatar";
import {
  downloadPlayerAvatarAssetUrl,
  getPlayerAvatarStatus,
} from "./avatar-client";
import styles from "./player-avatar-lab.module.css";

function PreviewCamera() {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
  }, [camera]);
  return null;
}

export function PlayerAvatarLab() {
  const configuration = useMemo(() => publicSupabaseConfiguration(), []);
  const [phase, setPhase] = useState<"loading" | "missing" | "ready">(
    configuration ? "loading" : "missing",
  );
  const [displayName, setDisplayName] = useState("Spelare");
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!configuration) return;
    const client = browserSupabaseClient(configuration);
    let active = true;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const sessionResult = await client.auth.getSession();
        const session = sessionResult.data.session;
        if (!session || session.user.is_anonymous) {
          if (active) setPhase("missing");
          return;
        }
        const profile = await client
          .from("profiles")
          .select("display_name")
          .eq("user_id", session.user.id)
          .maybeSingle<{ display_name: string }>();
        if (profile.data && active) setDisplayName(profile.data.display_name);
        const status = await getPlayerAvatarStatus(session.access_token);
        if (!status.modelAvailable) {
          if (active) setPhase("missing");
          return;
        }
        objectUrl = await downloadPlayerAvatarAssetUrl(session.access_token, "idle");
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setModelUrl(objectUrl);
        setPhase("ready");
      } catch {
        if (active) setPhase("missing");
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [configuration]);

  return (
    <section className={styles.lab} id="player-avatar">
      <div className={styles.copy}>
        <p>DIN PRIVATA MODELL</p>
        <h2>Spelaravatar</h2>
        <span>
          Här granskas endast den inloggade spelarens privata idle-GLB. Modellen påverkar
          aldrig kort, rouletteutfall, saldo eller behörighet.
        </span>
        {phase === "missing" ? <Link href="/konto#avatar">Skapa avatar på kontosidan</Link> : null}
      </div>
      <div className={styles.preview} aria-busy={phase === "loading"}>
        {phase === "ready" && modelUrl ? (
          <Canvas camera={{ fov: 34, position: [0, 1.25, 4.2] }} dpr={[1, 1.5]}>
            <color attach="background" args={["#0a0b10"]} />
            <PreviewCamera />
            <ambientLight intensity={0.7} />
            <directionalLight intensity={2.7} position={[-3, 5, 4]} />
            <GeneratedPlayerAvatar
              active={false}
              identity={{ displayName }}
              modelUrl={modelUrl}
              position={[0, 0, 0]}
              reduceMotion={reduceMotion}
              rotationY={0}
              targetHeight={2}
            />
            <Environment resolution={128}>
              <Lightformer color="#c6f24e" intensity={2} position={[3, 2, 2]} scale={3} />
              <Lightformer color="#7c5cff" intensity={1.8} position={[-3, 2, 2]} scale={3} />
            </Environment>
          </Canvas>
        ) : (
          <p>{phase === "loading" ? "Läser privat avatar…" : "Ingen färdig avatar hittades."}</p>
        )}
      </div>
    </section>
  );
}
