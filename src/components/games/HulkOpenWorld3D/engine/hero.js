/**
 * Hulk: Open World 3D — the hero controller (framework-free).
 *
 * Real kinematics: velocity, gravity, acceleration toward the stick, air
 * control, ground / ceiling / wall collision through Collision. Actions are
 * timed state machines with windup → active window → recovery; damage is
 * only dealt inside the active window, from the hitbox's actual position,
 * and only to targets with a clear line from the hero's chest.
 *
 * Input (world space, one fixed step):
 *   { mx, mz, camYaw, aim:{x,y,z}, sprint, walk, jump(held), punch(edge),
 *     heavy(held), smash(edge), grab(edge), rage(edge), special(edge) }
 */
import { HERO, ATTACKS, GRAVITY, PROPS, THROW } from "./config.js";
import { BOUNDS } from "./city.js";
import { clamp, lerp, wrapA, dampA } from "./util.js";
import { damageProp, launchProp, propBox, propCentreY } from "./props.js";

export function makeHero(st, x, y, z, heading = 0) {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading,
    grounded: true,
    groundY: y,
    airT: 0,
    fallFrom: y,
    hp: st.maxHp,
    maxHp: st.maxHp,
    rage: 0,
    raging: false,
    rageT: 0,
    st,
    act: null,
    combo: 0,
    comboT: 0,
    queued: false,
    charging: false,
    chargeT: 0,
    heavyHeld: false,
    heavyT: 0,
    carry: null,
    cd: { smash: 0, clap: 0, ragePunch: 0 },
    lastHurt: -99,
    alive: true,
    deadT: 0,
    inWater: false,
    speed: 0,
    anim: { mode: "idle", t: 0, side: 0, charge: 0, landT: 0, hurtT: 0, roarT: 0 },
    prevJump: false,
    prevHeavy: false,
    sprinting: false,
    leapT: 0,
    diving: false,
    stats: { jumps: 0, leaps: 0, maxLeap: 0, throws: 0, smashes: 0, claps: 0, punches: 0 },
    leapFrom: null,
  };
}

const fwd = (h) => [Math.sin(h), Math.cos(h)];
export const rageMul = (h) => HERO.rageDamage + (h.st.rageDmgBonus || 0);

