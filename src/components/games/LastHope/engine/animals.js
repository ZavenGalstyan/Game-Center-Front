/**
 * Last Hope — wildlife: deer and rabbits graze and wander near their herd
 * centre and bolt away from the player (and keep running a while when hurt).
 */
import { ANIMALS } from "../data/zombies.js";
import { yawOf, angDiff } from "./util.js";

export function spawnAnimal(G, t, x, z, home) {
  const def = ANIMALS[t];
  const a = { id: G.R.nextId++, t, def, x, z, yaw: G.rng() * 6.28, hp: def.hp, r: def.radius, home, state: "graze", st: G.rng() * 4, flee: 0, vx: 0, vz: 0, speed: 0, dead: false, flash: 0, to: null };
  G.R.animals.push(a);
  return a;
}

export function stepAnimals(G, dt) {
  const R = G.R;
  const P = G.P;
  for (let i = R.animals.length - 1; i >= 0; i--) {
    const a = R.animals[i];
    a.flash = Math.max(0, a.flash - dt * 4);
    if (a.dead) {
      a.st += dt;
      if (a.st > 8) R.animals.splice(i, 1);
      continue;
    }
    const def = a.def;
    const dx = a.x - P.x;
    const dz = a.z - P.z;
    const d = Math.hypot(dx, dz);
    if (!P.dead && d < def.scare * (P.sprinting ? 1.4 : 1) && !P.sneak) a.flee = Math.max(a.flee, 3);
    let tx = 0;
    let tz = 0;
    let sp = 0;
    if (a.flee > 0) {
      a.flee -= dt;
      // away from the player, bent toward home so they don't pin to the map edge
      const hx = a.home.x - a.x;
      const hz = a.home.z - a.z;
      const hl = Math.hypot(hx, hz) || 1;
      tx = dx / (d || 1) + (hx / hl) * 0.35;
      tz = dz / (d || 1) + (hz / hl) * 0.35;
      sp = def.flee;
    } else {
      a.st -= dt;
      if (a.state === "graze" && a.st <= 0) {
        const ang = G.rng() * Math.PI * 2;
        const r = Math.sqrt(G.rng()) * a.home.r;
        a.to = { x: a.home.x + Math.cos(ang) * r, z: a.home.z + Math.sin(ang) * r };
        a.state = "walk";
        a.st = 7;
      } else if (a.state === "walk") {
        const wx = a.to.x - a.x;
        const wz = a.to.z - a.z;
        const wl = Math.hypot(wx, wz);
        if (wl < 0.5 || a.st <= 0) {
          a.state = "graze";
          a.st = 2 + G.rng() * 5;
        } else {
          tx = wx;
          tz = wz;
          sp = def.speed;
        }
      }
    }
    const l = Math.hypot(tx, tz) || 1;
    const k = Math.min(1, dt * 6);
    a.vx += ((tx / l) * sp - a.vx) * k;
    a.vz += ((tz / l) * sp - a.vz) * k;
    a.x += a.vx * dt;
    a.z += a.vz * dt;
    const res = R.col.resolve(a.x, a.z, a.r);
    a.x = res.x;
    a.z = res.z;
    a.speed = Math.hypot(a.vx, a.vz);
    if (a.speed > 0.1) {
      const want = yawOf(a.vx, a.vz);
      a.yaw += Math.max(-dt * 8, Math.min(dt * 8, angDiff(a.yaw, want)));
    }
  }
}
