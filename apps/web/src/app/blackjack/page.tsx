import type { Metadata } from "next";

import { LiveGameTable } from "../_components/live-game/live-game-table";

export const metadata: Metadata = {
  description: "Spela serverstyrd play-money-blackjack med auktoritativa v2-events.",
  title: "Spela blackjack · Spelsajt",
};

export default function BlackjackPage() {
  return <LiveGameTable game="blackjack" />;
}
