import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description: "En modern play-money-plattform för blackjack och europeisk roulette.",
  title: "Spelsajt - Play Money, Real Feel",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07110d",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
