/**
 * Bottle Flip — headless throw simulator (shared by levelCheck / starFinder / reach).
 * Runs the real session code; nothing is mocked.
 */
import { createSession, launch, update, drainEvents } from "../game/session.js";
import { PHYS, BOTTLE } from "../physics/constants.js";
import { platformTop } from "../physics/solids.js";

/** Throw once from (platform index, local x) at sim time t0; returns outcome. */
export function simulateThrow(level, { from = 0, localX, t0 = 0, angle, power, collected }) {
  const s = createSession(level, { collected });
  // place the bottle
  s.t = t0;
  s.platformIndex = from;
  const p = level.platforms[from];
  s.localX = localX ?? (from === 0 ? level.spawnX ?? p.w * 0.7 : p.w / 2);
  s.checkpoint = from;
  s.progress = from;
  update(s, 0);
  // settle idle position at t0
  const tp = platformTop(p, s.t);
  s.body.x = tp.x0 + s.localX;
  s.body.y = tp.top + BOTTLE.com;
  launch(s, angle, power);
  const out = { result: "fail", platform: -1, perfect: false, reason: "", turns: 0, collected: [], x: 0, stars: 0 };
  let steps = 0;
  while (steps < 4000) {
    update(s, PHYS.dt);
    steps += 1;
    for (const e of drainEvents(s)) {
      if (e.type === "collect") out.collected.push(e.index);
      if (e.type === "land") {
        out.result = "land";
        out.platform = e.platform;
        out.perfect = e.perfect;
        out.turns = e.turns;
        out.flipped = e.flipped;
        out.x = s.localX;
        out.time = steps * PHYS.dt;
        return out;
      }
      if (e.type === "fail") {
        out.reason = e.reason;
        out.time = steps * PHYS.dt;
        return out;
      }
    }
  }
  out.reason = "timeout";
  return out;
}

export const DEG = Math.PI / 180;

/** Sweep angles × powers; returns grid of outcomes. */
export function sweep(level, opts, { a0 = 20, a1 = 160, da = 2, dp = 0.02 } = {}) {
  const rows = [];
  for (let p = 1; p >= -1e-9; p -= dp) {
    const row = [];
    for (let a = a0; a <= a1 + 1e-9; a += da) {
      row.push({ a, p, ...simulateThrow(level, { ...opts, angle: a * DEG, power: p }) });
    }
    rows.push(row);
  }
  return rows;
}

export function charOf(o, from) {
  if (o.result !== "land") return o.reason === "tipped" ? "," : ".";
  if (!o.flipped) return o.platform === from ? "-" : "~";
  if (o.perfect) return o.platform === from ? "@" : "*";
  return o.platform === from ? "o" : String(o.platform % 10);
}

export function printSweep(rows, from) {
  const lines = rows.map((r) => `${r[0].p.toFixed(2)} ${r.map((o) => charOf(o, from)).join("")}`);
  const header = "     " + rows[0].map((o) => (o.a % 20 === 0 ? "|" : " ")).join("");
  return [header, ...lines].join("\n");
}
