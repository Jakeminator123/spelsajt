import type { Metadata } from "next";

import { LiveGameTable } from "../_components/live-game/live-game-table";

export const metadata: Metadata = {
  description: "Spela serverstyrd europeisk play-money-roulette med auktoritativa v2-events.",
  title: "Spela roulette · Spelsajt",
};

export default function RoulettePage() {
  return <LiveGameTable game="roulette" />;
}
