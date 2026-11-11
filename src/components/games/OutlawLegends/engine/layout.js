/**
 * Level layout builder. Every solid thing is an axis-aligned box in `L.obs`
 * (collision, bullets, line of sight, the nav grid); `L.deco` holds visual
 * extras the sim ignores (roads, rails, lamps, porches, tumbleweeds…). The
 * renderer reads `kind` + params to build meshes, so the data stays plain.
 *
 * Location generators (town, saloon, ranch, canyon…) build the shared
 * scenery; each mission adds its own props, cover and enemy positions.
 */

export function createLayout(theme) {
  const L = { obs: [], deco: [], rooms: [], lights: [], theme };
  let n = 0;
  const solid = (kind, x, z, w, d, h, extra = {}) => {
    const o = { id: `o${n++}`, kind, x, z, w, d, h, ...extra };
    L.obs.push(o);
    return o;
  };
  const deco = (kind, x, z, extra = {}) => {
    const o = { kind, x, z, ...extra };
    L.deco.push(o);
    return o;
  };
  const B = {
    L,
    solid,
    deco,
    /** Solid false-front building. w along x, d along z; face = side with the door/porch. */
    building(x, z, w, d, { h = 5, face = "s", facade = null, tone = 0, porch = true, tall = 1.6 } = {}) {
      const o = solid("building", x, z, w, d, h, { face, facade, tone, tall });
      if (porch) deco("porch", x, z, { w, d, face, h });
      return o;
    },
    /** Hollow building: four plank walls with door gaps + a roof; the inside is a room with a ceiling. */
    house(x, z, w, d, { h = 4.2, doors = [{ side: "s", at: 0, width: 2 }], face = "s", facade = null, tone = 0, porch = true, th = 0.3, mat = "plank", roof = true } = {}) {
      const sides = { n: [x - w / 2, z - d / 2, x + w / 2, z - d / 2], s: [x - w / 2, z + d / 2, x + w / 2, z + d / 2], w: [x - w / 2, z - d / 2, x - w / 2, z + d / 2], e: [x + w / 2, z - d / 2, x + w / 2, z + d / 2] };
      for (const side of ["n", "s", "w", "e"]) {
        const [ax, az, bx, bz] = sides[side];
        const horiz = side === "n" || side === "s";
        const len = horiz ? w : d;
        const gaps = doors.filter((g) => g.side === side).map((g) => [g.at - g.width / 2, g.at + g.width / 2]).sort((a, b) => a[0] - b[0]);
        let cur = -len / 2;
        const segs = [];
        for (const [g0, g1] of gaps) {
          if (g0 > cur) segs.push([cur, g0]);
          cur = Math.max(cur, g1);
        }
        if (cur < len / 2) segs.push([cur, len / 2]);
        for (const [s0, s1] of segs) {
          const mid = (s0 + s1) / 2, L2 = s1 - s0;
          if (L2 < 0.05) continue;
          if (horiz) solid("wall", x + mid, az, L2 + th, th, h, { mat });
          else solid("wall", ax, z + mid, th, L2, h, { mat });
        }
        // lintel over each door
        for (const [g0, g1] of gaps) {
          const mid = (g0 + g1) / 2, L2 = g1 - g0;
          if (horiz) solid("wall", x + mid, az, L2, th, h, { y0: 2.7, mat, lintel: true });
          else solid("wall", ax, z + mid, th, L2, h, { y0: 2.7, mat, lintel: true });
        }
        void bx;
        void bz;
      }
      L.rooms.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, ceil: h - 0.15 });
      if (roof) deco("roof", x, z, { w, d, h, face, facade, tone, tall: facade ? 1.6 : 0, mat });
      if (porch) deco("porch", x, z, { w, d, face, h });
      return { x, z, w, d };
    },
    crate(x, z, s = 1.1, stack = 1) {
      return solid("crate", x, z, s, s, s * stack, { s, stack });
    },
    barrel(x, z) {
      return solid("barrel", x, z, 0.8, 0.8, 1.05);
    },
    wagon(x, z, ax = "z", cover = false) {
      return ax === "z" ? solid("wagon", x, z, 1.9, 3.8, 1.5, { ax, cover }) : solid("wagon", x, z, 3.8, 1.9, 1.5, { ax, cover });
    },
    fence(x1, z1, x2, z2, { h = 1.05, th = 0.16, kind = "fence" } = {}) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const horiz = Math.abs(z2 - z1) < Math.abs(x2 - x1);
      return solid(kind, (x1 + x2) / 2, (z1 + z2) / 2, horiz ? len : th, horiz ? th : len, h, { ax: horiz ? "x" : "z" });
    },
    wall(x1, z1, x2, z2, { h = 4, th = 0.35, mat = "plank", kind = "wall" } = {}) {
      const horiz = Math.abs(z2 - z1) < Math.abs(x2 - x1);
      const len = Math.hypot(x2 - x1, z2 - z1);
      return solid(kind, (x1 + x2) / 2, (z1 + z2) / 2, horiz ? len + th : th, horiz ? th : len + th, h, { mat });
    },
    rock(x, z, w, d, h, tone = 0) {
      return solid("rock", x, z, w, d, h, { tone });
    },
    cliff(x, z, w, d, h = 14, tone = 0) {
      return solid("cliff", x, z, w, d, h, { tone });
    },
    cactus(x, z, h = 2.7) {
      return solid("cactus", x, z, 0.55, 0.55, h);
    },
    tent(x, z, ax = "x") {
      return ax === "x" ? solid("tent", x, z, 3.6, 2.8, 2.3, { ax }) : solid("tent", x, z, 2.8, 3.6, 2.3, { ax });
    },
    campfire(x, z) {
      deco("campfire", x, z);
      L.lights.push({ x, y: 1, z, color: "#ff8a3a", i: 2.6, d: 14, flicker: true });
    },
    trough(x, z, ax = "x") {
      return ax === "x" ? solid("trough", x, z, 2.4, 0.8, 0.7, { ax }) : solid("trough", x, z, 0.8, 2.4, 0.7, { ax });
    },
    table(x, z, round = true) {
      deco("chairs", x, z);
      return solid("table", x, z, round ? 1.4 : 2.2, round ? 1.4 : 1.1, 0.82, { round });
    },
    hay(x, z, ax = "x") {
      return ax === "x" ? solid("hay", x, z, 1.8, 1.1, 1.1, { ax }) : solid("hay", x, z, 1.1, 1.8, 1.1, { ax });
    },
    sandbags(x, z, len = 3, ax = "x") {
      return ax === "x" ? solid("sandbags", x, z, len, 0.9, 0.95, { ax }) : solid("sandbags", x, z, 0.9, len, 0.95, { ax });
    },
    trainCar(x, z, len = 10, ax = "x", car = "box") {
      const h = car === "flat" ? 1.5 : car === "loco" ? 4.2 : 3.7;
      return ax === "x" ? solid("train", x, z, len, 3, h, { ax, car }) : solid("train", x, z, 3, len, h, { ax, car });
    },
    tower(x, z) {
      return solid("tower", x, z, 3, 3, 8.5);
    },
    lamp(x, z, color = "#ffb45a") {
      solid("post", x, z, 0.25, 0.25, 3, { lamp: true });
      L.lights.push({ x, y: 2.9, z, color, i: 1.6, d: 11, lamp: true });
    },
    lantern(x, z, y = 2.6, color = "#ffae4a") {
      deco("lantern", x, z, { y });
      L.lights.push({ x, y, z, color, i: 2.0, d: 10, flicker: true });
    },
    road(x, z, w, d) {
      deco("road", x, z, { w, d });
    },
    rails(x1, z1, x2, z2) {
      deco("rails", (x1 + x2) / 2, (z1 + z2) / 2, { len: Math.hypot(x2 - x1, z2 - z1), ax: Math.abs(x2 - x1) > Math.abs(z2 - z1) ? "x" : "z" });
    },
    tree(x, z) {
      return solid("tree", x, z, 0.6, 0.6, 5);
    },
    grave(x, z) {
      deco("grave", x, z);
    },
    well(x, z) {
      return solid("well", x, z, 1.8, 1.8, 1.0);
    },
    fire(x, z, s = 1) {
      deco("fire", x, z, { s });
      L.lights.push({ x, y: 1.5, z, color: "#ff6a2a", i: 3 * s, d: 16, flicker: true });
    },
    tumbleweeds(nn, x0, z0, x1, z1) {
      for (let i = 0; i < nn; i++) deco("tumbleweed", x0 + ((i * 7.31) % 1) * (x1 - x0), z0 + ((i * 3.77 + 0.3) % 1) * (z1 - z0), { seed: i });
    },
    cacti(list) {
      for (const [x, z, h] of list) B.cactus(x, z, h);
    },
    /** Invisible outer walls so nobody leaves the map. */
    bounds(x0, z0, x1, z1) {
      L.bounds = [x0, z0, x1, z1];
      const H = 8;
      solid("bound", (x0 + x1) / 2, z0 - 0.5, x1 - x0 + 2, 1, H, { hidden: true, noray: true });
      solid("bound", (x0 + x1) / 2, z1 + 0.5, x1 - x0 + 2, 1, H, { hidden: true, noray: true });
      solid("bound", x0 - 0.5, (z0 + z1) / 2, 1, z1 - z0 + 2, H, { hidden: true, noray: true });
      solid("bound", x1 + 0.5, (z0 + z1) / 2, 1, z1 - z0 + 2, H, { hidden: true, noray: true });
    },
  };
  return B;
}

