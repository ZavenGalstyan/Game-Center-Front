/**
 * Mario Adventure 3D — level-authoring kit.
 *
 * Every level is written as a short script against a builder:
 *
 *   const L = build({ id, world, num, name, ... });
 *   L.island(0, 20, 22, 30, 0);          // x, z, rx, rz, height
 *   L.hill(0, -4, 9, 2.5, { flat: 0.3 });
 *   L.spawn(0, -3);                      // y = ground
 *   L.plat(8, 1.5, 10, 3, 3);            // x, TOP, z, w, d
 *   L.coinLine([0, 4], [0, 12], 5);      // on the ground, 0.85 up
 *   …
 *   return L.done();
 *
 * Anything placed "on the ground" samples the same analytic terrain the
 * engine collides with (engine/terrain.js), so nothing floats or sinks.
 * Heights passed explicitly are platform TOPS (what Mario stands on).
 */
import { createTerrain } from "../engine/terrain.js";

const COIN_UP = 0.85;

export function build(meta) {
  const lv = {
    theme: "green",
    islands: [],
    hills: [],
    platforms: [],
    blocks: [],
    coins: [],
    enemies: [],
    hazards: [],
    pickups: [],
    checkpoints: [],
    pipes: [],
    signs: [],
    solids: [],
    deco: [],
    spawn: [0, 0, 0],
    spawnYaw: 0,
    star: null,
    goal: null,
    ...meta,
  };
  let terrain = null;
  const T = () => terrain || (terrain = createTerrain(lv));
  const ground = (x, z, fallback = 0) => {
    const h = T().height(x, z);
    return Number.isFinite(h) ? h : fallback;
  };
  // tiny deterministic rng for scattering decoration
  let seed = (meta.id || 1) * 9301 + 49297;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const L = {
    lv,
    ground,
    rnd,
    island(x, z, rx, rz, h, o = {}) {
      terrain = null;
      lv.islands.push({ x, z, rx, rz, h, seed: lv.islands.length * 1.7 + (meta.id || 0), ...o });
      return L;
    },
    hill(x, z, r, h, o = {}) {
      terrain = null;
      lv.hills.push({ x, z, r, h, ...o });
      return L;
    },
    spawn(x, z, yaw = 0, y = null) {
      lv.spawn = [x, y ?? ground(x, z), z];
      lv.spawnYaw = yaw;
      return L;
    },
    /* -------- platforms (top = surface height) */
    plat(x, top, z, w, d, o = {}) {
      lv.platforms.push({ type: "static", x, top, z, w, d, h: o.h ?? 1, style: o.style ?? lv.platStyle ?? "grass", ...o });
      return L;
    },
    /** a column from the ground up to `top` (pillars, stumps, mesas you climb) */
    pillar(x, z, top, w, o = {}) {
      const g = ground(x, z, top - 6);
      const h = Math.max(0.5, top - g + 1.5);
      lv.platforms.push({ type: "static", x, top, z, w, d: o.d ?? w, h, style: o.style ?? "pillar", shape: o.shape, r: o.shape === "cyl" ? w / 2 : undefined, ...o });
      return L;
    },
    mover(x, top, z, w, d, to, period = 5, o = {}) {
      lv.platforms.push({ type: "move", x, top, z, w, d, to, period, h: o.h ?? 0.7, style: o.style ?? "lift", ...o });
      return L;
    },
    loop(path, w, d, speed = 2.5, o = {}) {
      const [x, top, z] = path[0];
      lv.platforms.push({ type: "move", x, top, z, w, d, path, speed, h: o.h ?? 0.7, style: o.style ?? "lift", ...o });
      return L;
    },
    disc(x, top, z, r, rate = 0.8, o = {}) {
      lv.platforms.push({ type: "spin", shape: "cyl", x, top, z, r, w: r * 2, d: r * 2, rate, h: o.h ?? 0.8, style: o.style ?? "disc", ...o });
      return L;
    },
    bar(x, top, z, len, width, rate = 0.7, o = {}) {
      lv.platforms.push({ type: "spin", x, top, z, w: width, d: len, rate, h: o.h ?? 0.7, style: o.style ?? "bar", ...o });
      return L;
    },
    faller(x, top, z, w, d, o = {}) {
      lv.platforms.push({ type: "fall", x, top, z, w, d, h: o.h ?? 0.6, style: o.style ?? "crumble", ...o });
      return L;
    },
    spring(x, z, o = {}) {
      const top = o.top ?? ground(x, z) + 0.4;
      lv.platforms.push({ type: "bounce", x, top, z, shape: "cyl", r: o.r ?? 0.9, w: 1.8, d: 1.8, h: 0.4, power: o.power ?? 22, style: "spring", ...o });
      return L;
    },
    blinker(x, top, z, w, d, period = 4, phase = 0, o = {}) {
      // phase is a fraction of the period (0.35 = appears 35% of a cycle later)
      lv.platforms.push({ type: "blink", x, top, z, w, d, period, phase: -phase * period, on: o.on ?? 0.6, h: o.h ?? 0.6, style: o.style ?? "blink", ...o });
      return L;
    },
    /** giant mushroom: a stem column + a round cap you stand on */
    mushroom(x, z, top, r = 2, o = {}) {
      const g = o.base ?? ground(x, z, top - 8);
      const stemH = Math.max(0.5, top - 0.6 - g + 0.3);
      lv.platforms.push({ type: "static", shape: "cyl", x, top: top - 0.6, z, r: Math.max(0.45, r * 0.32), w: r * 0.64, d: r * 0.64, h: stemH, style: "stem", camIgnore: true });
      lv.platforms.push({ type: o.type || "static", shape: "cyl", x, top, z, r, w: r * 2, d: r * 2, h: 0.6, style: o.style || "mushcap", ...o });
      return L;
    },
    /** jump-through cloud (land on it from above, jump up through it) */
    cloud(x, top, z, r = 1.8, o = {}) {
      lv.platforms.push({ type: o.type || "static", shape: "cyl", x, top, z, r, w: r * 2, d: r * 2, h: 0.5, style: "cloud", oneWay: true, camIgnore: true, ...o });
      return L;
    },
    /** raw solid (walls, ruins) by centre + half extents */
    wall(x, y, z, hx, hy, hz, o = {}) {
      lv.platforms.push({ type: "static", x, top: y + hy, z, w: hx * 2, d: hz * 2, h: hy * 2, style: o.style ?? "wall", ...o });
      return L;
    },
    /* -------- blocks: centre height given as the block's BOTTOM */
    qblock(x, bottom, z, item = "coin", o = {}) {
      lv.blocks.push({ kind: "q", x, y: bottom + 0.55, z, item, ...o });
      return L;
    },
    brick(x, bottom, z, item = "none", o = {}) {
      lv.blocks.push({ kind: "brick", x, y: bottom + 0.55, z, item, ...o });
      return L;
    },
    /* -------- coins */
    coin(x, y, z) {
      lv.coins.push([x, y, z]);
      return L;
    },
    coinG(x, z, up = COIN_UP) {
      lv.coins.push([x, ground(x, z) + up, z]);
      return L;
    },
    /** n coins on the ground between two [x,z] points */
    coinLine(a, b, n, up = COIN_UP) {
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0.5 : i / (n - 1);
        const x = a[0] + (b[0] - a[0]) * k;
        const z = a[1] + (b[1] - a[1]) * k;
        lv.coins.push([x, ground(x, z) + up, z]);
      }
      return L;
    },
    /** n coins in the air between two [x,y,z] points (y = coin centre) */
    coinAir(a, b, n, arc = 0) {
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0.5 : i / (n - 1);
        lv.coins.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + Math.sin(k * Math.PI) * arc, a[2] + (b[2] - a[2]) * k]);
      }
      return L;
    },
    coinRing(x, y, z, r, n) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        lv.coins.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
      }
      return L;
    },
    coinRingG(x, z, r, n) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const cx = x + Math.cos(a) * r;
        const cz = z + Math.sin(a) * r;
        lv.coins.push([cx, ground(cx, cz) + COIN_UP, cz]);
      }
      return L;
    },
    /* -------- actors */
    enemy(type, x, z, o = {}) {
      lv.enemies.push({ type, x, z, ...o });
      return L;
    },
    hazard(type, o) {
      lv.hazards.push({ type, ...o });
      return L;
    },
    spikes(x, z, w, d, o = {}) {
      lv.hazards.push({ type: "spikes", x, z, w, d, y: o.y ?? ground(x, z), ...o });
      return L;
    },
    pickup(type, x, y, z) {
      lv.pickups.push({ type, x, y, z });
      return L;
    },
    pickupG(type, x, z) {
      lv.pickups.push({ type, x, y: ground(x, z) + 0.9, z });
      return L;
    },
    checkpoint(x, z, yaw = 0, y = null) {
      lv.checkpoints.push([x, y ?? ground(x, z), z, yaw]);
      return L;
    },
    star(x, y, z) {
      lv.star = [x, y, z];
      return L;
    },
    goal(x, z, y = null, h = 7) {
      lv.goal = [x, y ?? ground(x, z), z, h];
      return L;
    },
    /** warp pipe; `to` = index of the destination pipe (null = exit only) */
    pipe(x, z, h = 2, to = null, o = {}) {
      const y = o.y ?? ground(x, z, 0);
      lv.pipes.push({ x, y, z, h, to, ...o });
      return L;
    },
    sign(x, z, text, yaw = 0, y = null) {
      lv.signs.push({ x, y: y ?? ground(x, z), z, yaw, text });
      return L;
    },
    /* -------- decoration (some with colliders) */
    /** a waterfall sheet (visual) whose bottom sits at y, h tall, facing rot */
    waterfall(x, y, z, w, h, rot = 0) {
      lv.deco.push({ t: "waterfall", x, y, z, w, h, rot });
      return L;
    },
    deco(t, x, z, o = {}) {
      const y = o.y ?? ground(x, z, -100);
      if (y < -50) return L;
      lv.deco.push({ t, x, y, z, s: o.s ?? 1, rot: o.rot ?? rnd() * Math.PI * 2, ...o });
      const s = o.s ?? 1;
      const R = { tree: 0.45, pine: 0.4, palm: 0.35, cactus: 0.45, pillarDeco: 0.9, rock: 0.9, snowman: 0.7, crystal: 0.55, deadTree: 0.35, column: 0.75, totem: 0.6, mushroom: 0.4 }[t];
      // little rocks are scenery you walk over; only big ones collide
      if (R && !o.noCollide && !(t === "rock" && s < 0.8)) {
        const H = { tree: 5, pine: 6, palm: 6, cactus: 3, pillarDeco: 5, rock: 1.4, snowman: 2.6, crystal: 2.4, deadTree: 4, column: 6, totem: 4, mushroom: 2.5 }[t];
        lv.solids.push({ shape: "cyl", x, y: y + (H * s) / 2 - 0.2, z, r: R * s, hy: (H * s) / 2, surf: t === "rock" ? "stone" : "wood", camIgnore: t !== "rock" && t !== "column" && t !== "pillarDeco" });
      }
      return L;
    },
    /** scatter n decorations of type t in a ring/box, skipping spots too close to `avoid` points */
    scatter(t, n, cx, cz, rx, rz, o = {}) {
      let placed = 0;
      for (let i = 0; i < n * 6 && placed < n; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd());
        const x = cx + Math.cos(a) * rx * r;
        const z = cz + Math.sin(a) * rz * r;
        const g = T().height(x, z);
        if (!Number.isFinite(g)) continue;
        if (o.minY != null && g < o.minY) continue;
        if (o.avoid && o.avoid.some(([ax, az, ar]) => (x - ax) ** 2 + (z - az) ** 2 < ar * ar)) continue;
        const s = (o.s ?? 1) * (0.8 + rnd() * 0.45);
        L.deco(t, x, z, { s, noCollide: o.noCollide });
        placed++;
      }
      return L;
    },
    done() {
      return lv;
    },
  };
  return L;
}