/** advance the hero one fixed step */
export function stepHero(sim, h, inp, dt) {
  const st = h.st;
  const a = h.anim;
  a.t += dt;
  a.landT = Math.max(0, a.landT - dt);
  a.hurtT = Math.max(0, a.hurtT - dt);
  a.roarT = Math.max(0, a.roarT - dt);
  for (const k in h.cd) h.cd[k] = Math.max(0, h.cd[k] - dt);
  h.comboT = Math.max(0, h.comboT - dt);

  if (!h.alive) {
    h.deadT += dt;
    h.vx *= 0.9;
    h.vz *= 0.9;
    physics(sim, h, dt, 0, 0, 0);
    a.mode = "dead";
    return;
  }

  // rage
  if (h.raging) {
    h.rageT -= dt;
    h.rage = Math.max(0, (h.rageT / st.rageDur) * st.rageMax);
    if (h.rageT <= 0) {
      h.raging = false;
      h.rage = 0;
      sim.events.push({ type: "rageEnd" });
    }
  }
  // regeneration out of combat
  if (sim.t - h.lastHurt > HERO.regenDelay && h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + HERO.regen * dt * (h.raging ? 2 : 1));

  const moveLen = Math.min(1, Math.hypot(inp.mx || 0, inp.mz || 0));
  const camF = fwd(inp.camYaw != null ? inp.camYaw : h.heading);

  /* ---------------------------------------------------------- edges */
  const jumpPressed = inp.jump && !h.prevJump;
  const jumpReleased = !inp.jump && h.prevJump;
  h.prevJump = !!inp.jump;
  const heavyPressed = inp.heavy && !h.prevHeavy;
  const heavyReleased = !inp.heavy && h.prevHeavy;
  h.prevHeavy = !!inp.heavy;

  if (inp.rage && !h.raging && h.rage >= st.rageMax - 0.01 && (!h.act || h.act.kind !== "lift")) startRage(sim, h);

  /* ---------------------------------------------------------- actions */
  if (h.act) {
    stepAction(sim, h, inp, dt);
  } else {
    if (inp.punch) {
      if (h.carry) startAct(sim, h, "throw", inp);
      else if (!h.grounded && h.airT > 0.12 && h.y - groundBelow(sim, h) > 2.5) startDive(sim, h);
      else if (h.grounded) startPunch(sim, h, inp);
    } else if (inp.smash && !h.carry) {
      if (!h.grounded && h.y - groundBelow(sim, h) > 2.5) startDive(sim, h);
      else if (h.grounded && h.cd.smash <= 0) startAct(sim, h, "smash", inp);
      else if (h.cd.smash > 0) sim.events.push({ type: "cooldown", what: "smash" });
    } else if (inp.special && !h.carry && h.grounded) {
      if (h.cd.clap <= 0) startAct(sim, h, "clap", inp);
      else sim.events.push({ type: "cooldown", what: "clap" });
    } else if (inp.grab && h.grounded) {
      if (h.carry) dropCarry(sim, h);
      else tryGrab(sim, h, inp);
    }
    // heavy / rage punch: hold to charge, release to strike
    if (!h.act && !h.carry && h.grounded) {
      if (heavyPressed) {
        h.heavyHeld = true;
        h.heavyT = 0;
      }
      if (h.heavyHeld && inp.heavy) h.heavyT += dt;
      if (h.heavyHeld && heavyReleased) {
        h.heavyHeld = false;
        if (h.heavyT >= ATTACKS.ragePunch.charge && h.cd.ragePunch <= 0) startAct(sim, h, "ragePunch", inp);
        else startAct(sim, h, "heavy", inp);
      }
    } else if (heavyReleased) h.heavyHeld = false;
  }
  if (h.act && h.act.kind !== "heavyCharge") h.heavyHeld = h.heavyHeld && !!inp.heavy;

  /* ---------------------------------------------------------- jump / super leap */
  // a jump may cancel a strike's recovery; presses during other actions are buffered briefly
  const act0 = h.act;
  const recovering = act0 && ACT[act0.kind] && ACT[act0.kind].hit && act0.t > ACT[act0.kind].hit[1] + 0.03;
  const canJump = h.grounded && (!act0 || act0.kind === "landing" || recovering) && !h.heavyHeld;
  if (jumpPressed) h.jumpBuf = 0.3;
  h.jumpBuf = Math.max(0, (h.jumpBuf || 0) - dt);
  if (h.jumpBuf > 0 && canJump && !h.charging) {
    h.jumpBuf = 0;
    if (h.act) h.act = null;
    if (inp.jump) {
      h.charging = true;
      h.chargeT = 0;
    } else launchJump(sim, h, inp, moveLen);
  }
  if (h.charging) {
    if (!h.grounded || (h.act && h.act.kind !== "landing")) h.charging = false;
    else if (inp.jump) {
      const was = h.chargeT;
      h.chargeT = Math.min(HERO.leapCharge, h.chargeT + dt);
      if (was < HERO.leapThreshold && h.chargeT >= HERO.leapThreshold) sim.events.push({ type: "chargeStart" });
    } else {
      h.charging = false;
      launchJump(sim, h, inp, moveLen);
    }
  }
  a.charge = h.charging ? clamp((h.chargeT - HERO.leapThreshold) / (HERO.leapCharge - HERO.leapThreshold), 0, 1) : 0;

  /* ---------------------------------------------------------- locomotion */
  let want = 0;
  let wx = 0;
  let wz = 0;
  if (moveLen > 0.05) {
    wx = inp.mx / Math.max(moveLen, 1e-6);
    wz = inp.mz / Math.max(moveLen, 1e-6);
    const sprint = inp.sprint && h.grounded && !h.inWater && !h.carry && moveLen > 0.5;
    h.sprinting = sprint;
    const base = inp.walk || moveLen < 0.5 ? HERO.walk : sprint ? HERO.sprint * st.sprintMul : HERO.run;
    want = base * (moveLen < 0.5 && !inp.walk ? moveLen * 2 : 1);
  } else h.sprinting = false;
  if (h.carry) want *= 0.82 - 0.12 * h.carry.def.weight;
  if (h.raging) want *= HERO.rageSpeed;
  if (h.inWater) want *= 0.55;
  if (h.charging || h.heavyHeld) want = 0;
  if (h.act) want *= h.act.move != null ? h.act.move : 0.15;

  if (h.grounded) {
    const tx = wx * want;
    const tz = wz * want;
    const acc = HERO.accel * (want < Math.hypot(h.vx, h.vz) ? 1.4 : 1);
    const dx = tx - h.vx;
    const dz = tz - h.vz;
    const dl = Math.hypot(dx, dz);
    const step = Math.min(dl, acc * dt);
    if (dl > 1e-6) {
      h.vx += (dx / dl) * step;
      h.vz += (dz / dl) * step;
    }
  } else if (want > 0) {
    // air control: steer toward the stick without killing a leap's momentum
    const cur = Math.hypot(h.vx, h.vz);
    const cap = Math.max(cur, HERO.run);
    h.vx += wx * HERO.airAccel * dt;
    h.vz += wz * HERO.airAccel * dt;
    const n = Math.hypot(h.vx, h.vz);
    if (n > cap) {
      h.vx *= cap / n;
      h.vz *= cap / n;
    }
  }
  // facing: movement direction, or the camera while attacking / carrying / aiming
  if (h.act && h.act.face != null) h.heading = dampA(h.heading, h.act.face, 18, dt);
  else if (moveLen > 0.05 && (h.grounded || h.airT < 0.3 || true)) {
    const target = Math.atan2(wx, wz);
    h.heading = dampA(h.heading, target, h.grounded ? HERO.turnRate : 4, dt);
  }

  physics(sim, h, dt, wx, wz, want);

  /* ---------------------------------------------------------- carry */
  if (h.carry) {
    const p = h.carry;
    const [fx, fz] = fwd(h.heading);
    const lift = h.act && h.act.kind === "lift" ? clamp((h.act.t - 0.12) / 0.35, 0, 1) : 1;
    p.x = h.x + fx * lerp(1.6, 0.2, lift);
    p.z = h.z + fz * lerp(1.6, 0.2, lift);
    p.y = h.y + lerp(0.2, HERO.height + 0.35, lift);
    p.rot = h.heading + (p.type === "car" || p.type === "van" || p.type === "taxi" ? Math.PI / 2 : 0);
    p.ver++;
  }

  /* ---------------------------------------------------------- anim hints */
  h.speed = Math.hypot(h.vx, h.vz);
  if (h.act) a.mode = h.act.anim || h.act.kind;
  else if (h.charging) a.mode = "charge";
  else if (h.heavyHeld) a.mode = "heavyCharge";
  else if (!h.grounded) a.mode = h.vy > 0 ? "jump" : "fall";
  else if (h.carry) a.mode = h.speed > 1 ? "carryWalk" : "carry";
  else if (h.speed < 0.6) a.mode = "idle";
  else if (h.sprinting && h.speed > HERO.run + 1) a.mode = "sprint";
  else if (h.speed > HERO.walk + 1.2) a.mode = "run";
  else a.mode = "walk";
  a.heavy = h.heavyHeld ? clamp(h.heavyT / ATTACKS.ragePunch.charge, 0, 1) : 0;
}

