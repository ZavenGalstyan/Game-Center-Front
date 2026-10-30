/**
 * Route bot — DEV/test only, never imported by the game. Plays a level by
 * producing the same per-tick input the keyboard produces ({l, r, jp} per
 * hero), so a finished route proves the level is solvable with real controls.
 *
 * A route is { f: [...cmds], a: [...cmds] } (Flame / Aqua), run in parallel:
 *   ["x", tx]          walk until the hero's centre is at column tx's centre (fractions ok)
 *   ["jx", tx]         jump, steer toward tx in the air, then walk the rest
 *   ["j", dir]         jump holding dir (-1, 0, 1) until landing
 *   ["w", sec]         stand still
 *   ["u", fn]          stand still until fn(state, hero) is true
 *   ["ux", tx, fn]     walk to tx once fn(state, hero) is true
 *   ["sync", name]     wait until the other hero reaches the same sync name
 *   ["hold", dir, sec] hold a direction for sec seconds (pushing, levers)
 */
import { T, DT, PHYS } from "../engine/sim.js";

const TIMEOUT = 14;

function steer(p, target, acc) {
  const cx = p.x + p.w / 2;
  const d = target - cx;
  const stop = (p.vx * p.vx) / (2 * acc) + 0.6;
  if (d > 1 && !(p.vx > 0 && d <= stop)) return 1;
  if (d < -1 && !(p.vx < 0 && -d <= stop)) return -1;
  return 0;
}

const near = (p, target) => Math.abs(target - (p.x + p.w / 2)) < 3 && Math.abs(p.vx) < 25;

export function createBot(route) {
  const runners = { flame: mk(route.f || []), aqua: mk(route.a || []) };
  function mk(q) {
    return { q, i: 0, t: 0, phase: 0, air: false, stuck: null, waiting: null };
  }
  const bot = (s) => {
    const out = {};
    for (const p of s.players) out[p.id] = run(s, p, runners[p.id], runners[p.id === "flame" ? "aqua" : "flame"]);
    // release both sides of a sync together
    const f = runners.flame;
    const a = runners.aqua;
    if (f.waiting && f.waiting === a.waiting) {
      f.waiting = a.waiting = null;
      f.i++;
      a.i++;
      f.t = a.t = 0;
      f.phase = a.phase = 0;
    }
    return out;
  };
  bot.runners = runners;
  bot.done = () => Object.values(runners).every((r) => r.i >= r.q.length);
  bot.stuck = () => Object.entries(runners).filter(([, r]) => r.stuck).map(([k, r]) => `${k}: ${r.stuck}`);
  return bot;
}

function run(s, p, r, other) {
  const inp = { l: false, r: false, jp: false };
  if (p.dead || r.i >= r.q.length) return inp;
  const cmd = r.q[r.i];
  const [op, a2raw, a3] = cmd;
  // a target may be a function of the state (e.g. "wherever the crate landed")
  const a1 = (op === "x" || op === "jx") && typeof a2raw === "function" ? a2raw(s, p) : a2raw;
  const a2 = a3;
  r.t += DT;
  const next = () => {
    r.i++;
    r.t = 0;
    r.phase = 0;
  };
  const press = (dir) => {
    if (dir > 0) inp.r = true;
    else if (dir < 0) inp.l = true;
  };
  if (r.t > TIMEOUT && op !== "u" && op !== "ux" && op !== "sync") r.stuck = `cmd #${r.i} ${JSON.stringify(cmd)} timed out at x=${((p.x + p.w / 2) / T).toFixed(2)} y=${((p.y + p.h) / T).toFixed(2)}`;
  if (r.t > 60) r.stuck = `cmd #${r.i} ${JSON.stringify(cmd)} waited 60 s`;
  switch (op) {
    case "x": {
      const target = a1 * T + T / 2;
      press(steer(p, target, p.ground ? PHYS.accG : PHYS.accA));
      if (p.ground && near(p, target)) next();
      break;
    }
    case "ux": {
      // the condition only has to hold once (a door may close again behind you)
      if (r.phase === 0 && !a2(s, p)) break;
      r.phase = 1;
      const target = a1 * T + T / 2;
      press(steer(p, target, p.ground ? PHYS.accG : PHYS.accA));
      if (p.ground && near(p, target)) next();
      break;
    }
    case "jx": {
      const target = a1 * T + T / 2;
      if (r.phase === 0) {
        if (p.ground) {
          inp.jp = true;
          r.phase = 1;
          r.air = false;
        }
        press(Math.sign(target - (p.x + p.w / 2)));
        break;
      }
      if (!p.ground) r.air = true;
      if (r.phase === 1) {
        // full air control toward the target, then settle on the ground
        const d = target - (p.x + p.w / 2);
        press(r.air ? steer(p, target, PHYS.accA) : Math.sign(d));
        if (r.air && p.ground) r.phase = 2;
        if (!r.air && r.t > 0.25) r.phase = 0; // the jump did not start; try again
        break;
      }
      press(steer(p, target, PHYS.accG));
      if (p.ground && near(p, target)) next();
      break;
    }
    case "j": {
      if (r.phase === 0) {
        inp.jp = true;
        r.phase = 1;
        r.air = false;
      }
      press(a1);
      if (!p.ground) r.air = true;
      if (r.air && p.ground) next();
      if (!r.air && r.t > 0.25) r.phase = 0;
      break;
    }
    case "w":
      if (r.t >= a1) next();
      break;
    case "u":
      if (a1(s, p)) next();
      break;
    case "hold":
      press(a1);
      if (r.t >= a2) next();
      break;
    case "sync":
      r.waiting = a1;
      if (other.i >= other.q.length) r.stuck = `sync ${a1}: other hero has no more commands`;
      break;
    default:
      throw new Error(`unknown bot op ${op}`);
  }
  return inp;
}

/** play a level to the end with a route; returns a result summary */
export function playRoute(buildLevel, step, def, route, { maxTime = 240, trace = false } = {}) {
  const s = buildLevel(def);
  const bot = createBot(route);
  const log = [];
  let n = 0;
  while (s.status === "playing" && s.time < maxTime) {
    const inp = bot(s);
    step(s, inp);
    if (trace && n++ % 30 === 0) log.push(s.players.map((p) => `${p.id[0]}(${((p.x + p.w / 2) / T).toFixed(1)},${((p.y + p.h) / T).toFixed(1)})`).join(" "));
    if (bot.stuck().length) break;
  }
  return {
    status: s.status,
    time: s.time,
    gems: s.players.map((p) => p.gems),
    totalGems: [s.gems.filter((g) => g.el === "fire").length, s.gems.filter((g) => g.el === "water").length],
    stuck: bot.stuck(),
    dead: s.players.filter((p) => p.dead).map((p) => `${p.id} (${p.cause}) at ${((p.x + p.w / 2) / T).toFixed(1)},${((p.y + p.h) / T).toFixed(1)}`),
    pos: s.players.map((p) => `${p.id} ${((p.x + p.w / 2) / T).toFixed(2)},${((p.y + p.h) / T).toFixed(2)}`),
    runner: Object.fromEntries(Object.entries(bot.runners).map(([k, r]) => [k, `${r.i}/${r.q.length}`])),
    log,
    state: s,
  };
}
