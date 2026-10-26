/**
 * Strike Force — one match, fully simulated in plain JS.
 *
 * Every combatant (the player included) is driven by an `input` object:
 *   { mx, mz }        local move (-1..1, +mz = forward, +mx = right)
 *   yaw, pitch        view angles (radians; yaw 0 looks along -z)
 *   fire, ads, sprint, crouch, jump   held buttons
 *   reload, interact  held buttons (edges detected here)
 *   swap              0 | 1 | null — requested weapon slot
 * The player's input comes from devices, bots' from engine/bot.js — the
 * same movement, weapon and hit rules apply to everyone.
 *
 * Output for the renderer / audio / HUD goes through `events` (drain()).
 */
import { createCollision } from "./collision.js";
import { createNav } from "./nav.js";
import { createRng } from "./rng.js";
import { getMap } from "./maps/index.js";
import { weaponById, PRIMARIES, SECONDARIES, damageAt, shotInterval } from "./weapons.js";
import { thinkBot, createBrain } from "./bot.js";
import * as C from "./config.js";

const DEG = Math.PI / 180;
const navCache = new Map();
const colCache = new Map();

export function mapRuntime(mapId) {
  const map = getMap(mapId);
  if (!colCache.has(mapId)) colCache.set(mapId, createCollision(map.boxes, map.bounds));
  if (!navCache.has(mapId)) navCache.set(mapId, createNav(map));
  return { map, col: colCache.get(mapId), nav: navCache.get(mapId) };
}

export const viewDir = (yaw, pitch) => {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
};

const blankInput = () => ({ mx: 0, mz: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, crouch: false, jump: false, reload: false, interact: false, swap: null });

function weaponState(id) {
  const def = weaponById(id);
  return { def, mag: def.mag, reserve: def.reserve, cool: 0, cycleT: 0, reloadT: 0, reloading: false, reloadTotal: 0, shellPhase: 0, burstLeft: 0, latch: false, bloom: 0, lastShot: -9 };
}