/* ====================================================================== locations */

/**
 * Red Mesa — the hometown. A north–south main street (x −7…7) lined with
 * false-front buildings, alleys between them and backyards behind.
 */
export function town(B, { hollow = {}, north = "church" } = {}) {
  B.bounds(-36, -52, 36, 50);
  B.road(0, -1, 14, 102);
  B.road(0, -44, 30, 8);
  const left = [
    { z: -36, len: 10, facade: "store", h: 5.5, tone: 1 },
    { z: -22, len: 12, facade: "hotel", h: 7.5, tone: 2 },
    { z: -6, len: 14, facade: "saloon", h: 7, tone: 0 },
    { z: 10, len: 11, facade: "bank", h: 6, tone: 3, key: "bank" },
    { z: 24, len: 9, facade: "house", h: 4.8, tone: 1 },
    { z: 38, len: 12, facade: "stable", h: 5.5, tone: 2 },
  ];
  const right = [
    { z: -34, len: 11, facade: "sheriff", h: 5, tone: 3, key: "sheriff" },
    { z: -20, len: 9, facade: "house", h: 4.6, tone: 0 },
    { z: -6, len: 11, facade: "gunsmith", h: 5.5, tone: 2 },
    { z: 9, len: 10, facade: "barber", h: 5, tone: 1 },
    { z: 23, len: 10, facade: "undertaker", h: 5, tone: 0 },
    { z: 37, len: 11, facade: "house", h: 4.8, tone: 3 },
  ];
  const place = (b, sideX, face) => {
    const x = sideX;
    if (hollow[b.key]) {
      const doorSide = face === "e" ? "e" : "w";
      B.house(x, b.z, 8, b.len, { h: Math.min(b.h, 5), doors: [{ side: doorSide, at: 0, width: 2 }], face, facade: b.facade, tone: b.tone });
    } else B.building(x, b.z, 8, b.len, { h: b.h, face, facade: b.facade, tone: b.tone });
  };
  for (const b of left) place(b, -13.6, "e");
  for (const b of right) place(b, 13.6, "w");
  if (north === "church") B.building(0, -47, 10, 7, { h: 6.5, face: "s", facade: "church", tone: 1, porch: false });
  // hitching rails and troughs along the boardwalks
  for (const z of [-33, -19, -3, 13, 27, 41]) B.fence(-8.6, z - 1.2, -8.6, z + 1.2, { h: 1.0 });
  for (const z of [-31, -17, -3, 12, 26, 40]) B.fence(8.6, z - 1.2, 8.6, z + 1.2, { h: 1.0 });
  B.trough(-8.3, -26, "z");
  B.trough(8.3, 15, "z");
  // backyard fences
  B.fence(-24, -44, -24, -10);
  B.fence(-24, 2, -24, 44);
  B.fence(24, -44, 24, -12);
  B.fence(24, 0, 24, 44);
  for (const [x, z] of [[-20, -29], [-21, 17], [20, -27], [21, 30], [-27, -2], [27, -6]]) B.barrel(x, z);
  B.crate(-20, 32, 1.2, 2);
  B.crate(20, 3, 1.2);
  B.lamp(-7.6, -40);
  B.lamp(7.6, -12);
  B.lamp(-7.6, 18);
  B.lamp(7.6, 30);
  B.deco("windmill", -30, 40);
  B.tower(29, -44);
  B.tumbleweeds(8, -6, -40, 6, 40);
}

