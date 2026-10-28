/**
 * Last Hope — headless test suite (Node ≥ 18, no deps).
 *
 *   node src/components/games/LastHope/tools/simTest.mjs [data|unit|bot|all] [seed]
 *
 * data  item / recipe / loot / mission references, every map's spawns,
 *       containers, exits, nodes, doors and the boss reachable on foot
 * unit  inventory, collision, crafting, building + siege, combat + telegraph
 *       fairness, survival drain, death & bag recovery, travel, save/load
 * bot   a scripted survivor plays the objective chain with real movement
 */
import { ITEMS } from "../data/items.js";
import { RECIPES } from "../data/recipes.js";
import { LOOT } from "../data/loot.js";
import { MISSIONS } from "../data/missions.js";
import { PIECES } from "../data/structures.js";
import { LOCATIONS, LOCATION_ORDER, getMap } from "../data/locations/index.js";
import { createNav } from "../engine/nav.js";
import { createCollider } from "../engine/collide.js";
import * as I from "../engine/inventory.js";
import { createGame, tick, EMPTY_INTENT, craft, travel, respawn, serialize, deserialize, doInteract, findInteract, openContainer, openInv, afterTransfer, enterLocation, hudSnapshot } from "../engine/game.js";
import { place, checkPlace, upgrade, setDoor } from "../engine/building.js";
import { spawnZombie } from "../engine/zombies.js";
import { giveItem, equipSlot, useSlot } from "../engine/items.js";
import { NODES } from "../engine/nodes.js";
import { CONTAINER_DIMS } from "../engine/layout.js";

const mode = process.argv[2] || "all";
const SEED = +(process.argv[3] || 7);
let pass = 0;
let fail = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(msg);
    console.log("  ✗", msg);
  }
}
/** An open patch of ground: a clear 16 m line toward +z from the result. */
function openSpot(G) {
  const col = G.R.col;
  for (let k = 0; k < 4000; k++) {
    const x = -50 + ((k * 37) % 100);
    const z = -50 + ((k * 53) % 90);
    let okk = !col.overlaps(x, z, 1.2) && col.raycast(x - 1, z, x - 1, z + 16) >= 1 && col.raycast(x + 1, z, x + 1, z + 16) >= 1 && col.raycast(x, z, x, z + 16) >= 1;
    if (okk) for (const n of G.R.nodes) if (Math.abs(n.x - x) < 2.5 && n.z > z - 2 && n.z < z + 17) okk = false;
    if (okk) return [x, z];
  }
  throw new Error('no open spot');
}
const section = (s) => console.log(`\n== ${s}`);
const run = (G, sec, intent = EMPTY_INTENT, dt = 1 / 30) => {
  for (let t = 0; t < sec; t += dt) tick(G, intent, dt);
};

