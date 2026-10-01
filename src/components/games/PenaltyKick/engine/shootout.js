/**
 * Penalty Kick — shootout rules (pure; exhaustively tested in tools/simTest.mjs).
 *
 * Kicks alternate PLAYER, RIVAL, PLAYER, RIVAL… The player kicks first.
 * Regulation: up to 5 each; stop as soon as one side cannot be caught
 * (goals + remaining kicks of the trailing side < the leader's goals).
 * Sudden death: after 5 each and level, one kick each per round; decided only
 * after BOTH have kicked in a round and exactly one scored.
 */
export function newShootout() {
  return { player: [], rival: [], suddenDeath: false, over: false, winner: null };
}

export const goals = (arr) => arr.filter((r) => r === "goal").length;

/** Whose kick is next ("player" | "rival"), or null when over. */
export function nextKicker(so) {
  if (so.over) return null;
  return so.player.length <= so.rival.length ? "player" : "rival";
}

export function roundOf(so) {
  return Math.max(so.player.length, so.rival.length) + (so.player.length === so.rival.length ? 1 : 0);
}

/** Record one kick ("goal" | "saved" | "missed") for `who`; returns the new state. */
export function record(so, who, result) {
  if (so.over) return so; // never extra penalties after a decision
  if (nextKicker(so) !== who) throw new Error(`out of turn: expected ${nextKicker(so)}, got ${who}`);
  const s = { ...so, player: [...so.player], rival: [...so.rival] };
  s[who].push(result === "goal" ? "goal" : result);
  const pg = goals(s.player);
  const rg = goals(s.rival);
  const pn = s.player.length;
  const rn = s.rival.length;
  if (pn <= 5 && rn <= 5 && !(pn === 5 && rn === 5)) {
    // regulation: can anyone still catch up?
    const pLeft = 5 - pn;
    const rLeft = 5 - rn;
    if (pg > rg + rLeft) return { ...s, over: true, winner: "player" };
    if (rg > pg + pLeft) return { ...s, over: true, winner: "rival" };
    return s;
  }
  if (pn === 5 && rn === 5) {
    if (pg !== rg) return { ...s, over: true, winner: pg > rg ? "player" : "rival" };
    return { ...s, suddenDeath: true };
  }
  // sudden death: decide only when both have kicked this round
  s.suddenDeath = true;
  if (pn === rn) {
    const pLast = s.player[pn - 1] === "goal";
    const rLast = s.rival[rn - 1] === "goal";
    if (pLast !== rLast) return { ...s, over: true, winner: pLast ? "player" : "rival" };
  }
  return s;
}
