/**
 * A simple bot that plays any mission through the same input object a human
 * produces (camera-relative stick + edge presses). Used by simTest.mjs and
 * by the DEV autoplay hook.
 */
import { navDir } from "../engine/world.js";

export function createBot() {
  return { t: 0, next: 0, alt: 0, healing: null };
}

function stickToward(g, dx, dz) {
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return { mx: 0, mz: 0 };
  dx /= l;
  dz /= l;
  const sy = Math.sin(g.cam.yaw), cy = Math.cos(g.cam.yaw);
  // forward = (sy, cy), right = (-cy, sy)
  return { mz: dx * sy + dz * cy, mx: -dx * cy + dz * sy };
}
function go(g, x, z) {
  const P = g.player;
  const d = navDir(g.nav, P.x, P.z, x, z);
  return d ? stickToward(g, d.x, d.z) : { mx: 0, mz: 0 };
}

export function botInput(g, B, dt) {
  B.t += dt;
  const P = g.player;
  const inp = { mx: 0, mz: 0, dYaw: 0, dPitch: 0 };
  const st = g.cur;
  if (!st || P.dead) return inp;
  const ready = B.t >= B.next;
  const press = (k, gap = 0.18) => {
    if (ready) {
      inp[k] = true;
      B.next = B.t + gap;
    }
  };
  const near = (o) => Math.hypot(o.x - P.x, o.z - P.z);

  // eat pizza when low
  const pz = g.items.filter((i) => i.kind === "pizza" && !i.taken).sort((a, b) => near(a) - near(b))[0];
  if (P.hp < P.maxHp * 0.4 && pz && !(g.boss && /aim|rush/.test(g.boss.state))) B.healing = pz;
  if (B.healing && (B.healing.taken || P.hp >= P.maxHp * 0.85)) B.healing = null;
  if (B.healing) {
    if (g.prompt?.ref === B.healing) press("interact");
    Object.assign(inp, go(g, B.healing.x, B.healing.z));
    dodgeThreats(g, B, inp);
    return inp;
  }

  switch (st.id) {
    case "move":
      Object.assign(inp, go(g, 0, 0));
      return inp;
    case "look":
      inp.dYaw = 0.04;
      return inp;
    case "jump":
      if (P.grounded) press("jump", 0.3);
      return inp;
    case "dodge":
      inp.mz = 1;
      press("dodge", 0.6);
      return inp;
    case "light":
    case "combo":
    case "heavy":
    case "special": {
      const d = [...g.dummies].sort((a, b) => near(a) - near(b))[0];
      if (near(d) > 1.6) Object.assign(inp, go(g, d.x, d.z));
      else {
        Object.assign(inp, stickToward(g, d.x - P.x, d.z - P.z));
        inp.mx *= 0.05;
        inp.mz *= 0.05;
        if (st.id === "light" || st.id === "combo") press("light", 0.12);
        if (st.id === "heavy" && P.heavyCd <= 0 && P.state === "move") press("heavy", 0.5);
        if (st.id === "special" && P.specialCd <= 0 && P.state === "move") press("special", 1);
      }
      return inp;
    }
    case "splinter": {
      const n = g.npcs[0];
      if (g.prompt?.kind === "npc") press("interact", 0.5);
      else Object.assign(inp, go(g, n.x, n.z - 1.3));
      return inp;
    }
    case "find":
    case "free": {
      const threat = g.aliveEnemies().filter((e) => e.alert && near(e) < 5).sort((a, b) => near(a) - near(b))[0];
      if (threat) return fight(g, B, inp, press, threat);
      if (g.prompt?.kind === "civ" && !g.prompt.disabled) press("interact", 0.4);
      Object.assign(inp, go(g, g.civ.x - 1.2, g.civ.z));
      return inp;
    }
    case "escort": {
      const threat = g.aliveEnemies().filter((e) => near(e) < 4).sort((a, b) => near(a) - near(b))[0];
      if (threat) return fight(g, B, inp, press, threat);
      // walk to the van but wait for the civilian
      if (near(g.civ) > 4.5) return inp;
      const S = g.level.safe;
      Object.assign(inp, go(g, S.x, S.z + 1));
      return inp;
    }
    case "guards":
    case "kills":
    case "boss": {
      const pool = st.id === "guards" ? g.aliveEnemies().filter((e) => e.guard) : g.aliveEnemies();
      const e = pool.sort((a, b) => near(a) - near(b))[0];
      if (!e) return inp;
      return fight(g, B, inp, press, e);
    }
    default:
      return inp;
  }
}

function dodgeThreats(g, B, inp) {
  const P = g.player;
  for (const e of g.aliveEnemies()) {
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    if (e.state === "windup" && d < 3.4 && e.st > 0.25 && P.dodgeCd <= 0) {
      Object.assign(inp, stickToward(g, P.x - e.x, P.z - e.z));
      inp.dodge = true;
      return true;
    }
  }
  return false;
}

function fight(g, B, inp, press, e) {
  const P = g.player;
  const d = Math.hypot(e.x - P.x, e.z - P.z);
  // Shredder's Blade Rush: step sideways out of the lane, roll as he comes
  if (e.kind === "shredder" && (e.state === "aim" || e.state === "rush") && e.lane) {
    const L = e.lane;
    const fx = Math.sin(L.facing), fz = Math.cos(L.facing);
    const side = (P.x - L.x0) * fz - (P.z - L.z0) * fx; // signed lateral offset
    const s = side >= 0 ? 1 : -1;
    Object.assign(inp, stickToward(g, fz * s, -fx * s));
    if (e.state === "rush" && Math.abs(side) < 2.4 && P.dodgeCd <= 0) inp.dodge = true;
    return inp;
  }
  if (dodgeThreats(g, B, inp)) return inp;
  if (d > e.r + P.r + 1.0) {
    Object.assign(inp, go(g, e.x, e.z));
    if (P.specialCd <= 0 && d < 3 && P.state === "move") press("special", 0.3);
    return inp;
  }
  Object.assign(inp, stickToward(g, e.x - P.x, e.z - P.z));
  inp.mx *= 0.2;
  inp.mz *= 0.2;
  if (P.specialCd <= 0 && P.state === "move") press("special", 0.3);
  else {
    B.alt = (B.alt + 1) % 4;
    if (B.alt === 3 && P.heavyCd <= 0) press("heavy", 0.14);
    else press("light", 0.12);
  }
  return inp;
}
