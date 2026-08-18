import Image from "next/image";
import Link from "next/link";

import { Reveal } from "./_components/reveal";
import { SceneLoader } from "./_components/scene-loader";
import { LobbyTicker } from "./_components/winners-ticker";

const navLinks = [
  { label: "Start", href: "#mvp" },
  { label: "Spelen", href: "#games" },
  { label: "Under huven", href: "#architecture" },
];

const games = [
  {
    title: "Blackjack",
    tag: "MVP-spel",
    image: "/images/game-blackjack.webp",
    state: "Demobord under utveckling",
    description: "Klassiska beslut, sex lekar och S17 — med hit, stand, double och split i den testade motorn.",
  },
  {
    title: "Europeisk roulette",
    tag: "MVP-spel",
    image: "/images/game-roulette.webp",
    state: "Demobord under utveckling",
    description: "Europeiskt single-zero-bord med alla 37 nummerfält och tio klassiska sätt att placera marker.",
  },
];

const implementationStages = [
  {
    eyebrow: "KLAR KÄRNA",
    title: "Testade spelmotorer",
    copy: "Blackjack och roulette följer frysta regler och är byggda för auktoritativ serverkörning.",
  },
  {
    eyebrow: "DEMO JUST NU",
    title: "Scenen reagerar",
    copy: "3D-bordet spelar upp ett inspelat, validerat eventflöde utan att skapa egna utfall.",
  },
  {
    eyebrow: "NÄSTA STEG",
    title: "Spelbara bord",
    copy: "Inloggning, PLAY-saldo och liveleverans kopplas in innan spelkontrollerna öppnas.",
  },
];

const foundations = [
  {
    title: "Regler som håller",
    copy: "MVP-v2 låser spelbeteendet i maskinläsbara regler och regressionstester.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Verifierbara utfall",
    copy: "Samma seeddata ger samma roulettepocket och blackjackshuffle — varje gång.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
      </svg>
    ),
  },
  {
    title: "Bara play money",
    copy: "MVP:n har inga riktiga pengar, insättningar, uttag eller köpbara krediter.",
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
          <span className="balance-chip" aria-label="Presentationsdemo med play money">
            <i /> DEMO <small>PLAY ONLY</small>
          </span>
          <a className="primary-button compact" href="#games">Se spelen</a>
        </div>
      </header>

      <LobbyTicker />

      <section className="hero" id="mvp">
        <div className="hero-copy">
          <p className="kicker">PLAY MONEY · REAL FEEL</p>
          <h1>
            Casinokänslan.
            <span>Utan att riskera en krona.</span>
          </h1>
          <p className="lede">
            Blackjack och europeisk roulette i en och samma mörka, responsiva värld.
            Testade spelmotorer är byggda för att avgöra utfallen; 3D-bordet visar
            just nu en tydligt märkt presentationsdemo.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#games">Upptäck spelen</a>
            <a className="ghost-button" href="#architecture">Så fungerar det</a>
          </div>
          <dl className="hero-metrics">
            <div><dt>2</dt><dd>klassiska spel</dd></div>
            <div><dt>37</dt><dd>roulettefickor</dd></div>
            <div><dt>100%</dt><dd>play money</dd></div>
          </dl>
        </div>

        <div className="hero-visual">
          <SceneLoader />
          <div className="status-card">
            <span className="status-card-label"><i /> 3D-PRESENTATIONSDEMO</span>
            <strong className="status-card-value">UNDER UTVECKLING</strong>
            <span className="status-card-sub">Inspelat scenario · inget PLAY-saldo påverkas</span>
          </div>
        </div>
      </section>

      <section className="games-section" id="games">
        <Reveal className="section-heading" as="div">
          <div>
            <p className="kicker">TVÅ SPEL · FULLT FOKUS</p>
            <h2>Två klassiker. Byggda rätt.</h2>
          </div>
          <p>Utforska stilen och spelvärlden redan nu. Bordens spelkontroller öppnas när hela serverflödet är inkopplat.</p>
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
                  alt={`${game.title} – visuell konceptbild`}
                  fill
                  sizes="(max-width: 700px) 100vw, 33vw"
                  className="game-image"
                />
                <span className="game-tag">{game.tag}</span>
              </div>
              <div className="game-copy">
                <h3>{game.title}</h3>
                <p>{game.description}</p>
                <div className="game-foot">
                  <span className="game-state"><i /> {game.state}</span>
                  <a className="play-pill" href="#architecture">Läs mer</a>
                </div>
              </div>
            </Reveal>
          ))}

          <Reveal className="game-card game-card-cta" as="article" from="up" delay={games.length * 80}>
            <div className="cta-inner">
              <span className="game-tag">Så fungerar det</span>
              <h3>Verklig känsla.<br />Tydliga gränser.</h3>
              <p>Scenen får liv av spelhändelser men väljer aldrig kort, nummer, vinst eller saldo.</p>
              <a className="text-link" href="#architecture">Titta under huven <span>→</span></a>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="architecture-section" id="architecture">
        <Reveal className="architecture-visual" as="div" from="left">
          <div className="architecture-orbit" aria-hidden="true">
            <span className="architecture-orbit-ring" />
            <span className="architecture-orbit-core">V2</span>
          </div>
          <div className="architecture-visual-copy">
            <p className="kicker">UNDER HUVEN</p>
            <h2>Motorn avgör.<br />Scenen reagerar.</h2>
            <p>3D-presentationen följer spelet. Den får aldrig skriva om det.</p>
          </div>
        </Reveal>

        <div className="architecture-board">
          <Reveal className="architecture-board-head" as="div" from="right">
            <span className="status-dot"><i /> MVP-STATUS</span>
            <h3>Från motor till bord</h3>
          </Reveal>
          {implementationStages.map((stage, index) => (
            <Reveal className="implementation-row" as="article" key={stage.title} from="right" delay={index * 90}>
              <span className="implementation-index">0{index + 1}</span>
              <div>
                <span className="implementation-eyebrow">{stage.eyebrow}</span>
                <h3>{stage.title}</h3>
                <p>{stage.copy}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="promo-section" id="development">
        <Reveal className="promo-banner" as="div" from="scale">
          <div className="promo-copy">
            <p className="kicker">PLAY MONEY PÅ RIKTIGT</p>
            <h2>Byggt för känslan. Aldrig för insättningar.</h2>
            <p>Här står upplevelsen i centrum — utan riktiga pengar. Följ hur motor, fairness och presentation hänger ihop i projektets levande systemkarta.</p>
            <Link className="primary-button" href="/system">Utforska systemkartan</Link>
          </div>
          <div className="promo-chips" aria-hidden="true">
            <span className="promo-chip chip-1" />
            <span className="promo-chip chip-2" />
            <span className="promo-chip chip-3" />
            <span className="promo-chip chip-4" />
          </div>
        </Reveal>
      </section>

      <section className="perks-section" aria-label="Teknisk grund">
        <div className="perks-grid">
          {foundations.map((foundation, index) => (
            <Reveal className="perk-card" as="article" key={foundation.title} from="up" delay={index * 100}>
              <span className="perk-icon">{foundation.icon}</span>
              <h3>{foundation.title}</h3>
              <p>{foundation.copy}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <footer>
        <div className="footer-brand">
          <span className="brand-mark">S</span>
          <span>Spelsajt</span>
        </div>
        <p>Play-money MVP · Blackjack + europeisk roulette · Inga insättningar</p>
        <span>MVP-v2</span>
      </footer>
    </main>
  );
}