function groundBelow(sim, h) {
  return sim.col.groundAt(h.x, h.z, h.y, 0.1, HERO.radius).y;
}

/* ================================================================ physics */
const _hitProps = [];
function physics(sim, h, dt, wx, wz, want) {
  const r = HERO.radius;
  // body-slam props while sprinting / leaping through them
  const sp = Math.hypot(h.vx, h.vz);
  if (sp > HERO.run + 2 || (!h.grounded && sp > 8)) {
    _hitProps.length = 0;
    const nx = h.x + h.vx * dt * 2;
    const nz = h.z + h.vz * dt * 2;
    sim.col.propsIn(nx - r, nz - r, nx + r, nz + r, _hitProps);
    for (const p of _hitProps) {
      if (p.mode !== "static" || p === h.carry || p.inert) continue;
      const b = p._in;
      if (b.y1 < h.y + 0.3 || b.y0 > h.y + HERO.height) continue;
      const inv = 1 / (sp || 1);
      if (p.def.grab && p.def.weight <= 1.3 && p.state < 2) {
        damageProp(sim, p, ATTACKS.body.dmg * 0.6, { byPlayer: true, dx: h.vx * inv, dz: h.vz * inv });
        if (p.mode === "static") launchProp(sim, p, h.vx * 0.9, 4 + sp * 0.15, h.vz * 0.9, true, 0.6);
        sim.shake(p.x, p.z, 0.25, 30);
        sim.events.push({ type: "bodySlam", prop: p });
      } else if (p.def.hp <= 120 || p.type === "lamp" || p.type === "light" || p.type === "fence") {
        damageProp(sim, p, ATTACKS.body.dmg * 3, { byPlayer: true, dx: h.vx * inv, dz: h.vz * inv });
        sim.events.push({ type: "bodySlam", prop: p });
      }
    }
  }

  const feet0 = h.y;
  h.x += h.vx * dt;
  h.z += h.vz * dt;
  const c = sim.col.pushOut(h, r, HERO.height, HERO.stepUp);
  if (c) {
    const vn = h.vx * c.nx + h.vz * c.nz;
    if (vn < 0) {
      h.vx -= vn * c.nx;
      h.vz -= vn * c.nz;
    }
  }
  h.x = clamp(h.x, BOUNDS.min + 2, BOUNDS.max - 2);
  h.z = clamp(h.z, BOUNDS.min + 2, BOUNDS.max - 2);

  // vertical
  h.vy -= GRAVITY * dt * (h.diving ? 1.6 : 1);
  if (h.vy < -70) h.vy = -70;
  h.y += h.vy * dt;
  const ceil = sim.col.ceilingAt(h.x, h.z, feet0 + HERO.height, r);
  if (h.y + HERO.height > ceil && h.vy > 0) {
    h.y = ceil - HERO.height;
    h.vy = 0;
  }
  const g = sim.col.groundAt(h.x, h.z, Math.max(feet0, h.y), HERO.stepUp, r);
  h.inWater = g.water && h.y < -0.6;
  h.onProp = g.on && g.on.def ? g.on : null;
  if (h.y <= g.y) {
    const impact = -h.vy;
    h.y = g.y;
    if (!h.grounded) land(sim, h, impact);
    h.vy = 0;
    h.grounded = true;
    h.groundY = g.y;
  } else if (h.grounded && h.vy <= 0 && h.y - g.y < HERO.stepUp * 0.8) {
    // walking down a curb / step: stick to the ground
    h.y = g.y;
    h.vy = 0;
  } else {
    if (h.grounded) {
      h.fallFrom = h.y;
      h.airT = 0;
    }
    h.grounded = false;
  }
  if (!h.grounded) {
    h.airT += dt;
    h.fallFrom = Math.max(h.fallFrom, h.y);
  } else h.fallFrom = h.y;
  if (h.y < -20) {
    // fell out of the world (should not happen): put him back on the street
    const s = sim.safeSpot(h.x, h.z);
    h.x = s.x;
    h.z = s.z;
    h.y = 0;
    h.vy = 0;
  }
}

