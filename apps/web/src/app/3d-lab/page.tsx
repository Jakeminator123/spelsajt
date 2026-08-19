import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";
import Link from "next/link";

import { DealerLabLoader } from "../_components/asset-lab/dealer-lab-loader";
import { LAB_ASSETS, type LabAsset } from "../_components/asset-lab/lab-assets";
import styles from "./three-d-lab.module.css";

export const metadata: Metadata = {
  description: "Lokalt inspektionsrum för riggade avatarer, bord och animationer.",
  title: "3D-labb – Spelsajt",
};

function localLabAssets(): readonly LabAsset[] {
  if (process.env.NODE_ENV !== "development") {
    return [];
  }

  const localFileExists = (url: string) => (
    existsSync(join(process.cwd(), "public", url.replace(/^\//, "")))
  );

  return LAB_ASSETS
    .filter((asset) => localFileExists(asset.modelUrl))
    .map((asset) => ({
      ...asset,
      animationUrls: asset.animationUrls.filter(localFileExists),
    }));
}

export default function ThreeDLabPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <span>S</span>
          Spelsajt
        </Link>
        <div className={styles.title}>
          <p>INTERNT PRESENTATIONSLABB</p>
          <h1>Character room <span>/ 3D-inspektion</span></h1>
        </div>
        <Link className={styles.backLink} href="/">Till startsidan</Link>
      </header>

      <div className={styles.notice} role="note">
        <span>LABB</span>
        <p>Den här sidan granskar endast visuella tillgångar. Den ansluter inte till game-servern och kan aldrig välja kort, utfall eller saldo.</p>
      </div>

      <DealerLabLoader assets={localLabAssets()} />
    </main>
  );
}
