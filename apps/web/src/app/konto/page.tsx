import type { Metadata } from "next";
import Link from "next/link";

import { AccountPanel } from "./account-panel";
import styles from "./account.module.css";

export const metadata: Metadata = {
  description: "Hantera din gästprofil eller säkra samma play-money-konto med Google.",
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
        <Link className={styles.backLink} href="/">Till lobbyn <span>→</span></Link>
      </header>

      <section className={styles.layout}>
        <div className={styles.intro}>
          <p className="kicker">DIN PLATS VID BORDET</p>
          <h1>Ett konto.<br /><span>Samma spelare.</span></h1>
          <p>Spela direkt som gäst och säkra kontot när du vill. Google kopplas till samma identitet, i stället för att kasta bort det du redan har gjort.</p>

          <div className={styles.promiseGrid}>
            <div><strong>01</strong><span>Gäst direkt</span><small>Ingen registreringsvägg före spelet.</small></div>
            <div><strong>02</strong><span>Samma id</span><small>Profil och play-money-data följer identiteten.</small></div>
            <div><strong>03</strong><span>Play only</span><small>Inga riktiga pengar eller köpbara krediter.</small></div>
          </div>
        </div>

        <AccountPanel />
      </section>
    </main>
  );
}