/** The Rusty Spur saloon interior. */
export function saloon(B) {
  B.bounds(-16, -13, 16, 13);
  B.L.rooms.push({ x0: -16, z0: -13, x1: 16, z1: 13, ceil: 5.6 });
  B.L.floor = "wood";
  B.L.ceiling = 5.8;
  B.wall(-16, -13, 16, -13, { h: 6 });
  B.wall(-16, 13, -2, 13, { h: 6 });
  B.wall(2, 13, 16, 13, { h: 6 });
  B.wall(-16, -13, -16, 13, { h: 6 });
  B.wall(16, -13, 16, 13, { h: 6 });
  B.solid("bar", -3, -9.2, 18, 1.1, 1.15);
  B.deco("shelf", -3, -12.6, { w: 16 });
  B.solid("piano", 12.6, -10.6, 2.6, 1.2, 1.5);
  B.deco("stairs", 13.4, 4, {});
  B.solid("wall", 13.4, 4, 4.6, 8, 1.2, { mat: "plank", hidden: true });
  for (const [x, z] of [[-9, -2], [-3, -1], [3, -3], [9, -2], [-10, 5], [-4, 6], [4, 5], [8, 8], [-10, 10]]) B.table(x, z);
  B.solid("piano", -14.6, 0, 1, 3.4, 1.0, { kind2: "bench" });
  B.deco("chandelier", -5, 0, { y: 4.8 });
  B.deco("chandelier", 6, 2, { y: 4.8 });
  B.L.lights.push({ x: -5, y: 4.3, z: 0, color: "#ffc070", i: 3, d: 18 });
  B.L.lights.push({ x: 6, y: 4.3, z: 2, color: "#ffc070", i: 3, d: 18 });
  B.deco("door", 0, 13, { w: 4 });
}

