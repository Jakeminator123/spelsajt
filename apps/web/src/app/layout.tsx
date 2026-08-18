import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const sora = Sora({
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
  themeColor: "#060f0b",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="sv" className={`${inter.variable} ${sora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
