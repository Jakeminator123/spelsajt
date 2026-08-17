"use client";

import dynamic from "next/dynamic";

const CasinoScene = dynamic(
  () => import("./casino-scene").then((module) => module.CasinoScene),
  {
    loading: () => <div className="scene-loading">Preparing the table...</div>,
    ssr: false,
  },
);

export function SceneLoader() {
  return (
    <div className="scene-shell" aria-hidden="true">
      <CasinoScene />
      <div className="scene-caption">
        <span><i /> LIVE RENDER</span>
        <strong>Event-driven table preview</strong>
      </div>
    </div>
  );
}
