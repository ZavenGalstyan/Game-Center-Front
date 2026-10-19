/**
 * Headless play-out: runs hands with the real engine and the real AI until a
 * condition is met. Used to finish a tournament after the human busts (the
 * standings are played out, not invented) and by the test suite.
 */
import { startHand, applyAction, advance, viewFor } from "./table.js";
import { decide, PROFILES, observeHand } from "./ai.js";
import { afterHand } from "./tournament.js";
import { shuffledDeck } from "./cards.js";

/** Plays the current hand to completion (every seat must be an AI or `human` callback). */
export function playHand(table, { rand, memory = {}, tournament = false, sims, human } = {}) {
  let s = table;
  let guard = 0;
  while (s.phase !== "complete") {
    if (++guard > 500) throw new Error("hand did not finish");
    if (s.phase === "betting") {
      const seat = s.toAct;
      const p = s.players[seat];
      const action = !p.ai && human
        ? human(viewFor(s, seat), s)
        : decide(viewFor(s, seat), { profile: PROFILES[p.profile] || PROFILES.jack, difficulty: p.diff || "medium", rand, memory, tournament, sims });
      const r = applyAction(s, seat, action);
      if (r.error) throw new Error(`illegal AI action ${JSON.stringify(action)}: ${r.error}`);
      s = r.state;
    } else {
      s = advance(s).state;
    }
  }
  return s;
}

/**
 * Plays a tournament out to the end with every remaining seat driven by the
 * AI (the human must already be out). Returns { table, tour }.
 */
export function finishTournament(table, tour, { rand, randInt, memory = {}, sims = 60, maxHands = 3000 } = {}) {
  let s = table, t = tour, m = memory;
  for (let h = 0; h < maxHands && !t.done; h++) {
    const r = startHand(s, shuffledDeck(randInt));
    if (r.error) break;
    s = playHand(r.state, { rand, memory: m, tournament: true, sims });
    m = observeHand(m, s);
    ({ tour: t, table: s } = afterHand(t, s));
  }
  return { table: s, tour: t, memory: m };
}