export function createMatch(opts = {}) {
  const mode = C.MODES[opts.mode] || C.MODES.tdm;
  const diff = C.DIFFICULTY[opts.difficulty] || C.DIFFICULTY.normal;
  const size = C.SIZES[opts.size] || C.SIZES.standard;
  const rnd = createRng(opts.seed ?? (Math.random() * 2 ** 31) | 0);
  const { map, col, nav } = mapRuntime(opts.mapId || "harbor");
  const events = [];
  const emit = (e) => {
    events.push(e);
    return e;
  };

  const M = {
    mode,
    diff,
    size,
    map,
    col,
    nav,
    rnd,
    events,
    state: "countdown",
    countdown: C.COUNTDOWN,
    t: 0, // live time
    clock: 0, // total time incl. countdown
    timeLeft: mode.time,
    scores: [0, 0],
    combatants: [],
    pickups: [],
    flags: [],
    uav: [0, 0], // team → seconds left
    winner: null,
    result: null,
    player: null,
    nextPickup: 1,
  };

  /* ------------------------------------------------------------ roster */
  const usedNames = new Set();
  const pickName = () => {
    for (let k = 0; k < 50; k++) {
      const n = rnd.pick(C.BOT_NAMES);
      if (!usedNames.has(n)) {
        usedNames.add(n);
        return n;
      }
    }
    return "Bot" + rnd.int(99);
  };
  const botLoadout = () => {
    const r = rnd();
    const cat = r < 0.38 ? "ar" : r < 0.66 ? "smg" : r < 0.78 ? "shotgun" : r < 0.88 ? "sniper" : "lmg";
    const pool = PRIMARIES.filter((w) => w.cat === cat);
    return { primary: rnd.pick(pool).id, secondary: rnd.pick(SECONDARIES).id };
  };
  const mk = (id, name, team, isPlayer, loadout) => {
    const c = {
      id,
      name,
      team,
      isPlayer,
      alive: false,
      hp: C.MAX_HP,
      armor: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      r: C.BODY_R,
      h: C.STAND_H,
      grounded: true,
      crouch: 0,
      crouched: false,
      yaw: 0,
      pitch: 0,
      kickP: 0,
      kickY: 0,
      input: blankInput(),
      prevJump: false,
      prevReload: false,
      prevInteract: false,
      loadout: { ...loadout },
      nextLoadout: null,
      weapons: [weaponState(loadout.primary), weaponState(loadout.secondary)],
      cur: 0,
      switchT: 0,
      ads: 0,
      sprinting: false,
      sprintOutT: 0,
      lastHurt: -99,
      lastShot: -99,
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      headshots: 0,
      shots: 0,
      hits: 0,
      caps: 0,
      respawnAt: 0,
      protect: 0,
      damagers: new Map(),
      stepAcc: 0,
      air: 0,
      onLadder: false,
      overdrive: 0,
      killedBy: null,
      color: null,
      brain: null,
      speed: 0,
    };
    if (!isPlayer || opts.playerIsBot) c.brain = createBrain(c, M);
    return c;
  };

  const teamSize = mode.teams ? size.team : 0;
  const loadout = opts.loadout || { primary: "vx9", secondary: "p9" };
  if (mode.teams) {
    M.player = mk(0, opts.playerName || "You", 0, true, loadout);
    M.combatants.push(M.player);
    for (let k = 1; k < teamSize; k++) M.combatants.push(mk(k, pickName(), 0, false, botLoadout()));
    for (let k = 0; k < teamSize; k++) M.combatants.push(mk(teamSize + k, pickName(), 1, false, botLoadout()));
  } else {
    M.player = mk(0, opts.playerName || "You", 0, true, loadout);
    M.combatants.push(M.player);
    for (let k = 1; k < size.ffa; k++) M.combatants.push(mk(k, pickName(), k, false, botLoadout()));
    M.combatants.forEach((c, i) => (c.color = C.FFA_COLORS[i % C.FFA_COLORS.length]));
  }

  if (mode.id === "dom") {
    for (const key of ["A", "B", "C"]) {
      const f = map.flags[key];
      M.flags.push({ key, x: f.x, z: f.z, y: col.floorAt(f.x, 3, f.z, 0.2, 0, 3.5), owner: -1, progress: 0, capTeam: -1, contested: false, tickT: 0 });
    }
  }

  const isEnemy = (a, b) => a !== b && (mode.teams ? a.team !== b.team : true);
  M.isEnemy = isEnemy;
  M.eye = (c) => c.y + C.EYE_CROUCH + (C.EYE_STAND - C.EYE_CROUCH) * (1 - c.crouch);

  /* ------------------------------------------------------------ spawning */
  const allSpawns = [...map.spawns[0], ...map.spawns[1]];
  const ffaSpawns = [...allSpawns, ...map.hot.map((h) => ({ x: h.x, z: h.z, yaw: rnd() * Math.PI * 2 }))].filter((s) => nav.walkable(nav.cellOf(s.x, s.z)));
  function chooseSpawn(c) {
    let list;
    if (!mode.teams) list = ffaSpawns;
    else {
      list = map.spawns[c.team];
      if (mode.id === "dom") {
        // add spawns behind flags our team holds
        const own = M.flags.filter((f) => f.owner === c.team);
        if (own.length && rnd() < 0.5) {
          const extra = [];
          for (const f of own) {
            for (let k = 0; k < 6; k++) {
              const cell = nav.nearest(f.x + rnd.range(-9, 9), f.z + rnd.range(-9, 9), 8);
              if (cell >= 0) {
                const p = nav.posOf(cell);
                extra.push({ x: p.x, z: p.z, yaw: c.team === 0 ? -Math.PI / 2 : Math.PI / 2 });
              }
            }
          }
          list = [...list, ...extra];
        }
      }
    }
    let best = list[0];
    let bestScore = -Infinity;
    for (const s of list) {
      let minD = 60;
      let seen = false;
      let crowd = false;
      for (const o of M.combatants) {
        if (!o.alive || o === c) continue;
        const d = Math.hypot(o.x - s.x, o.z - s.z);
        if (d < 1.4) crowd = true;
        if (!isEnemy(c, o)) continue;
        if (d < minD) minD = d;
        if (d < 45 && col.los(o.x, M.eye(o), o.z, s.x, 1.5, s.z)) seen = true;
      }
      const score = minD - (seen ? 30 : 0) - (crowd ? 50 : 0) + rnd() * 6;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  function spawn(c) {
    if (c.nextLoadout) {
      c.loadout = c.nextLoadout;
      c.nextLoadout = null;
    }
    const s = chooseSpawn(c);
    c.x = s.x;
    c.z = s.z;
    c.y = Math.max(0, col.floorAt(s.x, 2, s.z, c.r, 0, 2.5));
    c.vx = c.vy = c.vz = 0;
    c.yaw = s.yaw + (rnd() - 0.5) * 0.3;
    c.pitch = 0;
    c.kickP = c.kickY = 0;
    c.input.yaw = c.yaw;
    c.input.pitch = 0;
    c.hp = C.MAX_HP;
    c.armor = 0;
    c.alive = true;
    c.crouch = 0;
    c.crouched = false;
    c.h = C.STAND_H;
    c.weapons = [weaponState(c.loadout.primary), weaponState(c.loadout.secondary)];
    c.cur = 0;
    c.switchT = c.weapons[0].def.raise * 0.6;
    c.ads = 0;
    c.protect = C.SPAWN_PROTECT;
    c.streak = 0;
    c.overdrive = 0;
    c.damagers.clear();
    c.killedBy = null;
    c.lastHurt = -99;
    if (c.brain) c.brain.reset(c, M);
    emit({ type: "spawn", id: c.id });
  }
  M.combatants.forEach(spawn);

  /* ------------------------------------------------------------ geometry helpers */
  function coneDir(d, angDeg) {
    if (angDeg <= 0) return d;
    const a = angDeg * DEG * Math.sqrt(rnd());
    const th = rnd() * Math.PI * 2;
    // basis
    let ux = 0;
    let uy = 1;
    let uz = 0;
    if (Math.abs(d.y) > 0.95) {
      ux = 1;
      uy = 0;
    }
    let rx = d.y * uz - d.z * uy;
    let ry = d.z * ux - d.x * uz;
    let rz = d.x * uy - d.y * ux;
    const rl = Math.hypot(rx, ry, rz);
    rx /= rl;
    ry /= rl;
    rz /= rl;
    const vx = ry * d.z - rz * d.y;
    const vy = rz * d.x - rx * d.z;
    const vz = rx * d.y - ry * d.x;
    const tn = Math.tan(a);
    const cx = Math.cos(th) * tn;
    const cy = Math.sin(th) * tn;
    const x = d.x + rx * cx + vx * cy;
    const y = d.y + ry * cx + vy * cy;
    const z = d.z + rz * cx + vz * cy;
    const l = Math.hypot(x, y, z);
    return { x: x / l, y: y / l, z: z / l };
  }

  function raySphere(ox, oy, oz, d, cx, cy, cz, r) {
    const lx = cx - ox;
    const ly = cy - oy;
    const lz = cz - oz;
    const tc = lx * d.x + ly * d.y + lz * d.z;
    if (tc < 0) return Infinity;
    const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
    if (d2 > r * r) return Infinity;
    return tc - Math.sqrt(r * r - d2);
  }
  // ray vs vertical capsule (segment along y from y0 to y1, radius r)
  function rayCapsule(ox, oy, oz, d, cx, cz, y0, y1, r) {
    // closest approach between ray and the vertical segment
    const wx = ox - cx;
    const wz = oz - cz;
    const a = d.x * d.x + d.z * d.z;
    let t;
    if (a < 1e-8) t = 0;
    else t = -(wx * d.x + wz * d.z) / a;
    if (t < 0) t = 0;
    let py = oy + d.y * t;
    py = Math.max(y0, Math.min(y1, py));
    // refine with sphere at that height
    return raySphere(ox, oy, oz, d, cx, py, cz, r);
  }

  /** returns { c, zone, t } for the first combatant a ray hits before maxT */
  function hitCombatant(shooter, ox, oy, oz, d, maxT) {
    let best = null;
    let bestT = maxT;
    for (const o of M.combatants) {
      if (!o.alive || o === shooter || !isEnemy(shooter, o)) continue;
      // cheap reject
      const ex = o.x - ox;
      const ez = o.z - oz;
      const along = ex * d.x + ez * d.z;
      if (along < -1 || along > bestT + 1) continue;
      const eye = M.eye(o);
      const headY = eye + 0.06;
      const torsoTop = eye - 0.22;
      const torsoBot = o.y + 0.95 - 0.38 * o.crouch;
      let t = raySphere(ox, oy, oz, d, o.x, headY, o.z, 0.15);
      if (t < bestT) {
        bestT = t;
        best = { c: o, zone: "head", t };
      }
      t = rayCapsule(ox, oy, oz, d, o.x, o.z, torsoBot, torsoTop, 0.26);
      if (t < bestT) {
        bestT = t;
        best = { c: o, zone: "body", t };
      }
      t = rayCapsule(ox, oy, oz, d, o.x, o.z, o.y + 0.12, torsoBot, 0.21);
      if (t < bestT) {
        bestT = t;
        best = { c: o, zone: "limb", t };
      }
    }
    return best;
  }

  /* ------------------------------------------------------------ damage */
  function damage(victim, attacker, amount, info) {
    if (!victim.alive || M.state !== "live") return;
    if (victim.protect > 0) return;
    let dmg = amount;
    if (victim.armor > 0) {
      const a = Math.min(victim.armor, dmg * 0.7);
      victim.armor -= a;
      dmg -= a;
    }
    victim.hp -= dmg;
    victim.lastHurt = M.clock;
    const rec = victim.damagers.get(attacker.id) || { dmg: 0, t: 0 };
    rec.dmg += amount;
    rec.t = M.clock;
    victim.damagers.set(attacker.id, rec);
    emit({ type: "hit", attacker: attacker.id, victim: victim.id, amount, zone: info.zone, kill: victim.hp <= 0, x: attacker.x, z: attacker.z });
    if (victim.brain) victim.brain.onHurt(victim, attacker, M);
    if (victim.hp <= 0) kill(victim, attacker, info);
  }

  function kill(victim, killer, info) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.streak = 0;
    victim.armor = 0;
    victim.killedBy = killer.id;
    victim.respawnAt = M.clock + (victim.isPlayer && !opts.playerIsBot ? C.RESPAWN_PLAYER : C.RESPAWN_BOT);
    victim.deathAt = M.clock;
    killer.kills++;
    killer.streak++;
    killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
    const head = info.zone === "head";
    if (head) killer.headshots++;
    killer.score += 100 + (head ? 50 : 0);
    for (const [aid, rec] of victim.damagers) {
      if (aid === killer.id || M.clock - rec.t > 9 || rec.dmg < 25) continue;
      const a = M.combatants[aid];
      a.assists++;
      a.score += 50;
      emit({ type: "assist", id: aid, victim: victim.id });
    }
    if (mode.id === "tdm") M.scores[killer.team]++;
    emit({ type: "kill", killer: killer.id, victim: victim.id, weapon: info.weapon, head, wall: false, streak: killer.streak, x: victim.x, y: victim.y, z: victim.z, yaw: victim.yaw, dirX: info.dx || 0, dirZ: info.dz || 0 });
    for (const s of C.STREAKS) if (killer.streak === s.kills) award(killer, s);
    // weapon drop
    const w = victim.weapons[0];
    if (w && (w.mag > 0 || w.reserve > 0)) {
      M.pickups.push({ id: M.nextPickup++, weapon: w.def.id, mag: w.mag, reserve: Math.min(w.reserve, w.def.mag * 2), x: victim.x, y: victim.y, z: victim.z, t: 28 });
      if (M.pickups.length > 10) M.pickups.shift();
    }
  }

  function award(c, s) {
    emit({ type: "streak", id: c.id, streak: s.id, name: s.name });
    if (s.id === "uav") M.uav[mode.teams ? c.team : c.id === 0 ? 0 : 1] = s.time;
    else if (s.id === "overdrive") c.overdrive = s.time;
    else if (s.id === "plating") c.armor = 60;
  }

  /* ------------------------------------------------------------ per-combatant step */
  function stepMove(c, dt) {
    const inp = c.input;
    const ws = c.weapons[c.cur];
    const def = ws.def;
    c.yaw = inp.yaw;
    c.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch));
    // crouch
    const wantCrouch = inp.crouch && !c.onLadder;
    if (wantCrouch) c.crouched = true;
    else if (c.crouched && !col.blocked(c.x, c.y + 0.02, c.z, c.r - 0.02, C.STAND_H - 0.02)) c.crouched = false;
    c.crouch += ((c.crouched ? 1 : 0) - c.crouch) * Math.min(1, dt * 12);
    c.h = c.crouched ? C.CROUCH_H : C.STAND_H;
    // wish direction
    let mx = inp.mx;
    let mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const sy = Math.sin(c.yaw);
    const cy = Math.cos(c.yaw);
    const wx = -sy * mz + cy * mx;
    const wz = -cy * mz - sy * mx;
    const canSprint = inp.sprint && mz > 0.35 && !c.crouched && c.grounded !== false && !(inp.ads && c.ads > 0.2) && M.state === "live";
    if (c.sprinting && !canSprint) c.sprintOutT = def.sprintOut;
    c.sprinting = canSprint && (c.grounded || c.sprinting);
    let speed = c.sprinting ? C.SPRINT : c.crouched ? C.CROUCH_SPEED : C.WALK;
    speed *= 1 - (1 - C.ADS_SPEED) * c.ads;
    speed *= def.move;
    if (c.overdrive > 0) speed *= 1.15;
    if (M.state !== "live") speed = 0;
    const tx = wx * speed;
    const tz = wz * speed;
    const acc = c.grounded ? (ml > 0.05 ? C.ACCEL : C.FRICTION) : C.AIR_ACCEL;
    const dvx = tx - c.vx;
    const dvz = tz - c.vz;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = acc * dt;
    if (dl <= maxDv) {
      c.vx = tx;
      c.vz = tz;
    } else {
      c.vx += (dvx / dl) * maxDv;
      c.vz += (dvz / dl) * maxDv;
    }
    // jump
    if (inp.jump && !c.prevJump && c.grounded && M.state === "live") {
      if (c.crouched) c.crouched = !!col.blocked(c.x, c.y + 0.02, c.z, c.r - 0.02, C.STAND_H - 0.02);
      else {
        c.vy = C.JUMP_V;
        c.grounded = false;
        emit({ type: "jump", id: c.id });
      }
    }
    c.prevJump = inp.jump;
    // ladders
    c.onLadder = false;
    for (const L of map.ladders) {
      if (c.x + c.r > L.x0 - 0.15 && c.x - c.r < L.x1 + 0.15 && c.z + c.r > L.z0 - 0.15 && c.z - c.r < L.z1 + 0.15 && c.y < L.top + 0.05) {
        if (mz > 0.2 || inp.jump) {
          c.onLadder = true;
          c.vy = C.LADDER_V;
          if (c.y > L.top - 0.6) {
            // help over the lip
            const push = L.face === "s" ? -1 : L.face === "n" ? 1 : 0;
            const pushX = L.face === "e" ? -1 : L.face === "w" ? 1 : 0;
            c.vz += push * 3 * dt * 60 * 0.05;
            c.vx += pushX * 3 * dt * 60 * 0.05;
          }
        } else if (mz < -0.2) {
          c.onLadder = true;
          c.vy = -C.LADDER_V;
        } else if (!c.grounded) {
          c.onLadder = true;
          c.vy = 0;
        }
      }
    }
    const vyBefore = c.vy;
    const wasGrounded = c.grounded;
    col.move(c, dt, c.onLadder ? 0 : C.GRAVITY);
    if (!wasGrounded && c.grounded && vyBefore < -4.5) emit({ type: "land", id: c.id, v: -vyBefore });
    if (!c.grounded) c.air += dt;
    else c.air = 0;
    c.speed = Math.hypot(c.vx, c.vz);
    if (c.grounded && c.speed > 1.2) {
      c.stepAcc += c.speed * dt;
      const stride = c.sprinting ? 2.5 : c.crouched ? 1.5 : 1.9;
      if (c.stepAcc > stride) {
        c.stepAcc -= stride;
        emit({ type: "step", id: c.id, sprint: c.sprinting, crouch: c.crouched });
      }
    }
    // out-of-world safety
    if (c.y < -5 || !Number.isFinite(c.x) || !Number.isFinite(c.z)) {
      const cell = nav.nearest(c.x || 0, c.z || 0, 40);
      const p = cell >= 0 ? nav.posOf(cell) : map.spawns[0][0];
      c.x = p.x;
      c.z = p.z;
      c.y = 0.5;
      c.vx = c.vy = c.vz = 0;
    }
  }

  function startReload(c, ws) {
    const def = ws.def;
    if (ws.reloading || ws.reserve <= 0 || ws.mag >= def.mag) return;
    ws.reloading = true;
    const sp = c.overdrive > 0 ? 1.45 : 1;
    if (def.perShell) {
      ws.shellPhase = 0;
      ws.reloadT = def.shellStart / sp;
      ws.reloadTotal = (def.shellStart + def.shellTime * Math.min(ws.reserve, def.mag - ws.mag)) / sp;
    } else {
      ws.reloadT = (ws.mag === 0 ? def.reloadEmpty : def.reload) / sp;
      ws.reloadTotal = ws.reloadT;
      ws.reloadEmpty = ws.mag === 0;
    }
    emit({ type: "reload", id: c.id, w: def.id, empty: ws.mag === 0, time: ws.reloadTotal });
  }
  M.startReload = startReload;

  function stepReload(c, ws, dt) {
    if (!ws.reloading) return;
    const def = ws.def;
    const sp = c.overdrive > 0 ? 1.45 : 1;
    ws.reloadT -= dt;
    if (ws.reloadT > 0) return;
    if (def.perShell) {
      if (ws.shellPhase > 0 || def.shellStart === 0) {
        ws.mag++;
        ws.reserve--;
        emit({ type: "shell", id: c.id });
      }
      ws.shellPhase++;
      if (ws.mag >= def.mag || ws.reserve <= 0) {
        ws.reloading = false;
        ws.cycleT = Math.max(ws.cycleT, 0.25);
        emit({ type: "reloaded", id: c.id, w: def.id });
      } else ws.reloadT += def.shellTime / sp;
    } else {
      const need = def.mag - ws.mag;
      const take = Math.min(need, ws.reserve);
      ws.mag += take;
      ws.reserve -= take;
      ws.reloading = false;
      emit({ type: "reloaded", id: c.id, w: def.id });
    }
  }

  function cancelReload(ws) {
    if (!ws.reloading) return;
    ws.reloading = false;
    ws.reloadT = 0;
  }

  function fireShot(c, ws) {
    const def = ws.def;
    ws.mag--;
    // keep the fractional remainder so the real fire rate matches `rpm`
    ws.cool = Math.max(-1 / 60, ws.cool) + shotInterval(def);
    if (def.mode === "bolt" || def.mode === "pump") ws.cycleT = def.cycle;
    ws.lastShot = M.clock;
    c.lastShot = M.clock;
    c.shots++;
    const eye = M.eye(c);
    const yaw = c.yaw + c.kickY;
    const pitch = c.pitch + c.kickP;
    const base = viewDir(yaw, pitch);
    // spread
    const moving = Math.min(1, c.speed / C.WALK);
    let spread = def.spread + (def.adsSpread - def.spread) * c.ads;
    spread += def.moveSpread * moving * (1 - 0.6 * c.ads);
    if (!c.grounded) spread += def.airSpread;
    if (c.crouched) spread *= 0.85;
    spread += ws.bloom * (1 - 0.65 * c.ads);
    if (c.brain) spread += c.brain.extraSpread || 0;
    ws.bloom = Math.min(def.bloomMax, ws.bloom + def.bloom);
    // recoil
    const rk = (c.ads > 0.5 ? 0.78 : 1) * (c.crouched ? 0.85 : 1);
    c.kickP += def.recoilV * DEG * rk;
    c.kickY += (rnd() * 2 - 1) * def.recoilH * DEG * rk;
    const pellets = [];
    const ox = c.x;
    const oy = eye;
    const oz = c.z;
    const dmgScale = c.brain && !c.isPlayer ? diff.dmg : 1;
    let anyHit = false;
    const hitsBy = new Map();
    for (let p = 0; p < def.pellets; p++) {
      const d = coneDir(base, spread);
      const range = def.cat === "shotgun" ? 40 : 220;
      const wh = col.ray(ox, oy, oz, d.x, d.y, d.z, range);
      const tw = wh ? wh.t : range;
      const ch = hitCombatant(c, ox, oy, oz, d, tw);
      if (ch) {
        const dist = ch.t;
        const mul = ch.zone === "head" ? def.head : ch.zone === "limb" ? def.limb : 1;
        const amount = damageAt(def, dist) * mul * dmgScale;
        const prev = hitsBy.get(ch.c) || { amount: 0, zone: "limb" };
        prev.amount += amount;
        if (ch.zone === "head" || (ch.zone === "body" && prev.zone === "limb")) prev.zone = ch.zone;
        hitsBy.set(ch.c, prev);
        anyHit = true;
        pellets.push({ x: ox + d.x * ch.t, y: oy + d.y * ch.t, z: oz + d.z * ch.t, hit: ch.zone, victim: ch.c.id, dx: d.x, dy: d.y, dz: d.z });
      } else if (wh) {
        pellets.push({ x: ox + d.x * wh.t, y: oy + d.y * wh.t, z: oz + d.z * wh.t, nx: wh.nx, ny: wh.ny, nz: wh.nz, hit: "world", m: wh.box ? wh.box.m : "ground", k: wh.box ? wh.box.k : "ground", dx: d.x, dy: d.y, dz: d.z });
      } else pellets.push({ x: ox + d.x * range, y: oy + d.y * range, z: oz + d.z * range, hit: "none", dx: d.x, dy: d.y, dz: d.z });
    }
    if (anyHit) c.hits++;
    emit({ type: "shot", id: c.id, w: def.id, ox, oy, oz, pellets, silenced: !!def.silenced });
    for (const [v, h] of hitsBy) damage(v, c, h.amount, { zone: h.zone, weapon: def.id, dx: base.x, dz: base.z });
    // bots hear gunfire
    for (const o of M.combatants) if (o.brain && o.alive && o !== c && isEnemy(o, c) && Math.hypot(o.x - c.x, o.z - c.z) < def.loud) o.brain.hear(o, c, M);
    if (ws.mag === 0 && ws.reserve > 0 && !def.perShell) ws.autoReload = 0.18;
  }

  function stepWeapon(c, dt) {
    const inp = c.input;
    let ws = c.weapons[c.cur];
    ws.cool -= dt;
    ws.cycleT -= dt;
    c.switchT -= dt;
    c.sprintOutT -= dt;
    // recoil recovery
    const def = ws.def;
    const firing = M.clock - ws.lastShot < shotInterval(def) * 1.6;
    const rec = def.recoilRec * (firing ? 0.25 : 1);
    c.kickP *= Math.exp(-rec * dt);
    c.kickY *= Math.exp(-rec * dt);
    ws.bloom = Math.max(0, ws.bloom - def.bloomRec * dt * (firing ? 0.2 : 1));
    // swap
    if (inp.swap !== null && inp.swap !== undefined && inp.swap !== c.cur && c.weapons[inp.swap]) {
      cancelReload(ws);
      ws.burstLeft = 0;
      c.cur = inp.swap;
      ws = c.weapons[c.cur];
      c.switchT = ws.def.raise * (c.overdrive > 0 ? 0.7 : 1);
      c.ads = Math.min(c.ads, 0.2);
      emit({ type: "swap", id: c.id, w: ws.def.id, slot: c.cur });
    }
    inp.swap = null;
    const d = ws.def;
    // reload
    if (inp.reload && !c.prevReload) startReload(c, ws);
    c.prevReload = inp.reload;
    if (ws.autoReload !== undefined) {
      ws.autoReload -= dt;
      if (ws.autoReload <= 0) {
        ws.autoReload = undefined;
        if (ws.mag === 0) startReload(c, ws);
      }
    }
    if (ws.mag === 0 && ws.reserve > 0 && !ws.reloading && inp.fire && ws.cool <= 0 && c.switchT <= 0) startReload(c, ws);
    if (c.switchT <= 0) stepReload(c, ws, dt);
    // ADS
    const wantAds = inp.ads && !c.sprinting && c.switchT <= 0 && !c.onLadder && M.state === "live";
    const adsRate = 1 / (d.adsTime * (c.overdrive > 0 ? 0.75 : 1));
    c.ads = Math.max(0, Math.min(1, c.ads + (wantAds ? adsRate : -adsRate * 1.3) * dt));
    // fire
    const trigger = inp.fire;
    const pressed = trigger && !ws.latch;
    ws.latch = trigger;
    if (pressed) ws.queued = 0.12;
    else if (ws.queued > 0) ws.queued -= dt;
    const ready = M.state === "live" && c.switchT <= 0 && !c.sprinting && c.sprintOutT <= 0 && ws.cycleT <= 0 && ws.cool <= 0 && ws.mag > 0 && !c.onLadder;
    if (d.perShell && ws.reloading && trigger && ws.mag > 0 && ws.reloadT > 0) cancelReload(ws);
    if (!ready || (ws.reloading && !d.perShell) || ws.reloading) {
      if (d.mode === "burst" && ws.burstLeft > 0 && (ws.mag === 0 || ws.reloading)) ws.burstLeft = 0;
      return;
    }
    if (d.mode === "auto") {
      if (trigger) fireShot(c, ws);
    } else if (d.mode === "burst") {
      if (ws.burstLeft <= 0 && (pressed || ws.queued > 0)) {
        ws.burstLeft = d.burstN;
        ws.queued = 0;
      }
      if (ws.burstLeft > 0) {
        fireShot(c, ws);
        ws.burstLeft--;
        if (ws.burstLeft <= 0 || ws.mag === 0) {
          ws.burstLeft = 0;
          ws.cool = d.burstGap;
        }
      }
    } else if (pressed || ws.queued > 0) {
      ws.queued = 0;
      fireShot(c, ws);
    }
  }

  function stepPickups(c) {
    if (!c.alive) return;
    for (let k = M.pickups.length - 1; k >= 0; k--) {
      const p = M.pickups[k];
      if (Math.hypot(p.x - c.x, p.z - c.z) > 1.5 || Math.abs(p.y - c.y) > 1.6) continue;
      // same weapon → take its ammo
      const own = c.weapons.find((w) => w.def.id === p.weapon);
      if (own && own.reserve < own.def.reserve * 1.5) {
        own.reserve = Math.min(own.def.reserve * 1.5, own.reserve + p.mag + p.reserve);
        M.pickups.splice(k, 1);
        emit({ type: "ammo", id: c.id, w: p.weapon });
        continue;
      }
      if (c.isPlayer && c.input.interact && !c.prevInteract && !own) {
        const slot = weaponById(p.weapon).cat === "pistol" ? 1 : 0;
        const old = c.weapons[slot];
        const nw = weaponState(p.weapon);
        nw.mag = p.mag;
        nw.reserve = p.reserve;
        c.weapons[slot] = nw;
        cancelReload(old);
        c.cur = slot;
        c.switchT = nw.def.raise;
        p.weapon = old.def.id;
        p.mag = old.mag;
        p.reserve = old.reserve;
        p.t = 28;
        if (p.mag <= 0 && p.reserve <= 0) M.pickups.splice(k, 1);
        emit({ type: "pickup", id: c.id, w: nw.def.id });
      }
    }
    c.prevInteract = c.input.interact;
  }

  /** the pickup the player could swap to right now (for the prompt) */
  M.pickupNear = (c) => {
    if (!c.alive) return null;
    for (const p of M.pickups) {
      if (Math.hypot(p.x - c.x, p.z - c.z) <= 1.5 && Math.abs(p.y - c.y) <= 1.6 && !c.weapons.some((w) => w.def.id === p.weapon)) return p;
    }
    return null;
  };

  /* ------------------------------------------------------------ domination */
  function stepFlags(dt) {
    for (const f of M.flags) {
      const n = [0, 0];
      for (const c of M.combatants) {
        if (!c.alive) continue;
        if (Math.hypot(c.x - f.x, c.z - f.z) <= C.DOM_RADIUS && Math.abs(c.y - f.y) < 2.6) n[c.team]++;
      }
      f.counts = n;
      f.contested = n[0] > 0 && n[1] > 0;
      const solo = n[0] > 0 && !n[1] ? 0 : n[1] > 0 && !n[0] ? 1 : -1;
      if (f.contested) {
        f.capTeam = -1;
        continue;
      }
      if (solo >= 0) {
        const rate = (1 / C.DOM_CAPTURE) * Math.min(2.2, 1 + 0.45 * (n[solo] - 1));
        const sign = solo === 0 ? 1 : -1;
        if (f.owner === solo) {
          f.progress += (sign - f.progress) * Math.min(1, dt * 2);
          f.capTeam = -1;
          continue;
        }
        f.capTeam = solo;
        const before = f.progress;
        f.progress += sign * rate * dt;
        if (f.owner !== -1 && Math.sign(before) !== Math.sign(f.progress) && before !== 0) {
          emit({ type: "neutral", flag: f.key, from: f.owner, by: solo });
          f.owner = -1;
        }
        if (f.owner === -1 && Math.abs(f.progress) >= 1) {
          f.progress = sign;
          f.owner = solo;
          f.capTeam = -1;
          for (const c of M.combatants) {
            if (c.alive && c.team === solo && Math.hypot(c.x - f.x, c.z - f.z) <= C.DOM_RADIUS) {
              c.caps++;
              c.score += 150;
            }
          }
          emit({ type: "capture", flag: f.key, team: solo });
        }
      } else {
        f.capTeam = -1;
        // decay back to the owner's state
        const target = f.owner === 0 ? 1 : f.owner === 1 ? -1 : 0;
        const k = Math.min(1, dt * 0.35);
        f.progress += (target - f.progress) * k;
      }
    }
    // scoring
    for (const f of M.flags) {
      if (f.owner < 0) {
        f.tickT = 0;
        continue;
      }
      f.tickT += dt;
      if (f.tickT >= C.DOM_TICK) {
        f.tickT -= C.DOM_TICK;
        M.scores[f.owner]++;
      }
    }
  }

  /* ------------------------------------------------------------ match end */
  function finish(reason) {
    if (M.state === "ended") return;
    M.state = "ended";
    let winner;
    if (mode.teams) winner = M.scores[0] === M.scores[1] ? -1 : M.scores[0] > M.scores[1] ? 0 : 1;
    else {
      const sorted = [...M.combatants].sort((a, b) => b.kills - a.kills || b.score - a.score);
      winner = sorted[0].kills === (sorted[1]?.kills ?? -1) && sorted[0].score === sorted[1]?.score ? -1 : sorted[0].id;
    }
    M.winner = winner;
    const p = M.player;
    const ranking = [...M.combatants].sort((a, b) => b.score - a.score || b.kills - a.kills);
    const won = mode.teams ? winner === p.team : winner === p.id;
    M.result = { reason, winner, won, draw: winner === -1, place: ranking.indexOf(p) + 1, mvp: ranking[0].id };
    emit({ type: "end", reason, winner, won });
  }

  /* ------------------------------------------------------------ main step */
  M.step = (dt) => {
    if (M.state === "ended") return;
    dt = Math.min(dt, 0.05);
    M.clock += dt;
    if (M.state === "countdown") {
      M.countdown -= dt;
      if (M.countdown <= 0) {
        M.state = "live";
        emit({ type: "go" });
      }
    } else {
      M.t += dt;
      M.timeLeft = Math.max(0, mode.time - M.t);
    }
    for (const c of M.combatants) {
      if (!c.alive) continue;
      if (c.brain) thinkBot(c, M, dt);
    }
    // sub-step movement for stability at low frame rates; a rotating start
    // index keeps simultaneous trades fair (nobody always shoots first)
    const sub = dt > 1 / 50 ? 2 : 1;
    const n = M.combatants.length;
    const off = rnd.int(n);
    for (let i = 0; i < n; i++) {
      const c = M.combatants[(i + off) % n];
      if (!c.alive) continue;
      for (let s = 0; s < sub; s++) stepMove(c, dt / sub);
      stepWeapon(c, dt);
      stepPickups(c);
      if (c.protect > 0) {
        c.protect -= dt;
        if (c.input.fire || c.lastShot > M.clock - 0.1) c.protect = 0;
      }
      if (c.overdrive > 0) c.overdrive -= dt;
      if (c.hp < C.MAX_HP && M.clock - c.lastHurt > C.REGEN_DELAY) c.hp = Math.min(C.MAX_HP, c.hp + C.REGEN_RATE * dt * (c.overdrive > 0 ? 1.5 : 1));
    }
    for (const c of M.combatants) {
      if (c.alive || M.state !== "live") continue;
      const isHuman = c.isPlayer && !opts.playerIsBot;
      if (isHuman) {
        if (M.clock >= c.respawnAt || (c.input.respawn && M.clock - c.deathAt >= C.RESPAWN_PLAYER_MIN)) spawn(c);
      } else if (M.clock >= c.respawnAt) spawn(c);
    }
    for (let k = M.pickups.length - 1; k >= 0; k--) if ((M.pickups[k].t -= dt) <= 0) M.pickups.splice(k, 1);
    M.uav[0] = Math.max(0, M.uav[0] - dt);
    M.uav[1] = Math.max(0, M.uav[1] - dt);
    if (M.state === "live") {
      if (mode.id === "dom") stepFlags(dt);
      if (mode.teams) {
        if (M.scores[0] >= mode.limit || M.scores[1] >= mode.limit) finish("score");
      } else if (M.combatants.some((c) => c.kills >= mode.limit)) finish("score");
      if (M.timeLeft <= 0) finish("time");
    }
  };

  M.drain = () => events.splice(0, events.length);
  M.forfeit = () => finish("forfeit");
  /** apply a loadout at the next respawn (or now, during the countdown) */
  M.setLoadout = (c, lo) => {
    if (M.state === "countdown" && c.alive) {
      c.loadout = { ...lo };
      c.weapons = [weaponState(lo.primary), weaponState(lo.secondary)];
      c.cur = 0;
      c.switchT = c.weapons[0].def.raise * 0.5;
    } else c.nextLoadout = { ...lo };
  };
  M.ranking = () => [...M.combatants].sort((a, b) => b.score - a.score || b.kills - a.kills);
  return M;
}
