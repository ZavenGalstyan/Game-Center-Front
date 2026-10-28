/**
 * The hero: camera-relative movement with acceleration, sprint, dodge-roll
 * (i-frames), gravity, steps, moving platforms (carried along), pit falls
 * (back to the last safe footing), casting / shielding / specials / potions
 * and the hotbar. Pure simulation — rendering reads the fields.
 */
import { approachAngle, clamp } from "./math.js";
import { clampPitch } from "./camera.js";
import { cast, shield, special, drinkPotion } from "./combat.js";
import { SPELLS } from "../data/spells.js";
import { hotbar } from "./profile.js";

export function newPlayer(G, at) {
  const S = G.stats;
  return {
    x: at.x,
    y: G.col.ground(at.x, at.z, 50),
    z: at.z,
    yaw: at.yaw ?? Math.PI,
    vy: 0,
    moveX: 0,
    moveZ: 0,
    vel: { x: 0, z: 0 },
    speed: 0,
    hp: S.maxHp,
    mana: S.maxMana,
    onGround: true,
    floor: null,
    dodgeT: 0,
    dodgeCd: 0,
    dodgeDir: { x: 0, z: 1 },
    iframe: 0,
    shieldT: 0,
    shieldAge: 9,
    counterT: 0,
    castT: 0,
    castSpell: null,
    faceT: 0,
    faceYaw: 0,
    cds: {},
    stunT: 0,
    slowT: 0,
    hurtT: 0,
    hitT: 0,
    knock: null,
    dead: false,
    lumos: false,
    aiming: false,
    sprinting: false,
    combatT: 0,
    buffs: { edurus: 0 },
    safe: { x: at.x, z: at.z, y: 0 },
    safeT: 0,
    chill: 0,
    fallT: 0,
  };
}

