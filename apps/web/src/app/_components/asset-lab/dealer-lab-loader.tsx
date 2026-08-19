"use client";

import dynamic from "next/dynamic";

import type { LabAsset } from "./lab-assets";
import styles from "./dealer-lab.module.css";

const DealerLab = dynamic(
  () => import("./dealer-lab").then((module) => module.DealerLab),
  {
    loading: () => (
      <div className={styles.loader} role="status">
        <span />
        Laddar 3D-labbet…
      </div>
    ),
    ssr: false,
  },
);

export function DealerLabLoader({ assets }: { assets: readonly LabAsset[] }) {
  return <DealerLab assets={assets} />;
}
