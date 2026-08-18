import Image from "next/image";

import { JackpotCounter } from "./_components/jackpot-counter";
import { Reveal } from "./_components/reveal";
import { SceneLoader } from "./_components/scene-loader";
import { WinnersTicker } from "./_components/winners-ticker";

const navLinks = [
  { label: "Casino", href: "#casino" },
  { label: "Live", href: "#live" },
  { label: "Sport", href: "#sport" },
  { label: "Kampanjer", href: "#kampanjer" },
];

const games = [
  {
    title: "Blackjack",
    tag: "Bordsspel",
    image: "/images/game-blackjack.png",
    players: "312 spelare",
    description: "Sex lekar, S17 och verifierbar shuffle.",
    live: true,
  },
  {
    title: "European Roulette",
    tag: "Bordsspel",
    image: "/images/game-roulette.png",
    players: "198 spelare",
    description: "Ett nollfält och serverbestämt utfall.",
    live: true,
  },
  {
    title: "Golden Sevens",
    tag: "Slots",
    image: "/images/game-slots.png",
    players: "540 spelare",
    description: "96,4% RTP och free spins-läge.",
    live: false,
  },
  {
    title: "Live Baccarat",
    tag: "Live casino",
    image: "/images/game-live.png",
    players: "87 spelare",
    description: "Riktig dealer i realtid, HD-stream.",
    live: true,
  },
  {
    title: "Texas Hold'em",
    tag: "Poker",
    image: "/images/game-poker.png",
    players: "126 spelare",
    description: "Cash games och snabbturneringar.",
    live: false,
  },
];

const sportsEvents = [
  {
    league: "Allsvenskan",
    home: "AIK",
    away: "Djurgården",
    time: "Idag 19:00",
    odds: [
      { label: "1", value: "2.35" },
      { label: "X", value: "3.10" },
      { label: "2", value: "2.90" },
    ],
  },
  {
    league: "Premier League",
    home: "Arsenal",
    away: "Chelsea",
    time: "Idag 21:00",
    odds: [
      { label: "1", value: "1.85" },
      { label: "X", value: "3.60" },
      { label: "2", value: "4.20" },
    ],
  },
  {
    league: "NHL",
    home: "Rangers",
    away: "Bruins",
    time: "Imorgon 01:30",
    odds: [
      { label: "1", value: "2.10" },
      { label: "X", value: "4.00" },
      { label: "2", value: "2.55" },
    ],
  },
];