function land(sim, h, impact) {
  const fall = h.fallFrom - h.y;
  h.stats.lastLand = { x: h.x, z: h.z, fall };
  if (h.leapFrom) {
    const d = Math.hypot(h.x - h.leapFrom.x, h.z - h.leapFrom.z);
    h.stats.maxLeap = Math.max(h.stats.maxLeap, d);
    sim.events.push({ type: "leapLand", dist: d, from: h.leapFrom, x: h.x, y: h.y, z: h.z });
    h.leapFrom = null;
  }
  const dive = h.diving;
  h.diving = false;
  if (h.act && h.act.kind === "dive") h.act = null;
  if (fall >= HERO.landShockFall || impact > 26 || dive) {
    const L = ATTACKS.landing;
    const k = clamp((fall - HERO.landShockFall) / 30, 0, 1);
    let dmg = lerp(L.dmgMin, L.dmgMax, k);
    let rad = lerp(L.rMin, L.rMax, k);
    if (dive) {
      dmg = Math.max(dmg, ATTACKS.dive.dmg + 40 * k) * h.st.heavyMul;
      rad = Math.max(rad, ATTACKS.dive.radius);
    }
    shockwave(sim, h, rad, dmg, L.knock, L.lift, "landing");
    h.act = { kind: "landing", t: 0, dur: 0.42, move: 0, anim: "land" };
    h.anim.landT = 0.5;
    sim.events.push({ type: "landShock", x: h.x, y: h.y, z: h.z, r: rad, big: true });
    sim.fx.push({ type: "shockwave", x: h.x, y: h.y + 0.1, z: h.z, r: rad });
    sim.shake(h.x, h.z, 0.9, 100);
  } else {
    h.anim.landT = impact > 12 ? 0.3 : 0.12;
    if (impact > 12) {
      h.act = { kind: "landing", t: 0, dur: 0.16, move: 0.3, anim: "land" };
      sim.fx.push({ type: "dust", x: h.x, y: h.y + 0.2, z: h.z, r: 2.4 });
    }
    sim.events.push({ type: "land", x: h.x, z: h.z, impact });
    if (impact > 14) sim.shake(h.x, h.z, 0.3, 60);
  }
}

function launchJump(sim, h, inp, moveLen) {
  const c = clamp((h.chargeT - HERO.leapThreshold) / (HERO.leapCharge - HERO.leapThreshold), 0, 1);
  const jm = h.st.jumpMul;
  h.grounded = false;
  h.fallFrom = h.y;
  h.airT = 0;
  if (h.chargeT < HERO.leapThreshold) {
    h.vy = HERO.jumpV * Math.sqrt(jm);
    h.stats.jumps++;
    sim.events.push({ type: "jump" });
    return;
  }
  // super leap: direction = stick, else straight up with a little forward drift
  let dx;
  let dz;
  if (moveLen > 0.2) {
    dx = inp.mx / moveLen;
    dz = inp.mz / moveLen;
  } else {
    [dx, dz] = fwd(h.heading);
  }
  const hs = moveLen > 0.2 ? lerp(HERO.leapMinH, HERO.leapMaxH, c) * jm : 3;
  h.vx = dx * hs;
  h.vz = dz * hs;
  h.vy = lerp(HERO.leapMinV, HERO.leapMaxV, c) * Math.sqrt(jm);
  h.heading = Math.atan2(dx, dz);
  h.leapFrom = { x: h.x, y: h.y, z: h.z, charge: c };
  h.stats.leaps++;
  sim.events.push({ type: "leap", charge: c });
  sim.fx.push({ type: "dust", x: h.x, y: h.y + 0.2, z: h.z, r: 3 + c * 4 });
  sim.fx.push({ type: "shockwave", x: h.x, y: h.y + 0.1, z: h.z, r: 3 + c * 4, soft: true });
  sim.shake(h.x, h.z, 0.25 + c * 0.4, 50);
  // the launch itself cracks the ground: light props around fly
  if (c > 0.5) shockwave(sim, h, 3 + c * 2, 15, 6, 4, "launch");
}

/* ================================================================ actions */
const ACT = {
  jab1: { dur: 0.41, hit: [0.11, 0.21], move: 0.35, lunge: 3.5, anim: "punch" },
  jab2: { dur: 0.42, hit: [0.1, 0.2], move: 0.35, lunge: 3.5, anim: "punch" },
  jab3: { dur: 0.66, hit: [0.18, 0.3], move: 0.2, lunge: 6, anim: "uppercut" },
  heavy: { dur: 0.86, hit: [0.32, 0.44], move: 0.1, lunge: 7, anim: "heavy" },
  ragePunch: { dur: 0.87, hit: [0.18, 0.32], move: 0.05, lunge: 12, anim: "ragePunch" },
  smash: { dur: 0.92, at: 0.42, move: 0, anim: "smash" },
  clap: { dur: 0.81, at: 0.36, move: 0, anim: "clap" },
  lift: { dur: 0.6, at: 0.28, move: 0, anim: "lift" },
  throw: { dur: 0.5, at: 0.2, move: 0.3, anim: "throw" },
  hurt: { dur: 0.3, move: 0.2, anim: "hurt" },
  roar: { dur: 0.9, at: 0.35, move: 0, anim: "rage" },
};

