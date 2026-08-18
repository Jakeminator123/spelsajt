import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  description:
    "Spelsajt är en play-money-plattform med blackjack, roulette, slots, live casino och sportbok — all casinokänsla, noll risk.",
  title: "Spelsajt - Casino & Sportbok på play money",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#08090c",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="sv" className={`${interTight.variable} ${bricolage.variable}`}>
      <body>{children}</body>
    </html>
  );
}
