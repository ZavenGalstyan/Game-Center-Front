/**
 * Iron Arena — match controller. Runs the simulation at a fixed 60 Hz
 * (frame-rate independent physics, fire rates and AI), renders with
 * interpolation, feeds device input + the camera's aim point to the player
 * tank, routes match events to the world (visuals), audio and HUD, and owns
 * pause / resume / quit. The HUD gets a snapshot via onHud (≈10 Hz) and a
 * per-frame fast callback (crosshair, gun marker, tags, damage numbers).
 */
import { createMatch } from "./engine/match.js";
import { ABILITIES } from "./engine/tanks.js";
import { weaponReady } from "./engine/combat.js";
import { sound } from "./audio.js";
import { themeFor } from "./three/themes.js";
import { getMap } from "./engine/maps/index.js";
import { clamp } from "./engine/util.js";

const STEP = 1 / 60;
const STREAKS = { 2: "DOUBLE KILL", 3: "TRIPLE KILL", 4: "RAMPAGE", 5: "UNSTOPPABLE", 7: "IRON LEGEND" };

export function createGame({ world, input, onHud, onFast, onEnd, onState }) {
  const G = {
    match: null,
    state: "idle", // idle | loading | play | paused | ended
    acc: 0,
    feed: [],
    notices: [],
    hits: [],
    dmgDir: [],
    numbers: [],
    hudT: 0,
    time: 0,
    countdownLast: 4,
    endT: 0,
    slow: 1,
    pauseReason: "",
    cam: { yaw: 0, pitch: 0.22, dist: 13 },
    killer: null,
    cfg: null,
    lastTurret: 0,
    turretRate: 0,
  };
  let nid = 1;
  const notice = (text, kind = "info", sub = "") => {
    G.notices.push({ id: nid++, text, kind, sub, t: G.time });
    if (G.notices.length > 4) G.notices.shift();
  };

  async function start(cfg, onProgress) {
    G.state = "loading";
    onState?.("loading");
    G.cfg = cfg;
    await world.loadMap(cfg.mapId, onProgress);
    const M = createMatch(cfg);
    G.match = M;
    G.acc = 0;
    G.feed = [];
    G.notices = [];
    G.hits = [];
    G.dmgDir = [];
    G.numbers = [];
    G.countdownLast = 4;
    G.endT = 0;
    G.slow = 1;
    G.killer = null;
    G.cam = { yaw: M.player.yaw, pitch: 0.2, dist: G.cam.dist || 13 };
    world.bindMatch(M);
    world.setView({ yaw: G.cam.yaw, pitch: G.cam.pitch, dist: G.cam.dist, scope: 0 });
    input.releaseAll();
    sound.stopMusic();
    sound.ambience(themeFor(getMap(cfg.mapId).theme).ambience);
    G.state = "play";
    onState?.("play");
    return M;
  }

  function pause(reason = "menu") {
    if (G.state !== "play") return;
    G.state = "paused";
    G.pauseReason = reason;
    input.releaseAll();
    input.setActive(false);
    input.exitLock();
    sound.engine(null);
    sound.flame(false);
    onState?.("paused");
  }
  function resume() {
    if (G.state !== "paused") return;
    G.state = "play";
    G.acc = 0;
    input.setActive(true);
    onState?.("play");
  }
  function quit() {
    if (G.match && G.match.state !== "ended") G.match.forfeit?.();
    G.match = null;
    G.state = "idle";
    world.clearMatch();
    sound.stopAmbience();
    sound.engine(null);
    sound.flame(false);
    input.setActive(false);
    input.exitLock();
    onState?.("idle");
  }

  /* ------------------------------------------------------------ events */
  function rel(x, z) {
    const P = G.match.player;
    const dx = x - P.x;
    const dz = z - P.z;
    const dist = Math.hypot(dx, dz);
    // camera right = (-cos yaw, sin yaw)
    const right = -dx * Math.cos(G.cam.yaw) + dz * Math.sin(G.cam.yaw);
    return { dist, pan: dist > 1 ? clamp(right / Math.max(6, dist), -1, 1) : 0 };
  }
  function processEvents(events) {
    const M = G.match;
    const P = M.player;
    for (const e of events) {
      switch (e.type) {
        case "fire":
          if (e.id === P.id) sound.fire(e.kind, { gain: 1 });
          else sound.fire(e.kind, rel(e.x, e.z));
          break;
        case "charge":
          if (e.id === P.id) sound.charge(e.time, { gain: 1 });
          else {
            const r = rel(M.tanks[e.id].x, M.tanks[e.id].z);
            if (r.dist < 70) sound.charge(e.time, r);
          }
          break;
        case "reload":
          if (e.id === P.id) sound.reload(e.time);
          break;
        case "overheat":
          if (e.id === P.id) notice("OVERHEATED", "warn", "Cooling down");
          break;
        case "impact": {
          const r = rel(e.x, e.z);
          if (r.dist < 160) sound.impact(e.kind, r);
          if (e.tank === P.id && e.kind !== "flame") sound.ricochet({ gain: 0.6 });
          break;
        }
        case "hit": {
          if (e.attacker === P.id && e.target !== P.id) {
            const kill = !M.tanks[e.target].alive;
            if (!e.quiet || G.time - (G.hits[G.hits.length - 1]?.t ?? -9) > 0.25) {
              G.hits.push({ t: G.time, kill });
              if (G.hits.length > 6) G.hits.shift();
              if (!e.quiet) sound.hitConfirm(kill);
            }
            // floating damage numbers (merge quiet ticks into the last number)
            const last = G.numbers[G.numbers.length - 1];
            if (e.quiet && last && last.target === e.target && G.time - last.t < 0.35) {
              last.amount += e.amount;
              last.t = G.time;
            } else {
              G.numbers.push({ id: nid++, t: G.time, x: e.x, y: e.y + 1.5, z: e.z, amount: e.amount, target: e.target, crit: e.amount > 150 });
              if (G.numbers.length > 12) G.numbers.shift();
            }
          }
          if (e.target === P.id && e.attacker >= 0 && e.attacker !== P.id) {
            if (!e.quiet) sound.hurt(e.amount);
            const a = M.tanks[e.attacker];
            G.dmgDir.push({ id: nid++, t: G.time, x: a.x, z: a.z, amount: e.amount });
            if (G.dmgDir.length > 6) G.dmgDir.shift();
          }
          break;
        }
        case "kill": {
          const k = e.killer >= 0 ? M.tanks[e.killer] : null;
          const v = M.tanks[e.victim];
          const r = rel(v.x, v.z);
          sound.explosion(1.4, r);
          G.feed.push({ id: nid++, t: G.time, killer: k ? k.name : "", victim: v.name, kTeam: k ? k.realTeam : -1, vTeam: v.realTeam, kColor: k?.color, vColor: v.color, kYou: k === P, vYou: v === P, weapon: k ? k.stats.weapon.name : e.kind, kind: e.kind });
          if (G.feed.length > 6) G.feed.shift();
          if (k === P && v !== P) {
            notice(e.carrier ? "FLAG CARRIER DESTROYED" : "ENEMY DESTROYED", "kill", `+${e.carrier ? 160 : 100}`);
            const s = STREAKS[k.streak];
            if (s) {
              notice(s, "streak", `${k.streak} in a row`);
              sound.streak();
            }
          }
          if (v === P) G.killer = k && k !== P ? { name: k.name, tank: k.stats.name, hp: Math.max(1, Math.round(k.hp)), maxHp: k.stats.hp, color: k.color } : { name: "", tank: "", hp: 0 };
          break;
        }
        case "assist":
          if (e.id === P.id) notice("ASSIST", "assist", "+40");
          break;
        case "flag": {
          const mine = e.team === P.team; // our flag?
          const by = M.tanks[e.by];
          if (e.action === "take") {
            if (by === P) notice("YOU HAVE THE FLAG", "good", "Bring it home!");
            else notice(mine ? "OUR FLAG TAKEN" : "ENEMY FLAG TAKEN", mine ? "bad" : "good", by ? by.name : "");
            sound.flag("take", !mine);
          } else if (e.action === "drop") {
            notice(mine ? "OUR FLAG DROPPED" : "ENEMY FLAG DROPPED", mine ? "warn" : "info", mine ? "Return it!" : "");
            sound.flag("drop", false);
          } else if (e.action === "return") {
            notice(mine ? "OUR FLAG RETURNED" : "ENEMY FLAG RETURNED", mine ? "good" : "info", by === P ? "+80" : "");
            sound.flag("return", mine);
          } else if (e.action === "capture") {
            const good = e.scorer === P.team;
            notice(good ? "FLAG CAPTURED!" : "ENEMY CAPTURED OUR FLAG", good ? "good" : "bad", by === P ? "+300" : by ? by.name : "");
            sound.flag("capture", good);
          }
          break;
        }
        case "ability": {
          if (e.id === P.id) {
            sound.ability(e.ability);
            notice(ABILITIES[P.stats.ability].name.toUpperCase(), "ability", "");
          } else if (e.ability === "inferno" || e.ability === "barrage") {
            const t = M.tanks[e.id];
            const r = rel(t.x, t.z);
            if (r.dist < 60) sound.ability(e.ability);
          }
          break;
        }
        case "whistle": {
          const r = rel(e.x, e.z);
          if (r.dist < 80) sound.whistle(r);
          break;
        }
        case "spawn":
          if (e.id === P.id) {
            G.killer = null;
            G.cam.yaw = P.yaw;
            G.cam.pitch = 0.2;
          }
          break;
        case "go":
          notice("FIGHT!", "go", M.mode.name);
          sound.countdown(true);
          sound.music("battle");
          break;
        case "end":
          G.endT = G.time;
          G.slow = 0.35;
          sound.result(e.result);
          sound.stopMusic();
          break;
        default:
      }
    }
  }

  /* ------------------------------------------------------------ frame */
  function tick(dtReal) {
    G.time += dtReal;
    const M = G.match;
    if (!M) {
      world.frame(dtReal, 1);
      return;
    }
    let alpha = 1;
    const dt = dtReal * G.slow;
    if (G.state === "play") {
      const P = M.player;
      // camera look
      const [lx, ly] = input.takeLook();
      const scoped = input.scopeHeld() && P.alive;
      const zoomK = scoped ? (P.stats.model === "sniper" ? 0.22 : 0.42) : 1;
      G.cam.yaw -= lx * zoomK;
      G.cam.pitch = clamp(G.cam.pitch + ly * zoomK, scoped ? -0.35 : -0.28, scoped ? 0.6 : 0.95);
      const w = input.takeWheel();
      if (w) G.cam.dist = clamp(G.cam.dist + w * 1.6, 7, 24);
      if (input.takeRecenter()) G.cam.yaw = P.yaw;
      world.setView({ yaw: G.cam.yaw, pitch: G.cam.pitch, dist: G.cam.dist, scope: scoped ? 1 : 0 });
      // player controls
      const d = input.drive();
      const live = M.state === "play" && P.alive;
      P.input.throttle = live ? d.throttle : 0;
      P.input.steer = live ? d.steer : 0;
      if (P.alive && world.aim) {
        P.input.ax = world.aim.x;
        P.input.ay = world.aim.y;
        P.input.az = world.aim.z;
      }
      P.input.fire = live && input.fireHeld();
      if (input.takeAbility() && live) P.input.ability = true;
      // fixed-step simulation
      G.acc += Math.min(dt, 0.1);
      let n = 0;
      while (G.acc >= STEP && n < 8) {
        M.step(STEP);
        G.acc -= STEP;
        n++;
        const ev = M.drain();
        if (ev.length) {
          world.handleEvents(ev);
          processEvents(ev);
        }
      }
      if (n === 8) G.acc = 0;
      alpha = G.acc / STEP;
      // countdown beeps
      if (M.state === "countdown") {
        const c = Math.ceil(M.countdown);
        if (c < G.countdownLast) {
          G.countdownLast = c;
          if (c > 0) sound.countdown(false);
        }
      }
      // engine voice
      const tr = Math.abs(P.turret - G.lastTurret) / Math.max(1e-3, dt);
      G.lastTurret = P.turret;
      G.turretRate += (Math.min(3, tr) - G.turretRate) * 0.2;
      sound.engine({ speed: P.vf, throttle: P.input.throttle, alive: P.alive, heavy: P.stats.model === "titan" || P.stats.model === "guardian", light: P.stats.model === "scout" || P.stats.model === "phantom", turretRate: G.turretRate });
      sound.flame(P.alive && P.ws.firing);
      if (M.state === "ended" && G.time - G.endT > 2.8) {
        G.state = "ended";
        G.slow = 1;
        input.setActive(false);
        input.exitLock();
        sound.engine(null);
        sound.flame(false);
        onState?.("ended");
        onEnd?.(M);
      }
    }
    world.frame(G.state === "paused" ? 0 : dt, alpha);
    onFast?.(G, dtReal);
    G.hudT -= dtReal;
    if (G.hudT <= 0) {
      G.hudT = 1 / 10;
      onHud?.(snapshot());
    }
  }

  function snapshot() {
    const M = G.match;
    if (!M) return null;
    const P = M.player;
    const w = P.stats.weapon;
    const ab = ABILITIES[P.stats.ability];
    const ranking = M.ranking();
    return {
      mode: M.mode,
      state: M.state,
      countdown: M.countdown,
      timeLeft: M.timeLeft,
      scores: [...M.scores],
      limit: M.limit,
      hp: P.hp,
      maxHp: P.stats.hp,
      alive: P.alive,
      respawnIn: P.alive ? 0 : Math.max(0, P.respawnAt - M.clock),
      protT: P.protT,
      killer: G.killer,
      weapon: {
        kind: w.kind,
        name: w.name,
        ready: clamp(weaponReady(P), 0, 1),
        clip: P.ws.clip,
        clipMax: w.clip || 0,
        heat: P.ws.heat,
        overheated: P.ws.overheated,
        reloading: P.ws.reloading,
        charging: P.ws.charging,
        burst: P.ws.burstLeft,
      },
      ability: { key: ab.key, name: ab.name, cd: P.ab.cd, cdMax: ab.cd, active: P.ab.active, dur: ab.dur },
      fx: { nitro: P.fx.nitro, shield: P.fx.shield, cloak: P.fx.cloak, focus: P.fx.focus, over: P.fx.over, repair: P.fx.repair, burn: P.fx.burnT },
      kills: P.kills,
      deaths: P.deaths,
      assists: P.assists,
      score: P.score,
      streak: P.streak,
      place: ranking.indexOf(P) + 1,
      team: P.realTeam,
      carrying: P.carrying,
      flags: M.mode.id === "ctf" ? M.flags.map((f) => ({ team: f.team, state: f.state, carrier: f.carrier >= 0 ? M.tanks[f.carrier].name : "", dropT: f.dropT })) : null,
      feed: G.feed.filter((f) => G.time - f.t < 7),
      notices: G.notices.filter((n) => G.time - n.t < 2.8),
      board: M.tanks.map((t) => ({ id: t.id, name: t.name, team: t.realTeam, tank: t.stats.name, kills: t.kills, deaths: t.deaths, assists: t.assists, score: t.score, caps: t.caps, alive: t.alive, isPlayer: t.isPlayer, color: t.color })),
      ended: M.state === "ended",
      result: M.result,
      tankName: P.stats.name,
      model: P.stats.model,
    };
  }

  G.start = start;
  G.pause = pause;
  G.resume = resume;
  G.quit = quit;
  G.tick = tick;
  G.snapshot = snapshot;
  return G;
}