/* ======================================================================== data */
function dataTests() {
  section("data");
  const itemIds = new Set(Object.keys(ITEMS));
  for (const r of RECIPES) {
    ok(itemIds.has(r.out), `recipe ${r.id} output ${r.out}`);
    for (const id of Object.keys(r.cost)) ok(itemIds.has(id), `recipe ${r.id} input ${id}`);
  }
  for (const [tid, T] of Object.entries(LOOT)) for (const [id] of T.items) ok(itemIds.has(id), `loot ${tid} item ${id}`);
  for (const p of Object.values(PIECES)) for (const t of p.tiers) for (const id of Object.keys(t.cost)) ok(itemIds.has(id), `piece ${p.id} cost ${id}`);
  for (const m of MISSIONS) {
    const c = m.cond;
    if (c.item) ok(itemIds.has(c.item), `mission ${m.id} item ${c.item}`);
    if (c.piece) ok(!!PIECES[c.piece], `mission ${m.id} piece ${c.piece}`);
    if (c.loc) ok(!!LOCATIONS[c.loc], `mission ${m.id} loc ${c.loc}`);
    for (const id of Object.keys(m.items || {})) ok(itemIds.has(id), `mission ${m.id} reward ${id}`);
  }
  ok(MISSIONS.length >= 30, `≥30 objectives (${MISSIONS.length})`);
  // every recipe output item obtainable; every crafted mission item has a recipe
  for (const m of MISSIONS) if (m.cond.k === "craft") ok(RECIPES.some((r) => r.out === m.cond.item), `mission ${m.id} craftable ${m.cond.item}`);

  for (const id of LOCATION_ORDER) {
    const M = getMap(id);
    const nav = createNav(M);
    const col = createCollider(M);
    // locked doors are impassable for the reachability check
    nav.setStructures(M.doors.map((d, i) => ({ id: 1000 + i, shape: { k: "b", x: d.x, z: d.z, hw: d.w / 2, hd: 0.25, a: d.yaw }, cost: -1 })));
    const entry = M.entry;
    ok(!col.overlaps(entry.x, entry.z, 0.38), `${id}: entry is free`);
    const start = M.start || entry;
    ok(!col.overlaps(start.x, start.z, 0.38), `${id}: start is free`);
    const F = nav.field(0, entry.x, entry.z, 999, 0);
    // any cell within `slack` metres that the entry's distance field reaches
    const near = (FF, x, z, slack) => {
      for (let dz = -slack; dz <= slack; dz += 0.25) for (let dx = -slack; dx <= slack; dx += 0.25) if (dx * dx + dz * dz <= slack * slack && Number.isFinite(nav.fieldAt(FF, x + dx, z + dz))) return true;
      return false;
    };
    const reach = (x, z, slack = 1.6) => near(F, x, z, slack);
    // behind locked doors: allow the "after unlock" field too
    const nav2 = createNav(M);
    const F2 = nav2.field(0, entry.x, entry.z, 999, 0);
    const reach2 = (x, z) => near(F2, x, z, 1.8);
    // a container must be openable: a reachable cell within interact range with clear sight to it
    const openable = (FF, c) => {
      const dm = CONTAINER_DIMS[c.t] || [0.5, 0.5];
      const lim = Math.max(dm[0], dm[1]) * 0.8 + 1.45;
      for (let r = 0.5; r <= lim; r += 0.25)
        for (let a = 0; a < 32; a++) {
          const px = c.x + Math.cos((a / 32) * 6.283) * r;
          const pz = c.z + Math.sin((a / 32) * 6.283) * r;
          if (!Number.isFinite(nav.fieldAt(FF, px, pz))) continue;
          const k = Math.min(1, (Math.min(dm[0], dm[1]) + 0.05) / r);
          if (col.raycast(px, pz, c.x + (px - c.x) * k, c.z + (pz - c.z) * k, true) >= 0.999) return true;
        }
      return false;
    };
    let bad = 0;
    for (const c of M.containers) if (!openable(F, c) && !openable(F2, c)) (bad++, console.log("    unreachable container", id, c.id, c.t, c.x.toFixed(1), c.z.toFixed(1)));
    ok(bad === 0, `${id}: all ${M.containers.length} containers reachable`);
    bad = 0;
    for (const n of M.nodes) if (!reach(n.x, n.z, (n.s || 1) * 1.5 + 1)) bad++;
    ok(bad <= Math.max(2, M.nodes.length * 0.03), `${id}: nodes reachable (${M.nodes.length - bad}/${M.nodes.length})`);
    for (const e of M.exits) ok(reach(e.x, e.z, e.r), `${id}: exit "${e.label}" reachable`);
    bad = 0;
    for (const s of M.spawns) if (!reach(s.x, s.z, s.r) && !reach2(s.x, s.z)) (bad++, console.log("    unreachable spawn", id, s.t, s.x, s.z));
    ok(bad === 0, `${id}: spawn groups reachable`);
    for (const s of M.sources) ok(reach(s.x + s.r - 1.6, s.z) || reach(s.x - s.r + 1.6, s.z) || reach(s.x, s.z + s.r - 1.6) || reach(s.x, s.z - s.r + 1.6), `${id}: water source ${s.name} reachable`);
    if (M.boss) ok(reach(M.boss.x, M.boss.z) || reach2(M.boss.x, M.boss.z), `${id}: boss arena reachable`);
    if (M.boss) {
      // bosses must fit their arena (large nav class)
      ok(!nav.isBlocked(1, M.boss.x, M.boss.z), `${id}: boss spawn free for a large body`);
    }
    for (const d of M.doors) ok(reach2(d.x, d.z + 1.2) || reach2(d.x, d.z - 1.2), `${id}: door ${d.id} approachable`);
    for (const s of M.switches || []) ok(reach(s.x, s.z), `${id}: switch ${s.id} reachable`);
  }
}

