# Ruleset MVP v1 (historisk)

Detta är den bevarade första regelprofilen. Den maskinläsbara källan är `packages/config/rulesets/mvp-v1.json`, validerad av JSON Schema och låst med en semantisk hash. Profilen ändras inte i efterhand; den aktiva, fullständigare profilen beskrivs i [MVP v2](mvp-v2.md).

## Gemensamt

- Valuta: `PLAY`.
- Alla belopp är heltal.
- Enspelarrundor.
- Servern är auktoritativ.
- Varje command har ett unikt idempotency-ID.

## Blackjack

- Sex standardlekar, totalt 312 kort.
- Ny deterministisk shuffle per hand.
- Dealer stannar på soft 17.
- Blackjack betalar 3:2.
- Tillåtna actions: hit, stand, double och en split.
- Ingen insurance, surrender, resplit eller side bets i MVP.

## Roulette

- Europeiskt hjul med ett nollfält.
- Resultatrymden är heltalen 0-36.
- Straight, split, street, corner, six-line, column, dozen, red/black, odd/even och low/high.
- Ingen la partage, en prison, racetrack eller neighbor bets i MVP.

## Fairness

- Algoritm-ID: `pf-v1`.
- SHA-256 commitment.
- HMAC-SHA256 byte stream.
- Rejection sampling för alla begränsade heltal.
- Fisher-Yates för blackjack.
- Ruleset-hash ingår i den kanoniska HMAC-inputen.
