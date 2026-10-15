/**
 * Route bot for Prison Escape 3D — plays the REAL game through the same entry
 * points the UI uses (stepPlayer input, pick() + interact(), panel answers).
 * Used headless by simTest.mjs and in the browser via the DEV harness.
 *
 *   const bot = createBot(game, SCRIPTS.routeA);
 *   each frame: const input = bot.frame(dt);  game.stepPlayer(input, dt); game.update(dt);
 *
 * Tasks: {go:[x,z], crouch, sprint} · {use:key} · {wait:s} · {until:(g)=>bool, max} ·
 *        {say:"label"} · {use:"ray", choose:id} · {safe:[tasks], max}
 * A `safe` segment is planned: the bot replays it on a snapshot of the game
 * and only commits once a start time gets through without a chase, alarm or
 * capture (waiting in place — ideally hidden — until then). The sim is
 * deterministic, so the committed run repeats the rehearsal exactly.
 */

/** Deep-enough copy of a running Game for look-ahead (shares static data). */
export function cloneGame(g) {
  const c = Object.create(Game.prototype);
  Object.assign(c, g);
  const cp = (o) => (o == null ? o : Array.isArray(o) ? o.map(cp) : typeof o === "object" ? { ...o } : o);
  c.player = { ...g.player, hideFrom: g.player.hideFrom && { ...g.player.hideFrom } };
  c.flags = new Set(g.flags);
  c.got = new Set(g.got);
  c.inv = [...g.inv];
  c.events = [];
  c.puzzle = { ...g.puzzle, seq: [...g.puzzle.seq], keypad: [...g.puzzle.keypad] };
  c.doors = g.doors.map((d) => ({ ...d }));
  c.doorById = Object.fromEntries(c.doors.map((d) => [d.id, d]));
  c.guards = g.guards.map((x) => ({ ...x, path: cp(x.path), lastSeen: cp(x.lastSeen), target: cp(x.target) }));
  c.inmates = g.inmates.map((x) => ({ ...x }));
  c.cams = g.cams.map((x) => ({ ...x }));
  c.lights = g.lights.map((x) => ({ ...x }));
  c.checkpoint = { ...g.checkpoint };
  c.capture = cp(g.capture);
  c.channel = cp(g.channel);
  c.transition = cp(g.transition);
  c.ended = cp(g.ended);
  c._staticIts = null;
  c.target = null;
  c.stats = { ...g.stats };
  return c;
}
import { Game, Nav, yawTo } from "../sim.js";
import { NOTES } from "../data.js";