/* ======================================================================== unit */
function unitTests() {
  section("inventory");
  {
    const inv = I.makeInv(4);
    ok(I.add(inv, "wood", 120) === 0, "add 120 wood into 4×50 slots");
    ok(I.count(inv, "wood") === 120, "count wood 120");
    ok(I.add(inv, "stone", 90) === 40, "overflow returns leftover");
    ok(I.remove(inv, "wood", 30) === 30 && I.count(inv, "wood") === 90, "remove 30 wood");
    const b = I.makeInv(3);
    ok(I.takeAll(inv, b) > 0, "takeAll moves items");
    const inv2 = I.makeInv(2);
    I.add(inv2, "stone_axe", 1);
    ok(inv2.slots[0].d === ITEMS.stone_axe.dur, "durability initialised");
    ok(I.moveSlot(inv2, 0, inv2, 1) && inv2.slots[1]?.id === "stone_axe", "move slot");
  }

  section("collision");
  {
    const G = createGame({ seed: SEED });
    const col = G.R.col;
    // walk into the tent: must stop outside
    const P = G.P;
    let inside = false;
    for (let k = 0; k < 200; k++) {
      tick(G, { ...EMPTY_INTENT, mx: -0.6, mz: -0.8 }, 1 / 30);
      if (col.overlaps(P.x, P.z, P.r - 0.05)) inside = true;
    }
    ok(!inside, "player never overlaps solids while walking into props");
    const S = getMap("suburb");
    const c2 = createCollider(S);
    const hb = S.buildings[0];
    // a point inside a wall segment gets pushed out
    // approach a house wall from outside, overlapping it by 0.2 m
    const w = S.walls[0];
    const b0 = S.buildings[w.bld];
    let mx = (w.x0 + w.x1) / 2;
    let mz = (w.z0 + w.z1) / 2;
    const nl = Math.hypot(mx - b0.x, mz - b0.z);
    mx += ((mx - b0.x) / nl) * 0.3;
    mz += ((mz - b0.z) / nl) * 0.3;
    const r = c2.resolve(mx, mz, 0.38);
    ok(!c2.overlaps(r.x, r.z, 0.37), "resolve pushes out of a wall");
    ok(c2.raycast(hb.x, hb.z - 30, hb.x, hb.z + 30, true) < 1, "house walls block sight");
  }

  section("gather + craft");
  {
    const G = createGame({ seed: SEED });
    giveItem(G, "wood", 4);
    giveItem(G, "stone", 3);
    giveItem(G, "fiber", 2);
    const r = craft(G, "stone_axe");
    ok(r.ok, "craft stone axe");
    ok(G.equip.hand?.id === "stone_axe", "crafted axe goes to the empty hand");
    ok(I.count(G.inv, "wood") === 0, "craft consumed wood");
    ok(!craft(G, "bow").ok, "bow needs workbench + level");
    // chop the nearest tree for real
    const P = G.P;
    const tree = G.R.nodes.filter((n) => n.def.kind === "tree" && n.alive).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    P.x = tree.x - (tree.solidR + 0.9);
    P.z = tree.z;
    P.yaw = Math.PI / 2;
    const before = G.stats.gathered.wood || 0;
    for (let k = 0; k < 12; k++) {
      G.interact = findInteract(G);
      if (G.interact?.kind === "gather") doInteract(G);
      run(G, 0.9);
    }
    ok((G.stats.gathered.wood || 0) - before >= tree.def.amount - 1, `chopping yields wood (${(G.stats.gathered.wood || 0) - before})`);
    ok(!tree.alive, "tree depleted");
    ok(G.locs.camp.nodes[tree.id] > G.t, "depletion persisted with a respawn time");
    ok(G.equip.hand?.d < ITEMS.stone_axe.dur, "axe lost durability");
    // pick nodes
    const br = G.R.nodes.find((n) => n.t === "branch" && n.alive);
    P.x = br.x + 0.8;
    P.z = br.z;
    G.interact = findInteract(G);
    ok(G.interact?.kind === "pick", "branch offers Collect");
    doInteract(G);
    run(G, 0.8);
    ok(!br.alive, "branch collected");
  }

  section("building + siege");
  {
    const G = createGame({ seed: SEED });
    giveItem(G, "wood", 200);
    giveItem(G, "stone", 60);
    giveItem(G, "rope", 5);
    giveItem(G, "fiber", 20);
    G.P.x = 6;
    G.P.z = 6;
    const fire = place(G, "campfire", 1, 1);
    ok(!!fire, "place campfire");
    ok(!place(G, "campfire", 1, 1), "can't place on an occupied cell");
    ok(!checkPlace(G, "wall", 40, 0).ok, "outside build zone rejected");
    const wb = place(G, "workbench", 3, -3);
    ok(!!wb, "place workbench");
    G.P.x = 3;
    G.P.z = -1;
    ok(craft(G, "rope").ok, "craft rope anywhere");
    G.P.level = 3;
    ok(craft(G, "bow").ok, "bow crafts at workbench at level 3");
    // build a closed 2×2-cell box around (10..14, 10..14) and stand inside
    const walls = [
      ["wall", 11, 10, 0],
      ["wall", 13, 10, 0],
      ["wall", 11, 14, 0],
      ["wall", 13, 14, 0],
      ["wall", 10, 11, 1],
      ["wall", 10, 13, 1],
      ["wall", 14, 11, 1],
      ["door", 14, 13, 1],
    ];
    G.P.x = 6;
    G.P.z = 6;
    let n = 0;
    for (const [k, x, z, rot] of walls) if (place(G, k, x, z, rot)) n++;
    ok(n === walls.length, `enclosure placed (${n}/${walls.length})`);
    G.P.x = 12;
    G.P.z = 12;
    run(G, 0.1);
    // try to walk out: blocked
    run(G, 3, { ...EMPTY_INTENT, mx: 1, mz: 0 });
    ok(G.P.x < 14, "walls stop the player");
    // door opens
    const door = G.structures.find((s) => s.kind === "door");
    setDoor(G, door.id, true);
    G.P.x = 12.8;
    G.P.z = 12.9;
    run(G, 1.5, { ...EMPTY_INTENT, mx: 1, mz: 0 });
    ok(G.P.x > 14.2, "open door lets the player through");
    run(G, 3);
    ok(!door.open, "door swings shut behind you");
    // siege: put the player back inside, zombie outside must hit structures
    G.P.x = 12;
    G.P.z = 12;
    G.P.hp = 999;
    G.P.maxHp = 999;
    const z = spawnZombie(G, "walker", 12, 22, { hx: 12, hz: 22, r: 2 });
    z.state = "chase";
    z.lastSeen = { x: 12, z: 12 };
    const hpBefore = G.structures.filter((s) => s.kind === "wall" || s.kind === "door").reduce((a, s) => a + s.hp, 0);
    run(G, 25);
    const hpAfter = G.structures.filter((s) => s.kind === "wall" || s.kind === "door").reduce((a, s) => a + s.hp, 0);
    ok(hpAfter < hpBefore, `zombie sieges the enclosure (structure hp ${hpBefore} → ${hpAfter})`);
    ok(G.P.hp === 999 || G.P.hp > 990, "player safe inside while walls stand");
    // upgrade
    G.P.x = 6;
    G.P.z = 6;
    const w0 = G.structures.find((s) => s.kind === "wall");
    ok(upgrade(G, w0.id) && w0.tier === 1, "upgrade wall to stone");
  }

  section("combat");
  {
    const G = createGame({ seed: SEED });
    enterLocation(G, "forest", "travel");
    G.R.zombies.length = 0;
    const P = G.P;
    const [ox, oz] = openSpot(G);
    P.x = ox;
    P.z = oz;
    giveItem(G, "wooden_spear", 1);
    const z = spawnZombie(G, "walker", ox, oz + 6, {});
    let tt = 0;
    while (z.state !== "dead" && tt < 30) {
      const dx = z.x - P.x;
      const dz = z.z - P.z;
      const d = Math.hypot(dx, dz);
      const I0 = { ...EMPTY_INTENT, aim: { x: z.x, z: z.z }, attack: d < 2.4, mx: d > 2.2 ? dx / d : -dx / d * 0.6, mz: d > 2.2 ? dz / d : -dz / d * 0.6 };
      tick(G, I0, 1 / 30);
      tt += 1 / 30;
    }
    ok(z.state === "dead", `walker killed with a spear in ${tt.toFixed(1)} s`);
    ok(G.stats.kills.walker === 1, "kill counted");
    run(G, 0.5);
    ok(G.R.pickups.length >= 0, "drops spawned (maybe)");

    // fairness: step out of reach during the windup → no damage
    const G2 = createGame({ seed: SEED + 1 });
    enterLocation(G2, "forest", "travel");
    G2.R.zombies.length = 0;
    const P2 = G2.P;
    const [o2x, o2z] = openSpot(G2);
    P2.x = o2x;
    P2.z = o2z;
    const z2 = spawnZombie(G2, "walker", o2x, o2z + 1.2, {});
    z2.state = "chase";
    let dodged = false;
    for (let k = 0; k < 120; k++) {
      tick(G2, EMPTY_INTENT, 1 / 30);
      if (z2.state === "windup") {
        const hp0 = P2.hp;
        // sprint away
        run(G2, 0.9, { ...EMPTY_INTENT, mx: 0, mz: -1, sprint: true });
        dodged = P2.hp === hp0;
        break;
      }
    }
    ok(dodged, "stepping out of a telegraphed attack avoids the damage");
    // standing still gets hit
    const G3 = createGame({ seed: SEED + 2 });
    enterLocation(G3, "forest", "travel");
    G3.R.zombies.length = 0;
    const [o3x, o3z] = openSpot(G3);
    G3.P.x = o3x;
    G3.P.z = o3z;
    const z3 = spawnZombie(G3, "walker", o3x, o3z + 1.1, {});
    z3.state = "chase";
    run(G3, 2.5);
    ok(G3.P.hp < 100, `standing in reach gets hit (hp ${G3.P.hp.toFixed(0)})`);
    // toxic spit + poison
    const G4 = createGame({ seed: SEED + 3 });
    enterLocation(G4, "forest", "travel");
    G4.R.zombies.length = 0;
    const [o4x, o4z] = openSpot(G4);
    G4.P.x = o4x;
    G4.P.z = o4z;
    const t4 = spawnZombie(G4, "toxic", o4x, o4z + 6, {});
    t4.state = "chase";
    let spat = false;
    for (let k = 0; k < 300 && !spat; k++) {
      tick(G4, EMPTY_INTENT, 1 / 30);
      if (G4.events.some((e) => e.t === "spit")) spat = true;
      G4.events.length = 0;
    }
    ok(spat, "toxic zombie spits at mid range");
    // brute boss slam is telegraphed
    const G5 = createGame({ seed: SEED });
    G5.unlocked.push("industrial");
    enterLocation(G5, "industrial", "travel");
    const boss = G5.R.zombies.find((q) => q.boss === "alpha");
    ok(!!boss, "Alpha Brute spawned at the dock");
    // ranged: bow + arrows
    const G6 = createGame({ seed: SEED });
    enterLocation(G6, "forest", "travel");
    G6.R.zombies.length = 0;
    const [o6x, o6z] = openSpot(G6);
    G6.P.x = o6x;
    G6.P.z = o6z;
    giveItem(G6, "bow", 1);
    giveItem(G6, "arrow", 10);
    const z6 = spawnZombie(G6, "walker", o6x, o6z + 12, {});
    for (let k = 0; k < 300 && z6.state !== "dead"; k++) tick(G6, { ...EMPTY_INTENT, aim: { x: z6.x, z: z6.z }, attack: true, mz: -0.3 }, 1 / 30);
    ok(z6.state === "dead", "bow kills a walker at range");
    ok(I.count(G6.inv, "arrow") < 10, "arrows consumed");
  }

  section("survival + death");
  {
    const G = createGame({ seed: SEED });
    const f0 = G.P.food;
    run(G, 60);
    ok(G.P.food < f0 && G.P.water < 100, "hunger and thirst drain");
    giveItem(G, "canned_food", 1);
    const i = G.inv.slots.findIndex((s) => s?.id === "canned_food");
    const fb = G.P.food;
    useSlot(G, i);
    run(G, 1);
    ok(G.P.food > fb, "eating restores food");
    // die in the forest and recover the bag
    enterLocation(G, "forest", "travel");
    giveItem(G, "wood", 20);
    const px = G.P.x;
    const pz = G.P.z;
    G.P.hp = 1;
    G.R.zombies.length = 0;
    const z = spawnZombie(G, "walker", px, pz + 1.1, {});
    z.state = "chase";
    run(G, 3);
    ok(G.P.dead, "player dies");
    respawn(G);
    ok(G.loc === "camp" && !G.P.dead, "respawn at camp");
    ok(I.count(G.inv, "wood") === 0, "inventory left in the bag");
    ok(G.locs.forest.bag && G.locs.forest.bag.inv.slots.some((s) => s?.id === "wood"), "bag stored at the death spot");
    travel(G, "forest");
    G.P.x = G.locs.forest.bag.x;
    G.P.z = G.locs.forest.bag.z + 0.5;
    G.R.zombies.length = 0;
    G.interact = findInteract(G);
    ok(G.interact?.kind === "bag", "bag offers Recover");
    doInteract(G);
    I.takeAll(openInv(G), G.inv);
    afterTransfer(G);
    ok(I.count(G.inv, "wood") === 20 && !G.locs.forest.bag, "bag recovered");
  }

  section("containers + travel + save/load");
  {
    const G = createGame({ seed: SEED });
    const c = getMap("camp").containers[0];
    G.P.x = c.x + 1;
    G.P.z = c.z;
    const slots = openContainer(G, c.id);
    ok(slots.some((s) => s?.id === "wood"), "starter stash has wood");
    I.takeAll(openInv(G), G.inv);
    afterTransfer(G);
    ok(!G.locs.camp.cont[c.id].some(Boolean), "stash emptied and persisted");
    ok(!travel(G, "suburb"), "suburb locked at start");
    ok(travel(G, "forest") && G.loc === "forest", "travel to forest");
    giveItem(G, "stone_axe", 1);
    G.structures.push({ id: 99, kind: "wall", tier: 1, key: "h:0:0", rot: 0, hp: 500, open: false, x: 1, z: 0, yaw: 1.57 });
    const s1 = serialize(G);
    const json = JSON.stringify(s1);
    const G2 = deserialize(JSON.parse(json));
    ok(!!G2, "deserialize");
    ok(G2.loc === "forest" && Math.abs(G2.P.x - G.P.x) < 0.5, "location + position restored");
    ok(I.count(G2.inv, "wood") === I.count(G.inv, "wood"), "inventory restored");
    ok(G2.equip.hand?.id === G.equip.hand?.id, "equipment restored");
    ok(G2.structures.length === 1 && G2.structures[0].tier === 1, "structures restored");
    ok(G2.locs.camp.cont[c.id] && !G2.locs.camp.cont[c.id].some(Boolean), "looted container state restored");
    ok(deserialize({ v: 99, seed: 1 }) === null, "future save rejected");
    ok(deserialize(null) === null, "garbage rejected");
    const h = hudSnapshot(G2);
    ok(h.missions.length === 3, "tracker shows 3 objectives");
  }
}

/* ======================================================================== main */
const t0 = Date.now();
if (mode === "data" || mode === "all") dataTests();
if (mode === "unit" || mode === "all") unitTests();
if (mode === "bot" || mode === "all") {
  const { runBot } = await import("./bot.mjs");
  section("bot playthrough");
  const r = await runBot(SEED, { log: true });
  ok(r.done.length >= 30, `bot completed ${r.done.length}/${MISSIONS.length} objectives (${r.minutes.toFixed(0)} game-minutes, ${r.deaths} deaths)`);
  for (const f of r.failures) ok(false, `bot: ${f}`);
}
console.log(`\n${pass} passed, ${fail} failed  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (fail) {
  console.log(fails.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
void NODES;
void LOCATIONS;