export function updatePlayer(G, dt, inp) {
  const p = G.player;
  const S = G.stats;
  // camera
  G.camYaw -= inp.dYaw;
  G.camPitch = clampPitch(G.camPitch + inp.dPitch);
  // timers
  for (const k of Object.keys(p.cds)) if (p.cds[k] > 0) p.cds[k] = Math.max(0, p.cds[k] - dt);
  for (const k of ["dodgeCd", "iframe", "stunT", "slowT", "hurtT", "hitT", "castT", "faceT", "counterT"]) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
  if (p.shieldT > 0) {
    p.shieldT = Math.max(0, p.shieldT - dt);
    p.shieldAge += dt;
  }
  if (p.buffs.edurus > 0) p.buffs.edurus = Math.max(0, p.buffs.edurus - dt);
  p.combatT = Math.max(0, p.combatT - dt);
  p.chill = Math.max(0, p.chill - dt * 0.4);
  if (p.dead) {
    p.speed = 0;
    return;
  }
  // regeneration
  let regen = S.regen;
  if (p.lumos) {
    const drain = SPELLS.lumos.drain * (G.P.spells.lumos >= 3 ? 0.5 : 1);
    regen -= drain + S.regen * 0.5;
  }
  p.mana = clamp(p.mana + regen * dt, 0, S.maxMana);
  if (p.lumos && p.mana <= 0.01) {
    p.lumos = false;
    G.emit({ type: "lumos", on: false, out: true });
  }
  if (p.combatT <= 0 && p.hp < S.maxHp) p.hp = Math.min(S.maxHp, p.hp + S.maxHp * 0.03 * dt);

  // ---------------------------------------------------------- actions
  const busy = p.stunT > 0 || G.dialogue || G.cinematic > 0;
  p.aiming = !!inp.aim && !busy;
  if (!busy) {
    if (inp.slot != null) {
      const hb = hotbar(G.P);
      const id = hb[inp.slot];
      if (id && id !== G.P.equipped) {
        G.P.equipped = id;
        G.emit({ type: "equipSpell", id });
      }
    }
    if (inp.cycle) {
      const hb = hotbar(G.P);
      const i = Math.max(0, hb.indexOf(G.P.equipped));
      const id = hb[(i + inp.cycle + hb.length) % hb.length];
      if (id && id !== G.P.equipped) {
        G.P.equipped = id;
        G.emit({ type: "equipSpell", id });
      }
    }
    if (inp.lumos && G.P.spells.lumos) cast(G, "lumos");
    if (inp.shield) shield(G);
    if (inp.q) special(G, "q");
    if (inp.r) special(G, "r");
    if (inp.potion) {
      const r = drinkPotion(G, inp.potion === 2 ? "invigoration" : "wiggenweld");
      if (!r.ok && r.msg) G.emit({ type: "deny", text: r.msg });
    }
    const eq = G.P.equipped;
    const kind = SPELLS[eq]?.kind;
    if (inp.cast.pressed) cast(G, eq);
    else if (inp.cast.down && kind === "bolt" && !(p.cds[eq] > 0)) cast(G, eq);
    if (inp.interact) G.interact();
    if (inp.dodge && p.dodgeCd <= 0 && p.onGround && p.dodgeT <= 0) {
      let dx = inp.mx;
      let dz = inp.mz;
      const fx = Math.sin(G.camYaw);
      const fz = Math.cos(G.camYaw);
      let wx = fx * dz - fz * dx;
      let wz = fz * dz + fx * dx;
      const L = Math.hypot(wx, wz);
      if (L < 0.1) {
        wx = -Math.sin(p.yaw);
        wz = -Math.cos(p.yaw);
      } else {
        wx /= L;
        wz /= L;
      }
      p.dodgeDir = { x: wx, z: wz };
      p.dodgeT = 0.42;
      p.iframe = 0.34;
      p.dodgeCd = G.stats.passive === "swift" ? 0.5 : 0.7;
      p.castT = 0;
      G.emit({ type: "dodge", x: p.x, z: p.z });
    }
  }

  // ---------------------------------------------------------- movement
  const ox = p.x;
  const oz = p.z;
  // ride moving platforms
  if (p.floor && p.floor.platform && p.onGround) {
    p.x += p.floor.dx;
    p.z += p.floor.dz;
    p.y += p.floor.dy;
  }
  const fx = Math.sin(G.camYaw);
  const fz = Math.cos(G.camYaw);
  let wx = 0;
  let wz = 0;
  if (!busy) {
    wx = fx * inp.mz - fz * inp.mx;
    wz = fz * inp.mz + fx * inp.mx;
    const L = Math.hypot(wx, wz);
    if (L > 1) {
      wx /= L;
      wz /= L;
    }
  }
  p.sprinting = !!inp.sprint && !p.aiming && Math.hypot(wx, wz) > 0.3 && p.castT <= 0.1;
  let top = 4.7 * S.speed;
  if (p.sprinting) top = 7.3 * S.speed;
  if (p.aiming) top = 2.9;
  if (p.castT > 0) top *= 0.62;
  if (p.shieldT > 0) top *= 0.55;
  if (p.slowT > 0) top *= 0.55;
  if (p.hurtT > 0) top *= 0.4;
  let tvx = wx * top;
  let tvz = wz * top;
  if (p.dodgeT > 0) {
    const k = p.dodgeT / 0.42;
    tvx = p.dodgeDir.x * (4 + 9 * k);
    tvz = p.dodgeDir.z * (4 + 9 * k);
    p.dodgeT = Math.max(0, p.dodgeT - dt);
    p.moveX = tvx;
    p.moveZ = tvz;
  } else {
    const acc = p.onGround ? 14 : 4;
    p.moveX += (tvx - p.moveX) * Math.min(1, dt * acc);
    p.moveZ += (tvz - p.moveZ) * Math.min(1, dt * acc);
  }
  if (p.knock) {
    p.moveX += p.knock.vx;
    p.moveZ += p.knock.vz;
    p.knock.t -= dt;
    if (p.knock.t <= 0) p.knock = null;
  }
  p.x += p.moveX * dt;
  p.z += p.moveZ * dt;
  G.col.resolve(p, 0.38, 1.8);
  // gravity & floors
  p.vy -= 24 * dt;
  p.y += p.vy * dt;
  const g = G.col.ground(p.x, p.z, Math.max(p.y, p.y - p.vy * dt));
  const floor = G.col.lastFloor;
  if (p.y <= g) {
    if (!p.onGround && p.vy < -12) {
      const fall = Math.round((-p.vy - 12) * 2.2);
      if (fall > 2) G.hurtPlayer(fall, { kind: "fall", noStagger: true });
      G.emit({ type: "land", hard: p.vy < -14 });
    }
    p.y = g;
    p.vy = 0;
    p.onGround = true;
    p.floor = floor;
  } else if (p.onGround && p.y - g < 0.55 && p.vy <= 0) {
    // walk down steps / off a descending lift
    p.y = g;
    p.vy = 0;
    p.floor = floor;
  } else {
    p.onGround = false;
    p.floor = null;
  }
  // remember safe footing
  p.safeT -= dt;
  if (p.onGround && p.safeT <= 0 && !(p.floor && p.floor.platform) && g > -1 && !G.nearPit(p.x, p.z)) {
    p.safeT = 0.4;
    p.safe = { x: p.x, z: p.z, y: p.y };
  }
  if (p.y < -14) {
    p.x = p.safe.x;
    p.z = p.safe.z;
    p.y = p.safe.y + 0.2;
    p.vy = 0;
    p.moveX = p.moveZ = 0;
    G.emit({ type: "fellOut" });
    G.hurtPlayer(Math.round(G.stats.maxHp * 0.12), { kind: "fall", noStagger: true });
  }
  p.vel.x = (p.x - ox) / dt;
  p.vel.z = (p.z - oz) / dt;
  p.speed = Math.hypot(p.vel.x, p.vel.z);
  // facing
  const castFacing = p.aiming || p.castT > 0.05 || p.shieldT > 0;
  if (p.faceT > 0) p.yaw = approachAngle(p.yaw, p.faceYaw, dt * 18);
  else if (castFacing) p.yaw = approachAngle(p.yaw, G.camYaw, dt * 16);
  else if (p.dodgeT > 0) p.yaw = approachAngle(p.yaw, Math.atan2(p.dodgeDir.x, p.dodgeDir.z), dt * 20);
  else if (Math.hypot(p.moveX, p.moveZ) > 0.4) p.yaw = approachAngle(p.yaw, Math.atan2(p.moveX, p.moveZ), dt * 12);
}