export function createBot(game, script, { log = () => {}, stealth = true, rehearse = false } = {}) {
  const nav = new Nav(game.boxes, 0.22, 0.85);
  const pass = (i) => {
    const d = game.doors[i];
    return !d.locked || d.open > 0.9;
  };
  const tasks = script.map((t) => ({ ...t }));
  let ti = 0;
  let path = null;
  let pi = 0;
  let t = 0;
  let stuck = 0;
  let lastPos = null;
  let hold = 0;
  let freezeT = 0;
  const state = { done: false, failed: null, task: null, caught: 0 };

  const eye = () => ({ x: game.player.x, y: game.eyeHeight(), z: game.player.z });
  const dirOf = (yaw, pitch) => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
  function aimAt(key) {
    const it = game.interactables().find((i) => i.key === key);
    if (!it) return null;
    const p = game.player;
    const e = eye();
    p.yaw = yawTo(p.x, p.z, it.x, it.z);
    p.pitch = Math.atan2(it.y - e.y, Math.hypot(it.x - p.x, it.z - p.z));
    game.target = game.pick(e, dirOf(p.yaw, p.pitch));
    return game.target;
  }
  function next(reason = "") {
    if (reason) log(`  ✓ ${reason}`);
    ti++;
    path = null;
    t = 0;
    stuck = 0;
    hold = 0;
  }
  function fail(msg) {
    state.failed = `task ${ti} (${JSON.stringify(tasks[ti], (k, v) => (typeof v === "function" ? "fn" : v))}): ${msg}`;
    state.done = true;
  }
  /** Crude stealth: if any guard is getting suspicious, freeze crouched. */
  function danger() {
    if (!stealth) return false;
    return game.guards.some((g) => g.active && g.seen && g.aware > 0.12 && g.state !== "chase");
  }

  function frame(dt) {
    const input = {};
    if (game.ended) state.done = true;
    if (rehearse && game.capture) state.done = true;
    if (state.done) return input;
    if (game.capture || game.transition) {
      path = null;
      return input;
    }
    const task = tasks[ti];
    state.task = task;
    if (!task) {
      state.done = true;
      return input;
    }
    t += dt;
    const p = game.player;
    if (task.safe) {
      if (task.plan == null || t >= task.plan) {
        // rehearse the segment from right now
        const c = cloneGame(game);
        const sub = createBot(c, task.safe, { stealth: false, rehearse: true });
        let bad = false;
        for (let i = 0; i < (task.look ?? 60) * 60 && !sub.state.done && !bad; i++) {
          const inp = sub.frame(1 / 60);
          c.stepPlayer(inp, 1 / 60);
          c.update(1 / 60);
          for (const e of c.events.splice(0)) if (e.type === "caught" || e.type === "alert" || e.type === "alarm") bad = true;
          if (c.capture) bad = true;
        }
        if (!bad && sub.state.done && !sub.state.failed) {
          log(`  ↳ safe window found after ${t.toFixed(1)} s`);
          tasks.splice(ti, 1, ...task.safe.map((x) => ({ ...x, noFreeze: true })));
          path = null;
          t = 0;
          stuck = 0;
          hold = 0;
          lastPos = null;
          freezeT = 0;
          return frame(dt);
        }
        task.plan = t + (task.step ?? 0.5);
        if (t > (task.max ?? 240)) return fail(`no safe window (${sub.state.failed || (bad ? "detected" : "timeout")})`), input;
      }
      if (task.crouch && !p.crouch && !p.hidden) game.toggleCrouch(true);
      return input;
    }
    if (task.say) {
      log(`- ${task.say}`);
      next();
      return input;
    }
    if (task.go) {
      const [gx, gz] = task.go;
      const want = !!task.crouch;
      if (p.crouch !== want) game.toggleCrouch(want);
      const d = Math.hypot(gx - p.x, gz - p.z);
      if (d < (task.tol ?? 0.3)) {
        next();
        return input;
      }
      if (!task.noFreeze && (freezeT > 0 || danger())) {
        freezeT = danger() ? 0.6 : freezeT - dt;
        if (!p.crouch) game.toggleCrouch(true);
        return input;
      }
      if (!path) {
        path = nav.path(p.x, p.z, gx, gz, pass);
        pi = 0;
        if (!path) return fail(`no path from ${p.x.toFixed(1)},${p.z.toFixed(1)} to ${gx},${gz}`), input;
      }
      while (pi < path.length - 1 && Math.hypot(path[pi][0] - p.x, path[pi][1] - p.z) < 0.25) pi++;
      // open closed (unlocked) doors in the way, like a player would
      for (const d of game.doors) {
        if (d.want || d.locked || d.def.crawl || d.def.kind === "shutter") continue;
        if (Math.hypot(d.def.x - p.x, d.def.z - p.z) > 1.6) continue;
        const it = aimAt(d.id);
        if (it?.key === d.id) game.interact(it);
        return input;
      }
      const [tx, tz] = path[pi];
      p.yaw = yawTo(p.x, p.z, tx, tz);
      input.f = true;
      input.sprint = !!task.sprint;
      // stuck detection → replan
      if (lastPos && Math.hypot(p.x - lastPos[0], p.z - lastPos[1]) < 0.004) stuck += dt;
      else stuck = Math.max(0, stuck - dt);
      lastPos = [p.x, p.z];
      if (stuck > 1.2) {
        path = null;
        stuck = 0;
        // nudge sideways
        input.f = false;
        input.l = (Math.floor(game.clock * 7) & 1) === 0;
        input.r = !input.l;
      }
      if (t > (task.max ?? 90)) fail(`timeout walking to ${gx},${gz} (at ${p.x.toFixed(2)},${p.z.toFixed(2)})`);
      return input;
    }
    if (task.use) {
      const it = aimAt(task.use);
      if (!it || it.key !== task.use) {
        if (t > 1) fail(`can't target ${task.use} from ${p.x.toFixed(2)},${p.z.toFixed(2)} (got ${it?.key})`);
        return input;
      }
      if (!hold) {
        const res = game.interact(it);
        hold = 1;
        if (res?.panel) answerPanel(res.panel);
        if (!game.channel) {
          next(`used ${task.use}`);
          return input;
        }
      }
      if (game.channel) {
        game.updateChannel(dt, true);
        if (t > 8) fail("hold never finished");
        return input;
      }
      next(`used ${task.use} (held)`);
      return input;
    }
    if (task.wait != null) {
      if (task.crouch && !p.crouch) game.toggleCrouch(true);
      if (t >= task.wait) next();
      return input;
    }
    if (task.until) {
      if (task.crouch && !p.crouch) game.toggleCrouch(true);
      if (game.ghost && /Hale|Brandt|Grant|Moss|Reyes|Diaz|Kowalski/.test(task.label || "")) {
        next();
        return input;
      }
      if (task.until(game)) next(task.label || "condition met");
      else if (t > (task.max ?? 120)) fail("condition never met: " + (task.label || ""));
      return input;
    }
    if (task.key) {
      if (task.key === "flash") game.flashlight = !game.flashlight;
      next();
      return input;
    }
    fail("unknown task");
    return input;
  }

  let pendingChoice = null;
  function answerPanel(panel) {
    if (panel.type === "keypad") {
      for (const g of NOTES.accessnote.glyphs) game.keypadPress(g);
    } else if (panel.type === "cctv") {
      game.watchCctv();
    } else if (panel.type === "dialogue" && panel.choices?.length) {
      const want = tasks[ti].choose || pendingChoice;
      if (want) {
        const r = game.choose(panel.npc, want);
        if (!r) fail("choice refused: " + want);
      }
    }
  }
  return { frame, state, aimAt, nav, pass };
}

