# Armenian Blot Heritage — rules presets

Blot (Բլոտ, also "Bazaar Blot") is the Armenian member of the Belote family.
Tables in Armenia and the diaspora play it with different house rules, so
the engine never hard-codes a convention: every rule that varies is a field of
a rules object (`engine/rules.js`), the two presets below are documented
here, and Settings → Rule variations can override the variable fields for the
**next** match (the running match keeps the rules it started with; they are
saved inside the match).

Where a convention could not be confirmed as *the* Armenian rule, the preset
uses the established Belote principle and says so ("Belote principle").

## Armenian Classic (default)

### Deal
- 32 cards (7 8 9 10 J Q K A in four suits), four players in two fixed
  partnerships; partners sit opposite.
- Every player receives 8 cards in packets of **3-2-3**, clockwise, starting
  with the player on the dealer's left. The full hand is dealt before bidding.
- The deal passes clockwise after every hand.

### Auction (numerical, "8 hearts", "10 no trump"…)
- The player on the dealer's left speaks first, then clockwise.
- A bid is a **level 8–16** plus a **strain**: ♥ ♦ ♣ ♠ or No Trump.
  The level is the number of tens of raw points the side promises
  (8 → at least 80 of the 162).
- Suits are equal: a new bid must raise the level by at least 1 (the strain
  may change; a partner may raise too).
- **Kaput** (all eight tricks) outranks every numbered bid; after it only
  pass/contra are possible.
- A player who passed may bid again later.
- An opponent of the highest bidder may say **Contra** (×2). It closes the
  bidding; the contract side may answer **Recontra** (×4) or pass.
  *Simplification:* contra is said on one's turn; the out-of-turn table
  habit is not modelled so every action stays ordered.
- Three passes after a bid end the auction. Four passes before any bid mean a
  **redeal** by the next dealer.
- All Trump is **off** in this preset (available as a variation).

### Card order and points
| | J | 9 | A | 10 | K | Q | 8 | 7 | suit total |
|---|---|---|---|---|---|---|---|---|---|
| Trump order | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | |
| Trump points | 20 | 14 | 11 | 10 | 4 | 3 | 0 | 0 | 62 |
| Plain order | 5 | 6 | 1 | 2 | 3 | 4 | 7 | 8 | |
| Plain points | 2 | 0 | 11 | 10 | 4 | 3 | 0 | 0 | 30 |
| No Trump points (A counts 19) | 2 | 0 | 19 | 10 | 4 | 3 | 0 | 0 | 38 |
| All Trump points (variation) | 14 | 9 | 6 | 5 | 3 | 2 | 0 | 0 | 39 |

Suit contract: 62 + 3 × 30 = 152, + 10 for the last trick = **162**.
No Trump: 4 × 38 = 152 + 10 = 162. All Trump: 4 × 39 = 156 + 10 = 166.

### Playing obligations
1. The player left of the dealer leads the first trick; the winner of each
   trick leads the next.
2. Follow the led suit if you can.
3. Trump led: you must play a higher trump if you can — even over your
   partner.
4. Void in the led suit, an **opponent** winning: you must trump; if an
   opponent has already trumped, you must over-trump if you can.
5. Void in the led suit, your **partner** winning: any card (partner
   exception).
6. An opponent's trump you cannot beat: any card (no under-trumping).
7. No Trump: follow suit, otherwise any card. All Trump: follow suit and beat
   the best card if you can.

### Declarations (combinations)
- Terz (3 in sequence) 20 · Fifty (4) 50 · Hundred (5 or more) 100.
  Sequence order is always 7 8 9 10 J Q K A.
- Four of a kind: Jacks 200 · Nines 150 · Aces / Tens / Kings / Queens 100.
  Sevens and eights never count; four Nines do not count in No Trump.
- A card belongs to one combination only; the detector chooses the partition
  worth the most.
- Announced with the first card a player plays; resolved after the first
  trick. Only the side holding the single best declaration scores (all of its
  declarations); the other side's are void. Best = higher value → four of a
  kind over a sequence → longer → higher top card → trump sequence.
- Remaining tie: **nobody scores** (Belote principle).
- The scoring side's combination cards become public (shown on the table) —
  the AI may use them.

### Belote / Rebelote
- King + Queen of trump in one hand = 20, announced "Belote" with the first
  of the two cards and "Rebelote" with the second; it counts once, when the
  second card is played.
- Not compared with declarations, not cancelled by them; it always stays with
  the holder's side. Not available in No Trump / All Trump.

### Scoring
Raw points (cards incl. the last-trick 10, declarations, Belote) are kept
separate from match points ("small points" = raw / 10, so a hand is worth 16).

- The contract is **made** when the contract side's cards + scoring
  declarations + Belote ≥ level × 10 (reaching it exactly is enough).
  Kaput is made only by taking all eight tricks.
- Hand value = **16** (or **25** when one side takes all eight tricks — capot)
  **+ the contract value** (the level; Kaput = 25), × 2 after Contra, × 4 after
  Recontra.
- Made: the whole hand value goes to the contract side.
  Failed: the whole hand value goes to the defenders.
- Declarations (/10) go to the side that won the comparison; on a failed
  contract **all** declarations go to the defenders.
- Belote (2) always stays with its holder's side.
- Declarations are not multiplied by contra.

Examples (tested in `tools/engineTest.mjs`):
- 9♥ made with 95 card points → contract side +25 (16 + 9).
- 10♥ with 70 cards + terz 20 = 90 < 100 → failed: defenders +26 (16 + 10),
  +2 (the contract side's terz), +2 (their own Belote).
- Unbid capot on an 8 bid → +33 (25 + 8). Kaput ×2 made → +100.

### Match
- Targets: **Short 101**, **Standard 201**, **Long 301** (Classic uses the
  selected target; Quick and Practice use 101).
- The match ends after a hand in which a side has reached the target with a
  strictly higher total; equal totals at or above the target play another
  hand.

## Classic Points (alternative preset)
Same deal, auction and declarations, plus All Trump bids, with
French/Coinche-style point scoring:
- Each side scores its own card points in tens: the defenders' card points
  are rounded to the nearest ten with 5 rounding **down** (75 → 7, 76 → 8)
  and the contract side gets the rest of 16 (capot: 25 to the side with all
  tricks).
- The contract must also take strictly more raw points than the defenders; a
  tie fails it.
- Made: each side keeps its card points, declarations and Belote; the
  contract side adds the level × multiplier.
- Failed: defenders take (16 + level) × multiplier plus all declarations.
- An opponent's trump that cannot be beaten must still be followed with a
  trump (under-trumping required).

## Variations (Settings)
`allowNoTrump`, `allowAllTrump`, `allowKaput`, `allowContra`,
`partnerException`, `undertrumpRequired`, `overtrumpOnTrumpLead`,
`declTie` (cancel | eldest), `failedDecl` (allToDefenders | keepOwn),
`beloteAward` (holder | contractOnly), `allPass` (nextDealer | sameDealer),
`firstLead` (leftOfDealer | declarer).

## Tests
- `node src/components/games/ArmenianBlot/tools/engineTest.mjs` — rules, AI and
  save tests (deterministic, seeded).
- `node src/components/games/ArmenianBlot/tools/aiSim.mjs [hands] [preset]` —
  AI self-play statistics and difficulty match-ups.
