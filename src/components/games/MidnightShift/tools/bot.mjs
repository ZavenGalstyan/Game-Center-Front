/**
 * A test player that only uses what a real player can perceive:
 *  - what the door lights show (g.at(doorNode) while that light is on),
 *  - what the current camera shows (g.at(cam) while the monitor is up),
 *  - footstep cues near the office ("arrive"/"move" events into halls/doors),
 * with a human-ish reaction delay. Used by simTest.mjs (balance) and the
 * browser harness (driving the real UI state).
 *
 * opts.skill 0..1: higher = shorter reactions, tighter light checks.
 */
import { DOOR_NODE } from "../data.js";

export function createBot(g, { skill = 0.7, rng = Math.random, watchHollow = true } = {}) {
  const react = 0.35 + (1 - skill) * 0.9;
  const scanEvery = 2.2 + (1 - skill) * 2.5;
  let t = 0;
  let nextScan = 1.5;
  let nextCams = 6;
  let plan = []; // queued timed actions [{at, fn}]
  const known = { L: 0, R: 0 }; // last time we saw something in the doorway
  let camRun = null;

  const later = (dtWait, fn) => plan.push({ at: t + dtWait, fn });

  function look(side) {
    if (g.monitor) return;
    g.setLight(side, true);
    later(0.25, () => {
      const seen = g.at(DOOR_NODE[side]).length > 0;
      g.setLight(side, false);
      if (seen) {
        known[side] = t;
        if (!g.doors[side]) g.toggleDoor(side);
      } else if (g.doors[side]) {
        g.toggleDoor(side);
      }
    });
  }

  const pending = {}; // side -> time we'll react to footsteps heard there
  function onEvent(e) {
    if (e.type !== "arrive") return;
    // Velvet's steps are soft and the Watcher only crackles — easier to miss
    const miss = e.id === "velvet" ? (1 - skill) * 0.6 : e.id === "hollow" ? 0.15 + (1 - skill) * 0.5 : (1 - skill) * 0.15;
    if (rng() < miss) return;
    pending[e.side] = Math.min(pending[e.side] ?? Infinity, t + react + rng() * 0.4);
  }

  return {
    onEvents(list) {
      for (const e of list) onEvent(e);
    },
    step(dt) {
      t += dt;
      plan.sort((a, b) => a.at - b.at);
      while (plan.length && plan[0].at <= t) plan.shift().fn();
      if (g.phase !== "play") return;
      for (const side of ["L", "R"]) {
        if (!(pending[side] <= t)) continue;
        if (g.monitor) {
          g.setMonitor(false);
          camRun = null;
          pending[side] = t + 0.3;
        } else if (!g.lights.L && !g.lights.R) {
          delete pending[side];
          look(side);
        }
        return;
      }
      if (Object.keys(pending).length) return;
      if (camRun) {
        camRun.t -= dt;
        if (camRun.t <= 0) {
          const next = camRun.list.shift();
          if (next) {
            g.setCam(next);
            camRun.t = 0.7;
            // a player who sees the Hollow Watcher on camera may keep watching it a bit
            if (watchHollow && g.at(next).includes("hollow") && g.robots.hollow.node !== "dock") camRun.t = 1.4;
          } else {
            g.setMonitor(false);
            camRun = null;
          }
        }
        return;
      }
      if (t >= nextScan) {
        nextScan = t + scanEvery * (0.8 + rng() * 0.4);
        look("L");
        later(0.45, () => look("R"));
        return;
      }
      if (t >= nextCams && !g.doors.L && !g.doors.R) {
        nextCams = t + 9 + rng() * 8;
        g.setMonitor(true);
        camRun = { t: 0.2, list: ["westHall", "eastHall", "dock"] };
      }
      // re-check a closed door from time to time
      for (const s of ["L", "R"]) if (g.doors[s] && t - known[s] > 1.6 && !plan.length) look(s);
    },
  };
}

/** play a whole night headlessly; returns g */
export function playNight(createNight, index, { seed, bot = "smart", skill, dt = 1 / 30 } = {}) {
  const g = createNight(index, { seed, skipIntro: true });
  let b = null;
  let r = seed >>> 0 || 1;
  const rng = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
  if (bot === "smart") b = createBot(g, { skill, rng });
  if (bot === "camper") {
    g.toggleDoor("L");
    g.toggleDoor("R");
  }
  let guard = 0;
  while (g.phase !== "won" && g.phase !== "lost" && guard++ < 100000) {
    g.step(dt);
    const ev = g.takeEvents();
    if (b) {
      b.onEvents(ev);
      b.step(dt);
    }
  }
  return g;
}