/** Rhodes ranch on the edge of town: farmhouse, barn, corral, windmill. */
export function ranch(B) {
  B.bounds(-44, -46, 44, 44);
  B.road(0, 20, 8, 50);
  B.road(-6, -6, 30, 8);
  B.house(-18, -22, 12, 9, { h: 4.4, doors: [{ side: "s", at: 0, width: 2 }, { side: "e", at: 0, width: 1.8 }], face: "s", facade: "house", tone: 2 });
  B.house(18, -22, 14, 11, { h: 6.5, doors: [{ side: "s", at: 0, width: 4 }, { side: "w", at: 2, width: 2 }], face: "s", facade: "barn", tone: 4, porch: false, mat: "barn" });
  // corral
  B.fence(8, 4, 30, 4);
  B.fence(8, 24, 30, 24);
  B.fence(30, 4, 30, 24);
  B.fence(8, 4, 8, 11);
  B.fence(8, 17, 8, 24);
  B.deco("windmill", -28, 6);
  B.solid("post", -28, 6, 2, 2, 3);
  B.trough(-24, 10, "x");
  for (const [x, z] of [[-6, -12], [4, -10], [-2, 6], [-12, 2], [14, 12], [22, 16], [-30, -8], [26, -6]]) B.hay(x, z, x > 0 ? "x" : "z");
  B.wagon(-8, 18, "x");
  B.wagon(4, -2, "z");
  B.crate(-14, -12, 1.1, 2);
  B.crate(-12.8, -12, 1.1);
  B.barrel(10, -14);
  B.barrel(11, -13);
  B.fence(-40, 30, -10, 30);
  B.fence(10, 30, 40, 30);
  B.tree(-34, -34);
  B.tree(34, 36);
  B.tree(-36, 22);
  B.lamp(-12, -15);
  B.tumbleweeds(6, -30, -30, 30, 30);
}

/** Cattle stockyard by the railway: pens, crate stacks and a loading shed. */
export function stockyard(B) {
  B.bounds(-36, -40, 36, 38);
  B.rails(-36, -34, 36, -34);
  B.trainCar(-20, -34, 11, "x", "box");
  B.trainCar(-6, -34, 11, "x", "box");
  B.trainCar(12, -34, 11, "x", "flat");
  B.house(20, -14, 12, 8, { h: 5, doors: [{ side: "s", at: -2, width: 3 }, { side: "w", at: 0, width: 2 }], face: "s", facade: "shed", tone: 2, porch: false, mat: "barn" });
  // pens
  for (const x0 of [-28, -16]) {
    B.fence(x0, -6, x0 + 9, -6);
    B.fence(x0, 6, x0 + 9, 6);
    B.fence(x0, -6, x0, 6);
    B.fence(x0 + 9, -6, x0 + 9, -2);
    B.fence(x0 + 9, 2, x0 + 9, 6);
  }
  const stacks = [[-4, -16, 2], [-1, -21, 1], [4, -8, 2], [8, 6, 1], [2, 14, 2], [-8, 16, 1], [-14, 24, 2], [10, 22, 1], [20, 8, 2], [26, 0, 1], [-24, 14, 1], [16, 28, 2], [-4, 2, 1]];
  for (const [x, z, s] of stacks) {
    B.crate(x, z, 1.2, s);
    B.crate(x + 1.25, z, 1.2, 1);
  }
  B.tower(-30, -20);
  B.barrel(14, -6);
  B.barrel(14.9, -5.6);
  B.barrel(-12, 30);
  B.hay(-30, 26);
  B.hay(28, 30, "z");
  B.wagon(28, 14, "z");
  B.lamp(0, -26);
  B.lamp(-10, 10);
  B.road(0, 30, 72, 7);
}

