const winners = [
  { name: "Elin_92", game: "Blackjack", amount: "12 400" },
  { name: "MrGreen", game: "Roulette", amount: "8 250" },
  { name: "Kajsa.K", game: "Golden Sevens", amount: "44 900" },
  { name: "Viktor", game: "Live Baccarat", amount: "6 120" },
  { name: "Nova", game: "Roulette", amount: "19 800" },
  { name: "Sixten", game: "Blackjack", amount: "3 540" },
  { name: "Freja_", game: "Golden Sevens", amount: "72 300" },
  { name: "Oskar99", game: "Live Poker", amount: "15 650" },
];

export function WinnersTicker() {
  // Duplicate the list so the marquee loops seamlessly.
  const loop = [...winners, ...winners];

  return (
    <div className="ticker" aria-label="Senaste vinsterna">
      <span className="ticker-label"><i /> LIVE VINSTER</span>
      <div className="ticker-viewport">
        <div className="ticker-track">
          {loop.map((winner, index) => (
            <span className="ticker-item" key={`${winner.name}-${index}`}>
              <strong>{winner.name}</strong>
              {winner.game}
              <b>+{winner.amount}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