/** best enemy to snap toward when an attack starts (in front of the camera, close) */
function autoFace(sim, h, inp, range = 7) {
  const [cx, cz] = fwd(inp.camYaw != null ? inp.camYaw : h.heading);
  const base = Math.hypot(inp.mx || 0, inp.mz || 0) > 0.2 ? Math.atan2(inp.mx, inp.mz) : Math.atan2(cx, cz);
  let best = null;
  let bs = Infinity;
  for (const e of sim.enemiesNear(h.x, h.z, range)) {
    if (e.dead) continue;
    const dx = e.x - h.x;
    const dz = e.z - h.z;
    const d = Math.hypot(dx, dz);
    const ang = Math.abs(wrapA(Math.atan2(dx, dz) - base));
    if (ang > 1.3 || Math.abs(e.y - h.y) > 4) continue;
    const s = d + ang * 4;
    if (s < bs) {
      bs = s;
      best = Math.atan2(dx, dz);
    }
  }
  for (const b of sim.bosses) {
    if (b.dead) continue;
    const dx = b.x - h.x;
    const dz = b.z - h.z;
    const d = Math.hypot(dx, dz) - b.def.r;
    const ang = Math.abs(wrapA(Math.atan2(dx, dz) - base));
    if (d > range || ang > 1.3) continue;
    const s = d + ang * 4;
    if (s < bs) {
      bs = s;
      best = Math.atan2(dx, dz);
    }
  }
  return best != null ? best : base;
}

function startAct(sim, h, kind, inp) {
  const d = ACT[kind];
  h.act = { kind, t: 0, dur: d.dur, move: d.move, anim: d.anim, face: kind === "lift" ? null : autoFace(sim, h, inp, kind === "clap" ? 16 : 7), hitSet: new Set(), fired: false };
  if (kind === "smash") {
    h.cd.smash = ATTACKS.smash.cd * h.st.cdMul;
    h.stats.smashes++;
  }
  if (kind === "clap") {
    h.cd.clap = ATTACKS.clap.cd * h.st.cdMul;
    h.stats.claps++;
  }
  if (kind === "ragePunch") h.cd.ragePunch = ATTACKS.ragePunch.cd * h.st.cdMul;
  if (kind === "throw") h.act.face = autoFace(sim, h, inp, 0.1);
  sim.events.push({ type: "act", kind });
}
function startPunch(sim, h, inp) {
  const n = h.comboT > 0 ? Math.min(3, h.combo + 1) : 1;
  h.combo = n;
  startAct(sim, h, `jab${n}`, inp);
  h.act.side = n === 2 ? 1 : 0;
  h.anim.side = h.act.side;
  h.stats.punches++;
}
function startDive(sim, h) {
  h.diving = true;
  h.vy = Math.min(h.vy, -26);
  h.vx *= 0.6;
  h.vz *= 0.6;
  h.act = { kind: "dive", t: 0, dur: 99, move: 0.3, anim: "dive", face: null };
  sim.events.push({ type: "act", kind: "dive" });
}
function startRage(sim, h) {
  h.raging = true;
  h.rageT = h.st.rageDur;
  h.anim.roarT = 1;
  h.act = { kind: "roar", t: 0, dur: ACT.roar.dur, move: 0, anim: "rage", face: null, fired: false };
  h.charging = false;
  if (h.carry) dropCarry(sim, h);
  sim.events.push({ type: "rageStart" });
  sim.shake(h.x, h.z, 0.6, 60);
}

function stepAction(sim, h, inp, dt) {
  const act = h.act;
  act.t += dt;
  const d = ACT[act.kind] || {};
  // combo: a punch press during a jab queues the next one
  if (inp.punch && act.kind.startsWith("jab") && act.kind !== "jab3") act.queued = true;
  if (act.kind.startsWith("jab") || act.kind === "heavy" || act.kind === "ragePunch") {
    const def = ATTACKS[act.kind];
    // forward lunge at the start of the strike
    if (act.t < d.hit[1] && act.t > d.hit[0] * 0.5) {
      const [fx, fz] = fwd(h.heading);
      h.vx = fx * d.lunge;
      h.vz = fz * d.lunge;
    }
    if (act.t >= d.hit[0] && act.t <= d.hit[1]) meleeHit(sim, h, act, def);
    if (act.kind === "ragePunch" && !act.fired && act.t >= d.hit[0] + 0.02) {
      act.fired = true;
      sim.fx.push({ type: "shockwave", x: h.x + Math.sin(h.heading) * 3, y: h.y + 1.6, z: h.z + Math.cos(h.heading) * 3, r: 5, soft: true });
      coneWave(sim, h, 9, 0.45, def.dmg * 0.35, 18, 4, act);
      sim.shake(h.x, h.z, 0.7, 60);
    }
    if (act.queued && act.t >= d.hit[1] + 0.04) {
      h.comboT = 0.5;
      h.act = null;
      startPunch(sim, h, inp);
      return;
    }
  } else if (act.kind === "smash" && !act.fired && act.t >= d.at) {
    act.fired = true;
    const A = ATTACKS.smash;
    const rk = h.raging ? 1.25 : 1;
    shockwave(sim, h, A.radius * rk, A.dmg * h.st.heavyMul, A.knock, A.lift, "smash");
    sim.fx.push({ type: "shockwave", x: h.x, y: h.y + 0.1, z: h.z, r: A.radius * rk });
    sim.fx.push({ type: "crater", x: h.x + Math.sin(h.heading) * 1.4, y: h.y, z: h.z + Math.cos(h.heading) * 1.4, r: 3 });
    sim.events.push({ type: "smash", x: h.x, z: h.z });
    sim.shake(h.x, h.z, 1, 90);
    sim.hitStop = Math.max(sim.hitStop, 0.06);
  } else if (act.kind === "clap" && !act.fired && act.t >= d.at) {
    act.fired = true;
    const A = ATTACKS.clap;
    coneWave(sim, h, A.range * (h.raging ? 1.2 : 1), A.cone, A.dmg * h.st.heavyMul, A.knock, A.lift, act);
    sim.events.push({ type: "clap", x: h.x, z: h.z, heading: h.heading });
    sim.fx.push({ type: "clap", x: h.x + Math.sin(h.heading) * 2, y: h.y + 2.2, z: h.z + Math.cos(h.heading) * 2, h: h.heading, r: A.range });
    sim.shake(h.x, h.z, 0.8, 80);
    sim.hitStop = Math.max(sim.hitStop, 0.05);
  } else if (act.kind === "lift" && !act.fired && act.t >= d.at) {
    act.fired = true;
    const p = act.prop;
    if (p && p.mode === "static") {
      sim.col.removeProp(p);
      p.mode = "carried";
      h.carry = p;
      sim.activeProps.add(p);
      sim.events.push({ type: "lifted", prop: p });
    }
  } else if (act.kind === "throw" && !act.fired && act.t >= d.at) {
    act.fired = true;
    throwCarry(sim, h, inp);
  } else if (act.kind === "roar" && !act.fired && act.t >= d.at) {
    act.fired = true;
    shockwave(sim, h, 7, 25, 12, 5, "roar");
    sim.fx.push({ type: "shockwave", x: h.x, y: h.y + 0.1, z: h.z, r: 8, rage: true });
  }
  if (h.act === act && act.t >= act.dur) {
    if (act.kind.startsWith("jab")) h.comboT = act.kind === "jab3" ? 0 : 0.5;
    if (act.kind === "jab3") h.combo = 0;
    h.act = null;
  }
}