/** Desert bandit camp: tents ring a fire, wagons, mesas all round. */
export function desertCamp(B, { size = 50 } = {}) {
  const s = size;
  B.bounds(-s, -s, s, s);
  B.L.floor = "sand";
  // mesa walls
  B.cliff(-s + 4, 0, 8, s * 2, 16, 1);
  B.cliff(s - 4, 0, 8, s * 2, 18, 1);
  B.cliff(0, -s + 4, s * 2, 8, 20, 1);
  for (const [x, z, w, d, h] of [[-30, 30, 7, 6, 4], [24, 34, 8, 6, 5], [-16, 18, 4, 3, 1.7], [12, 22, 5, 3, 1.6], [-4, 30, 3, 3, 1.4], [30, 6, 5, 4, 2.5], [-32, -6, 5, 6, 3], [6, 10, 3, 2.4, 1.3], [-10, 8, 3, 2, 1.2]]) B.rock(x, z, w, d, h, 1);
  B.cacti([[-24, 24], [18, 28, 3.2], [-38, 36], [36, 20], [-20, -30], [34, -24, 3.1], [2, 40], [-6, 18, 2.2]]);
  // camp
  B.campfire(0, -12);
  for (const [x, z, ax] of [[-9, -18, "z"], [-8, -6, "z"], [8, -19, "z"], [9, -6, "z"], [0, -24, "x"], [-14, -26, "x"], [14, -27, "x"]]) B.tent(x, z, ax);
  B.crate(-3, -4, 1.1);
  B.crate(3.5, -3, 1.1, 2);
  B.barrel(-5, -2);
  B.barrel(5, -1.5);
  B.hay(-18, -12, "z");
  B.hay(18, -12, "z");
  B.lantern(-8, -12, 2.2);
  B.lantern(8, -12, 2.2);
}

/** A winding canyon run, south (start) to north (exit). */
export function canyon(B) {
  B.bounds(-20, -84, 20, 84);
  B.L.floor = "red";
  // walls: segments that wiggle the corridor left/right
  const segs = [
    [76, 0, 14],
    [56, 2, 16],
    [36, -2, 16],
    [16, 2, 16],
    [-4, -2, 16],
    [-24, 2, 16],
    [-44, -2, 16],
    [-64, 2, 16],
    [-80, 0, 14],
  ];
  for (const [z, cx, wid] of segs) {
    const half = wid / 2;
    B.cliff(cx - half - 7, z, 14, 21, 15, 2);
    B.cliff(cx + half + 7, z, 14, 21, 16, 2);
  }
  // boulders as cover
  for (const [x, z, w, d, h] of [
    [2, 62, 2.4, 2, 1.4], [-3, 52, 3, 2, 1.2], [5, 44, 2, 2.6, 1.6], [-5, 36, 2.6, 2, 1.3],
    [1, 26, 3, 2, 1.1], [6, 18, 2, 2, 1.8], [-1, 10, 3.4, 2, 1.3], [-6, -2, 2.4, 2.2, 1.2],
    [-1, -10, 2.4, 2.4, 1.6], [4, -18, 3, 2, 1.2], [-2, -28, 3, 2.4, 1.4], [3, -36, 2.4, 2, 1.1],
    [-4, -46, 3, 2, 1.5], [1, -54, 2.6, 2.4, 1.3], [5, -62, 2.4, 2, 1.2],
  ])
    B.rock(x, z, w, d, h, 2);
  B.deco("bones", -2, 70);
  B.deco("bones", 3, -40);
  B.wagon(-4, 72, "z");
  B.cactus(6, 70, 2.4);
}

/** Wide open desert with a broken-down stagecoach in the middle. */
export function openDesert(B) {
  B.bounds(-62, -62, 62, 62);
  B.L.floor = "sand";
  B.road(0, 0, 9, 124);
  for (const [x, z, w, d, h] of [[-22, -18, 4, 3, 1.6], [24, -26, 5, 4, 2.2], [-30, 22, 6, 4, 2.8], [18, 24, 3, 3, 1.4], [-12, 36, 4, 3, 1.5], [36, 6, 6, 5, 3], [-40, -36, 8, 6, 5], [40, -44, 7, 7, 6], [44, 44, 8, 6, 5], [-46, 46, 7, 6, 4], [8, -40, 3, 2.4, 1.4], [-8, 12, 2.4, 2, 1.2], [10, -8, 2.2, 2, 1.1]])
    B.rock(x, z, w, d, h, 0);
  B.cacti([[-16, -30], [28, -10, 3.2], [-34, 4], [14, 40], [-20, 50], [50, -12], [-52, -10, 3], [4, 26, 2.3], [-6, -22, 2.4]]);
  B.tree(-26, -4);
  B.tree(30, 30);
  B.deco("bones", 16, -16);
  B.deco("bones", -18, 30);
}

