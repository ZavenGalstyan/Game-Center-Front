/**
 * Midnight Shift — the night simulation. Pure JS (no DOM), so it runs in Node
 * for tools/simTest.mjs and in the browser behind the React shell.
 *
 * One night = one state machine:
 *   intro → play → (powerout) → jumpscare → lost
 *                            ↘ won (6 AM)
 * Robots are tiny finite-state machines on the GRAPH in data.js:
 *   roam (timed movement opportunities)  → doorway (lingering, `wait`)
 *   doorway + door closed when wait ends → retreat (walks back two nodes)
 *   doorway + door open   when wait ends → attack (one jumpscare, game over)
 * Everything the UI/audio needs to react to is pushed to `events`, which
 * the shell drains every frame with takeEvents().
 */
import {
  NIGHTS, ROBOTS, ROBOT_IDS, GRAPH, DIST, DOOR_NODE, NODE_SIDE, NIGHT_SECONDS, HOUR_SECONDS,
  HOLLOW_DOOR_DRAIN, JUMPSCARE_SECONDS, INTRO_SECONDS,
} from "./data.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** -1 west, 0 centre, 1 east — used for footstep panning */
export const NODE_PAN = {
  showroom: 0, dock: 0, assembly: -0.6, boiler: -0.75, westHall: -0.9, leftDoor: -1,
  paint: 0.6, storage: 0.75, eastHall: 0.9, rightDoor: 1,
};

