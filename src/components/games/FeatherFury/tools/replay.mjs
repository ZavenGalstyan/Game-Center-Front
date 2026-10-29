/**
 * Shot replay shared by the solver, the difficulty report and the tests: a
 * shot is { a: aim angle in degrees above horizontal, p: pull 0–1, tap: physics
 * step after launch at which the ability is tapped, or -1 }.
 */
import { createGame, destroyGame, step, launch, triggerAbility, runUntilIdle, MAX_PULL } from "../engine/game.js";

export const pullOf = (s) => ({ x: -Math.cos((s.a * Math.PI) / 180) * s.p * MAX_PULL, y: Math.sin((s.a * Math.PI) / 180) * s.p * MAX_PULL });

/** fires one shot; returns steps until the bird first touched something (or -1) */
export function fire(g, s) {
  if (!launch(g, pullOf(s))) return -1;
  let touchAt = -1;
  for (let i = 0; i < 900 && g.state === "flying"; i++) {
    if (i === s.tap) triggerAbility(g);
    step(g);
    if (touchAt < 0 && g.shot?.touched) touchAt = i;
  }
  runUntilIdle(g);
  return touchAt;
}

export function play(def, shots) {
  const g = createGame(def);
  let touch = -1;
  for (const s of shots) {
    if (g.state !== "ready") break;
    touch = fire(g, s);
  }
  runUntilIdle(g);
  const r = { kills: g.defeated, won: g.state === "won", lost: g.state === "lost", score: g.score, stars: g.result?.stars || 0, touch, total: g.totalEnemies };
  destroyGame(g);
  return r;
}