/** Silver Creek mining settlement under a cliff with the mine mouth. */
export function miningTown(B) {
  B.bounds(-46, -50, 46, 46);
  B.cliff(0, -47, 92, 8, 22, 3);
  B.solid("mine", 0, -42, 10, 3, 7);
  B.rails(0, -40, 0, 30);
  B.rails(-24, -10, 24, -10);
  B.road(0, 10, 14, 72);
  // shacks (hostage huts are hollow)
  B.house(-20, -24, 9, 7, { h: 4, doors: [{ side: "e", at: 0, width: 2.4 }], face: "e", facade: "shack", tone: 4, porch: false, mat: "barn" });
  B.house(22, -26, 9, 7, { h: 4, doors: [{ side: "w", at: 0, width: 2.4 }], face: "w", facade: "shack", tone: 4, porch: false, mat: "barn" });
  B.house(-24, 14, 8, 8, { h: 4, doors: [{ side: "e", at: 0, width: 2.4 }], face: "e", facade: "shack", tone: 2, porch: false, mat: "barn" });
  B.building(22, 6, 10, 12, { h: 6, face: "w", facade: "assay", tone: 3 });
  B.building(22, 26, 9, 10, { h: 5, face: "w", facade: "store", tone: 1 });
  B.building(-22, 34, 9, 9, { h: 4.6, face: "e", facade: "house", tone: 0 });
  B.tower(-34, -16);
  B.deco("headframe", 12, -34);
  B.solid("post", 12, -34, 3, 3, 9);
  for (const [x, z] of [[0, -30], [0, -18], [-14, -10], [10, -10]]) B.solid("cart", x, z, 1.3, 1.9, 1.3);
  for (const [x, z, s] of [[-8, -26, 2], [7, -24, 1], [-10, 2, 1], [8, 0, 2], [-6, 18, 1], [6, 24, 1], [-12, -38, 1], [-34, 2, 2]]) B.crate(x, z, 1.2, s);
  for (const [x, z] of [[4, -36], [-4, 6], [32, -10], [-30, 26], [12, 36]]) B.barrel(x, z);
  B.lamp(-6, -14);
  B.lamp(6, 12);
  B.lamp(-6, 30);
}

/** Inside the Silver Creek mine: timbered corridors, a side chamber and the great hall. */
export function mineTunnel(B) {
  B.bounds(-32, -42, 32, 42);
  B.L.floor = "rock";
  B.L.ceiling = 4.6;
  B.L.rooms.push({ x0: -32, z0: -42, x1: 32, z1: 42, ceil: 4.4 });
  const W = (x1, z1, x2, z2) => B.wall(x1, z1, x2, z2, { h: 5, th: 1.2, mat: "rock", kind: "rockwall" });
  // outer
  W(-32, -42, 32, -42);
  W(-32, 42, 32, 42);
  W(-32, -42, -32, 42);
  W(32, -42, 32, 42);
  // entry corridor (south, x -4..4) z 42 → 18
  W(-4, 42, -4, 18);
  W(4, 42, 4, 24);
  // junction hall z 18..6
  W(-4, 18, -20, 18);
  W(4, 24, 20, 24);
  W(20, 24, 20, 6);
  W(-20, 18, -20, 15);
  W(-20, 9, -20, 6);
  W(-32, 18, -20, 18);
  W(-32, 6, -20, 6);
  // side chamber west (x -32..-20, z 6..18) open from hall at -20, z 9..15
  // north corridor from junction, x -4..4 up to z -14
  W(-20, 6, -4, 6);
  W(4, 6, 12, 6);
  W(-4, 6, -4, -14);
  W(4, 6, 4, -14);
  // east loop corridor x 12..20 from z 6 to -14
  W(20, 6, 20, -14);
  // great hall z -14..-42 (full width) entrances at x -4..4 and x 12..20
  W(-32, -14, -4, -14);
  W(4, -14, 12, -14);
  W(20, -14, 32, -14);
  // pillars & cover
  for (const [x, z] of [[-14, -24], [14, -24], [-14, -34], [14, -34], [0, -30]]) B.solid("pillar", x, z, 1.6, 1.6, 5);
  for (const [x, z, s] of [[-8, -20, 1], [9, -20, 1], [-22, -30, 2], [22, -30, 1], [-6, -37, 1], [6, -38, 2], [-1, 0, 1], [8, -4, 1], [-12, 12, 1], [12, 15, 1], [0, 32, 1], [-26, 12, 1]]) B.crate(x, z, 1.1, s);
  for (const [x, z] of [[0, 12], [16, -2], [-26, -20], [26, -22]]) B.solid("cart", x, z, 1.3, 1.9, 1.3);
  B.rails(0, 42, 0, -14);
  for (const [x, z] of [[0, 36], [0, 22], [-12, 12], [12, 12], [0, -4], [16, -6], [-26, 12], [-20, -24], [20, -24], [0, -36], [-24, -38], [24, -38]]) B.lantern(x, z, 3.2);
}

