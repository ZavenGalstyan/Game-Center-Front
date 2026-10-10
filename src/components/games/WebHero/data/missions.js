/**
 * Web Hero — mission catalogue: 30 missions, six per district, the sixth of
 * each district a boss fight. Every mission is authored against its
 * district's generated city through named locations (roofIn, blockCenter,
 * corner, streetW / streetN …), so every point lands on real geometry —
 * tools/simTest.mjs validates every point and chase path and has the bot
 * play every mission start to finish.
 *
 * spec: { id, district, name, brief, spawn, steps[], pre{}, tokens[3], heals[],
 *         par, xp, hpScale, dmgScale, boss?, arena? }
 *
 * Step types (engine/missions.js): reach · defeat · drones · rescue ·
 * disable · collect · protect · chase · boss (+ optional `time` limit).
 */
import { cityFor } from "../engine/world.js";
import { floorAt, pushOut, pathClear } from "../engine/collide.js";

const at = (p, dy = 0, dx = 0, dz = 0) => ({ x: p.x + dx, y: p.y + dy, z: p.z + dz });
/** spot on a roof offset from its centre (clamped inside the footprint) */
const onRoof = (r, fx = 0, fz = 0) => {
  const b = r.box;
  const x = Math.max(b.x0 + 1.5, Math.min(b.x1 - 1.5, r.x + fx));
  const z = Math.max(b.z0 + 1.5, Math.min(b.z1 - 1.5, r.z + fz));
  return { x, y: r.y, z };
};
/** a roof that must exist (authoring error otherwise) */
const roof = (C, i, j, pick = "tall") => {
  const r = C.roofIn(i, j, pick);
  if (!r) throw new Error(`[WebHero missions] no roof in ${C.key} block ${i},${j}`);
  return r;
};
const g = (kind, p, n = 1, o = {}) => ({ kind, at: p, n, spread: n > 1 ? 2.6 : 0, ...o });
const tok = (p, dy = 1.2) => at(p, dy);
/** street path through intersections (i,j) → corner points at street level */
const streetPath = (C, cells) => cells.map(([i, j]) => C.corner(i, j));
/**
 * rooftop route over specific roof boxes (ids from tools/roofChains.mjs: roofs
 * that face each other across a street at a runnable height): start on the
 * far side of the first roof, cross each roof to the edge facing the next,
 * hop the street, … finish on the far side of the last roof.
 */
