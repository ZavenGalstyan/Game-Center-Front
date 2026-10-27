/**
 * Strike Force — map authoring helpers.
 *
 * A map is plain data produced by these helpers:
 *   boxes    axis-aligned colliders, each tagged with a visual kind `k`,
 *            material `m`, optional tint `c` / style `s` / orientation `rot`
 *   props    visual-only dressing (lamps, cranes, foliage, decals …)
 *   ground   flat surface patches (roads, pads, paths) drawn over the base
 *   ladders  climb volumes (player only)
 *   spawns   { 0: [...], 1: [...] } team spawns; FFA uses all of them
 *   flags    Domination points A/B/C
 *   hot      points of interest for roaming bots
 *
 * Conventions: x = east, z = south, y = up, metres. Rotations are quarter
 * turns (rot 0 = long side along x) so every collider stays an AABB.
 * Sides: n = -z, s = +z, w = -x, e = +x.
 */
export function createBuilder({ id, name, bounds }) {
  const boxes = [];
  const props = [];
  const ground = [];
  const ladders = [];
  const spawns = { 0: [], 1: [] };
  const flags = {};
  const hot = [];

  const add = (x0, y0, z0, x1, y1, z1, k = "block", m = "concrete", o = {}) => {
    const b = { x0: Math.min(x0, x1), y0, z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1, z1: Math.max(z0, z1), k, m, shoot: true, ...o };
    boxes.push(b);
    return b;
  };
  /** centred box */
  const box = (x, z, w, d, h, k = "block", m = "concrete", o = {}) => {
    const y = o.y || 0;
    const { y: _y, ...rest } = o;
    void _y;
    return add(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, k, m, rest);
  };
  const prop = (t, o) => {
    props.push({ t, ...o });
    return o;
  };

  /* ---------------------------------------------------------- structures */

  /**
   * Enterable single-storey building. Openings: { side, at, w, kind }
   * at = offset of the opening centre from the side's centre; kind door|window.
   */
  function room(x, z, w, d, h, o = {}) {
    const th = o.th || 0.3;
    const m = o.m || "plaster";
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const ops = o.open || [];
    const style = o.s || m;
    const wallOpts = { s: style, c: o.c };
    const side = (name, a0, a1, fixed0, fixed1, alongX) => {
      const list = ops
        .filter((p) => p.side === name)
        .map((p) => {
          const mid = (a0 + a1) / 2 + p.at;
          const kind = p.kind || "door";
          return { a: mid - p.w / 2, b: mid + p.w / 2, kind, y0: kind === "door" ? 0 : p.y0 ?? 1.05, y1: kind === "door" ? p.h || 2.35 : p.y1 ?? 2.1 };
        })
        .sort((p, q) => p.a - q.a);
      let cur = a0;
      const seg = (s0, s1, y0, y1) => {
        if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return;
        if (alongX) add(s0, y0, fixed0, s1, y1, fixed1, "wall", m, wallOpts);
        else add(fixed0, y0, s0, fixed1, y1, s1, "wall", m, wallOpts);
      };
      for (const p of list) {
        seg(cur, p.a, 0, h);
        seg(p.a, p.b, p.y1, h);
        if (p.y0 > 0) seg(p.a, p.b, 0, p.y0);
        prop(p.kind === "door" ? "doorway" : "window", {
          side: name,
          x: alongX ? (p.a + p.b) / 2 : (fixed0 + fixed1) / 2,
          z: alongX ? (fixed0 + fixed1) / 2 : (p.a + p.b) / 2,
          w: p.b - p.a,
          y0: p.y0,
          y1: p.y1,
          th,
          alongX,
          s: style,
          glass: !!o.glass,
        });
        cur = p.b;
      }
      seg(cur, a1, 0, h);
    };
    side("n", x0, x1, z0, z0 + th, true);
    side("s", x0, x1, z1 - th, z1, true);
    side("w", z0 + th, z1 - th, x0, x0 + th, false);
    side("e", z0 + th, z1 - th, x1 - th, x1, false);
    if (o.roof !== false) add(x0 - 0.15, h, z0 - 0.15, x1 + 0.15, h + 0.32, z1 + 0.15, "roof", o.roofM || "concrete", { s: style, c: o.roofC });
    prop("interior", { x, z, w, d, h, floor: o.floor || "tile", s: style, light: o.light !== false });
    return { x0, x1, z0, z1, h };
  }

  /** solid tall building used as a landmark / boundary, facade-textured */
  const facade = (x, z, w, d, h, s = "office", o = {}) => box(x, z, w, d, h, "facade", o.m || "facade", { s, c: o.c, ...o });

  /** straight staircase: dir n|s|e|w is the climbing direction */
  function stairs(x, z, dir, w, n, rise = 0.3, run = 0.42, m = "concrete") {
    const dx = dir === "e" ? 1 : dir === "w" ? -1 : 0;
    const dz = dir === "s" ? 1 : dir === "n" ? -1 : 0;
    for (let i = 0; i < n; i++) {
      const c0 = i * run;
      const c1 = (i + 1) * run;
      const top = (i + 1) * rise;
      if (dx) add(x + dx * c0, 0, z - w / 2, x + dx * c1, top, z + w / 2, "step", m);
      else add(x - w / 2, 0, z + dz * c0, x + w / 2, top, z + dz * c1, "step", m);
    }
    return n * rise;
  }

  /** climbable ladder volume on a face; `face` = side of the ladder the climber stands on */
  function ladder(x, z, top, face = "s", w = 0.7) {
    const L = { x0: x - w / 2, x1: x + w / 2, z0: z - w / 2, z1: z + w / 2, top, face };
    ladders.push(L);
    prop("ladder", { x, z, top, face, w });
    return L;
  }

  /** guard / sniper tower with a ladder on side `face` */
  function watchtower(x, z, { size = 3.2, h = 4.4, face = "s", m = "wood" } = {}) {
    const s = size / 2;
    const leg = 0.26;
    for (const [lx, lz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      box(x + lx * (s - leg / 2), z + lz * (s - leg / 2), leg, leg, h, "post", m);
    add(x - s, h, z - s, x + s, h + 0.22, z + s, "platform", m);
    const rh = 1.05;
    const rt = 0.12;
    const y = h + 0.22;
    const gap = 0.9;
    const rail = (x0, z0, x1, z1) => add(x0, y, z0, x1, y + rh, z1, "rail", m, { shoot: true, low: true });
    // north / south rails (gap on the ladder face)
    if (face === "n") {
      rail(x - s, z - s, x - gap / 2, z - s + rt);
      rail(x + gap / 2, z - s, x + s, z - s + rt);
    } else rail(x - s, z - s, x + s, z - s + rt);
    if (face === "s") {
      rail(x - s, z + s - rt, x - gap / 2, z + s);
      rail(x + gap / 2, z + s - rt, x + s, z + s);
    } else rail(x - s, z + s - rt, x + s, z + s);
    if (face === "w") {
      rail(x - s, z - s + rt, x - s + rt, z - gap / 2);
      rail(x - s, z + gap / 2, x - s + rt, z + s - rt);
    } else rail(x - s, z - s + rt, x - s + rt, z + s - rt);
    if (face === "e") {
      rail(x + s - rt, z - s + rt, x + s, z - gap / 2);
      rail(x + s - rt, z + gap / 2, x + s, z + s - rt);
    } else rail(x + s - rt, z - s + rt, x + s, z + s - rt);
    add(x - s - 0.25, y + 2.3, z - s - 0.25, x + s + 0.25, y + 2.5, z + s + 0.25, "roof", "metalRoof", { s: "tower" });
    prop("towerFrame", { x, z, s, h, y, m });
    const off = s + 0.18;
    const lx = face === "e" ? x + off : face === "w" ? x - off : x;
    const lz = face === "s" ? z + off : face === "n" ? z - off : z;
    ladder(lx, lz, y, face);
    return y;
  }

  /* ---------------------------------------------------------- props with colliders */
  const CW = 6.06;
  const CD = 2.44;
  const CH = 2.59;
  /** ISO shipping container; rot 0 = long along x; level = stack height */
  const container = (x, z, rot = 0, c = "#b5452f", level = 0, o = {}) =>
    rot % 2 === 0 ? box(x, z, CW, CD, CH, "container", "corrugated", { y: level * CH, c, rot, ...o }) : box(x, z, CD, CW, CH, "container", "corrugated", { y: level * CH, c, rot, ...o });
  const crate = (x, z, s = 1.2, o = {}) => box(x, z, s, s, o.h || s, "crate", o.m || "crateWood", { y: o.y || 0, c: o.c, s: o.s || "wood" });
  const barrier = (x, z, len = 3, rot = 0, m = "concrete") => (rot % 2 === 0 ? box(x, z, len, 0.62, 0.86, "barrier", m, { rot }) : box(x, z, 0.62, len, 0.86, "barrier", m, { rot }));
  const sandbags = (x, z, len = 3, rot = 0, h = 0.95) => (rot % 2 === 0 ? box(x, z, len, 0.8, h, "sandbag", "sandbag", { rot }) : box(x, z, 0.8, len, h, "sandbag", "sandbag", { rot }));
  const hesco = (x, z, len = 4, rot = 0, h = 1.9) => (rot % 2 === 0 ? box(x, z, len, 1.1, h, "hesco", "hesco", { rot }) : box(x, z, 1.1, len, h, "hesco", "hesco", { rot }));
  const VEH = { car: [4.5, 1.86, 1.45], suv: [4.8, 2.0, 1.8], truck: [7.6, 2.5, 3.1], humvee: [4.9, 2.2, 1.9], van: [5.2, 2.1, 2.3], bus: [11, 2.6, 3.1], forklift: [2.8, 1.3, 2.2], snowcat: [5.2, 2.6, 2.6], pickup: [5.3, 2.0, 1.75], apc: [6.6, 2.8, 2.3] };
  /** vehicle; rot 0 faces +x, 1 faces +z, 2 faces -x, 3 faces -z */
  const vehicle = (x, z, rot = 0, type = "car", c = "#5a6c7a", o = {}) => {
    const [L, W, H] = VEH[type];
    const along = rot % 2 === 0;
    return box(x, z, along ? L : W, along ? W : L, H, "vehicle", "vehicle", { s: type, c, rot, ...o });
  };
  const barrel = (x, z, c = "#2f5f8a", o = {}) => box(x, z, 0.62, 0.62, 0.92, "barrel", "barrel", { c, y: o.y || 0 });
  /** tree: thin trunk collider + visual canopy (type pine|oak|palm|dead|birch) */
  const tree = (x, z, sc = 1, type = "pine") => {
    const t = type === "palm" ? 0.32 : 0.42 * sc;
    box(x, z, t, t, 3.2 * sc, "trunk", "bark", { shoot: true, hidden: true });
    prop("tree", { x, z, sc, type, rot: hash2(x, z) * Math.PI * 2 });
  };
  const rock = (x, z, w, d, h, o = {}) => box(x, z, w, d, h, "rock", o.m || "rock", { y: o.y || 0, seed: hash2(x, z) });
  /** chain-link / mesh fence: blocks movement, not bullets or sight */
  const fence = (x0, z0, x1, z1, h = 2.3, o = {}) => {
    const t = 0.08;
    if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) return add(x0, 0, z0 - t, x1, h, z0 + t, "fence", o.m || "chainlink", { shoot: false, s: o.s || "chain" });
    return add(x0 - t, 0, z0, x0 + t, h, z1, "fence", o.m || "chainlink", { shoot: false, s: o.s || "chain" });
  };
  /** solid straight wall between two points (axis aligned) */
  const wall = (x0, z0, x1, z1, h = 3, th = 0.4, m = "concrete", o = {}) => {
    if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) return add(Math.min(x0, x1), 0, z0 - th / 2, Math.max(x0, x1), h, z0 + th / 2, o.k || "wall", m, { s: o.s || m, ...o });
    return add(x0 - th / 2, 0, Math.min(z0, z1), x0 + th / 2, h, Math.max(z0, z1), o.k || "wall", m, { s: o.s || m, ...o });
  };
  /** vertical cylinder tank (collider is its bounding box) */
  const tank = (x, z, r, h, c = "#c9ccd0", o = {}) => box(x, z, r * 2, r * 2, h, "tank", "paintedMetal", { c, y: o.y || 0, s: o.s || "tank" });
  /** horizontal tank lying along x (rot 0) or z (rot 1) */
  const htank = (x, z, len, r, rot = 0, c = "#c9ccd0") => (rot % 2 === 0 ? box(x, z, len, r * 2, r * 2 + 0.3, "htank", "paintedMetal", { c, rot }) : box(x, z, r * 2, len, r * 2 + 0.3, "htank", "paintedMetal", { c, rot }));

  /* ---------------------------------------------------------- surface + logic */
  const patch = (x0, z0, x1, z1, m, o = {}) => ground.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), m, ...o });
  const spawn = (team, x, z, yaw = 0) => spawns[team].push({ x, z, yaw });
  const flag = (key, x, z) => (flags[key] = { key, x, z });
  const poi = (x, z, w = 1) => hot.push({ x, z, w });

  function finish(extra = {}) {
    // invisible map boundary walls
    const { minX, maxX, minZ, maxZ } = bounds;
    const H = 30;
    add(minX - 1, 0, minZ - 1, maxX + 1, H, minZ, "invisible", "none", { hidden: true });
    add(minX - 1, 0, maxZ, maxX + 1, H, maxZ + 1, "invisible", "none", { hidden: true });
    add(minX - 1, 0, minZ, minX, H, maxZ, "invisible", "none", { hidden: true });
    add(maxX, 0, minZ, maxX + 1, H, maxZ, "invisible", "none", { hidden: true });
    return { id, name, bounds, boxes, props, ground, ladders, spawns, flags, hot, ...extra };
  }

  return { add, box, prop, room, facade, stairs, ladder, watchtower, container, crate, barrier, sandbags, hesco, vehicle, barrel, tree, rock, fence, wall, tank, htank, patch, spawn, flag, poi, finish, CW, CD, CH };
}

/** deterministic 0..1 hash of a coordinate pair */
export function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
