# Ruleset MVP v2

Det här dokumentet förklarar den aktiva play-money-regelprofilen. Den maskinläsbara sanningen är [`packages/config/rulesets/mvp-v2.json`](../../packages/config/rulesets/mvp-v2.json). Filen valideras mot JSON Schema och dess semantiska innehåll är låst med SHA-256 i `ruleset-lock.json`. En beteendeändring kräver ett nytt ruleset-ID och nya golden vectors; `mvp-v2` skrivs inte om i efterhand.

## Gemensamt

- Valuta: `PLAY`, utan decimaler eller köpbarhet.
- Startsaldo: 10 000 PLAY.
- Backend är auktoritativ för regler, utfall, payout och saldo.
- Alla insatser och utbetalningar är heltal.
- Fairness-algoritmen är `pf-v1`: SHA-256 commitment, HMAC-SHA256 stream och rejection sampling.

## Blackjack

- Sex standardlekar, totalt 312 fysiskt identifierbara kort.
- Amerikansk hålkortsmodell; dealer tittar efter blackjack vid ess eller tiovärde.
- Dealer stannar på soft 17.
- Naturlig blackjack betalar 3:2.
- Insatsen måste vara delbar med 2 PLAY så att 3:2 alltid kan betalas exakt.
- Hit, stand, double och högst en split stöds.
- Double tillåts på valfria två kort och efter split.
- Kort med samma blackjackvärde får splittas, exempelvis kung och dam.
- Ess får inte splittas igen och varje splittat ess får exakt ett nytt kort.
- 21 efter split räknas som vanlig 21, inte naturlig blackjack.
- Insurance, surrender och side bets ingår inte.

## Europeisk roulette

- Ett europeiskt singelnollhjul med fälten 0–36.
- Noll gör att alla vanliga outside bets förlorar; ingen `la partage` eller `en prison`.
- Straight, split, street, corner, six-line, column, dozen, red/black, odd/even och low/high stöds.
- Rulesetet lagrar gross return inklusive återbetald insats: 36×, 18×, 12×, 9×, 6×, 3× eller 2× beroende på bettyp.
- Betgeometrin valideras mot den kanoniska europeiska bordslayouten; klienten kan inte skicka en godtycklig grupp nummer.

## Versioner

`mvp-v1` bevaras som en publicerad historisk profil och dess kontrakt ändras inte. `mvp-v2` är aktiv profil eftersom den uttryckligen definierar blackjackdetaljer, roulettepayouts, säkra dolda kort, strukturerade roulettebets och fullständiga snapshots.