/* ------------------------------------------------------------------ scripts */
const brandtAway = (g) => {
  const b = g.guards.find((x) => x.id === "brandt");
  return b.x > -15.5 && b.pause > 4.5 && b.state === "patrol";
};
const haleAway = (g) => {
  const h = g.guards.find((x) => x.id === "hale");
  return h.state === "patrol" && h.z < -2 && h.x > 26;
};
const haleAtDesk = (g) => {
  const h = g.guards.find((x) => x.id === "hale");
  return h.state === "patrol" && h.z > 14 && h.pause > 6;
};
const camAway = (id, minAng) => (g) => {
  const c = g.cams.find((x) => x.id === id);
  return Math.sin((g.clock / c.period) * Math.PI * 2) * Math.sign(minAng) > Math.abs(minAng);
};
const haleLeavingSouth = (g) => {
  const h = g.guards.find((x) => x.id === "hale");
  return h.state === "patrol" && h.pause <= 0 && h.wp === 1 && h.z < 2 && h.z > -1;
};
const grantFar = (g) => {
  const gr = g.guards.find((x) => x.id === "grant");
  return gr.x < -6 && gr.state === "patrol" && gr.pause > 0.5;
};
const mossFar = (side) => (g) => {
  const m = g.guards.find((x) => x.id === "moss");
  return m.state === "patrol" && (side < 0 ? m.x < -18 : m.x > 20) && m.pause > 1;
};

export const DAY = [
  { say: "M1 First Night" },
  { go: [2.5, 26.9] },
  { use: "poster" },
  { until: (g) => g.phase === "day" && !g.transition, label: "morning", max: 10 },
  { say: "M2 The Routine" },
  { go: [3.95, 26.0] },
  { use: "sink" },
  { go: [2.5, 23.0] },
  { use: "cell3" },
  { go: [2.5, 19.5] },
  { go: [-20, 1.2], max: 120 },
  { until: (g) => g.mission === 2, label: "M2 done", max: 5 },
  { say: "M3 A Useful Contact" },
  { go: [-20, -4.45] },
  { use: "ray" },
  { go: [-29.1, -8.6] },
  { until: brandtAway, label: "Brandt at the fridges", max: 60, crouch: true },
  { go: [-29.0, -11.3], crouch: true },
  { go: [-28.75, -14.6], crouch: true },
  { use: "rationshelf" },
  { go: [-29.0, -11.0], crouch: true },
  { go: [-29.1, -8.6], crouch: true },
  { go: [-20, -4.45] },
  { use: "ray" },
  { until: (g) => g.mission === 3, label: "M3 done", max: 3 },
  { say: "M4 Hidden Supplies" },
  { go: [-4.6, -9.25] },
  { use: "dryer3" },
  { say: "M5 Restricted Access" },
  { go: [3.25, -6.0] },
  { use: "vent" },
  { go: [5.2, -6.0], crouch: true },
  { go: [6.0, -9.35] },
  { key: "flash" },
  { use: "storagedesk" },
  { go: [12.5, -9.0] },
  { use: "toolshelf" },
  { go: [9.0, 2.3] },
  { use: "storage" },
  { key: "flash" },
  { go: [9.0, 5.0] },
  { go: [23.5, 5.6] },
  { until: (g) => haleAtDesk(g), label: "Hale back at his desk", max: 90 },
  { go: [30.2, -4.9], crouch: true, max: 40 },
  { use: "maint" },
  { until: (g) => g.mission === 5, label: "M5 done", max: 3 },
  { say: "M6 Security Pattern" },
  { go: [34, 2.25] },
  { use: "cctv" },
  { go: [43.6, -12.45] },
  { use: "passlocker" },
  { go: [33, -6.0] },
  { until: (g) => haleAtDesk(g) && camAway("cam_rc", 0.3)(g), label: "Hale at his desk + camera looking west", max: 160 },
  { go: [30.3, -2.0], crouch: true, max: 30 },
  { go: [30.3, 4.0], crouch: true, max: 30 },
  { go: [24.5, 5.6], max: 30 },
  { go: [0, 6.0], max: 60 },
  { go: [10, 10.5] },
  { until: (g) => haleAway(g), label: "Hale away from the station", max: 120 },
  { go: [14.2, 12.0] },
  { go: [17.5, 12.6], crouch: true },
  { go: [20.7, 13.95], crouch: true },
  { use: "gsdesk" },
  { go: [17.0, 12.2], crouch: true },
  { go: [12, 12] },
  { until: (g) => g.mission === 6, label: "M6 done", max: 3 },
  { say: "M7 The Final Plan" },
  { go: [0, 10], max: 60 },
  { go: [-20, -4.45], max: 90 },
];