/** Dry Gulch station: platform, depot, rails and freight. */
export function station(B) {
  B.bounds(-52, -32, 52, 30);
  B.rails(-52, -16, 52, -16);
  B.rails(-52, -24, 52, -24);
  B.deco("platform", 0, -9.5, { w: 60, d: 7 });
  B.house(0, 4, 20, 9, { h: 5.5, doors: [{ side: "n", at: 0, width: 2.4 }, { side: "s", at: -4, width: 2 }, { side: "e", at: 0, width: 2 }], face: "n", facade: "station", tone: 3, porch: true });
  B.building(-32, 6, 12, 9, { h: 5, face: "n", facade: "store", tone: 1 });
  B.building(32, 8, 10, 10, { h: 6, face: "n", facade: "hotel", tone: 2 });
  B.tower(-44, -9);
  for (const [x, z, s] of [[-18, -10, 1], [-14, -8, 2], [14, -10, 1], [20, -8, 2], [-26, -11, 1], [28, -10, 1], [-6, -12, 1], [6, -7, 1]]) B.crate(x, z, 1.1, s);
  for (const [x, z] of [[-10, -6], [10, -6], [-38, 0], [40, -2]]) B.solid("cart", x, z, 1.4, 2.2, 1.1, { luggage: true });
  B.trainCar(-30, -24, 12, "x", "box");
  B.trainCar(-16, -24, 12, "x", "box");
  B.trainCar(30, -24, 12, "x", "flat");
  for (const x of [-20, 0, 20]) B.lamp(x, -6);
  B.road(0, 20, 104, 8);
  for (const [x, z] of [[-14, 14], [14, 16], [-44, 20], [44, 18]]) B.barrel(x, z);
  B.wagon(-20, 22, "x");
}

/** Gang hideout at Devil's Rock: palisade fort with a gate, towers, cabins. */
export function fort(B) {
  B.bounds(-50, -52, 50, 52);
  B.L.floor = "dirt";
  const P = (x1, z1, x2, z2) => B.wall(x1, z1, x2, z2, { h: 4.6, th: 0.8, mat: "log", kind: "palisade" });
  P(-30, -32, 30, -32);
  P(-30, -32, -30, 28);
  P(30, -32, 30, 28);
  P(-30, 28, -3, 28);
  P(3, 28, 30, 28);
  B.solid("gate", 0, 28, 6, 0.9, 4.6, { gate: true });
  for (const [x, z] of [[-30, -32], [30, -32], [-30, 28], [30, 28]]) B.tower(x, z);
  B.house(-16, -18, 11, 8, { h: 4.4, doors: [{ side: "s", at: 0, width: 2 }], face: "s", facade: "cabin", tone: 4, porch: true, mat: "log" });
  B.house(16, -18, 11, 8, { h: 4.4, doors: [{ side: "s", at: 0, width: 2 }], face: "s", facade: "cabin", tone: 4, porch: true, mat: "log" });
  B.building(0, -26, 12, 7, { h: 5.5, face: "s", facade: "cabin", tone: 4 });
  B.campfire(0, -2);
  for (const [x, z, s] of [[-8, 6, 1], [8, 8, 2], [-20, 4, 1], [20, 2, 1], [-4, 16, 1], [6, 18, 1], [-22, 18, 2], [22, 16, 1]]) B.crate(x, z, 1.2, s);
  for (const [x, z] of [[-12, -6], [12, -8], [-25, -4], [25, 10]]) B.barrel(x, z);
  B.wagon(-14, 10, "z");
  B.wagon(15, -4, "x");
  // outside approach
  for (const [x, z, w, d, h] of [[-12, 40, 4, 3, 1.5], [10, 38, 3, 2.4, 1.3], [-24, 34, 3, 3, 1.4], [22, 44, 4, 3, 1.6], [0, 46, 3, 2, 1.2], [-40, 0, 6, 8, 4], [40, -10, 6, 8, 4], [-40, -42, 8, 7, 6], [40, -44, 8, 8, 6]]) B.rock(x, z, w, d, h, 1);
  B.cacti([[-34, 40], [32, 36], [-44, 22], [44, 24]]);
  B.lantern(-16, -13, 2.6);
  B.lantern(16, -13, 2.6);
  B.lantern(-4, 26, 3);
  B.lantern(4, 26, 3);
}

/** Ghost town & cemetery on Boot Hill — for the twin duels. */
export function bootHill(B) {
  B.bounds(-42, -46, 42, 40);
  B.L.floor = "dirt";
  B.road(0, 0, 12, 86);
  // ruined buildings (low broken walls)
  for (const [x, z, w, d, h] of [[-14, 18, 8, 0.4, 2.2], [-18, 22, 0.4, 8, 1.6], [14, 16, 9, 0.4, 1.8], [18, 20, 0.4, 7, 2.4], [-14, -4, 7, 0.4, 1.4], [14, -6, 8, 0.4, 2], [-18, -9, 0.4, 9, 1.8], [18, -10, 0.4, 8, 1.5]]) B.solid("ruin", x, z, w, d, h, { mat: "plank" });
  B.building(-16, 32, 8, 8, { h: 4.5, face: "e", facade: "house", tone: 4 });
  B.building(16, 30, 9, 9, { h: 5, face: "w", facade: "saloon", tone: 4 });
  B.building(0, -42, 10, 6, { h: 7, face: "s", facade: "church", tone: 4, porch: false });
  // cemetery
  for (let i = 0; i < 18; i++) B.grave(-26 + (i % 6) * 3.2, -26 - Math.floor(i / 6) * 3.4);
  for (let i = 0; i < 12; i++) B.grave(16 + (i % 4) * 3.2, -24 - Math.floor(i / 4) * 3.4);
  B.fence(-30, -20, -8, -20, { h: 0.9 });
  B.fence(10, -20, 30, -20, { h: 0.9 });
  B.tree(-6, -30);
  B.tree(24, 6);
  B.tree(-28, 8);
  for (const [x, z] of [[-4, 10], [5, 4], [-3, 24], [4, -14]]) B.barrel(x, z);
  B.wagon(-6, -10, "z");
  B.tumbleweeds(8, -8, -30, 8, 30);
}