const roofRoute = (C, ids) => {
  const R = ids.map((id) => C.geo.boxes[id]);
  const inside = (b, x, z) => ({ x: Math.max(b.x0 + 1.6, Math.min(b.x1 - 1.6, x)), y: b.y1, z: Math.max(b.z0 + 1.6, Math.min(b.z1 - 1.6, z)) });
  const legs = [];
  for (let k = 1; k < R.length; k++) {
    const a = R[k - 1];
    const b = R[k];
    if (Math.max(b.x0 - a.x1, a.x0 - b.x1) > 0) {
      const z = (Math.max(a.z0, b.z0) + Math.min(a.z1, b.z1)) / 2;
      legs.push([inside(a, b.x0 > a.x1 ? a.x1 : a.x0, z), inside(b, b.x0 > a.x1 ? b.x0 : b.x1, z)]);
    } else {
      const x = (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2;
      legs.push([inside(a, x, b.z0 > a.z1 ? a.z1 : a.z0), inside(b, x, b.z0 > a.z1 ? b.z0 : b.z1)]);
    }
  }
  // start / finish: the farthest spot on the roof with a clear run to / from the edge
  const far = (b, p, toEdge) => {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const cands = [];
    for (const fx of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) cands.push(inside(b, b.x0 + (b.x1 - b.x0) * fx, b.z0 + (b.z1 - b.z0) * fz));
    cands.push(inside(b, cx, cz));
    cands.sort((u, v) => Math.hypot(v.x - p.x, v.z - p.z) - Math.hypot(u.x - p.x, u.z - p.z));
    for (const q of cands) if (Math.hypot(q.x - p.x, q.z - p.z) > 5 && (toEdge ? pathClear(C.geo, q, p) : pathClear(C.geo, p, q))) return q;
    return inside(b, cx, cz);
  };
  const out = [far(R[0], legs[0][0], true)];
  for (const [pa, pb] of legs) out.push(pa, { ...pb, hop: true });
  out.push(far(R[R.length - 1], legs[legs.length - 1][1], false));
  return out;
};

/** walk-through hints for the coastal bridge (shore stairs up · island stairs + jetty down) */
const bridgeUp = (C) => {
  const d = C.props.bridges[0].deck;
  const zc = (d.z0 + d.z1) / 2;
  return [{ x: d.x0 - 17, y: 0, z: zc }, { x: d.x0 + 2, y: d.y1, z: zc }];
};
const bridgeDown = (C) => {
  const d = C.props.bridges[0].deck;
  const zc = (d.z0 + d.z1) / 2;
  const isl = C.props.piers.find((q) => q.kind === "island");
  return [{ x: d.x1 - 1, y: d.y1, z: zc }, { x: d.x1 + 14.5, y: 0.85, z: isl.z0 }];
};

const M = [];
const def = (meta, build) => M.push({ ...meta, build });
const D1 = { district: "downtown", hpScale: 1, dmgScale: 1 };
const D2 = { district: "industrial", hpScale: 1.1, dmgScale: 1.1 };
const D3 = { district: "coastal", hpScale: 1.2, dmgScale: 1.15 };
const D4 = { district: "neon", hpScale: 1.3, dmgScale: 1.2 };
const D5 = { district: "fortress", hpScale: 1.4, dmgScale: 1.3 };

/* ======================================================================= DISTRICT 1 — DOWNTOWN */

def({ id: 1, ...D1, name: "First Patrol", brief: "Criminals are terrorising a rooftop café. Swing in, take them down and get the hostage to safety.", par: 150, xp: 200 }, (C) => {
  // a mid-height roof ringed by towers: the first swing has real anchors on every side
  const start = C.roofIn(1, 1);
  const north = C.roofIn(1, 0, "low");
  const scene = C.roofIn(3, 3, "low");
  return {
    spawn: { x: start.x, y: start.y, z: start.box.z0 + 3, h: Math.PI },
    pre: {
      thugs: [
        { kind: "thug", at: onRoof(scene, -2, -2) },
        { kind: "thug", at: onRoof(scene, 3, 0) },
        { kind: "thug", at: onRoof(scene, -1, 3) },
      ],
    },
    steps: [
      { type: "reach", at: north, r: 15, dy: 9, label: "Swing across the street to the rooftop to the north" },
      { type: "reach", at: C.blockCenter(2, 2), r: 14, dy: 4, label: "A scream from the plaza — get down there" },
      { type: "reach", at: scene, r: 9, dy: 3, label: "Criminals on the roof to the south-east — climb up!" },
      { type: "defeat", pre: "thugs", label: "Stop the criminals" },
      { type: "rescue", civs: [{ at: onRoof(scene, 2, 2) }], label: "Rescue the hostage" },
    ],
    tokens: [tok(onRoof(C.roofIn(2, 0, "low"), 2, 2)), tok(onRoof(C.roofIn(3, 2), 0, 0)), tok(C.blockCenter(2, 2), 1.2)],
    heals: [at(onRoof(scene, -3, 3), 0.8)],
  };
});

def({ id: 2, ...D1, name: "Bank Job", brief: "A crew is cleaning out the Skyline Savings bank. Break up the robbery — and don't let the getaway driver escape.", par: 170, xp: 230 }, (C) => {
  const start = roof(C, 3, 2, "low");
  const bank = C.streetW(4, 1);
  return {
    spawn: { ...onRoof(start, 0, -6), h: Math.PI / 2 },
    steps: [
      { type: "reach", at: bank, r: 14, dy: 6, label: "Alarm at the bank on Fifth — swing over" },
      { type: "defeat", group: [g("thug", at(bank, 0, 0, -4), 3, { aggro: true }), g("gunner", at(bank, 0, 0, 7))], label: "Stop the robbers" },
      { type: "chase", path: streetPath(C, [[4, 1], [4, 0], [5, 0], [5, 1], [5, 2], [5, 3]]), speed: 8.5, label: "The getaway runner is fleeing with the cash — catch him!" },
    ],
    tokens: [tok(onRoof(roof(C, 4, 1, "low"), 3, 3)), tok(onRoof(roof(C, 3, 1), -3, 0)), tok(C.corner(5, 2), 1.2)],
    heals: [at(C.streetN(4, 2), 0.8)],
  };
});

def({ id: 3, ...D1, name: "Rooftop Runner", brief: "A courier for the city's crime bosses is running stolen plans across the rooftops. Chase him down, then crash the hand-off.", par: 180, xp: 260 }, (C) => {
  // roofs facing each other across the streets around Fifth & Ninth (tools/roofChains.mjs)
  const route = roofRoute(C, [95, 102, 135, 125]);
  const drop = roof(C, 4, 2, "low");
  return {
    spawn: { ...onRoof(roof(C, 2, 0), 0, 0), h: Math.PI / 2 },
    steps: [
      { type: "reach", at: route[0], r: 12, dy: 8, label: "The courier was seen on the rooftops to the south-east" },
      { type: "chase", path: route, speed: 7, label: "Rooftop pursuit — web him before he gets away!" },
      { type: "defeat", group: [g("thug", onRoof(drop, -3, -3), 2, { aggro: true }), g("shield", onRoof(drop, 3, 2), 1, { aggro: true })], label: "Crash the hand-off — shield guards block from the front (use F or Web Pull)" },
    ],
    tokens: [tok(onRoof(roof(C, 2, 0, "low"), 4, 4)), tok(onRoof(roof(C, 4, 0, "low"), 4, 4)), tok(onRoof(roof(C, 4, 2, "low"), 0, 0))],
    heals: [at(onRoof(drop, 0, 4), 0.8)],
  };
});

def({ id: 4, ...D1, name: "Tower Rescue", brief: "A gas leak has trapped workers on three rooftops — and looters are robbing one of them. Get everyone out before the clock runs out.", par: 200, xp: 290 }, (C) => {
  const a = roof(C, 4, 2, "low");
  const b = roof(C, 5, 1, "low");
  const c = roof(C, 4, 0, "low");
  return {
    spawn: { ...onRoof(roof(C, 3, 3, "low"), 0, 0), h: 0 },
    steps: [
      { type: "defeat", group: [g("thug", onRoof(a, -3, 0), 2, { aggro: true }), g("gunner", onRoof(a, 3, 3), 1, { aggro: true })], label: "Looters on the roof to the east — stop them" },
      { type: "rescue", civs: [{ at: onRoof(a, 3, -3) }, { at: onRoof(b, 0, 0) }, { at: onRoof(c, 0, 0) }], time: 170, label: "Rescue the trapped workers" },
    ],
    tokens: [tok(onRoof(roof(C, 3, 2), 0, 0)), tok(onRoof(roof(C, 5, 2, "low"), 2, -2)), tok(onRoof(roof(C, 4, 1, "low"), 0, 0))],
    heals: [at(onRoof(b, -3, 3), 0.8), at(onRoof(c, 3, -3), 0.8)],
  };
});

def({ id: 5, ...D1, name: "Drone Sweep", brief: "Hijacked delivery drones are buzzing the plaza. Knock them out of the sky and shut down the signal jammers steering them.", par: 200, xp: 320 }, (C) => {
  const q = C.blockCenter(2, 2);
  const j1 = roof(C, 1, 2, "low");
  const j2 = roof(C, 3, 1, "low");
  return {
    spawn: { ...C.corner(2, 3), h: Math.PI },
    steps: [
      { type: "drones", group: [g("drone", at(q, 0, -6, 0), 2, { aggro: true }), g("drone", at(q, 0, 6, 4), 2, { aggro: true })], label: "Take down the drones over the plaza (webbed drones crash)" },
      { type: "disable", devices: [onRoof(j1, 2, 2), onRoof(j2, 0, 0)], group: [g("gunner", onRoof(j2, -3, -3), 1, { aggro: true }), g("thug", onRoof(j1, -3, 0), 1, { aggro: true })], label: "Disable the signal jammers on the rooftops (hold E)" },
    ],
    tokens: [tok(at(q, 0, 10, -10)), tok(onRoof(roof(C, 2, 1), 0, 0)), tok(onRoof(roof(C, 1, 3), 0, 0))],
    heals: [at(q, 0.8, -10, 10)],
  };
});

def({ id: 6, ...D1, boss: true, name: "Iron Bruiser", brief: "The armoured enforcer behind the downtown crime wave has taken the plaza. Dodge his slams, make him charge the walls — and hit the core.", par: 260, xp: 600 }, (C) => {
  const q = C.blockCenter(2, 2);
  return {
    spawn: { ...onRoof(roof(C, 2, 1, "low"), 0, 0), h: 0 },
    arena: { ...q, r: 16 },
    steps: [
      { type: "defeat", group: [g("thug", at(q, 0, 0, -12), 2, { aggro: true }), g("bruiser", at(q, 0, 6, -10), 1, { aggro: true })], label: "Clear his crew out of the plaza" },
      { type: "boss", boss: "bruiser", arena: q, radius: 16, label: "Defeat the Iron Bruiser" },
    ],
    tokens: [tok(onRoof(roof(C, 1, 2, "low"), 0, 0)), tok(onRoof(roof(C, 3, 2, "low"), 0, 0)), tok(onRoof(roof(C, 2, 3), 0, 0))],
    heals: [at(q, 0.8, -13, 13), at(q, 0.8, 13, 13)],
  };
});

/* ======================================================================= DISTRICT 2 — INDUSTRIAL ZONE */

def({ id: 7, ...D2, name: "Smuggler's Yard", brief: "Smugglers are moving stolen tech through the container yard. Take the crew down and recover the shipment manifests.", par: 200, xp: 330 }, (C) => {
  const y = C.blockCenter(2, 0);
  return {
    spawn: { ...onRoof(roof(C, 1, 1), 0, 0), h: Math.PI },
    steps: [
      { type: "reach", at: C.streetW(2, 0), r: 12, dy: 6, label: "Head to the container yard" },
      { type: "defeat", group: [g("thug", C.streetW(2, 0), 3, { aggro: true }), g("shield", at(C.streetN(2, 1), 0, 0, -3), 1, { aggro: true })], label: "Take down the smugglers" },
      { type: "collect", items: [at(C.corner(2, 0), 1.2, 0, 3), at(C.corner(3, 0), 1.2, 0, 3), at(C.streetN(2, 1), 1.2, 4, 0)], label: "Recover the shipment manifests" },
    ],
    tokens: [tok(onRoof(roof(C, 3, 0, "low"), 0, 0)), tok(C.corner(3, 1)), tok(onRoof(roof(C, 1, 0), 0, 0))],
    heals: [at(C.corner(2, 1), 0.8)],
  };
});

def({ id: 8, ...D2, name: "Crane Runner", brief: "A crooked foreman bolted with the yard's security keys. Run him down through the cranes and the warehouses.", par: 190, xp: 350 }, (C) => {
  return {
    spawn: { ...C.corner(4, 1), h: 0 },
    steps: [
      { type: "chase", path: streetPath(C, [[4, 1], [4, 2], [4, 3], [3, 3], [2, 3], [2, 4], [1, 4]]), speed: 9, label: "Catch the foreman before he escapes!" },
      { type: "defeat", group: [g("thug", C.corner(1, 4), 2, { aggro: true }), g("gunner", C.streetN(1, 4), 1, { aggro: true }), g("shield", C.streetW(1, 4), 1, { aggro: true })], label: "His crew jumps you — fight!" },
    ],
    tokens: [tok(onRoof(roof(C, 3, 2, "low"), 0, 0)), tok(C.streetN(3, 3)), tok(onRoof(roof(C, 2, 4), 0, 0))],
    heals: [at(C.corner(3, 3), 0.8), at(C.corner(2, 4), 0.8)],
  };
});

def({ id: 9, ...D2, name: "Factory Lockdown", brief: "Bombs are ticking on three warehouse roofs. Defuse them before the factory district goes up — gunners are guarding them.", par: 190, xp: 370 }, (C) => {
  const a = roof(C, 3, 1, "low");
  const b = roof(C, 4, 2, "low");
  const c = roof(C, 2, 1, "low");
  return {
    spawn: { ...C.corner(3, 2), h: 0 },
    steps: [
      { type: "disable", devices: [onRoof(a, 0, 0), onRoof(b, 0, 0), onRoof(c, 0, 0)], group: [g("gunner", onRoof(a, -4, 2)), g("gunner", onRoof(b, 4, 0)), g("thug", onRoof(c, -3, 0), 2)], time: 200, label: "Defuse the bombs (hold E) before time runs out" },
    ],
    tokens: [tok(onRoof(roof(C, 4, 0, "low"), 0, 0)), tok(onRoof(roof(C, 3, 2), 0, 0)), tok(onRoof(roof(C, 2, 3), 0, 0))],
    heals: [at(C.corner(4, 2), 0.8)],
  };
});

def({ id: 10, ...D2, name: "Hostage Warehouse", brief: "Night-shift workers are being held in the old cannery. A bruiser runs the door. Get them out.", par: 210, xp: 390 }, (C) => {
  const w = C.streetN(1, 3);
  const r = roof(C, 1, 3, "low");
  return {
    spawn: { ...onRoof(roof(C, 1, 1), 0, 0), h: 0 },
    steps: [
      { type: "reach", at: w, r: 12, dy: 6, label: "Reach the cannery" },
      { type: "defeat", group: [g("bruiser", w, 1, { aggro: true }), g("thug", at(w, 0, 5, 0), 2, { aggro: true }), g("assassin", at(w, 0, -5, 0), 1, { aggro: true })], label: "Defeat the guards — dodge the bruiser's slam!" },
      { type: "rescue", civs: [{ at: at(w, 0, -3, -3) }, { at: at(w, 0, 3, -3) }, { at: onRoof(r, 0, 0) }], label: "Free the workers" },
    ],
    tokens: [tok(onRoof(roof(C, 0, 3), 0, 0)), tok(onRoof(roof(C, 2, 3), 2, 2)), tok(C.corner(1, 2), 1.2)],
    heals: [at(w, 0.8, 0, 4)],
  };
});

def({ id: 11, ...D2, name: "Fuel Depot", brief: "A gang wants to torch the fuel depot and blame you for the blast. Hold the line through every wave.", par: 230, xp: 410 }, (C) => {
  const d = C.corner(4, 4);
  const sp = (dx, dz) => at(d, 0, dx, dz);
  return {
    spawn: { ...at(d, 0, 0, -10), h: 0 },
    steps: [
      { type: "protect", at: d, hp: 140, target: "Fuel depot", waves: [[g("thug", sp(-16, 0), 3)], [g("gunner", sp(16, 0), 2), g("drone", sp(0, 16), 2)], [g("bruiser", sp(-16, 4)), g("thug", sp(0, -16), 2)]], label: "Protect the fuel depot" },
    ],
    tokens: [tok(onRoof(roof(C, 2, 3, "low"), 0, 0)), tok(onRoof(roof(C, 4, 3, "low"), 0, 0)), tok(onRoof(roof(C, 3, 4, "low"), 0, 0))],
    heals: [at(d, 0.8, 6, 6), at(d, 0.8, -6, -6)],
  };
});

def({ id: 12, ...D2, boss: true, name: "Drone Commander", brief: "The man pulling the drones' strings is hovering over the yard in an armoured flight rig. Strip his escort, drop his shield and drag him down.", par: 280, xp: 700 }, (C) => {
  const q = C.blockCenter(2, 2);
  return {
    spawn: { ...C.corner(2, 3), h: Math.PI },
    arena: { ...q, r: 16 },
    steps: [
      { type: "drones", group: [g("drone", at(q, 0, -8, -8), 2, { aggro: true }), g("drone", at(q, 0, 8, 8), 2, { aggro: true })], label: "Shoot down the escort drones" },
      { type: "boss", boss: "commander", arena: q, radius: 16, label: "Defeat the Drone Commander" },
    ],
    tokens: [tok(onRoof(roof(C, 1, 2), 0, 0)), tok(onRoof(roof(C, 3, 2), 0, 0)), tok(onRoof(roof(C, 2, 1), 0, 0))],
    heals: [at(q, 0.8, -13, 13), at(q, 0.8, 13, -13)],
  };
});

/* ======================================================================= DISTRICT 3 — COASTAL DISTRICT */

def({ id: 13, ...D3, name: "Pier Pressure", brief: "Smugglers are unloading weapons on the piers. Shut the operation down — and watch out for the new hired blades.", par: 210, xp: 420 }, (C) => {
  const p1 = C.blockCenter(3, 1);
  const p2 = C.blockCenter(3, 3);
  return {
    spawn: { ...onRoof(roof(C, 2, 1), 0, 0), h: Math.PI / 2 },
    steps: [
      { type: "defeat", group: [g("thug", at(p1, 0, 12, 0), 3, { aggro: true }), g("assassin", at(p1, 0, 14, 6), 1, { aggro: true })], label: "Clear the north pier" },
      { type: "defeat", group: [g("shield", at(p2, 0, 12, 0), 1, { aggro: true }), g("gunner", at(p2, 0, 14, 6), 2, { aggro: true }), g("assassin", at(p2, 0, 10, -6), 1, { aggro: true })], label: "Clear the south pier" },
    ],
    tokens: [tok(onRoof(roof(C, 3, 1), 0, 0)), tok(onRoof(roof(C, 3, 3), 0, 0)), tok(onRoof(roof(C, 2, 2), 0, 0))],
    heals: [at(p1, 0.8, 16, -8), at(p2, 0.8, 16, -8)],
  };
});

def({ id: 14, ...D3, name: "Bridge Bombs", brief: "Charges have been planted along the harbour bridge. Drones are guarding them — defuse every one.", par: 220, xp: 440 }, (C) => {
  const deck = C.props.bridges[0].deck;
  const zc = (deck.z0 + deck.z1) / 2;
  const x = (k) => deck.x0 + (deck.x1 - deck.x0) * k;
  return {
    spawn: { ...onRoof(roof(C, 2, 2), 0, 0), h: Math.PI / 2 },
    steps: [
      { type: "reach", at: { x: x(0.08), y: deck.y1, z: zc }, r: 10, dy: 3, via: bridgeUp(C), label: "Get onto the harbour bridge (stairs by the shore road — or swing up)" },
      { type: "disable", devices: [{ x: x(0.25), y: deck.y1, z: zc }, { x: x(0.55), y: deck.y1, z: zc }, { x: x(0.85), y: deck.y1, z: zc }], group: [g("drone", { x: x(0.4), y: deck.y1, z: zc }, 2, { aggro: true }), g("drone", { x: x(0.75), y: deck.y1, z: zc }, 1, { aggro: true })], time: 210, label: "Defuse the charges on the bridge (hold E)" },
    ],
    tokens: [tok(((tw) => ({ x: (tw.x0 + tw.x1) / 2, y: tw.y1, z: (tw.z0 + tw.z1) / 2 }))(C.props.bridges[0].towers[0])), tok(onRoof(roof(C, 3, 3), 0, 0)), tok({ x: x(0.98), y: deck.y1, z: zc })],
    heals: [at({ x: x(0.4), y: deck.y1, z: zc }, 0.8)],
  };
});

def({ id: 15, ...D3, name: "Lighthouse Signal", brief: "Someone is signalling smugglers from the old lighthouse. Search the island and the docks for their codebooks.", par: 230, xp: 460 }, (C) => {
  const isl = C.blockCenter(5, 2);
  const p = C.blockCenter(3, 2);
  return {
    spawn: { ...onRoof(roof(C, 2, 2), 0, 0), h: Math.PI / 2 },
    steps: [
      { type: "collect", items: [at(p, 1.2, 10, -8), at(p, 1.2, 14, 8)], group: [g("thug", at(p, 0, 12, 0), 2, { aggro: true })], label: "Find the codebooks on the docks" },
      { type: "reach", at: at(isl, 0.4, -6, -8), r: 8, dy: 3, via: [...bridgeUp(C), ...bridgeDown(C)], label: "Cross the harbour bridge to the lighthouse island" },
      { type: "collect", items: [at(isl, 1.6, -8, -8), at(isl, 1.6, 8, 8)], group: [g("gunner", at(isl, 0.4, 8, -8), 1, { aggro: true }), g("assassin", at(isl, 0.4, -9, 6), 2, { aggro: true })], label: "Search the island — assassins guard the codebooks" },
    ],
    tokens: [tok(onRoof(roof(C, 3, 2), 0, 0)), tok(at(isl, 0.4, 10, 0)), tok(onRoof(roof(C, 2, 3), 0, 0))],
    heals: [at(isl, 1.2, 0, 10)],
  };
});

def({ id: 16, ...D3, name: "Boardwalk Chase", brief: "A fence is getting away along the waterfront with a stolen prototype. Stay on him.", par: 200, xp: 480 }, (C) => {
  return {
    spawn: { ...C.corner(3, 0), h: 0 },
    steps: [
      { type: "chase", path: streetPath(C, [[3, 0], [3, 1], [2, 1], [2, 2], [2, 3], [3, 3], [3, 4], [2, 4], [2, 5]]), speed: 9.5, label: "Chase the fence down the waterfront!" },
      { type: "defeat", group: [g("shield", C.corner(2, 5), 2, { aggro: true }), g("gunner", C.streetN(2, 5), 1, { aggro: true })], label: "Beat his bodyguards" },
    ],
    tokens: [tok(onRoof(roof(C, 2, 3), 0, 0)), tok(onRoof(roof(C, 2, 4), 0, 0)), tok(onRoof(roof(C, 3, 4), 0, 0))],
    heals: [at(C.corner(3, 3), 0.8)],
  };
});

def({ id: 17, ...D3, name: "Storm Surge", brief: "A storm surge is flooding the docks — and looters are using it as cover. Rescue the stranded and stop the looting.", par: 220, xp: 500 }, (C) => {
  const p3 = C.blockCenter(3, 3);
  const p4 = C.blockCenter(3, 4);
  return {
    spawn: { ...onRoof(roof(C, 2, 3), 0, 0), h: Math.PI / 2 },
    steps: [
      { type: "defeat", group: [g("thug", at(p3, 0, 12, 0), 2, { aggro: true }), g("assassin", at(p4, 0, 12, 0), 1, { aggro: true }), g("gunner", at(p4, 0, 15, 6), 1, { aggro: true })], label: "Stop the looters on the docks" },
      { type: "rescue", civs: [{ at: at(p3, 0, 16, 6) }, { at: at(p4, 0, 16, -6) }, { at: onRoof(roof(C, 3, 3), 0, 0) }, { at: onRoof(roof(C, 3, 5), 0, 0) }], time: 170, label: "Rescue the stranded dock workers" },
    ],
    tokens: [tok(onRoof(roof(C, 3, 4), 0, 0)), tok(onRoof(roof(C, 2, 4), 0, 0)), tok(at(p3, 0, 20, 12))],
    heals: [at(p3, 0.8, 18, -8)],
  };
});

def({ id: 18, ...D3, boss: true, name: "Shock Striker", brief: "A speed-freak in a stolen power suit is frying the coastal grid. Survive his lightning dashes and trap him when he overcharges.", par: 280, xp: 800 }, (C) => {
  const q = C.blockCenter(1, 2);
  return {
    spawn: { ...onRoof(roof(C, 1, 1), 0, 0), h: 0 },
    arena: { ...q, r: 16 },
    steps: [
      { type: "reach", at: q, r: 14, dy: 3, label: "The grid is failing — get to the square" },
      { type: "boss", boss: "striker", arena: q, radius: 16, label: "Defeat the Shock Striker" },
    ],
    tokens: [tok(onRoof(roof(C, 0, 2), 0, 0)), tok(onRoof(roof(C, 2, 2), 0, 0)), tok(onRoof(roof(C, 1, 3), 0, 0))],
    heals: [at(q, 0.8, -13, 13), at(q, 0.8, 13, -13)],
  };
});

/* ======================================================================= DISTRICT 4 — NEON CITY */

def({ id: 19, ...D4, name: "Neon Nights", brief: "The Shadow Hunter's assassins have taken over the night market. Show them the city still has a defender.", par: 220, xp: 520 }, (C) => {
  const q = C.blockCenter(2, 1);
  return {
    spawn: { ...onRoof(roof(C, 1, 1, "low"), 0, 0), h: Math.PI / 2 },
    steps: [
      { type: "reach", at: q, r: 14, dy: 3, label: "Get down to the night market" },
      { type: "defeat", group: [g("assassin", at(q, 0, -6, -4), 2, { aggro: true }), g("thug", at(q, 0, 6, 0), 2, { aggro: true }), g("gunner", at(q, 0, 0, 10), 1, { aggro: true })], label: "Defeat the assassins and their thugs" },
      { type: "defeat", group: [g("shield", at(q, 0, 0, -12), 2, { aggro: true }), g("assassin", at(q, 0, 10, -10), 1, { aggro: true })], label: "Reinforcements! Break their shields" },
    ],
    tokens: [tok(onRoof(roof(C, 2, 0), 0, 0)), tok(onRoof(roof(C, 3, 1, "low"), 0, 0)), tok(at(q, 0, 12, 12))],
    heals: [at(q, 0.8, -12, 12), at(q, 0.8, 12, -12)],
  };
});

def({ id: 20, ...D4, name: "Signal Hijack", brief: "Rooftop transmitters are hijacking every screen in Neon City. Shut them off — the drones guarding them won't make it easy.", par: 230, xp: 540 }, (C) => {
  const a = roof(C, 4, 0, "low");
  const b = roof(C, 5, 1, "low");
  const c = roof(C, 5, 2, "low");
  return {
    spawn: { ...onRoof(roof(C, 3, 2, "low"), 0, 0), h: Math.PI },
    steps: [
      { type: "disable", devices: [onRoof(a, 0, 0), onRoof(b, 0, 0), onRoof(c, 0, 0)], group: [g("drone", onRoof(a, 3, 3), 2), g("drone", onRoof(b, -3, 0), 1), g("gunner", onRoof(c, 3, 0), 1)], label: "Shut down the transmitters (hold E)" },
    ],
    tokens: [tok(onRoof(roof(C, 4, 1), 0, 0)), tok(onRoof(roof(C, 5, 0, "low"), 0, 0)), tok(onRoof(roof(C, 3, 0, "low"), 0, 0))],
    heals: [at(onRoof(b, 3, 3), 0.8)],
  };
});

def({ id: 21, ...D4, name: "Rooftop Rumble", brief: "A Shadow Hunter scout is carrying the location of his hideout. He's fast and he's on the rooftops. So are you.", par: 220, xp: 560 }, (C) => {
  // the scout leaps from the tower roof down to the next one (tools/roofChains.mjs)
  const route = roofRoute(C, [83, 55]);
  const end = C.geo.boxes[55];
  const endR = { x: (end.x0 + end.x1) / 2, y: end.y1, z: (end.z0 + end.z1) / 2, box: end };
  return {
    spawn: { ...onRoof(roof(C, 0, 2, "low"), 0, 0), h: Math.PI / 2 },
    steps: [
      { type: "reach", at: route[0], r: 12, dy: 8, label: "The scout is on the tower roof to the east" },
      { type: "chase", path: route, speed: 5.5, label: "Rooftop pursuit — don't lose him!" },
      { type: "defeat", group: [g("assassin", onRoof(endR, -3, -3), 2, { aggro: true }), g("shield", onRoof(endR, 3, 3), 1, { aggro: true })], label: "It was an ambush — fight your way out" },
    ],
    tokens: [tok(onRoof(roof(C, 2, 0, "low"), 0, 0)), tok(onRoof(roof(C, 0, 2, "low"), 0, 0)), tok(onRoof(roof(C, 2, 3, "low"), 0, 0))],
    heals: [at(onRoof(endR, 0, 4), 0.8)],
  };
});

def({ id: 22, ...D4, name: "Club Raid", brief: "Hostages are being held above the Karaoke Club. Take out the guards on the street, then get everyone off the roof.", par: 240, xp: 580 }, (C) => {
  const s = C.streetN(1, 5);
  const r = roof(C, 0, 5, "low");
  const r2 = roof(C, 1, 3, "low");
  return {
    spawn: { ...C.corner(1, 4), h: Math.PI / 2 },
    steps: [
      { type: "defeat", group: [g("bruiser", s, 1, { aggro: true }), g("assassin", at(s, 0, -6, 0), 2, { aggro: true }), g("gunner", at(s, 0, 6, 0), 1, { aggro: true })], label: "Take out the guards outside the club" },
      { type: "rescue", civs: [{ at: onRoof(r, -3, 0) }, { at: onRoof(r, 3, 0) }, { at: onRoof(r2, 0, 0) }], label: "Rescue the hostages on the rooftops" },
    ],
    tokens: [tok(onRoof(roof(C, 2, 5), 0, 0)), tok(onRoof(roof(C, 0, 4, "low"), 0, 0)), tok(C.corner(2, 5), 1.2)],
    heals: [at(s, 0.8, 0, -4), at(onRoof(r, 0, 3), 0.8)],
  };
});

def({ id: 23, ...D4, name: "Blackout", brief: "They're coming for the substation that keeps Neon City lit. Wave after wave — hold it together.", par: 250, xp: 600 }, (C) => {
  const d = C.corner(4, 4);
  const sp = (dx, dz) => at(d, 0, dx, dz);
  return {
    spawn: { ...at(d, 0, 0, 8), h: Math.PI },
    steps: [
      { type: "protect", at: d, hp: 150, target: "Substation", waves: [[g("assassin", sp(-16, 0), 2), g("thug", sp(16, 0), 2)], [g("drone", sp(0, 16), 3)], [g("shield", sp(0, -16), 2), g("gunner", sp(16, 0), 2)], [g("bruiser", sp(-16, 0)), g("assassin", sp(16, 0), 2)]], label: "Protect the substation" },
    ],
    tokens: [tok(onRoof(roof(C, 3, 3, "low"), 0, 0)), tok(onRoof(roof(C, 4, 3, "low"), 0, 0)), tok(onRoof(roof(C, 3, 4, "low"), 0, 0))],
    heals: [at(d, 0.8, 6, 6), at(d, 0.8, -6, -6)],
  };
});

def({ id: 24, ...D4, boss: true, name: "Shadow Hunter", brief: "The assassin lord himself. He vanishes, he counters, he never fights fair. Webs reveal him — never strike his blue stance.", par: 300, xp: 900 }, (C) => {
  const q = C.blockCenter(1, 4);
  return {
    spawn: { ...C.corner(1, 4), h: Math.PI },
    arena: { ...q, r: 16 },
    steps: [
      { type: "reach", at: q, r: 14, dy: 3, label: "He's waiting in the square" },
      { type: "boss", boss: "hunter", arena: q, radius: 16, label: "Defeat the Shadow Hunter" },
    ],
    tokens: [tok(onRoof(roof(C, 0, 4, "low"), 0, 0)), tok(onRoof(roof(C, 2, 4, "low"), 0, 0)), tok(onRoof(roof(C, 1, 3, "low"), 0, 0))],
    heals: [at(q, 0.8, -13, 13), at(q, 0.8, 13, -13)],
  };
});

/* ======================================================================= DISTRICT 5 — CENTRAL FORTRESS */

def({ id: 25, ...D5, name: "Breach", brief: "The Titan Overlord's fortress district is sealed. Break through the west gate and kill the lock systems.", par: 240, xp: 620 }, (C) => {
  const e = C.half - 4;
  const gate = { x: -e + 6, y: 0, z: 0 };
  return {
    spawn: { x: -e - 6, y: 0, z: 0, h: Math.PI / 2 },
    steps: [
      { type: "defeat", group: [g("shield", at(gate, 0, 2, -4), 2, { aggro: true }), g("gunner", at(gate, 0, 6, 4), 2, { aggro: true })], label: "Defeat the gate guards" },
      { type: "disable", devices: [at(gate, 0, -4, -9), at(gate, 0, -4, 9)], group: [g("assassin", at(gate, 0, 10, 0), 1, { aggro: true })], label: "Disable the gate locks (hold E)" },
    ],
    tokens: [tok(onRoof(roof(C, 0, 2), 0, 0)), tok(onRoof(roof(C, 0, 3, "low"), 0, 0)), tok({ x: -e - 1, y: 9, z: -20 }, 1.2)],
    heals: [at(gate, 0.8, 8, 0)],
  };
});

def({ id: 26, ...D5, name: "Data Heist", brief: "The fortress keeps its plans in data cores scattered around the HQ. Grab them — patrols everywhere.", par: 250, xp: 640 }, (C) => {
  const h = C.hq;
  const k = 47;
  return {
    spawn: { ...C.corner(1, 1), h: Math.PI / 4 },
    steps: [
      { type: "collect", items: [{ x: h.x - k, y: 1.2, z: h.z - k }, { x: h.x + k, y: 1.2, z: h.z - k }, { x: h.x + k, y: 1.2, z: h.z + k }, { x: h.x - k, y: 1.2, z: h.z + k }], group: [g("gunner", { x: h.x, y: 0, z: h.z - k }, 2, { aggro: true }), g("assassin", { x: h.x + k, y: 0, z: h.z }, 1, { aggro: true }), g("shield", { x: h.x - k, y: 0, z: h.z }, 1, { aggro: true })], label: "Recover the four data cores around the HQ" },
    ],
    tokens: [{ x: h.x, y: h.roof + 1.2, z: h.z - 40 }, tok(onRoof(roof(C, 1, 1), 0, 0)), tok(onRoof(roof(C, 4, 2), 0, 0))],
    heals: [{ x: h.x + k, y: 0.8, z: h.z + k - 6 }, { x: h.x - k, y: 0.8, z: h.z - k + 6 }],
  };
});

def({ id: 27, ...D5, name: "Prison Break", brief: "The Overlord's cells are full of people who stood up to him. Bring the walls down and get them out.", par: 260, xp: 660 }, (C) => {
  const s = C.streetN(4, 4);
  const r = roof(C, 4, 3, "low");
  return {
    spawn: { ...C.corner(5, 4), h: -Math.PI / 2 },
    steps: [
      { type: "defeat", group: [g("bruiser", s, 1, { aggro: true }), g("shield", at(s, 0, -6, 0), 2, { aggro: true }), g("gunner", at(s, 0, 6, -3), 2, { aggro: true })], label: "Defeat the prison guards" },
      { type: "rescue", civs: [{ at: at(s, 0, -3, 4) }, { at: at(s, 0, 3, 4) }, { at: onRoof(r, -3, 0) }, { at: onRoof(r, 3, 0) }], group: [g("assassin", onRoof(r, 0, 4), 1, { aggro: true })], time: 180, label: "Free the prisoners — the guards upstairs are waking up" },
    ],
    tokens: [tok(onRoof(roof(C, 5, 4, "low"), 0, 0)), tok(onRoof(roof(C, 3, 4, "low"), 0, 0)), tok(C.corner(4, 5), 1.2)],
    heals: [at(s, 0.8, 0, -5), at(onRoof(r, 0, -4), 0.8)],
  };
});

def({ id: 28, ...D5, name: "Drone Foundry", brief: "The Overlord's drone foundry is spitting out a new swarm. Ground it, then shut down the guidance beacons.", par: 250, xp: 680 }, (C) => {
  const c = C.corner(4, 2);
  const a = roof(C, 4, 1, "low");
  const b = roof(C, 5, 2, "low");
  return {
    spawn: { ...at(c, 0, 0, 12), h: Math.PI },
    steps: [
      { type: "drones", group: [g("drone", at(c, 0, -6, -6), 3, { aggro: true }), g("drone", at(c, 0, 6, 6), 3, { aggro: true })], label: "Ground the drone swarm" },
      { type: "disable", devices: [onRoof(a, 0, 0), onRoof(b, 0, 0)], group: [g("gunner", onRoof(a, 3, 3), 1), g("assassin", onRoof(b, -3, -3), 1)], label: "Shut down the guidance beacons (hold E)" },
    ],
    tokens: [tok(onRoof(roof(C, 5, 1), 0, 0)), tok(onRoof(roof(C, 4, 3, "low"), 0, 0)), tok(at(c, 0, 10, -10))],
    heals: [at(c, 0.8, -8, 8), at(onRoof(a, -3, -3), 0.8)],
  };
});

def({ id: 29, ...D5, name: "Last Stand", brief: "Your allies are planting an EMP that will cripple the Titan's armour. Everything the fortress has left is coming for it.", par: 280, xp: 720 }, (C) => {
  const d = C.corner(2, 5);
  const sp = (dx, dz) => at(d, 0, dx, dz);
  return {
    spawn: { ...at(d, 0, 0, -8), h: 0 },
    steps: [
      { type: "protect", at: d, hp: 170, target: "EMP device", waves: [[g("shield", sp(-16, 0), 2), g("thug", sp(16, 0), 2)], [g("drone", sp(0, -16), 3), g("gunner", sp(16, 0), 1)], [g("assassin", sp(-16, 0), 3)], [g("bruiser", sp(0, -16), 2), g("gunner", sp(16, 0), 1)]], label: "Defend the EMP device" },
    ],
    tokens: [tok(onRoof(roof(C, 1, 5, "low"), 0, 0)), tok(onRoof(roof(C, 2, 5, "low"), 0, 0)), tok(onRoof(roof(C, 1, 4, "low"), 0, 0))],
    heals: [at(d, 0.8, 6, 6), at(d, 0.8, -6, -6)],
  };
});

def({ id: 30, ...D5, boss: true, name: "Titan Overlord", brief: "The final fight. The Titan Overlord in his war-mech, three phases of armour and fury. End this — for the whole city.", par: 360, xp: 1500 }, (C) => {
  const q = C.blockCenter(2, 4);
  return {
    spawn: { ...C.corner(2, 4), h: Math.PI * 0.75 },
    arena: { ...q, r: 17 },
    steps: [
      { type: "defeat", group: [g("shield", at(q, 0, -8, -12), 2, { aggro: true }), g("gunner", at(q, 0, 8, -12), 2, { aggro: true })], label: "Break through the Overlord's honour guard" },
      { type: "boss", boss: "titan", arena: q, radius: 17, label: "Defeat the Titan Overlord" },
    ],
    tokens: [tok(onRoof(roof(C, 1, 4), 0, 0)), tok(onRoof(roof(C, 3, 4, "low"), 0, 0)), tok(onRoof(roof(C, 2, 5), 0, 0))],
    heals: [at(q, 0.8, -14, 0), at(q, 0.8, 14, 0), at(q, 0.8, 0, 14)],
  };
});

/* ----------------------------------------------------------------------- API */

export const MISSIONS = M;
export const MISSION_COUNT = 30;
export const PER_DISTRICT = 6;

/**
 * Snap a point to the nearest free spot on the SAME surface (roof gear,
 * water tanks, parked cars, props): spiral out until the floor height matches
 * and a body fits. Keeps authored intent, guarantees solid placement.
 */
const _fl = {};
const _hit = {};
function free(C, p, body = 0.75) {
  const G = C.geo;
  const fits = (x, z) => floorAt(G, x, z, p.y + 0.3, p.y - 0.3, _fl) && Math.abs(_fl.y - p.y) < 0.3 && !pushOut(G, { x, z }, body, _fl.y + 0.1, _fl.y + 1.8, 0.35, _hit);
  if (fits(p.x, p.z)) return { ...p, y: _fl.y };
  for (let r = 1; r <= 14; r += 0.75) {
    const n = Math.max(8, Math.round(r * 5));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (fits(x, z)) return { ...p, x, y: _fl.y, z };
    }
  }
  return p;
}
const snapStand = (C, p) => (p ? Object.assign(p, free(C, p)) : p);
const snapFloat = (C, p, up) => {
  if (!p) return p;
  const b = free(C, { ...p, y: p.y - up });
  return Object.assign(p, { x: b.x, y: b.y + up, z: b.z });
};
function snapSpec(C, s) {
  snapStand(C, s.spawn);
  for (const t of s.tokens || []) snapFloat(C, t, 1.2);
  for (const t of s.heals || []) snapFloat(C, t, 0.8);
  const groups = (gs) => {
    for (const gr of gs || []) gr.at = gr.kind === "drone" ? gr.at : free(C, gr.at, gr.n > 1 ? 0.75 + (gr.spread || 0) : 0.75);
  };
  for (const gs of Object.values(s.pre || {})) groups(gs);
  for (const st of s.steps) {
    groups(st.group);
    for (const c of st.civs || []) c.at = free(C, c.at);
    if (st.devices) st.devices = st.devices.map((d) => free(C, d, 0.9));
    if (st.items) st.items = st.items.map((it) => {
      const b = free(C, { ...it, y: it.y - 1.2 });
      return { x: b.x, y: b.y + 1.2, z: b.z };
    });
    if (st.type === "protect") {
      st.at = free(C, st.at, 1.6);
      for (const w of st.waves) groups(w);
    }
    if (st.type === "chase") st.path = st.path.map((q) => (q.hop !== undefined && q.y > 1 ? q : { ...free(C, q, 0.5), hop: q.hop }));
  }
  return s;
}

const cache = new Map();
export function missionMeta(id) {
  const m = M.find((x) => x.id === id);
  const district = Math.ceil(id / PER_DISTRICT);
  return m ? { ...m, built: true, districtId: district } : { id, name: "Coming soon", built: false, districtId: district, boss: false };
}
export function missionSpec(id) {
  const m = M.find((x) => x.id === id);
  if (!m) return null;
  if (!cache.has(id)) {
    const C = cityFor(m.district);
    const s = snapSpec(C, m.build(C));
    cache.set(id, { id, district: m.district, name: m.name, brief: m.brief, par: m.par, xp: m.xp, boss: !!m.boss, hpScale: m.hpScale || 1, dmgScale: m.dmgScale || 1, ...s });
  }
  return cache.get(id);
}
export const BUILT = () => M.map((m) => m.id).sort((a, b) => a - b);
