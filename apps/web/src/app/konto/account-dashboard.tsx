import type { AccountSummaryV2 } from "@spelsajt/contracts";
import type { CSSProperties } from "react";

import {
  accountOutcomeLabel,
  accountOutcomeShares,
  accountWinRate,
  formatPlayAmount,
} from "./account-summary";
import styles from "./account.module.css";

export type AccountSummaryPhase = "idle" | "loading" | "ready" | "error" | "unconfigured";

interface AccountDashboardProps {
  readonly onReload: () => void;
  readonly phase: AccountSummaryPhase;
  readonly summary: AccountSummaryV2 | null;
  readonly summaryError: string | null;
}

function gameLabel(game: "blackjack" | "roulette"): string {
  return game === "blackjack" ? "Blackjack" : "Roulette";
}

function roundDate(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function valueTone(value: string): "negative" | "positive" | "neutral" {
  const amount = BigInt(value);
  if (amount < 0n) return "negative";
  if (amount > 0n) return "positive";
  return "neutral";
}

function SummaryStatus({
  onReload,
  phase,
  summaryError,
}: Pick<AccountDashboardProps, "onReload" | "phase" | "summaryError">) {
  if (phase === "ready") return null;

  return (
    <section className={styles.summaryStatus} aria-busy={phase === "loading"}>
      <span className={styles.statusOrb} data-state={phase} />
      <div>
        <p className={styles.eyebrow}>AUKTORITATIV SPELDATA</p>
        <h3>
          {phase === "loading" || phase === "idle"
            ? "Hämtar din spelöversikt…"
            : phase === "unconfigured"
              ? "Spelservern är inte ansluten här."
              : "Spelöversikten kunde inte hämtas."}
        </h3>
        <p>
          {phase === "unconfigured"
            ? "Profilen fungerar, men den publika spelserveradressen saknas i miljön."
            : phase === "error"
              ? summaryError
              : "Saldo och rundor läses från spelservern."}
        </p>
      </div>
      {phase === "error" ? (
        <button className={styles.compactButton} onClick={onReload} type="button">
          Försök igen
        </button>
      ) : null}
    </section>
  );
}

export function AccountDashboard({
  onReload,
  phase,
  summary,
  summaryError,
}: AccountDashboardProps) {
  if (phase !== "ready" || !summary) {
    return <SummaryStatus onReload={onReload} phase={phase} summaryError={summaryError} />;
  }

  const outcomeShares = accountOutcomeShares(summary.totals);
  const winRate = accountWinRate(summary.totals);

  return (
    <section className={styles.summaryDashboard}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>AUKTORITATIV SPELÖVERSIKT</p>
          <h2>Dina siffror</h2>
        </div>
        <button className={styles.refreshButton} onClick={onReload} type="button">
          <span aria-hidden="true">↻</span> Uppdatera
        </button>
      </div>

      <div className={styles.statGrid} aria-label="Sammanfattning">
        <article className={`${styles.statCard} ${styles.balanceStat}`}>
          <span>Saldo</span>
          <strong>{formatPlayAmount(summary.balance)}</strong>
          <small>{summary.currency} tillgängligt</small>
        </article>
        <article className={styles.statCard}>
          <span>Spelade rundor</span>
          <strong>{summary.totals.rounds}</strong>
          <small>Avgjorda på spelservern</small>
        </article>
        <article className={styles.statCard}>
          <span>Vinstfrekvens</span>
          <strong>{winRate}<small>%</small></strong>
          <small>{summary.totals.wonRounds} vunna rundor</small>
        </article>
        <article className={styles.statCard}>
          <span>Netto</span>
          <strong data-value={valueTone(summary.totals.net)}>
            {formatPlayAmount(summary.totals.net, true)}
          </strong>
          <small>PLAY, insats mot utbetalning</small>
        </article>
      </div>

      <div className={styles.analyticsGrid}>
        <article className={styles.featureCard}>
          <div className={styles.cardHeading}>
            <div>
              <p className={styles.eyebrow}>RESULTAT</p>
              <h3>Utfall över tid</h3>
            </div>
            <span>{summary.totals.rounds} rundor</span>
          </div>
          <div className={styles.outcomeBars}>
            {outcomeShares.map((share) => (
              <div className={styles.outcomeRow} key={share.outcome}>
                <div>
                  <span>{share.label}</span>
                  <strong>{share.rounds}</strong>
                </div>
                <div
                  aria-label={`${share.label}: ${share.rounds} rundor, ${share.percentage} procent`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={share.percentage}
                  className={styles.outcomeTrack}
                  role="progressbar"
                >
                  <i
                    data-outcome={share.outcome}
                    style={{ "--outcome-width": `${share.percentage}%` } as CSSProperties}
                  />
                </div>
                <small>{share.percentage}%</small>
              </div>
            ))}
          </div>
          {summary.totals.rounds === 0 ? (
            <p className={styles.emptyCopy}>Fördelningen visas efter din första avgjorda runda.</p>
          ) : null}
        </article>

        <article className={styles.featureCard}>
          <div className={styles.cardHeading}>
            <div>
              <p className={styles.eyebrow}>PER SPEL</p>
              <h3>Blackjack och roulette</h3>
            </div>
          </div>
          <div className={styles.gameBreakdown}>
            {summary.games.map((game) => (
              <div className={styles.gameRow} key={game.game}>
                <div className={styles.gameIdentity}>
                  <span aria-hidden="true">{game.game === "blackjack" ? "21" : "17"}</span>
                  <div>
                    <strong>{gameLabel(game.game)}</strong>
                    <small>{game.rounds} rundor · {accountWinRate(game)}% vinster</small>
                  </div>
                </div>
                <dl>
                  <div><dt>Insatt</dt><dd>{formatPlayAmount(game.wagered)}</dd></div>
                  <div><dt>Utbetalt</dt><dd>{formatPlayAmount(game.returned)}</dd></div>
                  <div>
                    <dt>Netto</dt>
                    <dd data-value={valueTone(game.net)}>{formatPlayAmount(game.net, true)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className={`${styles.featureCard} ${styles.historyCard}`}>
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.eyebrow}>HISTORIK</p>
            <h3>Senaste rundorna</h3>
          </div>
          <span>Senast avgjorda först</span>
        </div>
        {summary.recentRounds.length === 0 ? (
          <p className={styles.emptyCopy}>Inga avgjorda rundor ännu. När du spelar visas de här.</p>
        ) : (
          <div className={styles.historyTable} role="table" aria-label="Senaste spelrundor">
            <div className={styles.historyHeader} role="row">
              <span role="columnheader">Spel</span>
              <span role="columnheader">Utfall</span>
              <span role="columnheader">Insats</span>
              <span role="columnheader">Utbetalt</span>
              <span role="columnheader">Avgjord</span>
            </div>
            {summary.recentRounds.slice(0, 8).map((round) => (
              <div className={styles.historyRow} key={round.roundId} role="row">
                <strong role="cell">{gameLabel(round.game)}</strong>
                <span data-outcome={round.outcome} role="cell">
                  <i /> {accountOutcomeLabel(round.outcome)}
                </span>
                <span role="cell">{formatPlayAmount(round.wager)} PLAY</span>
                <span role="cell">{formatPlayAmount(round.payout)} PLAY</span>
                <time dateTime={round.settledAt} role="cell">{roundDate(round.settledAt)}</time>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