/** Silas Crowe's hacienda: adobe walls, courtyard fountain, back field. */
export function hacienda(B) {
  B.bounds(-48, -58, 48, 54);
  B.L.floor = "dirt";
  const A = (x1, z1, x2, z2, h = 3.6) => B.wall(x1, z1, x2, z2, { h, th: 0.9, mat: "adobe", kind: "adobe" });
  // outer compound z 40 (gate) → -6 ; main house north side
  A(-30, 40, -4, 40);
  A(4, 40, 30, 40);
  A(-30, 40, -30, -6);
  A(30, 40, 30, -6);
  A(-30, -6, -6, -6);
  A(6, -6, 30, -6);
  // inner courtyard arcades
  for (const [x, z] of [[-16, 26], [-16, 12], [16, 26], [16, 12], [-8, 2], [8, 2]]) B.solid("pillar", x, z, 1.2, 1.2, 3.6, { mat: "adobe" });
  B.solid("fountain", 0, 18, 4.4, 4.4, 1.1);
  B.house(-20, 2, 12, 9, { h: 4.4, doors: [{ side: "e", at: 0, width: 2 }], face: "e", facade: "adobe", tone: 5, porch: false, mat: "adobe" });
  B.building(20, 2, 12, 9, { h: 4.6, face: "w", facade: "adobe", tone: 5, porch: false });
  for (const [x, z] of [[-8, 30], [8, 32], [-22, 22], [22, 20], [0, 8]]) B.solid("pot", x, z, 1, 1, 1.2);
  for (const [x, z, s] of [[-24, 34, 1], [24, 34, 1], [-6, 12, 1], [6, 26, 1]]) B.crate(x, z, 1.1, s);
  // back field (boss arena) z -6 → -58
  for (const [x, z, w, d, h] of [[-14, -20, 3, 2.4, 1.5], [14, -22, 3, 2.4, 1.5], [-5, -29, 3, 2, 1.2], [-20, -38, 3, 3, 1.6], [20, -40, 3, 3, 1.6], [-8, -46, 2.4, 2, 1.3], [8, -46, 2.4, 2, 1.3]]) B.rock(x, z, w, d, h, 1);
  B.tree(-34, -30);
  B.tree(34, -26);
  B.cliff(0, -56, 96, 4, 12, 1);
  B.cliff(-46, -30, 4, 52, 10, 1);
  B.cliff(46, -30, 4, 52, 10, 1);
  B.cacti([[-40, 20], [40, 16], [-38, 46], [38, 48], [-26, -50], [26, -50]]);
  B.road(0, 47, 10, 14);
  B.lantern(-4, 38, 2.8);
  B.lantern(4, 38, 2.8);
  B.lantern(-6, -5, 2.8);
  B.lantern(6, -5, 2.8);
}

/** The sun-baked mesa where Coyote Kate holds court. */
export function mesa(B) {
  B.bounds(-46, -54, 46, 46);
  B.L.floor = "red";
  B.cliff(-44, 0, 8, 100, 14, 2);
  B.cliff(44, 0, 8, 100, 14, 2);
  B.cliff(0, -52, 92, 6, 18, 2);
  B.deco("arch", 0, -18);
  B.rock(-9, -18, 3, 3, 6, 2);
  B.rock(9, -18, 3, 3, 6, 2);
  for (const [x, z, w, d, h] of [[-20, 30, 4, 3, 1.6], [18, 28, 4, 3, 1.5], [-6, 18, 3, 2, 1.2], [8, 12, 3, 2, 1.3], [-24, 6, 5, 4, 2.5], [24, 2, 5, 4, 2.6], [-14, -2, 3, 2, 1.3], [14, -6, 3, 2, 1.3], [0, 4, 2.4, 2, 1.1], [-30, -30, 6, 5, 4], [30, -34, 6, 5, 4]]) B.rock(x, z, w, d, h, 2);
  B.tent(-18, 16, "z");
  B.tent(20, 14, "z");
  B.campfire(0, 24);
  B.cacti([[-34, 36], [32, 38], [-36, -14], [34, -10]]);
  B.deco("bones", 4, -34);
}
