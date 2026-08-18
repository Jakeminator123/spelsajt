import type { Metadata } from "next";
import { systemModel } from "@spelsajt/system-model";

import { SystemCanvas } from "./_components/system-canvas";

export const metadata: Metadata = {
  description: "Körbar systemmodell för Spelsajts blackjack- och rouletteflöden.",
  title: "Systemmodell | Spelsajt",
};

export default function SystemPage() {
  const serializableSystemModel = structuredClone(systemModel);

  return <SystemCanvas model={serializableSystemModel} />;
}
