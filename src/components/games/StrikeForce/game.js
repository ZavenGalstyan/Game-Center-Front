/**
 * Strike Force — match controller. Runs the simulation at a fixed 120 Hz
 * (frame-rate independent movement and fire rates), feeds device input to
 * the player, routes match events to the world (visuals), audio and HUD,
 * and owns pause / resume / quit.
 *
 * The HUD gets a mutable snapshot via onHud (≈15 Hz) plus fast callbacks
 * (onFast) every frame for the crosshair, hit markers and damage arrows.
 */
import { createMatch, viewDir } from "./engine/match.js";
import { weaponById } from "./engine/weapons.js";
import { STREAKS } from "./engine/config.js";
import { sound } from "./audio.js";
import { getMap } from "./engine/maps/index.js";
import { themeFor } from "./three/themes.js";

const STEP = 1 / 120;
const SURFACE = { harbor: "concrete", desert: "sand", neon: "concrete", forest: "dirt", snow: "snow" };

export function createGame({ world, input, onHud, onFast, onEnd, onState }) {
  const G = {
    match: null,
    state: "idle", // idle | loading | play | paused | ended
    acc: 0,
    feed: [],
    notices: [],
    hits: [],
    dmg: [],
    weaponKills: {},
    heartT: 0,
    hudT: 0,
    countdownLast: 4,
    lastHp: 100,
    endT: 0,
    surface: "concrete",
    pauseReason: "",
    loadProgress: 0,
    time: 0,
  };
  let noticeId = 1;

  const notice = (text, kind = "info", sub = "") => {
    G.notices.push({ id: noticeId++, text, kind, sub, t: G.time });
    if (G.notices.length > 4) G.notices.shift();
  };

  async function start(cfg) {
    G.state = "loading";
    onState?.("loading");
    G.loadProgress = 0;
    await world.loadMap(cfg.mapId, (p) => {
      G.loadProgress = p;
      onHud?.(null, p);
    });
    const m = createMatch(cfg);
    G.match = m;
    G.acc = 0;
    G.feed = [];
    G.notices = [];
    G.hits = [];
    G.dmg = [];
    G.weaponKills = {};
    G.countdownLast = 4;
    G.lastHp = 100;
    G.endT = 0;
    G.surface = SURFACE[getMap(cfg.mapId).theme] || "concrete";
    world.bindMatch(m);
    input.setView(m.player.yaw, 0);
    input.releaseAll();
    sound.stopMusic();
    sound.ambience(themeFor(getMap(cfg.mapId).theme).ambience);
    G.state = "play";
    onState?.("play");
    return m;
  }

  function pause(reason = "menu") {
    if (G.state !== "play") return;
    G.state = "paused";
    G.pauseReason = reason;
    input.releaseAll();
    input.exitLock();
    onState?.("paused");
  }
  function resume() {
    if (G.state !== "paused") return;
    G.state = "play";
    G.acc = 0;
    onState?.("play");
  }
  function quit() {
    if (G.match && G.state !== "ended") G.match.forfeit?.();
    G.match = null;
    G.state = "idle";
    world.clearMatch();
    sound.stopAmbience();
    input.exitLock();
    onState?.("idle");
  }

  /* ------------------------------------------------------------ events */
  function rel(x, z) {
    const P = G.match.player;
    const dx = x - P.x;
    const dz = z - P.z;
    const dist = Math.hypot(dx, dz);
    const yaw = input.S.yaw;
    const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
    return { dist, pan: dist > 0.5 ? Math.max(-1, Math.min(1, right / Math.max(4, dist))) : 0 };
  }
  function processEvents(events) {
    const M = G.match;
    const P = M.player;
    for (const e of events) {
      switch (e.type) {
        case "shot": {
          const own = e.id === P.id;
          if (own) {
            sound.shot(e.w, { own: true });
            const def = weaponById(e.w);
            if (def.mode === "bolt") setTimeout(() => G.state !== "idle" && sound.cycle("bolt"), 120);
            if (def.mode === "pump") setTimeout(() => G.state !== "idle" && sound.cycle("pump"), 90);
          } else {
            const r = rel(e.ox, e.oz);
            sound.shot(e.w, r);
            // near miss: bullet passes close to the player's head
            const shooter = M.combatants[e.id];
            if (P.alive && M.isEnemy(P, shooter)) {
              const ey = M.eye(P);
              for (const p of e.pellets) {
                if (p.victim === P.id) continue;
                const ax = e.ox;
                const ay = e.oy;
                const az = e.oz;
                const bx = p.x - ax;
                const by = p.y - ay;
                const bz = p.z - az;
                const L2 = bx * bx + by * by + bz * bz;
                const t = Math.max(0, Math.min(1, ((P.x - ax) * bx + (ey - ay) * by + (P.z - az) * bz) / (L2 || 1)));
                const d = Math.hypot(ax + bx * t - P.x, ay + by * t - ey, az + bz * t - P.z);
                if (d < 1.3 && t > 0.05 && t < 0.98) {
                  sound.whiz(r.pan);
                  break;
                }
              }
            }
          }
          break;
        }
        case "hit": {
          if (e.attacker === P.id) {
            const head = e.zone === "head";
            G.hits.push({ t: G.time, head, kill: e.kill });
            sound.hitmarker(head, e.kill);
          }
          if (e.victim === P.id) {
            sound.hurt(e.amount);
            const a = M.combatants[e.attacker];
            G.dmg.push({ t: G.time, x: a.x, z: a.z, amount: e.amount });
            if (G.dmg.length > 6) G.dmg.shift();
          }
          break;
        }
        case "kill": {
          const k = M.combatants[e.killer];
          const v = M.combatants[e.victim];
          G.feed.push({ id: noticeId++, t: G.time, killer: k.name, victim: v.name, kTeam: k.team, vTeam: v.team, kId: k.id, vId: v.id, weapon: weaponById(e.weapon).name, head: e.head });
          if (G.feed.length > 6) G.feed.shift();
          if (e.killer === P.id) {
            G.weaponKills[e.weapon] = (G.weaponKills[e.weapon] || 0) + 1;
            notice(e.head ? "HEADSHOT" : "ENEMY DOWN", "kill", `+${e.head ? 150 : 100}`);
          }
          if (e.victim === P.id) {
            G.killer = { name: k.name, weapon: weaponById(e.weapon).name, hp: Math.max(1, Math.round(k.hp)), head: e.head, id: k.id };
          }
          break;
        }
        case "assist":
          if (e.id === P.id) notice("ASSIST", "assist", "+50");
          break;
        case "streak":
          if (e.id === P.id) {
            const s = STREAKS.find((x) => x.id === e.streak);
            notice(s.name.toUpperCase(), "streak", s.blurb);
            sound.streak();
          } else if (e.streak === "uav" && M.isEnemy(P, M.combatants[e.id]) && M.mode.teams) notice("ENEMY UAV ONLINE", "warn", "Stay moving");
          break;
        case "reload":
          if (e.id === P.id) sound.reload(weaponById(e.w).perShell ? "shell" : e.empty ? "empty" : "tac", e.time);
          else {
            const r = rel(M.combatants[e.id].x, M.combatants[e.id].z);
            if (r.dist < 20) sound.reload("tac", e.time, r);
          }
          break;
        case "shell":
          if (e.id === P.id) sound.shell();
          break;
        case "swap":
          if (e.id === P.id) sound.swap();
          break;
        case "step": {
          if (e.id === P.id) sound.step(G.surface, { own: true, sprint: e.sprint });
          else if (!e.crouch) {
            const c = M.combatants[e.id];
            const r = rel(c.x, c.z);
            if (r.dist < 24) sound.step(G.surface, { ...r, sprint: e.sprint });
          }
          break;
        }
        case "jump":
          if (e.id === P.id) sound.jump();
          break;
        case "land":
          if (e.id === P.id) sound.land(e.v);
          break;
        case "capture": {
          const good = e.team === P.team;
          notice(`${good ? "CAPTURED" : "LOST"} ${e.flag}`, good ? "good" : "bad", good ? "Hold the point" : "Retake it");
          sound.capture(good);
          break;
        }
        case "neutral":
          if (e.from === P.team) notice(`${e.flag} UNDER ATTACK`, "bad");
          break;
        case "spawn":
          if (e.id === P.id) {
            input.setView(P.yaw, 0);
            G.killer = null;
          }
          break;
        case "go":
          notice("FIGHT", "go", M.mode.name);
          sound.countdown(true);
          break;
        case "pickup":
          if (e.id === P.id) notice(weaponById(e.w).name.toUpperCase(), "info", "Weapon acquired");
          break;
        case "ammo":
          if (e.id === P.id) notice("AMMO", "info", "+ magazines");
          break;
        case "end":
          G.endT = G.time;
          sound.victory(!!e.won);
          break;
        default:
      }
    }
  }

  /* ------------------------------------------------------------ frame */
  function tick(dt) {
    G.time += dt;
    const M = G.match;
    if (!M) {
      world.frame(dt);
      return;
    }
    if (G.state === "play") {
      G.acc += Math.min(dt, 0.1);
      let n = 0;
      while (G.acc >= STEP && n < 14) {
        input.apply(M.player.input, M.player);
        const pa = M.player.ads;
        const zoom = M.player.weapons[M.player.cur].def.zoom;
        input.S.adsFactor = 1 - pa + (pa * input.S.adsSens) / Math.pow(zoom, 0.85);
        M.step(STEP);
        G.acc -= STEP;
        n++;
        const ev = M.drain();
        if (ev.length) {
          world.handleEvents(ev);
          processEvents(ev);
        }
      }
      if (n === 14) G.acc = 0;
      // countdown beeps
      if (M.state === "countdown") {
        const c = Math.ceil(M.countdown);
        if (c < G.countdownLast) {
          G.countdownLast = c;
          if (c > 0) sound.countdown(false);
        }
      }
      // sway + inspect
      const [ldx, ldy] = input.takeLookDelta();
      world.vm.look(ldx, ldy);
      if (input.takeInspect()) world.vm.inspect();
      // heartbeat
      const P = M.player;
      if (P.alive && P.hp < 35) {
        G.heartT -= dt;
        if (G.heartT <= 0) {
          sound.heartbeat();
          G.heartT = 0.85;
        }
      }
      if (M.state === "ended" && G.time - G.endT > 2.6) {
        G.state = "ended";
        input.exitLock();
        onState?.("ended");
        onEnd?.(M, G.weaponKills);
      }
    }
    world.frame(dt, { yaw: input.S.yaw, pitch: input.S.pitch });
    onFast?.(G, dt);
    G.hudT -= dt;
    if (G.hudT <= 0) {
      G.hudT = 1 / 15;
      onHud?.(snapshot(), 1);
    }
  }

  /** crosshair spread half-angle (deg) like the real shot computation */
  function spreadDeg() {
    const P = G.match.player;
    const ws = P.weapons[P.cur];
    const def = ws.def;
    const moving = Math.min(1, P.speed / 4.7);
    let s = def.spread + (def.adsSpread - def.spread) * P.ads;
    s += def.moveSpread * moving * (1 - 0.6 * P.ads);
    if (!P.grounded) s += def.airSpread;
    if (P.crouched) s *= 0.85;
    s += ws.bloom * (1 - 0.65 * P.ads);
    return s;
  }

  function snapshot() {
    const M = G.match;
    const P = M.player;
    const ws = P.weapons[P.cur];
    const other = P.weapons[1 - P.cur];
    const near = M.pickupNear(P);
    const ranking = M.ranking();
    const leader = M.mode.teams ? null : [...M.combatants].sort((a, b) => b.kills - a.kills)[0];
    return {
      mode: M.mode,
      state: M.state,
      countdown: M.countdown,
      timeLeft: M.timeLeft,
      scores: M.scores,
      limit: M.mode.limit,
      hp: P.hp,
      armor: P.armor,
      alive: P.alive,
      respawnIn: P.alive ? 0 : Math.max(0, P.respawnAt - M.clock),
      canRespawn: !P.alive && M.clock - (P.deathAt || 0) >= 1.6,
      killer: G.killer,
      weapon: { id: ws.def.id, name: ws.def.name, cat: ws.def.cat, mode: ws.def.mode, mag: ws.mag, magSize: ws.def.mag, reserve: ws.reserve, reloading: ws.reloading, reloadP: ws.reloading ? 1 - ws.reloadT / Math.max(0.05, ws.reloadTotal) : 0, burst: ws.def.burstN },
      other: other ? { id: other.def.id, name: other.def.name, mag: other.mag, reserve: other.reserve } : null,
      slot: P.cur,
      ads: P.ads,
      scoped: ws.def.scope && P.ads > 0.92 && !ws.reloading,
      sprinting: P.sprinting,
      streak: P.streak,
      kills: P.kills,
      deaths: P.deaths,
      score: P.score,
      place: ranking.indexOf(P) + 1,
      leader: leader ? { name: leader.name, kills: leader.kills, you: leader === P } : null,
      flags: M.flags.map((f) => ({ key: f.key, owner: f.owner, progress: f.progress, capTeam: f.capTeam, contested: f.contested, inside: P.alive && Math.hypot(P.x - f.x, P.z - f.z) <= 4.6 })),
      feed: G.feed.filter((f) => G.time - f.t < 7),
      notices: G.notices.filter((n) => G.time - n.t < 2.6),
      pickup: near ? { name: weaponById(near.weapon).name } : null,
      uav: M.mode.teams ? M.uav[P.team] : M.uav[0],
      enemyUav: M.mode.teams ? M.uav[1 - P.team] : 0,
      overdrive: P.overdrive,
      team: P.team,
      combatants: M.combatants.map((c) => ({ id: c.id, name: c.name, team: c.team, kills: c.kills, deaths: c.deaths, assists: c.assists, score: c.score, caps: c.caps, alive: c.alive, isPlayer: c.isPlayer, color: c.color })),
      ended: M.state === "ended",
      result: M.result,
    };
  }

  G.start = start;
  G.pause = pause;
  G.resume = resume;
  G.quit = quit;
  G.tick = tick;
  G.snapshot = () => (G.match ? snapshot() : null);
  G.spreadDeg = () => (G.match ? spreadDeg() : 0);
  G.viewDir = viewDir;
  return G;
}
