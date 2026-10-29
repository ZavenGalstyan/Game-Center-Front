/**
 * A simple bot that plays any mission through the same input object a human
 * produces (camera-relative stick + edge presses). Used by simTest.mjs.
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

  // eat when low
  const dump = g.items.filter((i) => i.kind === "dumpling" && !i.taken).sort((a, b) => near(a) - near(b))[0];
  if (P.hp < P.maxHp * 0.4 && dump && !g.boss?.state?.match?.(/crouch|leap/)) B.healing = dump;
  if (B.healing && (B.healing.taken || P.hp >= P.maxHp * 0.85)) B.healing = null;
  if (B.healing) {
    if (g.prompt?.ref === B.healing) press("interact");
    Object.assign(inp, go(g, B.healing.x, B.healing.z));
    dodgeThreats(g, B, inp, press);
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
    case "punch":
    case "kick":
    case "special": {
      const d = [...g.dummies].sort((a, b) => near(a) - near(b))[0];
      if (near(d) > 1.6) Object.assign(inp, go(g, d.x, d.z));
      else {
        Object.assign(inp, stickToward(g, d.x - P.x, d.z - P.z));
        inp.mx *= 0.05;
        inp.mz *= 0.05;
        if (st.id === "punch") press("punch", 0.4);
        if (st.id === "kick") press("kick", 0.6);
        if (st.id === "special" && P.specialCd <= 0 && P.state === "move") press("special", 1);
      }
      return inp;
    }
    case "shifu": {
      const n = g.npcs[0];
      if (g.prompt?.kind === "npc") press("interact", 0.5);
      else Object.assign(inp, go(g, n.x, n.z - 1.2));
      return inp;
    }
    case "scrolls": {
      const threat = g.aliveEnemies().filter((e) => e.alert && near(e) < 4).sort((a, b) => near(a) - near(b))[0];
      if (threat) return fight(g, B, inp, press, threat);
      const s = g.items.filter((i) => i.kind === "scroll" && !i.taken).sort((a, b) => near(a) - near(b))[0];
      if (g.prompt?.kind === "scroll") press("interact", 0.3);
      Object.assign(inp, go(g, s.x, s.z));
      return inp;
    }
    case "kills":
    case "boss": {
      const e = g.aliveEnemies().sort((a, b) => near(a) - near(b))[0];
      if (!e) return inp;
      return fight(g, B, inp, press, e);
    }
    default:
      return inp;
  }
}

function dodgeThreats(g, B, inp, press) {
  const P = g.player;
  for (const e of g.aliveEnemies()) {
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    if (e.state === "windup" && d < 3.2 && e.st > 0.25 && P.dodgeCd <= 0) {
      const s = stickToward(g, P.x - e.x, P.z - e.z);
      Object.assign(inp, s);
      inp.dodge = true;
      return true;
    }
  }
  return false;
}

function fight(g, B, inp, press, e) {
  const P = g.player;
  const d = Math.hypot(e.x - P.x, e.z - P.z);
  // Tai Lung's pounce: run out of the ring, dodge as he lands
  if (e.kind === "tailung" && (e.state === "crouch" || e.state === "leap")) {
    const tx = e.target.x - P.x, tz = e.target.z - P.z;
    const away = stickToward(g, -tx - tz * 0.6 + 0.01, -tz + tx * 0.6);
    Object.assign(inp, away);
    if (e.state === "leap" && e.st > 0.5 && Math.hypot(tx, tz) < 4.2 && P.dodgeCd <= 0) inp.dodge = true;
    return inp;
  }
  if (dodgeThreats(g, B, inp, press)) return inp;
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
    press(B.alt === 3 ? "kick" : "punch", 0.14);
  }
  return inp;
}
