import type { Metadata } from "next";
import Link from "next/link";

import { AccountPanel } from "./account-panel";
import styles from "./account.module.css";

export const metadata: Metadata = {
  description: "Se ditt riktiga PLAY-saldo, spelresultat och din spelarprofil på Spelsajt.",
  title: "Spelarkonto – Spelsajt",
};

export default function AccountPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className="brand" href="/" aria-label="Spelsajt startsida">
          <span className="brand-mark">S</span>
          <span>Spelsajt</span>
        </Link>
        <nav className={styles.accountNav} aria-label="Kontonavigering">
          <Link href="/blackjack">Blackjack</Link>
          <Link href="/roulette">Roulette</Link>
          <a aria-current="page" href="#profil">Profil</a>
        </nav>
        <Link className={styles.backLink} href="/">Till lobbyn <span>→</span></Link>
      </header>

      <section className={styles.layout}>
        <div className={styles.intro}>
          <div>
            <p className="kicker">SPELARKONTO</p>
            <h1>Din spelöversikt.</h1>
          </div>
          <p>Saldo, resultat och rundor kommer från samma auktoritativa spelserver som borden använder. Inga påhittade dashboardvärden.</p>
        </div>

        <AccountPanel />
      </section>
    </main>
  );
}
