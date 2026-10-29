/**
 * Abandoned Suburb — Maple Street and Birch Avenue. Thirteen enterable
 * houses, a corner store with a gas canopy, a police blockade at the
 * crossroads, wrecked cars to salvage and a small park. Medium threat:
 * walkers everywhere, runners, riot-gear armored zombies at the blockade and
 * toxic ones around the store. The Ranger's House holds the Survivor's Map.
 */
import { createLayout } from "../../engine/layout.js";

export function buildSuburb() {
  const B = createLayout({ id: "suburb", name: "Abandoned Suburb", w: 168, d: 150, seed: 3307, biome: "suburb", base: "grass" });
  const { L } = B;
  const W2 = 84;
  const D2 = 75;
  for (let k = 0; k < 30; k++) B.paintCircle("dirt", B.r(-80, 80), B.r(-70, 70), B.r(2, 5), 3, 0.35);
  for (let k = 0; k < 20; k++) B.paintCircle("moss", B.r(-80, 80), B.r(-70, 70), B.r(6, 14), 6, 0.5);

  // streets
  B.road(
    [
      [-W2 - 4, 0],
      [W2 + 4, 0],
    ],
    9,
    { sidewalk: 2 },
  );
  B.road(
    [
      [12, -D2 - 4],
      [12, D2 + 4],
    ],
    9,
    { sidewalk: 2 },
  );
  B.reserveRect(-W2, -6.6, W2, 6.6);
  B.reserveRect(5.4, -D2, 18.6, D2);

  // houses — north row faces the street (+z), south row faces -z
  const north = [-66, -50, -34, -16, 30, 46, 64];
  const south = [-34, -16, 30, 46, 64];
  const names = ["The Millers'", "Green House", "Corner House", "Blue Cottage", "The Parkers'", "Ranger's House", "End House"];
  north.forEach((x, k) => {
    const ranger = x === 46;
    B.house(x, -16, 0, {
      style: k % 4,
      mirror: k % 2 === 1,
      name: names[k],
      bedroomContainer: ranger ? "desk" : "wardrobe",
      bedroomExtra: ranger ? { id: "ranger_desk", name: "Ranger's Desk", contents: { survivor_map: 1, pistol_ammo: 6, bandage: 2 } } : {},
      extra: ranger
        ? ({ F }) => {
            F("gun_case", -5.2, 3.2, Math.PI / 2, 0.2, 0.6);
          }
        : null,
    });
    B.paintRect("dirt", x - 1.4, -9.6, x - 0.2 + (k % 2 ? 2.4 : 0) - 1.2, -6.6, 0.3, 0.6);
  });
  south.forEach((x, k) => {
    B.house(x, 16, Math.PI, { style: (k + 2) % 4, mirror: k % 2 === 0, name: "House" });
  });
  // yard fences behind the north row and in front of the park
  B.fence(-74, -24.5, -8, -24.5, "picket", [
    [20, 2],
    [44, 2],
  ]);
  B.fence(22, -24.5, 73, -24.5, "picket", [[26, 2]]);
  B.fence(-24, 24.5, -8, 24.5, "picket", []);
  B.fence(22, 24.5, 73, 24.5, "picket", [[12, 2.2]]);
  for (const x of [-58, -42, -25, 38, 55]) B.fence(x, -10, x, -24.5, "picket");
  for (const x of [-25, 38, 55]) B.fence(x, 10, x, 24.5, "picket");

  // corner store + gas canopy (south-west lots)
  const store = B.box(-58, 30, Math.PI, 22, 14, {
    kind: "store",
    h: 3.6,
    mat: "brick",
    floor: "tile",
    name: "Quick Stop Market",
    sign: "QUICK STOP",
    front: [[11, 3]],
    frontWin: [
      [4.5, 5.5],
      [17.5, 5.5],
    ],
    rightWin: [[7, 3]],
  });
  const P = store.P;
  for (let k = 0; k < 3; k++) {
    const [x, z] = P(-5.5 + k * 5.5, -1.2);
    B.container("shelf", x, z, Math.PI, {});
  }
  {
    const [x, z] = P(-8.5, 4.4);
    B.prop("counter", x, z, { yaw: Math.PI, solid: "b", hw: 1.6, hd: 0.35 });
    const [fx, fz] = P(8, -6.2);
    B.container("fridge", fx, fz, Math.PI, { name: "Drinks Cooler" });
    const [fx2, fz2] = P(5.5, -6.2);
    B.container("fridge", fx2, fz2, Math.PI, { name: "Drinks Cooler" });
    const [mx, mz] = P(-9.8, -5.6);
    B.container("medcab", mx, mz, Math.PI, { name: "Pharmacy Shelf" });
  }
  B.paintRect("concrete", -72, 7, -44, 40, 0.2, 1);
  B.prop("gas_canopy", -58, 15, { yaw: 0 });
  B.solidC(-64, 15, 0.3);
  B.solidC(-52, 15, 0.3);
  B.prop("gas_pump", -61, 15, { solid: "b", hw: 0.4, hd: 0.6 });
  B.prop("gas_pump", -55, 15, { solid: "b", hw: 0.4, hd: 0.6 });
  B.reserveRect(-70, 8, -46, 22);

  // police blockade at the crossroads
  B.container("police_car", 6, -1.8, 1.25, { name: "Police Cruiser" });
  B.prop("police_car", 6, -1.8, { yaw: 1.25 });
  B.container("police_car", 19.5, 2.2, -1.9, { name: "Police Cruiser" });
  B.prop("police_car", 19.5, 2.2, { yaw: -1.9, v: 1 });
  for (const [x, z, a] of [
    [12, -4.8, 0],
    [12, 5, 0],
    [0, 3.5, 1.5],
    [24, -3.5, 1.6],
  ])
    B.prop("barrier", x, z, { yaw: a, solid: "b", hw: 1.5, hd: 0.3 });
  for (let k = 0; k < 6; k++) B.prop("cone", 12 + B.r(-6, 6), B.r(-3, 3), { yaw: B.r(0, 6) });

  // wrecked cars (salvageable) and lootable trunks
  const cars = [
    [-60, -2, 1.7, "w"],
    [-38, 2.2, -1.4, "t"],
    [-20, -2.4, 1.5, "w"],
    [36, 2, -1.6, "t"],
    [56, -2.2, 1.45, "w"],
    [72, 1.8, -1.5, "t"],
    [10, -30, 0.1, "w"],
    [14, 34, 3.0, "t"],
    [9.5, 56, 0.2, "w"],
    [-74, 22, 0.4, "t"],
  ];
  cars.forEach(([x, z, a, k], i) => {
    if (k === "w") {
      B.node("wreck", x, z, { yaw: a, v: i % 4 });
      B.solidB(x, z, 1, 2.2, a, true);
    } else {
      B.container("car_trunk", x, z, a, { name: "Abandoned Car" });
      B.prop("car", x, z, { yaw: a, v: i % 4 });
    }
  });

  // street furniture
  for (let x = -76; x <= 76; x += 17) {
    if (Math.abs(x - 12) < 8) continue;
    const zz = (x / 17) % 2 ? -6.2 : 6.2;
    B.prop("streetlight", x, zz, { yaw: zz < 0 ? 0 : Math.PI, solid: "c", r: 0.18 });
    B.light(x, 5.6, zz * 0.7, { color: "#ffcf8a", i: 2.2, r: 15, kind: "street", flicker: x % 3 === 0 ? 0.6 : 0 });
  }
  for (const x of north) {
    B.prop("mailbox", x + 1.6, -7, { yaw: 0, solid: "c", r: 0.15 });
    B.prop("trash_can", x + 4.5, -7.2, { solid: "c", r: 0.32 });
  }
  for (const x of south) B.prop("mailbox", x - 1.6, 7, { yaw: Math.PI, solid: "c", r: 0.15 });
  B.prop("hydrant", 3, -6.4, { solid: "c", r: 0.18 });
  B.prop("hydrant", 22, 6.4, { solid: "c", r: 0.18 });
  for (let x = -78; x <= 78; x += 26) B.prop("power_pole", x, -8.2, { solid: "c", r: 0.2 });

  // park in the south-east
  B.reserveRect(24, 28, 76, 70);
  B.paintRect("dirt", 34, 42, 46, 52, 1.2, 0.8);
  B.prop("swings", 40, 47, { yaw: 0.1, solid: "b", hw: 2, hd: 0.4 });
  B.prop("slide", 54, 46, { yaw: -0.4, solid: "b", hw: 0.6, hd: 1.8 });
  B.prop("bench", 48, 38, { yaw: Math.PI, solid: "b", hw: 0.9, hd: 0.3 });
  B.prop("bench", 62, 56, { yaw: -2, solid: "b", hw: 0.9, hd: 0.3 });
  B.prop("gazebo", 64, 40, { solid: "c", r: 0.35 });
  for (const [dx, dz] of [
    [-1.8, -1.8],
    [1.8, -1.8],
    [-1.8, 1.8],
    [1.8, 1.8],
  ])
    B.solidC(64 + dx, 40 + dz, 0.15);
  B.container("backpack_pile", 50, 51, 0.6);
  B.container("crate", 66, 62, 0.4, { table: "car_trunk", name: "Abandoned Supplies" });

  // greenery (some trees can be chopped)
  const sc = (n, r, f, area = [-80, 80, -71, 71], margin = 3) => {
    let made = 0;
    for (let tries = 0; tries < n * 40 && made < n; tries++) {
      const x = B.r(area[0], area[1]);
      const z = B.r(area[2], area[3]);
      if (!B.free(x, z, r, margin)) continue;
      f(x, z);
      made++;
    }
  };
  sc(46, 1.8, (x, z) => B.node(B.rng() < 0.6 ? "tree" : B.rng() < 0.5 ? "birch" : "pine", x, z, { s: B.r(0.85, 1.2) }));
  sc(30, 1, (x, z) => B.node("bush", x, z, { s: B.r(0.9, 1.3) }));
  sc(8, 1, (x, z) => B.node("berry", x, z));
  sc(12, 1.2, (x, z) => B.node("rock", x, z, { s: B.r(0.7, 1) }));
  sc(16, 0.8, (x, z) => B.node("branch", x, z));
  sc(10, 0.8, (x, z) => B.node("stones", x, z));
  sc(20, 1.2, (x, z) => B.prop("hedge", x, z, { yaw: B.rng() < 0.5 ? 0 : Math.PI / 2, solid: "b", hw: 1.4, hd: 0.45 }));
  sc(90, 0.6, (x, z) => B.prop("grass_tuft", x, z, { yaw: B.rng() * 6.28, s: B.r(0.8, 1.3) }), undefined, 1);
  sc(14, 1, (x, z) => B.prop("trash_bag", x, z, { yaw: B.rng() * 6.28, s: B.r(0.8, 1.1) }));
  for (let k = 0; k < 220; k++) {
    const side = k % 4;
    const t = side < 2 ? B.r(-74, 74) : B.r(-84, 84);
    const inset = B.r(0, 6);
    const x = side === 0 ? -84 + inset : side === 1 ? 84 - inset : t;
    const z = side === 2 ? -75 + inset : side === 3 ? 75 - inset : t;
    if (Math.abs(z) < 9 && x < -70) continue; // highway mouth
    if (!B.free(x, z, 1.3, 0)) continue;
    B.prop(B.rng() < 0.5 ? "tree_big" : "pine_big", x, z, { yaw: B.rng() * 6.28, s: B.r(0.95, 1.4), solid: "c", r: 0.45, mark: 1.3 });
  }

  // the dead
  B.spawn("walker", -44, 0, 3, 7);
  B.spawn("walker", 32, 0, 3, 7);
  B.spawn("walker", 60, -18, 2, 5);
  B.spawn("walker", -16, 18, 2, 5);
  B.spawn("walker", -64, -16, 2, 5);
  B.spawn("walker", 48, 46, 3, 8);
  B.spawn("walker", 12, -48, 2, 8);
  B.spawn("walker", 12, 50, 2, 8);
  B.spawn("runner", -2, -22, 2, 6);
  B.spawn("runner", 52, 12, 2, 6);
  B.spawn("runner", -30, 40, 1, 6);
  B.spawn("armored", 12, 0, 3, 5);
  B.spawn("toxic", -58, 19, 2, 5);
  B.spawn("walker", 46, -16, 2, 3);
  B.spawn("runner", -12, 0, 3, 10, { night: true });
  B.spawn("walker", 30, 30, 3, 10, { night: true });

  B.prop("road_sign", -76, -7.4, { yaw: Math.PI / 2 });
  B.prop("car", -79, 3, { yaw: 1.6, v: 3 });
  B.solidB(-79, 3, 1, 2.2, 1.6, true);
  B.exit(-80, -2, "Highway — open the world map", { r: 3.6 });
  L.entry = { x: -74, z: -2.5, yaw: Math.PI / 2 };
  return L;
}
