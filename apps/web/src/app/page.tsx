import { SceneLoader } from "./_components/scene-loader";

const systemLayers = [
  { label: "Frontend", value: "Next.js 16 + R3F" },
  { label: "Game server", value: "Fastify + Socket.IO" },
  { label: "Data och auth", value: "Supabase" },
  { label: "Fairness", value: "HMAC-SHA256" },
];

const games = [
  {
    eyebrow: "TABLE 01",
    title: "Blackjack",
    description: "Sex lekar, S17 och verifierbar shuffle. Först ut i den vertikala slicen.",
    status: "VERTICAL SLICE",
  },
  {
    eyebrow: "TABLE 02",
    title: "European Roulette",
    description: "Ett nollfält, full bettingmatta och ett serverbestämt utfall som 3D-hjulet följer.",
    status: "MILESTONE 3",
  },
];

export default function HomePage() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Spelsajt startsida">
          <span className="brand-mark">S</span>
          <span>Spelsajt</span>
        </a>
        <div className="topbar-actions">
          <span className="environment"><i /> PLAY MONEY ONLY</span>
          <button className="ghost-button" type="button" disabled>
            Logga in - snart
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker">PLAY MONEY. REAL FEEL.</p>
          <h1>
            Casino precision.
            <span>Without the casino baggage.</span>
          </h1>
          <p className="lede">
            En modern grund för blackjack och roulette där spelmotorn bestämmer utfallet och
            3D-världen reagerar på varje domänevent.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#games">Se spelplanen</a>
            <a className="text-link" href="#architecture">Utforska arkitekturen <span>↗</span></a>
          </div>
          <dl className="hero-metrics">
            <div><dt>37</dt><dd>roulettefickor</dd></div>
            <div><dt>312</dt><dd>kort per shuffle</dd></div>
            <div><dt>100%</dt><dd>play money</dd></div>
          </dl>
        </div>
        <SceneLoader />
      </section>

      <section className="system-strip" id="architecture" aria-label="Teknisk arkitektur">
        {systemLayers.map((layer, index) => (
          <div className="system-cell" key={layer.label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><small>{layer.label}</small><strong>{layer.value}</strong></div>
          </div>
        ))}
      </section>

      <section className="games-section" id="games">
        <div className="section-heading">
          <div>
            <p className="kicker">MVP GAME FLOOR</p>
            <h2>Två spel. En auktoritativ motor.</h2>
          </div>
          <p>Frontend visar och animerar. Backend validerar, avgör och bokför.</p>
        </div>

        <div className="game-grid">
          {games.map((game, index) => (
            <article className="game-card" key={game.title}>
              <div className={`game-art game-art-${index + 1}`} aria-hidden="true">
                <span className="orbit orbit-one" />
                <span className="orbit orbit-two" />
                <span className="game-number">0{index + 1}</span>
              </div>
              <div className="game-copy">
                <div className="game-meta"><span>{game.eyebrow}</span><i />{game.status}</div>
                <h3>{game.title}</h3>
                <p>{game.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <span>SPJ-001 / SCAFFOLD</span>
        <p>Built for Jakob × Emil</p>
        <span>17.08.2026</span>
      </footer>
    </main>
  );
}