/** sphere hitbox in front of the hero during a strike's active window */
function meleeHit(sim, h, act, def) {
  const [fx, fz] = fwd(h.heading);
  const cx = h.x + fx * def.reach;
  const cy = h.y + 1.7;
  const cz = h.z + fz * def.reach;
  const r = def.radius * (h.raging ? 1.15 : 1);
  const mul = (act.kind.startsWith("jab") ? h.st.punchMul : h.st.heavyMul) * (h.raging ? 1 : 1);
  const chestY = h.y + 2.0;
  let any = false;
  for (const e of sim.enemiesNear(cx, cz, r + 2.5)) {
    if (e.dead || act.hitSet.has(e)) continue;
    // distance from the hit centre to the enemy's vertical capsule
    const ey = clamp(cy, e.y + 0.2, e.y + e.def.h);
    const d = Math.hypot(e.x - cx, ey - cy, e.z - cz);
    if (d > r + e.def.r) continue;
    if (!sim.col.losClear(h.x, chestY, h.z, e.x, e.y + e.def.h * 0.6, e.z)) continue;
    act.hitSet.add(e);
    any = true;
    sim.damageEnemy(e, def.dmg * mul, { byPlayer: true, dx: fx, dz: fz, knock: def.knock, lift: def.lift, kind: act.kind, melee: true });
  }
  for (const b of sim.bosses) {
    if (b.dead || act.hitSet.has(b)) continue;
    if (!b.hitTest(cx, cy, cz, r)) continue;
    act.hitSet.add(b);
    any = true;
    sim.damageBoss(b, def.dmg * mul, { byPlayer: true, kind: act.kind, melee: true, x: cx, y: cy, z: cz });
  }
  const props = sim.col.propsIn(cx - r, cz - r, cx + r, cz + r);
  for (const p of props) {
    if (act.hitSet.has(p) || p.mode !== "static" || p === h.carry) continue;
    const b = p._in;
    const px = clamp(cx, b.x0, b.x1);
    const py = clamp(cy, b.y0, b.y1);
    const pz = clamp(cz, b.z0, b.z1);
    if (Math.hypot(px - cx, py - cy, pz - cz) > r) continue;
    if (!sim.col.losClear(h.x, chestY, h.z, px, py, pz)) continue;
    act.hitSet.add(p);
    any = true;
    damageProp(sim, p, def.dmg * mul * (h.raging ? rageMul(h) : 1), { byPlayer: true, dx: fx, dz: fz });
    // punch light props / cars across the street
    if (p.mode === "static" && p.def.grab && (p.def.weight < 1 || act.kind !== "jab1")) {
      const k = (def.knock / 10) * (1.4 - Math.min(1.2, p.def.weight));
      launchProp(sim, p, fx * 7 * k, 3 + 2 * k, fz * 7 * k, true, 0.7);
    }
  }
  // standing on a prop: the strike stomps it too
  const under = h.onProp;
  if (under && h.grounded && under.mode === "static" && !act.hitSet.has(under)) {
    act.hitSet.add(under);
    any = true;
    damageProp(sim, under, def.dmg * mul * (h.raging ? rageMul(h) : 1), { byPlayer: true, dx: fx, dz: fz });
  }
  if (any && !act.connected) {
    act.connected = true;
    sim.events.push({ type: "impact", kind: act.kind, x: cx, y: cy, z: cz });
    sim.fx.push({ type: "impact", x: cx, y: cy, z: cz, big: act.kind !== "jab1" && act.kind !== "jab2" });
    sim.hitStop = Math.max(sim.hitStop, act.kind === "ragePunch" ? 0.12 : act.kind === "heavy" || act.kind === "jab3" ? 0.07 : 0.035);
    sim.shake(cx, cz, act.kind === "ragePunch" ? 0.8 : act.kind === "heavy" ? 0.45 : 0.18, 30);
  }
}

