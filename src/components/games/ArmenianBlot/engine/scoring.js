/**
 * ScoringEngine — turns a finished hand into match points.
 *
 * Raw points (cards + last-trick 10, declarations, Belote) are kept apart
 * from the contract result and from the small match points; every number
 * that reaches the scoreboard comes with an explanation line.
 *
 * "bazaar" (Armenian Classic): the contract side must reach level × 10 raw
 * points (cards + its scoring declarations + its Belote). The hand is worth
 * 16 (or 25 when one side takes all eight tricks) plus the contract value,
 * times the contra multiplier, and the whole of it goes to the contract side
 * when the contract is made, to the defenders when it fails. Declarations go
 * to the side that won the comparison (all of them to the defenders on a
 * failed contract); Belote stays with its holder.
 *
 * "points" (Classic Points): each side scores its own card points rounded to
 * tens (the defenders' 5 rounds down, the contract side gets the rest of 16)
 * plus its declarations and Belote, and the contract side adds the contract
 * value × multiplier when made; when it fails the defenders take 16 + value
 * (× multiplier) and all declarations.
 */

/**
 * @param h {
 *   contract: { team, value, target, kaput, mult },
 *   cards: [raw0, raw1]          card points incl. the last-trick bonus,
 *   tricks: [n0, n1]             tricks won,
 *   decl: { team, points:[r0,r1] }  resolved declarations (raw),
 *   beloteTeam: 0|1|null         team of the player who completed Belote/Rebelote,
 * }
 */
export function scoreHand(h, rules) {
  const C = h.contract.team, D = 1 - C;
  const mult = h.contract.mult || 1;
  const declRaw = [h.decl?.points?.[0] || 0, h.decl?.points?.[1] || 0];
  const beloteRaw = [0, 0];
  if (h.beloteTeam != null && rules.belote) {
    if (rules.beloteAward === "holder" || h.beloteTeam === C) beloteRaw[h.beloteTeam] = rules.beloteValue;
  }
  const total = [0, 1].map((t) => h.cards[t] + declRaw[t] + beloteRaw[t]);
  const capotTeam = h.tricks[0] === 8 ? 0 : h.tricks[1] === 8 ? 1 : null;

  let made;
  if (h.contract.kaput) made = capotTeam === C;
  else made = total[C] >= h.contract.target && (!rules.mustBeatDefenders || total[C] > total[D]);

  const base = capotTeam != null ? rules.capotValue : rules.handValue;
  const dm = rules.multiplyDecl ? mult : 1;
  const small = (raw) => Math.round(raw / 10);
  const score = [0, 0];
  const lines = []; // { key, team, value, n? }
  const add = (team, key, value, extra) => {
    if (!value) return;
    score[team] += value;
    lines.push({ key, team, value, ...extra });
  };
  const beloteSmall = [small(beloteRaw[0]), small(beloteRaw[1])];
  // "contractOnly": a failed contract side loses its Belote to the defenders
  if (rules.beloteAward === "contractOnly" && !made && beloteSmall[C]) { beloteSmall[D] += beloteSmall[C]; beloteSmall[C] = 0; }
  const declSmall = [small(declRaw[0]) * dm, small(declRaw[1]) * dm];

  if (rules.scoring === "points") {
    let cs = [0, 0];
    if (capotTeam != null) cs[capotTeam] = rules.capotValue;
    else {
      const def = Math.floor((h.cards[D] + 4) / 10); // 75 → 7, 76 → 8
      cs[D] = def;
      cs[C] = Math.max(0, rules.handValue - def);
    }
    if (made) {
      add(C, "cards", cs[C]);
      add(C, "contract", h.contract.value * mult, { mult });
      add(D, "cards", cs[D]);
      add(C, "decl", declSmall[C]);
      add(D, "decl", declSmall[D]);
      add(C, "belote", beloteSmall[C]);
      add(D, "belote", beloteSmall[D]);
    } else {
      add(D, "failed", (base + h.contract.value) * mult, { base, mult });
      if (rules.failedDecl === "allToDefenders") add(D, "decl", declSmall[0] + declSmall[1]);
      else { add(D, "decl", declSmall[D]); add(C, "decl", declSmall[C]); }
      add(D, "belote", beloteSmall[D]);
      add(C, "belote", beloteSmall[C]);
    }
  } else {
    if (made) {
      add(C, "made", (base + h.contract.value) * mult, { base, mult });
      add(C, "decl", declSmall[C]);
      add(D, "decl", declSmall[D]);
    } else {
      add(D, "failed", (base + h.contract.value) * mult, { base, mult });
      if (rules.failedDecl === "allToDefenders") add(D, "decl", declSmall[0] + declSmall[1]);
      else { add(D, "decl", declSmall[D]); add(C, "decl", declSmall[C]); }
    }
    add(C, "belote", beloteSmall[C]);
    add(D, "belote", beloteSmall[D]);
  }

  return {
    made,
    capotTeam,
    base,
    mult,
    raw: { cards: h.cards.slice(), decl: declRaw, belote: beloteRaw, total },
    score,
    lines,
  };
}

/** Match over? Returns the winning team, or null (continue; ties above the target play on). */
export function matchWinner(scores, target) {
  const [a, b] = scores;
  if (a < target && b < target) return null;
  if (a === b) return null;
  return a > b ? 0 : 1;
}