const perks = [
  {
    title: "Provably fair",
    copy: "Varje utfall signeras med HMAC-SHA256 och kan verifieras i efterhand.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Realtidsmotor",
    copy: "Fastify och Socket.IO driver bordet — utfallet syns direkt i 3D-världen.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
      </svg>
    ),
  },
  {
    title: "100% play money",
    copy: "Spela riskfritt. Inga insättningar, inga uttag, bara ren speldesign.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.9 2.5 2-1.1 2-2.5 2A2.5 2.5 0 0 1 9.5 15" />
        <path d="M12 6v1.5M12 16.5V18" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <main>
      <header className="topbar" id="top">
        <a className="brand" href="#top" aria-label="Spelsajt startsida">
          <span className="brand-mark">S</span>
          <span>Spelsajt</span>
        </a>
        <nav className="topnav" aria-label="Huvudnavigering">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
        <div className="topbar-actions">
          <span className="balance-chip" aria-label="Ditt play money-saldo">
            <i /> 5 000 <small>PLAY</small>
          </span>
          <button className="primary-button compact" type="button">
            Logga in
          </button>
        </div>
      </header>

      <WinnersTicker />

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">PLAY MONEY · REAL FEEL</p>
          <h1>
            Casinokänslan.
            <span>Utan att riskera en krona.</span>
          </h1>
          <p className="lede">
            Blackjack, roulette, slots och live casino i en och samma värld — med en
            auktoritativ spelmotor som avgör varje utfall och en 3D-scen som reagerar direkt.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#casino">Spela nu</a>
            <a className="ghost-button" href="#sport">Till sportboken</a>
          </div>
          <dl className="hero-metrics">
            <div><dt>120+</dt><dd>spel</dd></div>
            <div><dt>37</dt><dd>roulettefickor</dd></div>
            <div><dt>100%</dt><dd>play money</dd></div>
          </dl>
        </div>

        <div className="hero-visual">
          <SceneLoader />
          <div className="jackpot-card">
            <span className="jackpot-label"><i /> MEGA JACKPOT</span>
            <strong className="jackpot-value">
              <JackpotCounter target={2847513} /> <em>PLAY</em>
            </strong>
            <span className="jackpot-sub">Växer varje sekund · 1 240 spelare online</span>
          </div>
        </div>
      </section>

      <section className="games-section" id="casino">
        <Reveal className="section-heading" as="div">
          <div>
            <p className="kicker">SPELUTBUD</p>
            <h2>Alla favoriter på ett bord.</h2>
          </div>
          <p>Bläddra bland bordsspel, slots och live casino. Fler släpps varje månad.</p>
        </Reveal>

        <div className="game-grid">
          {games.map((game, index) => (
            <Reveal
              className="game-card"
              as="article"
              key={game.title}
              from="up"
              delay={index * 80}
            >
              <div className="game-art">
                <Image
                  src={game.image}
                  alt={`${game.title} – ${game.tag}`}
                  fill
                  sizes="(max-width: 700px) 100vw, 33vw"
                  className="game-image"
                />
                <span className="game-tag">{game.tag}</span>
                {game.live ? <span className="game-live"><i /> LIVE</span> : null}
              </div>
              <div className="game-copy">
                <h3>{game.title}</h3>
                <p>{game.description}</p>
                <div className="game-foot">
                  <span className="game-players"><i /> {game.players}</span>
                  <button className="play-pill" type="button">Spela</button>
                </div>
              </div>
            </Reveal>
          ))}

          <Reveal className="game-card game-card-cta" as="article" from="up" delay={games.length * 80}>
            <div className="cta-inner">
              <span className="game-tag">Snart</span>
              <h3>120+ spel</h3>
              <p>Baccarat, craps, keno och nya slots är på väg in i lobbyn.</p>
              <a className="text-link" href="#kampanjer">Se hela utbudet <span>→</span></a>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="sports-section" id="sport">
        <Reveal className="sports-visual" as="div" from="left">
          <Image
            src="/images/sports-hero.png"
            alt="Upplyst fotbollsarena på natten"
            fill
            sizes="(max-width: 900px) 100vw, 45vw"
            className="sports-image"
          />
          <div className="sports-visual-copy">
            <p className="kicker">NYHET</p>
            <h2>Sportboken<br />är öppen.</h2>
            <p>Tippa matcher live med samma provably fair-motor som casinot.</p>
          </div>
        </Reveal>

        <div className="sports-board">
          <Reveal className="sports-board-head" as="div" from="right">
            <span className="live-dot"><i /> LIVE ODDS</span>
            <h3>Dagens matcher</h3>
          </Reveal>
          {sportsEvents.map((event, index) => (
            <Reveal className="match-row" as="div" key={`${event.home}-${event.away}`} from="right" delay={index * 90}>
              <div className="match-meta">
                <span className="match-league">{event.league}</span>
                <span className="match-time">{event.time}</span>
              </div>
              <div className="match-teams">
                <span>{event.home}</span>
                <b>vs</b>
                <span>{event.away}</span>
              </div>
              <div className="odds-row">
                {event.odds.map((odd) => (
                  <button className="odd-button" type="button" key={odd.label}>
                    <small>{odd.label}</small>
                    <strong>{odd.value}</strong>
                  </button>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="promo-section" id="kampanjer">
        <Reveal className="promo-banner" as="div" from="scale">
          <div className="promo-copy">
            <p className="kicker">VÄLKOMSTBONUS</p>
            <h2>5 000 play money direkt.</h2>
            <p>Skapa ett konto och börja spela på sekunder. Fyll på gratis när du vill.</p>
            <button className="primary-button" type="button">Skapa konto</button>
          </div>
          <div className="promo-chips" aria-hidden="true">
            <span className="promo-chip chip-1" />
            <span className="promo-chip chip-2" />
            <span className="promo-chip chip-3" />
            <span className="promo-chip chip-4" />
          </div>
        </Reveal>
      </section>

      <section className="perks-section" aria-label="Varför Spelsajt">
        <div className="perks-grid">
          {perks.map((perk, index) => (
            <Reveal className="perk-card" as="div" key={perk.title} from="up" delay={index * 100}>
              <span className="perk-icon">{perk.icon}</span>
              <h3>{perk.title}</h3>
              <p>{perk.copy}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <footer>
        <div className="footer-brand">
          <span className="brand-mark">S</span>
          <span>Spelsajt</span>
        </div>
        <p>Play money only · 18+ · Spela ansvarsfullt</p>
        <span>SPJ-001</span>
      </footer>
    </main>
  );
}