const NIGHT_START = [
  { until: (g) => g.phase === "night2" && !g.transition, label: "night", max: 10 },
  { go: [2.5, 23.0] },
  { use: "cell3" },
  { safe: [{ go: [1.2, 14.0], crouch: true }, { go: [0.0, 9.0], crouch: true }, { use: "block" }], crouch: true },
  { safe: [{ go: [12.6, 4.3] }, { use: "hide_cor2" }] },
];

export const SCRIPTS = {
  routeA: [
    ...DAY,
    { use: "ray", choose: "A" },
    { say: "M8 Breakout — maintenance route" },
    ...NIGHT_START,
    { safe: [{ use: "hide_cor2" }, { go: [24.2, 5.8] }, { go: [26.0, 4.0], crouch: true }, { go: [29.8, -4.6], crouch: true }, { go: [32.0, -2.4], crouch: true }, { use: "hide_mt" }], max: 300 },
    { safe: [{ use: "hide_mt" }, { go: [44.1, -9.5], crouch: true }, { use: "fusebox" }, { go: [44.1, -6.0], crouch: true }, { use: "brk_pumps" }, { use: "brk_lights" }, { use: "brk_main" }, { go: [38, -13.0], crouch: true }, { until: (g) => g.doorById.tunnel.open > 0.95, label: "shutter up", max: 6 }, { go: [38, -16], crouch: true }], max: 300 },
    { go: [38.6, -43.0], crouch: true, max: 120 },
    { use: "exitA" },
    { go: [38, -54], max: 40 },
    { until: (g) => !!g.ended, label: "escaped", max: 3 },
  ],
  routeB: [
    ...DAY,
    { use: "ray", choose: "B" },
    { say: "M8 Breakout — courtyard route" },
    ...NIGHT_START,
    { safe: [{ use: "hide_cor2" }, { go: [19.5, 4.1] }, { use: "check" }, { go: [19.5, 0.5], crouch: true }, { go: [17.3, -8.4], crouch: true }, { use: "release" }, { go: [24.0, -9.5], crouch: true }, { use: "hide_ck" }], max: 300 },
    { safe: [{ use: "hide_ck" }, { go: [19.5, -12.5], crouch: true }, { go: [-9.0, -21.0], crouch: true }, { go: [-9.05, -24.0], crouch: true }, { use: "floodbox" }, { use: "floodbox" }, { go: [-6.65, -36.6], crouch: true }, { use: "hide_dump" }], max: 300, look: 80 },
    { safe: [{ use: "hide_dump" }, { go: [-1.0, -38.7], crouch: true }, { use: "fence" }, { go: [0, -41.5], crouch: true }, { go: [8, -46.8], crouch: true }, { go: [8, -50.0], crouch: true }, { go: [8, -54] }], max: 300 },
    { until: (g) => !!g.ended, label: "escaped", max: 3 },
  ],
};

/** Runs a script to completion headlessly. */
export function run(game, script, { dt = 1 / 60, maxT = 1800, log, stealth } = {}) {
  const bot = createBot(game, script, { log, stealth });
  let caught = 0;
  for (let i = 0; i < maxT / dt && !bot.state.done; i++) {
    const input = bot.frame(dt);
    game.stepPlayer(input, dt);
    game.update(dt);
    for (const e of game.events.splice(0)) {
      if (e.type === "caught") {
        caught++;
        log?.(`  ✗ CAUGHT by ${e.who} at ${game.player.x.toFixed(1)},${game.player.z.toFixed(1)} (task ${JSON.stringify(bot.state.task, (k, v) => (typeof v === "function" ? "fn" : v))})`);
      }
      if (e.type === "escape") log?.(`  ★ ESCAPED via ${e.routeName}`);
    }
    if (caught > 6) break;
  }
  return { ...bot.state, caught, time: game.time, ended: game.ended };
}