/** radial shockwave around the hero (smash, landings, rage roar) */
export function shockwave(sim, h, rad, dmg, knock, lift, kind) {
  const mul = h.raging ? rageMul(h) : 1;
  const oy = h.y + 0.8;
  for (const e of sim.enemiesNear(h.x, h.z, rad + 2)) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - h.x, e.z - h.z);
    if (d > rad + e.def.r || Math.abs(e.y - h.y) > 5) continue;
    if (!sim.col.losClear(h.x, oy, h.z, e.x, e.y + 0.8, e.z)) continue;
    const k = 1 - Math.min(1, d / (rad + e.def.r)) * 0.55;
    sim.damageEnemy(e, dmg * k, { byPlayer: true, dx: (e.x - h.x) / (d || 1), dz: (e.z - h.z) / (d || 1), knock: knock * k, lift: lift * k, kind });
  }
  for (const b of sim.bosses) {
    if (b.dead) continue;
    const d = Math.hypot(b.x - h.x, b.z - h.z) - b.def.r;
    if (d > rad || Math.abs(b.y - h.y) > 6) continue;
    sim.damageBoss(b, dmg * (1 - Math.max(0, d) / rad * 0.5), { byPlayer: true, kind, x: h.x, y: h.y, z: h.z });
  }
  const props = sim.col.propsIn(h.x - rad, h.z - rad, h.x + rad, h.z + rad);
  for (const p of props) {
    if (p.mode !== "static" || p === h.carry) continue;
    const d = Math.hypot(p.x - h.x, p.z - h.z);
    if (d > rad || Math.abs(p.y - h.y) > 4) continue;
    if (!sim.col.losClear(h.x, oy, h.z, p.x, propCentreY(p), p.z)) continue;
    const k = 1 - d / rad;
    const dx = (p.x - h.x) / (d || 1);
    const dz = (p.z - h.z) / (d || 1);
    damageProp(sim, p, dmg * (0.5 + 0.7 * k) * mul * (kind === "launch" ? 0.3 : 1), { byPlayer: true, dx, dz });
    if (p.mode === "static" && p.def.grab && kind !== "roar") launchProp(sim, p, dx * knock * 0.5 * k, lift * (0.6 + k * 0.6) / Math.max(0.5, p.def.weight), dz * knock * 0.5 * k, true, 0.8);
  }
  for (const pr of sim.projectiles) {
    if (pr.hostile && Math.hypot(pr.x - h.x, pr.z - h.z) < rad * 0.7 && kind !== "launch") pr.dead = true;
  }
}

/** forward cone wave (thunder clap / rage punch follow-through) */
function coneWave(sim, h, range, cone, dmg, knock, lift, act) {
  const [fx, fz] = fwd(h.heading);
  const oy = h.y + 2;
  const mul = h.raging ? rageMul(h) : 1;
  const inCone = (x, z) => {
    const dx = x - h.x;
    const dz = z - h.z;
    const d = Math.hypot(dx, dz);
    if (d > range || d < 0.01) return d < 0.01 ? 1 : 0;
    const cos = (dx * fx + dz * fz) / d;
    return cos >= Math.cos(cone) ? d : 0;
  };
  for (const e of sim.enemiesNear(h.x + fx * range * 0.5, h.z + fz * range * 0.5, range * 0.6 + 2)) {
    if (e.dead || (act.hitSet && act.hitSet.has(e))) continue;
    const d = inCone(e.x, e.z);
    if (!d || Math.abs(e.y - h.y) > 6) continue;
    if (!sim.col.losClear(h.x, oy, h.z, e.x, e.y + 1, e.z)) continue;
    act.hitSet && act.hitSet.add(e);
    const k = 1 - (d / range) * 0.5;
    sim.damageEnemy(e, dmg * k, { byPlayer: true, dx: fx, dz: fz, knock: knock * k, lift: lift * k, kind: "clap" });
  }
  for (const b of sim.bosses) {
    if (b.dead || (act.hitSet && act.hitSet.has(b))) continue;
    const d = inCone(b.x, b.z);
    if (!d && Math.hypot(b.x - h.x, b.z - h.z) - b.def.r > 3) continue;
    act.hitSet && act.hitSet.add(b);
    sim.damageBoss(b, dmg * 0.8, { byPlayer: true, kind: "clap", x: h.x, y: h.y, z: h.z });
  }
  const props = sim.col.propsIn(h.x - range, h.z - range, h.x + range, h.z + range);
  for (const p of props) {
    if (p.mode !== "static" || p === h.carry) continue;
    const d = inCone(p.x, p.z);
    if (!d || Math.abs(p.y - h.y) > 5) continue;
    if (!sim.col.losClear(h.x, oy, h.z, p.x, propCentreY(p), p.z)) continue;
    const k = 1 - d / range;
    damageProp(sim, p, dmg * (0.4 + 0.6 * k) * mul, { byPlayer: true, dx: fx, dz: fz });
    if (p.mode === "static" && p.def.grab) launchProp(sim, p, fx * knock * 0.7 * (0.4 + k), 4 + 4 * k, fz * knock * 0.7 * (0.4 + k), true, 1);
  }
  // the clap's pressure wave swats incoming projectiles out of the air
  for (const pr of sim.projectiles) {
    if (!pr.hostile) continue;
    if (inCone(pr.x, pr.z) && Math.abs(pr.y - h.y) < 8) pr.dead = true;
  }
}