export function createNight(index, { seed = (Math.random() * 2 ** 32) >>> 0, rng = null, skipIntro = false } = {}) {
  const night = NIGHTS[Math.max(0, Math.min(NIGHTS.length - 1, index))];
  const rand = rng || mulberry32(seed);
  const events = [];
  const emit = (type, data = {}) => events.push({ type, ...data });

  const robots = {};
  for (const id of ROBOT_IDS) {
    robots[id] = {
      id,
      node: ROBOTS[id].start,
      level: night.ai[id],
      timer: night.delay[id],
      wait: 0,
      retreat: 0,
      moves: 0,
    };
  }

  const g = {
    night,
    index: night.n - 1,
    seed,
    phase: skipIntro ? "play" : "intro",
    intro: skipIntro ? 0 : INTRO_SECONDS,
    t: 0,
    hourIndex: 0,
    power: 100,
    doors: { L: false, R: false },
    lights: { L: false, R: false },
    monitor: false,
    cam: "showroom",
    robots,
    killer: null,
    jumpT: 0,
    out: null, // power-out sequence { stage, t }
    glitch: 0, // seconds of camera interference left
    tipIndex: 0,
    stats: { blocked: 0, camSwitches: 0, doorToggles: 0, lightToggles: 0, minPower: 100 },
    events,

    /* ------------------------------------------------------------ queries */
    usage() {
      return 1 + (g.monitor ? 1 : 0) + (g.lights.L ? 1 : 0) + (g.lights.R ? 1 : 0) + (g.doors.L ? 1 : 0) + (g.doors.R ? 1 : 0);
    },
    drainRate() {
      let r = night.drain * g.usage();
      for (const id of ROBOT_IDS) if (id === "hollow" && NODE_SIDE[robots[id].node]) r += HOLLOW_DOOR_DRAIN;
      return r;
    },
    hour() {
      return Math.min(6, Math.floor(g.t / HOUR_SECONDS));
    },
    /** robots standing at a node (camera or doorway) */
    at(node) {
      return ROBOT_IDS.filter((id) => robots[id].node === node);
    },
    canAct() {
      return g.phase === "play";
    },
    takeEvents() {
      const e = events.slice();
      events.length = 0;
      return e;
    },

    /* ------------------------------------------------------------ player actions */
    toggleDoor(side) {
      if (!g.canAct() || (side !== "L" && side !== "R")) return false;
      g.doors[side] = !g.doors[side];
      g.stats.doorToggles++;
      emit(g.doors[side] ? "doorClose" : "doorOpen", { side });
      return true;
    },
    setLight(side, on) {
      if (side !== "L" && side !== "R") return false;
      on = !!on;
      if (on && (!g.canAct() || g.monitor)) return false;
      if (g.lights[side] === on) return false;
      g.lights[side] = on;
      if (on) g.stats.lightToggles++;
      emit(on ? "lightOn" : "lightOff", { side, seen: on ? g.at(DOOR_NODE[side]) : [] });
      return true;
    },
    toggleLight(side) {
      return g.setLight(side, !g.lights[side]);
    },
    setMonitor(on) {
      on = !!on;
      if (on && !g.canAct()) return false;
      if (g.monitor === on) return false;
      g.monitor = on;
      if (on) {
        g.setLight("L", false);
        g.setLight("R", false);
      }
      emit(on ? "monitorUp" : "monitorDown", { cam: g.cam });
      return true;
    },
    toggleMonitor() {
      return g.setMonitor(!g.monitor);
    },
    setCam(id) {
      if (!g.canAct() || !g.monitor || !GRAPH[id] || NODE_SIDE[id]) return false;
      if (id === g.cam) return false;
      g.cam = id;
      g.stats.camSwitches++;
      emit("camSwitch", { cam: id });
      return true;
    },

    /* ------------------------------------------------------------ simulation */
    step(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.25);
      if (g.phase === "intro") {
        g.intro -= dt;
        if (g.intro <= 0) {
          g.intro = 0;
          g.phase = "play";
          emit("start");
        }
        return;
      }
      if (g.phase === "won" || g.phase === "lost") return;
      if (g.phase === "jumpscare") {
        g.jumpT += dt;
        if (g.jumpT >= JUMPSCARE_SECONDS) {
          g.phase = "lost";
          emit("lost", { killer: g.killer });
        }
        return;
      }

      g.t += dt;
      if (g.glitch > 0) g.glitch = Math.max(0, g.glitch - dt);
      const h = g.hour();
      if (h !== g.hourIndex) {
        g.hourIndex = h;
        emit("hour", { hour: h });
      }
      if (g.t >= NIGHT_SECONDS) {
        g.t = NIGHT_SECONDS;
        g.phase = "won";
        g.monitor = false;
        g.lights.L = g.lights.R = false;
        emit("won");
        return;
      }
      while (g.tipIndex < night.tips.length && g.t >= night.tips[g.tipIndex].at) emit("tip", { text: night.tips[g.tipIndex++].text });

      if (g.phase === "play") {
        g.power -= g.drainRate() * dt;
        g.stats.minPower = Math.min(g.stats.minPower, Math.max(0, g.power));
        if (g.power <= 0) powerOut();
      }
      for (const id of ROBOT_IDS) {
        stepRobot(robots[id], dt);
        if (g.phase === "jumpscare") return;
      }
      if (g.phase === "powerout") stepPowerOut(dt);
    },
  };

  function levelOf(r) {
    if (r.level <= 0) return 0;
    return r.level + (night.ramp[Math.min(5, g.hourIndex)] || 0);
  }

  function nextNode(r) {
    const n = r.node;
    if (ROBOTS[r.id].route) {
      const route = ROBOTS[r.id].route;
      const i = route.indexOf(n);
      if (i < 0) return route[0];
      if (r.retreat > 0) return route[Math.max(0, i - 1)];
      if (i > 0 && i < route.length - 2 && rand() < night.backChance) return route[i - 1];
      return route[Math.min(route.length - 1, i + 1)];
    }
    const nb = GRAPH[n];
    if (r.retreat > 0) {
      const far = Math.max(...nb.map((m) => DIST[m]));
      const opts = nb.filter((m) => DIST[m] === far);
      return opts[Math.floor(rand() * opts.length)];
    }
    const closer = nb.filter((m) => DIST[m] < DIST[n]);
    if (closer.length && rand() < night.hollowAggro) return closer[Math.floor(rand() * closer.length)];
    return nb[Math.floor(rand() * nb.length)];
  }

  function move(r, to) {
    const from = r.node;
    if (to === from) return;
    r.node = to;
    r.moves++;
    const side = NODE_SIDE[to] || null;
    if (side) r.wait = night.doorWait * ROBOTS[r.id].waitMul * (0.9 + 0.2 * rand());
    emit("move", { id: r.id, from, to, dist: DIST[to], pan: NODE_PAN[to] });
    if (side) emit("arrive", { id: r.id, side, doorClosed: g.doors[side] });
    if (g.monitor && g.phase === "play" && (g.cam === from || g.cam === to)) {
      g.glitch = 0.75;
      emit("camGlitch", { cam: g.cam });
    }
  }

  function stepRobot(r, dt) {
    if (r.level <= 0) return;
    const side = NODE_SIDE[r.node];
    if (side) {
      r.wait -= dt;
      if (r.wait > 0) return;
      if (g.doors[side]) {
        // the door held — walk away
        g.stats.blocked++;
        r.retreat = 2;
        emit("blocked", { id: r.id, side });
        move(r, nextNode(r));
        r.retreat--;
        r.timer = 2.2 + rand() * 1.5;
      } else {
        attack(r.id);
      }
      return;
    }
    r.timer -= dt;
    if (r.timer > 0) return;
    if (r.retreat > 0) {
      move(r, nextNode(r));
      r.retreat--;
      r.timer = r.retreat > 0 ? 2.2 + rand() * 1.5 : night.interval[r.id] * (0.85 + 0.3 * rand());
      return;
    }
    r.timer = night.interval[r.id] * (0.85 + 0.3 * rand());
    if (r.id === "hollow" && g.monitor && g.phase === "play" && g.cam === r.node) {
      emit("stare", { id: r.id });
      return; // watched — it cannot move
    }
    if (rand() * 20 >= levelOf(r)) return;
    move(r, nextNode(r));
  }

  function attack(id) {
    if (g.phase === "jumpscare" || g.phase === "lost" || g.phase === "won") return;
    g.phase = "jumpscare";
    g.killer = id;
    g.jumpT = 0;
    g.monitor = false;
    g.lights.L = g.lights.R = false;
    if (g.out) g.out.stage = "done";
    emit("jumpscare", { id });
  }

  function powerOut() {
    g.power = 0;
    g.phase = "powerout";
    for (const s of ["L", "R"]) {
      if (g.doors[s]) emit("doorOpen", { side: s, forced: true });
      g.doors[s] = false;
      g.lights[s] = false;
    }
    if (g.monitor) emit("monitorDown", { cam: g.cam, forced: true });
    g.monitor = false;
    g.out = { stage: "dark", t: 4 + rand() * 5 };
    emit("powerOut");
  }

  function stepPowerOut(dt) {
    const o = g.out;
    o.t -= dt;
    if (o.t > 0) return;
    if (o.stage === "dark") {
      o.stage = "tune";
      o.t = Math.max(6, 16 - night.n * 1.6 + rand() * 6);
      emit("tune");
    } else if (o.stage === "tune") {
      o.stage = "dark2";
      o.t = 2.4;
      emit("tuneEnd");
    } else if (o.stage === "dark2") {
      attack("hollow");
    }
  }

  return g;
}

