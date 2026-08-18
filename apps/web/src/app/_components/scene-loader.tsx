"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

const CasinoScene = dynamic(
  () => import("./casino-scene").then((module) => module.CasinoScene),
  {
    loading: () => <div className="scene-loading">Dukar upp bordet...</div>,
    ssr: false,
  },
);

export function SceneLoader() {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = shellRef.current;
    if (!node) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const progress = rect.top / window.innerHeight;
        node.style.setProperty("--parallax", `${(progress * -26).toFixed(2)}px`);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-label="Inspelad demonstration av den eventstyrda casinopresentationen"
      className="scene-shell"
      ref={shellRef}
      role="region"
    >
      <span aria-hidden="true" className="scene-glow scene-glow-a" />
      <span aria-hidden="true" className="scene-glow scene-glow-b" />
      <CasinoScene />
      <div className="scene-caption">
        <span><i /> INSPELAD DEMO</span>
        <strong>V2-events · inspelat resultat</strong>
      </div>
    </div>
  );
}
