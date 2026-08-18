const lobbyHighlights = [
  { title: "Blackjack", detail: "Sex lekar · S17", accent: "MVP" },
  { title: "Europeisk roulette", detail: "Single zero · 37 pockets", accent: "MVP" },
  { title: "100% play money", detail: "Inga insättningar", accent: "0 KR" },
  { title: "Verifierbara utfall", detail: "Testad fairness-kärna", accent: "FAIR" },
  { title: "3D-bord", detail: "Inspelat eventflöde", accent: "DEMO" },
];

export function LobbyTicker() {
  // Duplicering gör att statusraden kan loopa utan ett visuellt hopp.
  const loop = [...lobbyHighlights, ...lobbyHighlights];

  return (
    <div className="ticker" aria-label="Lobbyhöjdpunkter">
      <span className="ticker-label"><i /> PLAY MONEY</span>
      <div className="ticker-viewport">
        <div className="ticker-track">
          {loop.map((item, index) => (
            <span
              aria-hidden={index >= lobbyHighlights.length}
              className="ticker-item"
              key={`${item.title}-${index}`}
            >
              <strong>{item.title}</strong>
              {item.detail}
              <b>{item.accent}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