/* ================================================================ grab / throw */
function tryGrab(sim, h, inp) {
  const [fx, fz] = fwd(h.heading);
  let best = null;
  let bs = Infinity;
  for (const p of sim.col.propsIn(h.x - 4, h.z - 4, h.x + 4, h.z + 4)) {
    if (p.mode !== "static" || !p.def.grab || p.inert) continue;
    const b = p._in;
    const cx = clamp(h.x, b.x0, b.x1);
    const cz = clamp(h.z, b.z0, b.z1);
    const d = Math.hypot(cx - h.x, cz - h.z) - HERO.radius;
    if (d > 2.4 || b.y1 < h.y - 0.5 || b.y0 > h.y + 2) continue;
    const dx = p.x - h.x;
    const dz = p.z - h.z;
    const dl = Math.hypot(dx, dz) || 1;
    const facing = (dx * fx + dz * fz) / dl;
    const s = d - facing * 1.5;
    if (s < bs) {
      bs = s;
      best = p;
    }
  }
  if (!best) {
    sim.events.push({ type: "grabFail" });
    return;
  }
  startAct(sim, h, "lift", inp);
  h.act.prop = best;
  h.act.face = Math.atan2(best.x - h.x, best.z - h.z);
}
/** the prop the hero would grab right now (for the interaction prompt) */
export function grabCandidate(sim, h) {
  if (h.carry || !h.grounded) return null;
  let best = null;
  let bs = Infinity;
  for (const p of sim.col.propsIn(h.x - 4, h.z - 4, h.x + 4, h.z + 4)) {
    if (p.mode !== "static" || !p.def.grab || p.inert) continue;
    const b = p._in;
    const d = Math.hypot(clamp(h.x, b.x0, b.x1) - h.x, clamp(h.z, b.z0, b.z1) - h.z) - HERO.radius;
    if (d > 2.4 || b.y1 < h.y - 0.5 || b.y0 > h.y + 2) continue;
    if (d < bs) {
      bs = d;
      best = p;
    }
  }
  return best;
}
function throwCarry(sim, h, inp) {
  const p = h.carry;
  if (!p) return;
  h.carry = null;
  const w = p.def.weight;
  const sp = lerp(THROW.speedLight, THROW.speedHeavy, clamp(w, 0, 1.3) / 1.3) * h.st.throwStr;
  let ax = inp.aim ? inp.aim.x : Math.sin(h.heading);
  let ay = inp.aim ? inp.aim.y : 0;
  let az = inp.aim ? inp.aim.z : Math.cos(h.heading);
  // a little loft so a level throw still carries
  ay = clamp(ay + 0.1, -0.6, 0.85);
  const n = Math.hypot(ax, ay, az) || 1;
  ax /= n;
  ay /= n;
  az /= n;
  p.x = h.x + ax * 1.2;
  p.z = h.z + az * 1.2;
  p.y = h.y + HERO.height + 0.2;
  launchProp(sim, p, ax * sp + h.vx * 0.5, ay * sp + 2, az * sp + h.vz * 0.5, true, 0.8);
  h.stats.throws++;
  sim.events.push({ type: "throw", prop: p, speed: sp });
  sim.shake(h.x, h.z, 0.2, 30);
}
function dropCarry(sim, h) {
  const p = h.carry;
  if (!p) return;
  h.carry = null;
  const [fx, fz] = fwd(h.heading);
  p.x = h.x + fx * 2.6;
  p.z = h.z + fz * 2.6;
  p.y = h.y + 1;
  launchProp(sim, p, fx * 2, 1, fz * 2, false, 0.1);
  sim.events.push({ type: "drop", prop: p });
}

/** apply incoming damage to the hero (rage resistance, defence upgrades) */
export function hurtHero(sim, h, dmg, o = {}) {
  if (!h.alive) return 0;
  const k = (h.raging ? HERO.rageResist : 1) * h.st.defense;
  const real = dmg * k;
  h.hp -= real;
  h.lastHurt = sim.t;
  if (!h.raging) h.rage = Math.min(h.st.rageMax, h.rage + real * HERO.rageOnHurt * (h.st.rageGain || 1));
  h.anim.hurtT = 0.25;
  if (o.knock && o.x != null && !h.raging) {
    const dx = h.x - o.x;
    const dz = h.z - o.z;
    const d = Math.hypot(dx, dz) || 1;
    h.vx += (dx / d) * o.knock;
    h.vz += (dz / d) * o.knock;
    if (o.lift) {
      h.vy = Math.max(h.vy, o.lift);
      h.grounded = false;
    }
  }
  if (real >= 28 && !h.raging && (!h.act || ["jab1", "jab2", "walk"].includes(h.act.kind)) && !h.carry) {
    h.act = { kind: "hurt", t: 0, dur: ACT.hurt.dur, move: 0.2, anim: "hurt", face: null };
  }
  if (h.hp <= 0) {
    h.hp = 0;
    h.alive = false;
    h.act = null;
    h.charging = false;
    if (h.carry) dropCarry(sim, h);
    sim.events.push({ type: "heroDown" });
  }
  return real;
}

export { PROPS };
