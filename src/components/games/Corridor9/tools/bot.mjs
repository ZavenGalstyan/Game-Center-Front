/**
 * Corridor 9 — a tiny route bot used by the Node tests and the browser
 * harness. It walks the loop either all the way forward (out through J1) or
 * into the main corridor and back out through J0, steering the real player
 * through g.update().
 *
 * createBot(g, { decide }) → { step(dt) → input } where decide(loop) returns
 * "forward" | "back" (default: the correct answer).
 */
import { W, L, J0, J1 } from "../data.js";

const FORWARD = [
  { x: -W / 2 - 0.2, z: -W / 2 },
  { x: 0, z: -W / 2 + 0.4 },
  { x: 1.0, z: 4 },
  { x: 1.0, z: L - 1 },
  { x: 0.2, z: L + W / 2 - 0.2 },
  { x: W / 2 + 0.4, z: L + W / 2 },
  { x: J1.x + 1, z: L + W / 2 },
];
const BACK_AT = 11; // walk this far up the corridor before turning back
const BACK = [
  { x: -W / 2 - 0.2, z: -W / 2 },
  { x: 0, z: -W / 2 + 0.4 },
  { x: 1.0, z: 4 },
  { x: 1.0, z: BACK_AT },
  { x: 1.0, z: 3 },
  { x: 0, z: -W / 2 + 0.4 },
  { x: -W / 2 - 0.2, z: -W / 2 },
  { x: J0.x - 1, z: -W / 2 },
];

export const correctChoice = (loop) => (loop.anomaly ? "back" : "forward");

export function createBot(g, { decide = correctChoice, sprint = false } = {}) {
  let loopIdx = -1, route = null, wp = 0, stuck = 0, lastD = Infinity;
  return {
    get wp() {
      return wp;
    },
    step() {
      const P = g.player;
      if (g.loop.index !== loopIdx) {
        loopIdx = g.loop.index;
        route = (g.loop.final ? "forward" : decide(g.loop)) === "back" ? BACK : FORWARD;
        // start from the nearest waypoint ahead (we always enter at J0)
        wp = 0;
        stuck = 0;
      }
      let tgt = route[wp];
      let d = Math.hypot(tgt.x - P.x, tgt.z - P.z);
      while (d < 0.35 && wp < route.length - 1) {
        wp++;
        tgt = route[wp];
        d = Math.hypot(tgt.x - P.x, tgt.z - P.z);
        lastD = Infinity;
      }
      stuck = d > lastD - 1e-4 ? stuck + 1 : 0;
      lastD = d;
      const want = Math.atan2(-(tgt.x - P.x), -(tgt.z - P.z));
      let diff = want - P.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      P.yaw += diff * 0.35;
      return { f: Math.abs(diff) < 1.2, sprint, stuck };
    },
  };
}
