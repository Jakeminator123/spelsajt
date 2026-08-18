"use client";

import type { GameEventV2, GameSnapshotV2 } from "@spelsajt/contracts";
import { useState } from "react";

import {
  verifySettledRound,
  type FairnessVerification,
} from "./fairness-verifier";
import styles from "./live-game.module.css";

export function FairnessPanel({
  events,
  snapshot,
}: {
  readonly events: readonly GameEventV2[];
  readonly snapshot: GameSnapshotV2;
}) {
  const [result, setResult] = useState<FairnessVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const verify = async () => {
    setVerifying(true);
    try {
      setResult(await verifySettledRound(snapshot, events));
    } catch (error) {
      setResult({
        detail: error instanceof Error ? error.message : "Ett okänt verifieringsfel inträffade.",
        evidence: [],
        status: "failed",
        title: "Verifieringen kunde inte köras",
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section className={styles.fairnessPanel} aria-labelledby="fairness-title">
      <div className={styles.fairnessHeading}>
        <div>
          <span>PROVABLY FAIR · WEB CRYPTO</span>
          <h2 id="fairness-title">Verifiera rundan själv</h2>
          <p>
            Webbläsaren återskapar utfallet från server seed, ditt client seed, nonce och rulesethash.
            Kontrollen påverkar aldrig spelet eller saldot.
          </p>
        </div>
        <button disabled={verifying} onClick={() => void verify()} type="button">
          {verifying ? "Verifierar…" : "Kör verifiering"}
        </button>
      </div>

      {result ? (
        <div className={styles.fairnessResult} data-status={result.status} role="status">
          <div>
            <strong>{result.title}</strong>
            <p>{result.detail}</p>
          </div>
          {result.evidence.length ? (
            <details>
              <summary>Visa kryptografisk evidens</summary>
              <dl>
                {result.evidence.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd><code>{item.value}</code></dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
