/**
 * Iron Arena — one match: tanks, projectiles, flags, scoring and rules for
 * Deathmatch / Team Battle / Capture the Flag. Pure simulation (no DOM, no
 * Three.js); the game controller feeds the player's input, calls step(dt) at
 * a fixed rate and drains events for visuals, audio and HUD.
 */
import { getMap } from "./maps/index.js";
import { getArena } from "./arena.js";
import { getNav } from "./nav.js";
import { createTank, stepTank, collideTanks, aimTurret } from "./tank.js";
import { createProjectiles, updateWeapon, updateEffects, stepProjectiles, tryAbility, spawnStrike } from "./combat.js";
import { createBrain, resetBrain, updateBot, notifyHit } from "./ai.js";
import { MODES, POINTS, CALLSIGNS } from "./modes.js";
import { TANKS, tankStats, TEAM_COLORS, DM_COLORS, TEAM_SKIN } from "./tanks.js";
import { rng } from "./util.js";

const PROTECT = 2.5;

export function createMatch(cfg) {
  const mode = MODES[cfg.mode] || MODES.dm;
  const map = getMap(cfg.mapId);
  const A = getArena(map);
  const nav = getNav(A);
  const rand = rng(cfg.seed ?? ((Math.random() * 1e9) | 0));
  const difficulty = cfg.difficulty || "normal";
  const events = [];
  const scheduled = [];

  const M = {
    cfg,
    mode,
    map,
    A,
    nav,
    rand,
    difficulty,
    clock: 0,
    state: "countdown",
    countdown: cfg.countdown ?? 3.2,
    timeLeft: cfg.time ?? mode.time,
    limit: cfg.limit ?? mode.limit,
    scores: [0, 0],
    tanks: [],
    player: null,
    proj: createProjectiles(),
    flags: [],
    bases: [],
    result: null,
    winner: null,
    emit: (e) => events.push(e),
    drain() {
      const out = events.slice();
      events.length = 0;
      return out;
    },
  };
  M.isEnemy = (a, b) => a !== b && (!mode.teams || a.team !== b.team);
  M.dmgScale = (t) => t.dmgScale ?? 1;
  M.schedule = (delay, ev) => scheduled.push({ at: M.clock + delay, ev });

  /* ---------------------------------------------------------- bases / flags */
  for (let team = 0; team < 2; team++) {
    const f = map.flags[team];
    const y = A.surfaceAt(f.x, f.z, 50).h;
    M.bases.push({ x: f.x, y, z: f.z });
    M.flags.push({ team, home: { x: f.x, y, z: f.z }, x: f.x, y, z: f.z, state: "home", carrier: -1, dropT: 0 });
  }
  const dmSpawns = [
    ...map.spawns.team[0],
    ...map.spawns.team[1],
    ...nav.spreadPoints(12, [...map.spawns.team[0], ...map.spawns.team[1]]).map((n) => ({ x: n.x, z: n.z, yaw: Math.atan2(-n.x, -n.z) })),
  ];

  /* ---------------------------------------------------------- roster */
  const player = cfg.player || { tankId: "striker", up: {}, skin: "factory" };
  const upAvg = ((player.up?.armor | 0) + (player.up?.speed | 0) + (player.up?.damage | 0)) / 3;
  const botLevel = difficulty === "easy" ? 0 : difficulty === "normal" ? Math.min(2, Math.round(upAvg)) : Math.min(5, Math.round(upAvg) + 1);
  const botUp = { armor: botLevel, speed: botLevel, damage: botLevel };
  const roster = [];
  const total = mode.teams ? mode.size * 2 : mode.size;
  const names = [...CALLSIGNS].sort(() => rand() - 0.5);
  // varied tank picks: a shuffled bag of all eight, refilled as needed
  let bag = [];
  const pickTank = () => {
    if (!bag.length) bag = TANKS.map((t) => t.id).sort(() => rand() - 0.5);
    return bag.pop();
  };
  // team modes: both sides field the same four tank types (fair line-ups)
  const lineup = [];
  if (mode.teams) {
    const first = cfg.spectate ? pickTank() : player.tankId;
    lineup.push(first);
    bag = bag.filter((id) => id !== first);
    while (lineup.length < mode.size) {
      const id = pickTank();
      if (!lineup.includes(id)) lineup.push(id);
    }
  }
  const mirrored = mode.teams ? [...lineup, ...[...lineup].sort(() => rand() - 0.5)] : null;
  for (let i = 0; i < total; i++) {
    const isPlayer = i === 0 && !cfg.spectate;
    const team = mode.teams ? (i < mode.size ? 0 : 1) : -1;
    const tankId = isPlayer ? player.tankId : cfg.botTanks?.[i] ?? (mirrored ? mirrored[i] : pickTank());
    roster.push({ isPlayer, team, tankId, name: isPlayer ? cfg.playerName || "You" : names[i % names.length] });
  }

  let dmSlot = 0;
  roster.forEach((r, i) => {
    const stats = tankStats(r.tankId, r.isPlayer ? player.up : botUp);
    const team = r.team < 0 ? i : r.team; // DM: everyone their own "team" index
    const sp = pickSpawn({ team: r.team < 0 ? -1 : r.team, id: i }, true, r.team < 0 ? dmSlot++ : undefined);
    const skin = r.isPlayer ? { tank: r.tankId, id: player.skin } : mode.teams ? { tank: r.tankId, team: r.team } : { tank: r.tankId, id: "factory" };
    const t = createTank({ id: i, name: r.name, team, isPlayer: r.isPlayer, stats, skin, color: mode.teams ? TEAM_COLORS[r.team] : DM_COLORS[i % DM_COLORS.length], x: sp.x, z: sp.z, yaw: sp.yaw, A });
    t.realTeam = r.team;
    t.protT = PROTECT;
    if (!r.isPlayer) t.brain = createBrain(t, M);
    M.tanks.push(t);
    if (r.isPlayer) M.player = t;
  });
  // CTF roles: one defender per team, the rest attack (one flex on full bot teams)
  if (mode.id === "ctf")
    for (let team = 0; team < 2; team++) {
      const bots = M.tanks.filter((t) => t.team === team && t.brain);
      bots.forEach((t, k) => (t.brain.role = k === 0 ? "defend" : k === 3 ? "flex" : "attack"));
    }
  M.teamSkin = TEAM_SKIN;

  function pickSpawn(t, initial, slot) {
    if (t.team >= 0 && mode.teams) {
      const pts = map.spawns.team[t.team];
      if (initial) return pts[t.id % pts.length];
      let best = pts[0];
      let bs = -Infinity;
      for (const p of pts) {
        let dEnemy = Infinity;
        let crowd = 0;
        for (const o of M.tanks) {
          if (!o.alive || o.id === t.id) continue;
          const d = Math.hypot(o.x - p.x, o.z - p.z);
          if (d < 7) crowd++;
          if (o.team !== t.team) dEnemy = Math.min(dEnemy, d);
        }
        const s = Math.min(dEnemy, 120) - crowd * 80 + rand() * 6;
        if (s > bs) {
          bs = s;
          best = p;
        }
      }
      return best;
    }
    if (initial && slot != null) {
      // spread the initial DM spawns: take every other point
      const order = [0, 6, 3, 8, 11, 1, 13, 5, 9, 2, 15, 7];
      return dmSpawns[order[slot % order.length] % dmSpawns.length];
    }
    let best = dmSpawns[0];
    let bs = -Infinity;
    for (const p of dmSpawns) {
      let dmin = 200;
      for (const o of M.tanks) if (o.alive && o.id !== t.id) dmin = Math.min(dmin, Math.hypot(o.x - p.x, o.z - p.z));
      const s = dmin + rand() * 12;
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    return best;
  }

  /* ---------------------------------------------------------- damage & kills */
  M.damage = (target, amount, attacker, kind, x, y, z, quiet = false) => {
    if (!target.alive || M.state === "ended") return 0;
    if (attacker && attacker !== target && !M.isEnemy(attacker, target)) return 0;
    if (target.protT > 0) return 0;
    let mul = 1 - target.stats.armor;
    if (target.fx.shield > 0) mul *= 0.35;
    if (target.godMode) mul = 0;
    const dmg = Math.min(target.hp, amount * mul);
    if (dmg <= 0) return 0;
    target.hp -= dmg;
    target.sinceHit = 0;
    if (target.fx.repair > 0 && kind !== "burn") target.fx.repair *= 0.5;
    if (attacker) {
      attacker.dealt += dmg;
      const rec = target.damagers.get(attacker.id) || { amount: 0, t: 0 };
      rec.amount += dmg;
      rec.t = M.clock;
      target.damagers.set(attacker.id, rec);
      notifyHit(target, attacker, M);
    }
    M.emit({ type: "hit", target: target.id, attacker: attacker ? attacker.id : -1, amount: dmg, kind, x, y, z, quiet, shielded: target.fx.shield > 0 });
    if (target.hp <= 0.5) kill(target, attacker, kind);
    return dmg;
  };

  function kill(t, killer, kind) {
    t.hp = 0;
    t.alive = false;
    t.deaths++;
    t.streak = 0;
    t.deathAt = M.clock;
    t.respawnAt = M.clock + (cfg.respawn ?? mode.respawn);
    t.input.fire = false;
    t.fx.cloak = 0;
    t.fx.burnT = 0;
    t.ws.charging = false;
    t.ws.burstLeft = 0;
    const wasCarrier = t.carrying >= 0;
    if (wasCarrier) dropFlag(t);
    if (killer && killer !== t) {
      killer.kills++;
      killer.streak++;
      killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
      killer.score += POINTS.kill + (wasCarrier ? POINTS.carrierKill : 0);
      if (mode.id === "tdm") M.scores[killer.team]++;
    }
    for (const [id, rec] of t.damagers) {
      if (killer && id === killer.id) continue;
      if (M.clock - rec.t < 12 && rec.amount >= t.stats.hp * 0.15) {
        const a = M.tanks[id];
        if (!a || !M.isEnemy(a, t)) continue;
        a.assists++;
        a.score += POINTS.assist;
        M.emit({ type: "assist", id });
      }
    }
    t.damagers.clear();
    M.emit({ type: "kill", victim: t.id, killer: killer ? killer.id : -1, kind, x: t.x, y: t.y, z: t.z, streak: killer ? killer.streak : 0, carrier: wasCarrier });
  }

  function respawn(t) {
    const sp = pickSpawn({ team: mode.teams ? t.team : -1, id: t.id }, false);
    t.x = sp.x;
    t.z = sp.z;
    t.y = A.surfaceAt(sp.x, sp.z, 60).h;
    t.yaw = sp.yaw;
    t.vf = t.vl = t.vy = t.w = 0;
    t.pitch = t.roll = 0;
    t.turret = 0;
    t.gun = 0;
    t.hp = t.stats.hp;
    t.alive = true;
    t.grounded = true;
    t.protT = PROTECT;
    t.sinceHit = 99;
    t.ws.cd = 0.5;
    t.ws.burstLeft = 0;
    t.ws.reloading = false;
    t.ws.clip = t.stats.weapon.clip || 0;
    t.ws.heat = 0;
    t.ws.overheated = false;
    t.ws.charging = false;
    for (const k of Object.keys(t.fx)) if (typeof t.fx[k] === "number" && k !== "burnBy") t.fx[k] = 0;
    t.ab.cd = Math.min(t.ab.cd, 4);
    t.input.ax = t.x + Math.sin(t.yaw) * 50;
    t.input.az = t.z + Math.cos(t.yaw) * 50;
    t.input.ay = t.y + 2;
    t.input.fire = false;
    resetBrain(t, M);
    Object.assign(t.prev, { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: 0, roll: 0, turret: 0, gun: 0 });
    M.emit({ type: "spawn", id: t.id, x: t.x, y: t.y, z: t.z });
  }
  M.respawnNow = (t) => {
    if (!t.alive) respawn(t);
  };
  /** AI failsafe: a bot that made no progress for a long time is quietly re-deployed */
  M.rescue = (t) => {
    if (!t.alive || t.carrying >= 0) return;
    respawn(t);
    t.protT = 0;
    M.emit({ type: "rescue", id: t.id });
  };

  /* ---------------------------------------------------------- flags */
  function dropFlag(t) {
    const f = M.flags[t.carrying];
    t.carrying = -1;
    f.state = "dropped";
    f.carrier = -1;
    f.x = t.x;
    f.z = t.z;
    f.y = A.surfaceAt(t.x, t.z, t.y + 0.5).h;
    f.dropT = 25;
    // never leave a flag where nobody can reach it (deep water / off-grid)
    const nd = nav.nearest(f.x, f.z, f.y);
    if (nd && (A.inWater(f.x, f.z) || Math.hypot(nd.x - f.x, nd.z - f.z) > 6)) {
      f.x = nd.x;
      f.z = nd.z;
      f.y = nd.y;
    }
    M.emit({ type: "flag", action: "drop", team: f.team, by: t.id, x: f.x, y: f.y, z: f.z });
  }
  function returnFlag(f, by, silent = false) {
    f.state = "home";
    f.carrier = -1;
    f.x = f.home.x;
    f.y = f.home.y;
    f.z = f.home.z;
    if (!silent) M.emit({ type: "flag", action: "return", team: f.team, by: by ? by.id : -1 });
  }
  function updateFlags(dt) {
    if (mode.id !== "ctf") return;
    for (const f of M.flags) {
      if (f.state === "carried") {
        const c = M.tanks[f.carrier];
        f.x = c.x;
        f.y = c.y + c.dims.top;
        f.z = c.z;
        continue;
      }
      if (f.state === "dropped") {
        f.dropT -= dt;
        if (f.dropT <= 0) {
          returnFlag(f, null);
          continue;
        }
      }
      for (const t of M.tanks) {
        if (!t.alive) continue;
        const d = Math.hypot(t.x - f.x, t.z - f.z, (t.y - f.y) * 0.6);
        if (d > 4.6) continue;
        if (t.team === f.team) {
          if (f.state === "dropped") {
            t.returns++;
            t.score += POINTS.ret;
            returnFlag(f, t);
          }
        } else if (t.carrying < 0) {
          f.state = "carried";
          f.carrier = t.id;
          t.carrying = f.team;
          t.score += POINTS.take;
          if (t.fx.cloak > 0) {
            t.fx.cloak = 0;
            M.emit({ type: "uncloak", id: t.id });
          }
          M.emit({ type: "flag", action: "take", team: f.team, by: t.id });
          break;
        }
      }
    }
    // captures: carrier at own home while own flag is home
    for (const t of M.tanks) {
      if (!t.alive || t.carrying < 0) continue;
      const home = M.flags[t.team];
      if (home.state !== "home") continue;
      if (Math.hypot(t.x - home.home.x, t.z - home.home.z) < 5.5) {
        const f = M.flags[t.carrying];
        t.carrying = -1;
        t.caps++;
        t.score += POINTS.capture;
        M.scores[t.team]++;
        returnFlag(f, null, true);
        M.emit({ type: "flag", action: "capture", team: f.team, by: t.id, scorer: t.team });
      }
    }
  }

  /* ---------------------------------------------------------- end */
  function ranking() {
    return [...M.tanks].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.score - a.score || a.id - b.id);
  }
  M.ranking = ranking;
  function finish(reason) {
    if (M.state === "ended") return;
    M.state = "ended";
    let result = "draw";
    let winner = null;
    const P = M.player;
    if (mode.teams) {
      if (M.scores[0] !== M.scores[1]) winner = M.scores[0] > M.scores[1] ? 0 : 1;
      if (P) result = winner == null ? "draw" : winner === P.team ? "win" : "loss";
    } else {
      const r = ranking();
      winner = r[0].id;
      const tie = r[1] && r[1].kills === r[0].kills;
      if (P) result = r[0] === P && !tie ? "win" : tie && P.kills === r[0].kills ? "draw" : "loss";
    }
    M.result = result;
    M.winner = winner;
    M.endReason = reason;
    for (const t of M.tanks) t.input.fire = false;
    M.emit({ type: "end", result, winner, reason });
  }
  M.forfeit = () => finish("forfeit");
  function checkEnd() {
    if (mode.teams) {
      if (M.scores[0] >= M.limit || M.scores[1] >= M.limit) return finish("limit");
    } else if (M.tanks.some((t) => t.kills >= M.limit)) return finish("limit");
    if (M.timeLeft <= 0) finish("time");
  }

  /* ---------------------------------------------------------- step */
  M.step = (dt) => {
    if (M.state === "ended") {
      // let the world settle (wrecks smoke, shells land)
      M.clock += dt;
      for (const t of M.tanks) {
        t.input.throttle = 0;
        t.input.steer = 0;
        stepTank(t, A, dt, true);
      }
      stepProjectiles(M, dt);
      return;
    }
    M.clock += dt;
    const live = M.state === "play";
    if (M.state === "countdown") {
      M.countdown -= dt;
      if (M.countdown <= 0) {
        M.state = "play";
        M.emit({ type: "go" });
      }
    }
    for (const t of M.tanks) {
      if (t.brain) {
        if (live) updateBot(M, t, dt);
        else aimTurret(t, dt);
      }
      if (t.input.ability) {
        t.input.ability = false;
        if (live) tryAbility(M, t);
      }
    }
    for (const t of M.tanks) stepTank(t, A, dt, !live);
    for (let i = 0; i < M.tanks.length; i++) {
      const a = M.tanks[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < M.tanks.length; j++) {
        const b = M.tanks[j];
        if (!b.alive) continue;
        if (Math.abs(a.x - b.x) > 9 || Math.abs(a.z - b.z) > 9) continue;
        const imp = collideTanks(a, b);
        if (imp > 3) M.emit({ type: "ram", a: a.id, b: b.id, v: imp, x: (a.x + b.x) / 2, y: a.y + 1, z: (a.z + b.z) / 2 });
      }
    }
    for (const t of M.tanks) {
      updateWeapon(M, t, dt, live);
      updateEffects(M, t, dt);
    }
    stepProjectiles(M, dt);
    for (let i = scheduled.length - 1; i >= 0; i--)
      if (scheduled[i].at <= M.clock) {
        const ev = scheduled[i].ev;
        scheduled.splice(i, 1);
        if (ev.kind === "strike" && M.state !== "ended") spawnStrike(M, ev);
      }
    updateFlags(dt);
    for (const t of M.tanks) if (!t.alive && M.clock >= t.respawnAt && !t.holdRespawn) respawn(t);
    if (live) {
      M.timeLeft = Math.max(0, M.timeLeft - dt);
      checkEnd();
    }
  };

  return M;
}
