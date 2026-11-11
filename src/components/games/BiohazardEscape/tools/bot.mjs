/**
 * Route + combat bot — plays a level through the real simulation with the
 * same inputs a player sends (move, yaw/pitch, jump, fire, E, Q). A route is a
 * list of steps:
 *   ["use", entId, times?]   walk to the device, look at it, press E
 *   ["code", keypadId]       use the keypad and type its code
 *   ["shoot", nodeId]        charge an ion node with the Ion Lance
 *   ["kill", enemyId]        hunt one enemy down
 *   ["clear"]                fight until no awake enemy is left
 *   ["go", c, r] · ["wait", s] · ["exit"]
 * Whenever an unshielded enemy is in the line of fire the bot stops and
 * shoots it (best weapon for the range), heals below 45% health and respawns
 * at the checkpoint if it dies. Used by tools/levelTest.mjs and the browser
 * harness (tools/harness.mjs).
 */
import { CELL, DIRS, EYE, WEAPONS, cellCenter } from "../engine/constants.js";

const STEP = 1 / 60;

export function createBot(route, opts = {}) {
  const state = { i: 0, done: false, failed: false, reason: "", path: null, goalKey: "", waitT: 0, uses: 0, stuck: 0, lastPos: null, stepT: 0, pathT: 0, deadT: 0, aimT: 0, log: [] };
  const run = opts.run ?? true;
  // skill: aim error (radians, slowly wandering) and reaction time before the first shot at a new target
  const skill = opts.skill || null;
  const seen = new Map();
  let errA = 0,
    errB = 0;

  function passable(sim, c, r, { allowExit = false } = {}) {
    const t = sim.tileAt(c, r);
    if (!t) return false;
    if (t.t === "exit") return allowExit;
    if (t.t === "laser") return !sim.laserOn(t);
    if (t.t === "gas") return !sim.gasOn(t);
    if (t.t !== "floor" && t.t !== "acid") return false;
    if (t.h > 0.65) return false;
    return !sim.solidEntAt(c, r);
  }
  const cost = (sim, c, r) => {
    const t = sim.tileAt(c, r);
    if (t.t === "acid") return 12;
    if (t.h) return 3;
    return 1;
  };

  function findPath(sim, goals, allowExit) {
    const [sc, sr] = sim.playerCell();
    const key = (c, r) => r * sim.W + c;
    const dist = new Map([[key(sc, sr), 0]]);
    const prev = new Map();
    const open = [[0, sc, sr]];
    const goalSet = new Set(goals.map(([c, r]) => key(c, r)));
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, c, r] = open.splice(bi, 1)[0];
      if (d > (dist.get(key(c, r)) ?? Infinity)) continue;
      if (goalSet.has(key(c, r))) {
        const path = [[c, r]];
        let k = key(c, r);
        while (prev.has(k)) {
          k = prev.get(k);
          path.unshift([k % sim.W, Math.floor(k / sim.W)]);
        }
        return path;
      }
      for (const [dc, dr] of Object.values(DIRS)) {
        const nc = c + dc,
          nr = r + dr;
        if (!passable(sim, nc, nr, { allowExit: allowExit && goalSet.has(key(nc, nr)) })) continue;
        const nd = d + cost(sim, nc, nr);
        if (nd < (dist.get(key(nc, nr)) ?? Infinity)) {
          dist.set(key(nc, nr), nd);
          prev.set(key(nc, nr), key(c, r));
          open.push([nd, nc, nr]);
        }
      }
    }
    return null;
  }

  const yawTo = (p, x, z) => Math.atan2(-(x - p.x), -(z - p.z));
  function aimAt(sim, x, y, z) {
    const p = sim.player;
    const h = Math.hypot(x - p.x, z - p.z);
    return { setYaw: yawTo(p, x, z), setPitch: Math.atan2(y - (EYE + p.y), h) };
  }

  /** Walk along a path toward a goal set. Returns input, or null when standing on a goal. */
  function walk(sim, goals, allowExit = false) {
    const p = sim.player;
    const [pc, pr] = sim.playerCell();
    const gk = goals.map((g) => g.join(",")).join(";");
    state.pathT -= STEP;
    if (gk !== state.goalKey || !state.path || state.pathT <= 0) {
      state.goalKey = gk;
      state.path = findPath(sim, goals, allowExit);
      state.pathT = 0.5;
    }
    if (!state.path) return { wait: true };
    const idx = state.path.findIndex(([c, r]) => c === pc && r === pr);
    const path = idx >= 0 ? state.path.slice(idx) : state.path;
    if (path.length <= 1) {
      const [x, z] = cellCenter(pc, pr);
      if (goals.some(([c, r]) => c === pc && r === pr) && Math.hypot(p.x - x, p.z - z) < 0.45) return null;
      return { mz: 1, setYaw: yawTo(p, x, z), run: false, setPitch: 0 };
    }
    const [nc, nr] = path[1];
    let [tx, tz] = cellCenter(nc, nr);
    // cut corners when the next-next cell is a straight continuation
    const yaw = yawTo(p, tx, tz);
    const t = sim.tileAt(nc, nr);
    const here = sim.tileAt(pc, pr);
    let jump = false;
    if (t.h && p.ground && p.y < t.h - 0.2) {
      const edge = Math.max(Math.abs(tx - p.x), Math.abs(tz - p.z)) - CELL / 2;
      if (edge < 0.7) jump = true;
    }
    // acid: jump across from the edge when the path crosses a single acid cell
    if (t.t === "acid" && here.t !== "acid" && p.ground) {
      const edge = Math.max(Math.abs(tx - p.x), Math.abs(tz - p.z)) - CELL / 2;
      if (edge < 0.4) jump = true;
    }
    return { mz: 1, setYaw: yaw, setPitch: 0, run, jump };
  }

  function standGoalsFor(sim, e) {
    if (e.wall) return [[e.c, e.r]];
    if (e.t === "item" && e.pos && passable(sim, e.c, e.r)) return [[e.c, e.r]];
    const out = [];
    for (const [dc, dr] of Object.values(DIRS)) if (passable(sim, e.c + dc, e.r + dr)) out.push([e.c + dc, e.r + dr]);
    return out;
  }

  /* ---------------------------------------------------------------- combat */
  function bestWeapon(sim, en, dist) {
    const p = sim.player;
    const ok = (w) => p.weapons.includes(w) && (!WEAPONS[w].ammo || p.ammo[WEAPONS[w].ammo] > 0 || p.mags[w] > 0);
    if ((en.def.armor > 0.2 || en.boss) && ok("ion")) return "ion";
    if (dist < 6 && ok("shotgun")) return "shotgun";
    if (ok("rifle")) return "rifle";
    if (ok("shotgun") && dist < 10) return "shotgun";
    if (ok("ion") && en.max > 80) return "ion";
    return p.weapons.includes("pistol") ? "pistol" : null;
  }
  function threat(sim, only) {
    const p = sim.player;
    let best = null,
      bd = 24;
    for (const en of sim.enemies) {
      if (en.dead || en.state === "dormant" || en.emerge > 0) continue;
      if (only && en.id !== only) continue;
      if (sim.isShielded(en)) continue;
      const d = Math.hypot(en.x - p.x, en.z - p.z);
      if (d > bd) continue;
      if (!sim.lineClear(p.x, p.z, en.x, en.z, true)) continue;
      if (en.state !== "chase" && d > 12 && !only) continue;
      bd = d;
      best = en;
    }
    return best;
  }
  function fight(sim, en, base = {}) {
    const p = sim.player;
    const d = Math.hypot(en.x - p.x, en.z - p.z);
    const want = bestWeapon(sim, en, d);
    const inp = { ...base };
    if (want && p.cur !== want) inp.slot = want;
    const y = en.boss ? en.def.h * 0.55 : en.def.h * 0.62;
    // lead fast movers a little
    const lead = Math.min(0.25, d / 60);
    Object.assign(inp, aimAt(sim, en.x + en.vx * lead, y, en.z + en.vz * lead));
    inp.fire = true;
    if (skill) {
      if (!seen.has(en.id)) seen.set(en.id, sim.t);
      if (sim.t - seen.get(en.id) < skill.react) inp.fire = false;
      errA += (Math.sin(sim.t * 1.7 + en.x) * skill.aimErr - errA) * 0.08;
      errB += (Math.cos(sim.t * 2.3 + en.z) * skill.aimErr * 0.7 - errB) * 0.08;
      inp.setYaw += errA;
      inp.setPitch += errB;
      inp.lean = 0;
    }
    inp.aim = d > 8 && !en.boss;
    // keep some distance from melee
    const close = en.def.reach + 1.4 + (en.boss ? 1.5 : 0);
    if (d < close) {
      inp.mz = -1;
      inp.mx = Math.sin(sim.t * 1.3) > 0 ? 1 : -1;
    } else if (en.boss || en.def.ranged) {
      inp.mx = Math.sin(sim.t * 0.9) > 0 ? 1 : -1;
    }
    if (p.reloadT <= 0 && p.cur && p.mags[p.cur] === 0) inp.reload = true;
    return inp;
  }

  /* ---------------------------------------------------------------- step loop */
  function next(sim) {
    state.i++;
    state.shotsAt = null;
    state.uses = 0;
    state.path = null;
    state.goalKey = "";
    state.stepT = 0;
    state.aimT = 0;
  }
  function fail(why) {
    state.failed = true;
    state.reason = why;
  }

  function tick(sim) {
    const p = sim.player;
    if (state.done || state.failed) return {};
    if (sim.state === "dead") {
      state.deadT += STEP;
      if (state.deadT > 1) {
        state.deadT = 0;
        sim.respawn();
      }
      return {};
    }
    if (sim.state === "complete") {
      state.done = true;
      return {};
    }
    state.stepT += STEP;
    if (state.stepT > 150) {
      fail(`step ${state.i} timed out (${JSON.stringify(route[state.i])})`);
      return {};
    }
    // stuck detection
    if (!state.lastPos || Math.hypot(p.x - state.lastPos[0], p.z - state.lastPos[1]) > 0.5) {
      state.lastPos = [p.x, p.z];
      state.stuck = 0;
    } else state.stuck += STEP;

    const heal = p.hp < p.maxHp * 0.45 && p.medkits > 0 && sim.t - (state.healT || -9) > 1;
    if (heal) state.healT = sim.t;
    const step = route[state.i];
    if (!step) {
      state.done = true;
      return {};
    }
    const [kind, a, b] = step;
    const only = kind === "kill" ? a : null;
    const armed = !!p.cur;
    const en = armed ? threat(sim, null) || (only ? threat(sim, only) : null) : null;
    if (en && kind !== "wait") {
      const inp = fight(sim, en);
      inp.heal = heal;
      return inp;
    }
    let inp = stepInput(sim, kind, a, b);
    if (heal) inp = { ...inp, heal: true };
    if (state.stuck > 2.5 && inp && inp.mz) {
      // nudge sideways when wedged against something
      inp = { ...inp, mx: Math.sin(sim.t * 3) > 0 ? 1 : -1, jump: state.stuck > 4 };
      if (state.stuck > 5) {
        state.path = null;
        state.stuck = 0;
      }
    }
    return inp || {};
  }

  function stepInput(sim, kind, a, b) {
    const p = sim.player;
    switch (kind) {
      case "wait":
        state.waitT += STEP;
        if (state.waitT >= a) {
          state.waitT = 0;
          next(sim);
        }
        return {};
      case "go": {
        const w = walk(sim, [[a, b]]);
        if (!w) next(sim);
        return w || {};
      }
      case "exit": {
        const exits = sim.tiles.filter((t) => t.t === "exit").map((t) => [t.c, t.r]);
        return walk(sim, exits, true) || { mz: 1 };
      }
      case "clear": {
        const live = sim.enemies.filter((e) => !e.dead && e.state !== "dormant" && !sim.isShielded(e) && sim.flowAt(...cellOfE(e)) >= 0);
        if (!live.length) {
          next(sim);
          return {};
        }
        const tgt = live.sort((x, y) => Math.hypot(x.x - p.x, x.z - p.z) - Math.hypot(y.x - p.x, y.z - p.z))[0];
        return walk(sim, [cellOfE(tgt)]) || {};
      }
      case "kill": {
        const tgt = sim.enemyById[a] || sim.enemies.find((e) => e.id === a);
        if (!tgt || tgt.dead) {
          next(sim);
          return {};
        }
        if (sim.isShielded(tgt)) return fail(`${a} is shielded`), {};
        const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
        if (d > 8) return walk(sim, [cellOfE(tgt)]) || {};
        return { ...aimAt(sim, tgt.x, tgt.def.h * 0.5, tgt.z), mx: Math.sin(sim.t) > 0 ? 1 : -1 };
      }
      case "shoot": {
        const e = sim.byId[a];
        if (!e) return fail(`no node ${a}`), {};
        if (e.charged) {
          state.banned = null;
          next(sim);
          return {};
        }
        const box = sim.entBox(e);
        state.banned ||= new Set();
        // cells with a clear shot from the whole cell (centre and four offsets), not too far
        const clearFrom = (x, z) => [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]].every(([dx, dz]) => sim.lineClear(x + dx, z + dz, box.c[0], box.c[2], true));
        const goals = [];
        for (let r = 0; r < sim.H; r++)
          for (let c = 0; c < sim.W; c++) {
            if (!passable(sim, c, r) || sim.tileAt(c, r).t === "acid" || state.banned.has(`${c},${r}`)) continue;
            const [x, z] = cellCenter(c, r);
            if (Math.hypot(box.c[0] - x, box.c[2] - z) < 14 && clearFrom(x, z)) goals.push([c, r]);
          }
        const [pc, pr] = sim.playerCell();
        if (!goals.some(([c, r]) => c === pc && r === pr)) return walk(sim, goals) || {};
        const inp = { ...aimAt(sim, box.c[0], box.c[1], box.c[2]) };
        if (p.cur !== "ion") inp.slot = "ion";
        else if (p.switchT <= 0) {
          inp.fire = true;
          const spent = sim.counters.shots;
          state.shotsAt ??= spent;
          if (spent - state.shotsAt > 5) {
            state.banned.add(`${pc},${pr}`);
            state.shotsAt = null;
          }
        }
        return inp;
      }
      case "use":
      case "code": {
        const e = sim.byId[a];
        if (!e) return fail(`no entity ${a}`), {};
        const times = kind === "code" ? 1 : b ?? 1;
        if (state.uses >= times) {
          next(sim);
          return {};
        }
        const goals = standGoalsFor(sim, e);
        if (!goals.length) return fail(`can't stand next to ${a}`), {};
        const w = walk(sim, goals);
        if (w) return w;
        const box = sim.entBox(e);
        const aim = aimAt(sim, box.c[0], box.c[1], box.c[2]);
        state.aimT += STEP;
        if (sim.focus?.ent === e && state.aimT > 0.1) {
          state.aimT = 0;
          state.uses++;
          if (kind === "code") state.pendingCode = e;
          return { ...aim, use: true };
        }
        if (state.aimT > 3) return fail(`can't target ${a} (focus ${sim.focus?.ent?.id ?? "none"})`), {};
        return aim;
      }
      default:
        return fail(`unknown step ${kind}`), {};
    }
  }
  const cellOfE = (e) => [Math.floor(e.x / CELL), Math.floor(e.z / CELL)];

  const bot = (sim) => {
    if (state.pendingCode) {
      sim.enterCode(state.pendingCode.id, state.pendingCode.code);
      state.pendingCode = null;
    }
    const inp = tick(sim);
    // a human turns the mouse at a limited speed
    if (skill?.turn && inp && inp.setYaw !== undefined) {
      const p = sim.player;
      let d = inp.setYaw - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const max = skill.turn * STEP;
      if (Math.abs(d) > max) {
        inp.setYaw = p.yaw + Math.sign(d) * max;
        if (inp.fire && Math.abs(d) > 0.25) inp.fire = false;
      }
    }
    return inp;
  };
  bot.state = state;
  return bot;
}

/** Run a whole route headlessly. */
export function runRoute(sim, route, { maxT = 900, onEvent, skill } = {}) {
  const bot = createBot(route, { skill });
  let deaths = 0;
  while (sim.t < maxT && !bot.state.done && !bot.state.failed) {
    const inp = bot(sim);
    sim.update(STEP, inp);
    for (const e of sim.events) {
      if (e.type === "death") deaths++;
      onEvent?.(e, sim);
    }
    sim.events = [];
    if (sim.state === "complete") bot.state.done = true;
  }
  return { done: sim.state === "complete", deaths, t: sim.t, step: bot.state.i, reason: bot.state.reason || (sim.state !== "complete" ? "timeout" : ""), hp: sim.player.hp, xp: sim.xp };
}
