/**
 * A scripted survivor that plays the whole campaign through the same input
 * object the keyboard/mouse fill in (move axes, camera yaw, edge keys). Used
 * by tools/simTest.mjs headlessly and by the browser harness.
 *
 *   const bot = createBot(sim, { god })   // god = never dies (route check)
 *   while (!sim.won) sim.update(1/60, bot.step(1/60))
 */
import { LAYOUT } from "../sim.js";
import { SITES, LAKE, height, freshWaterAt } from "../terrain.js";
import { DINOS, canAfford, RECIPES } from "../data.js";

const TAU = Math.PI * 2;
const angTo = (p, t) => Math.atan2(t.x - p.x, t.z - p.z);

export function createBot(simRef, { god = false, log = null } = {}) {
  const sim = () => (typeof simRef === "function" ? simRef() : simRef);
  let plan = null; // generator of input frames
  let stuck = { t: 0, x: 0, z: 0, detour: 0, side: 1 };
  const S = SITES.station;
  const L = LAYOUT.lab;
  const say = (m) => log && log(`[t=${sim().time.toFixed(0)} M${sim().mission + 1}] ${m}`);

  /* ---------------- primitives (generators yielding input objects) */
  function* walk(tx, tz, r = 1.4, { sprint = false, maxT = 120 } = {}) {
    const t0 = sim().time;
    while (true) {
      const s = sim();
      const p = s.player;
      if (p.dead) return false;
      const d = Math.hypot(tx - p.x, tz - p.z);
      if (d < r) return true;
      if (s.time - t0 > maxT) {
        say(`walk timeout to ${tx.toFixed(0)},${tz.toFixed(0)} at ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
        return false;
      }
      // stuck detection → detour sideways for a bit
      stuck.t += 1 / 60;
      if (stuck.t > 0.9) {
        const moved = Math.hypot(p.x - stuck.x, p.z - stuck.z);
        if (moved < 1.2 && stuck.detour <= 0) {
          stuck.detour = 0.8 + Math.random() * 0.8;
          stuck.side = -stuck.side;
        }
        stuck.t = 0;
        stuck.x = p.x;
        stuck.z = p.z;
      }
      let yaw = angTo(p, { x: tx, z: tz });
      if (stuck.detour > 0) {
        stuck.detour -= 1 / 60;
        yaw += stuck.side * 1.35;
      }
      const fight = yield* maybeFight();
      if (fight) continue;
      const jump = stuck.detour > 0 && Math.random() < 0.02;
      yield { mz: 1, mx: 0, camYaw: yaw, sprint: sprint && p.stamina > 30, jump };
    }
  }
  /** Fight back (or flee into safety) when a predator is on us. */
  function* maybeFight() {
    const s = sim();
    const p = s.player;
    let threat = null;
    let td = Infinity;
    for (const d of s.dinos) {
      if (!d.alive || !DINOS[d.kind].predator) continue;
      if (!["chase", "attack", "recover", "alert"].includes(d.state)) continue;
      const dd = Math.hypot(d.x - p.x, d.z - p.z);
      if (dd < td) {
        td = dd;
        threat = d;
      }
    }
    if (!threat || td > 7) return false;
    if (!s.tools.spear && !s.tools.axe && threat.kind !== "herb") return false; // just keep running
    if (s.tools.spear && s.equipped !== "spear") {
      yield { equip: "spear", camYaw: angTo(p, threat) };
      return true;
    }
    if (!s.tools.spear && s.equipped !== "axe") {
      yield { equip: "axe", camYaw: angTo(p, threat) };
      return true;
    }
    if (p.hp < 40 && s.inv.bandage) {
      yield { heal: true, camYaw: angTo(p, threat) };
      return true;
    }
    // hold range: back off a touch when it is too close, then strike
    const reach = s.equipped === "spear" ? 3.0 : 2.0;
    const r = DINOS[threat.kind].radius;
    const mz = td - r < reach - 0.6 ? -0.6 : td - r > reach ? 0.5 : 0;
    yield { mz, mx: 0, camYaw: angTo(p, threat), attack: true };
    return true;
  }
  function* face(t, frames = 6) {
    for (let i = 0; i < frames; i++) yield { camYaw: angTo(sim().player, t) };
  }
  function* use(target, kindCheck, r = 1.3) {
    for (let attempt = 0; attempt < 4; attempt++) {
      yield* walk(target.x, target.z, r);
      yield* face(target);
      const f = sim().focus;
      if (f && kindCheck(f)) {
        yield { interact: true, camYaw: angTo(sim().player, target) };
        yield {};
        return true;
      }
      r *= 0.7;
    }
    say(`could not use target at ${target.x.toFixed(1)},${target.z.toFixed(1)} focus=${sim().focus?.kind}`);
    return false;
  }
  function* idle(sec) {
    const t0 = sim().time;
    while (sim().time - t0 < sec) {
      const f = yield* maybeFight();
      if (!f) yield {};
    }
  }
  function* upkeep() {
    const s = sim();
    const p = s.player;
    if (p.hunger < 45 && (s.inv.berries || s.inv.meat)) yield { eat: true };
    if (p.thirst < 45 && s.inv.water) yield { drink: true };
    if (p.hp < 50 && s.inv.bandage) yield { heal: true };
  }
  function* gather(kind, n) {
    // kind: "stick" | "stone" (pickups) — until the inventory has n of the item
    const item = kind === "stick" ? "wood" : "stone";
    let guard = 0;
    while (sim().inv[item] < n && guard++ < 40) {
      yield* upkeep();
      const s = sim();
      const p = s.player;
      // with an axe, chopping a nearby tree is faster for wood
      if (item === "wood" && s.tools.axe) {
        const tree = nearest(s.trees.filter((t) => t.alive && t.kind !== "big" && height(t.x, t.z) > 1), p);
        if (tree && Math.hypot(tree.x - p.x, tree.z - p.z) < 40) {
          yield* chop(tree);
          continue;
        }
      }
      const o = nearest(s.pickups.filter((q) => !q.taken && q.kind === kind), p);
      if (!o) return false;
      yield* use(o, (f) => f.kind === "pickup" && f.ref === o);
    }
    return sim().inv[item] >= n;
  }
  function* chop(tree) {
    yield* walk(tree.x, tree.z, 1.6);
    if (sim().equipped !== "axe" && sim().tools.axe) yield { equip: "axe" };
    for (let i = 0; i < 400 && tree.alive; i++) {
      const p = sim().player;
      const d = Math.hypot(tree.x - p.x, tree.z - p.z);
      if (d > 2.2) {
        yield* walk(tree.x, tree.z, 1.4, { maxT: 8 });
        continue;
      }
      if (p.stamina < 12) {
        yield* idle(2);
        continue;
      }
      yield { camYaw: angTo(p, tree), attack: true };
    }
  }
  const nearest = (list, p) => {
    let best = null;
    let bd = Infinity;
    for (const o of list) {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  };
  function* craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    const s = sim();
    if (!canAfford(s.inv, r.cost)) return false;
    // crafting happens in the inventory overlay: the UI calls sim.craft directly
    yield { craft: id };
    return true;
  }
  function* ensure(cost) {
    for (const [k, n] of Object.entries(cost)) {
      if (k === "wood") yield* gather("stick", n);
      if (k === "stone") {
        if (sim().tools.axe) {
          while (sim().inv.stone < n) {
            const b = nearest(sim().boulders.filter((q) => q.stone > 0), sim().player);
            const o = nearest(sim().pickups.filter((q) => !q.taken && q.kind === "stone"), sim().player);
            const p = sim().player;
            if (o && (!b || Math.hypot(o.x - p.x, o.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) + 10)) yield* use(o, (f) => f.ref === o);
            else if (b) {
              yield* walk(b.x, b.z, b.s * 0.95 + 1.6);
              if (sim().equipped !== "axe") yield { equip: "axe" };
              for (let i = 0; i < 90 && b.stone > 0 && sim().inv.stone < n; i++) yield { camYaw: angTo(sim().player, b), attack: true };
            } else break;
          }
        } else yield* gather("stone", n);
      }
    }
  }

  /* ---------------- the campaign */
  function* campaign() {
    const s0 = sim();
    // Mission 1
    say("explore wreck");
    yield* walk(LAYOUT.wreck.x - 6, LAYOUT.wreck.z - 6, 3);
    for (const c of s0.crates) yield* use(c, (f) => f.kind === "crate" && f.ref === c, 1.6);
    while (sim().mission === 0) {
      const b = nearest(sim().bushes.filter((q) => q.ripe), sim().player);
      yield* use(b, (f) => f.kind === "bush" && f.ref === b);
    }
    // Mission 2
    say("gather wood/stone, craft axe");
    yield* gather("stick", 6);
    yield* gather("stone", 4);
    yield* craft("axe");
    yield* idle(0.2);
    // Mission 3
    say("to the lake");
    yield* upkeep();
    const shore = { x: LAKE.x + 4, z: LAKE.z + LAKE.r + 1.5 };
    yield* walk(shore.x, shore.z, 2, { sprint: true });
    for (let i = 0; i < 900; i++) {
      // step down to the water's edge until "water" is focused
      const p = sim().player;
      const f = sim().focus;
      if (f && f.kind === "water") {
        yield { interact: true, camYaw: angTo(p, LAKE) };
        yield* idle(0.2);
      } else yield { mz: 0.6, camYaw: angTo(p, LAKE) };
      if (sim().mission !== 2) break;
      if (sim().done[2][1]) break;
    }
    // camp a little away from the water
    yield* ensure({ wood: 5, stone: 3 });
    yield* walk(LAKE.x + 10, LAKE.z + LAKE.r + 9, 2);
    for (let i = 0; i < 6 && !sim().campfires.length; i++) {
      yield* craft("campfire");
      if (!sim().campfires.length) yield* walk(sim().player.x + 4, sim().player.z + 3, 1);
    }
    // Mission 4
    say("spear + station");
    yield* ensure({ wood: 4, stone: 1 });
    yield* craft("spear");
    yield* upkeep();
    for (const [x, z] of [
      [-10, 20],
      [40, -5],
      [S.x - 36, S.z],
      [S.x - 22, S.z],
    ])
      yield* walk(x, z, 3, { sprint: true });
    // Mission 5
    say("circuit board");
    for (const [x, z] of [
      [L.x - L.hx - 2.5, L.z],
      [L.x - 2, L.z],
    ])
      yield* walk(x, z, 1.0);
    const circuit = sim().parts.find((p) => p.id === "circuit");
    yield* use({ x: LAYOUT.table.x - 1.3, z: circuit.z }, (f) => f.kind === "part" && f.ref === circuit, 0.6);
    if (!circuit.taken) {
      yield* face(circuit);
      if (sim().focus?.ref === circuit) yield { interact: true };
    }
    yield* walk(L.x - L.hx - 3, L.z, 1.2);
    say("battery in the cave");
    yield* upkeep();
    for (const [x, z] of [
      [S.x - 36, S.z],
      [-20, -40],
      [LAYOUT.cave.x, LAYOUT.cave.z + LAYOUT.cave.r + 6],
      [LAYOUT.cave.x, LAYOUT.cave.z],
    ])
      yield* walk(x, z, 2.5, { sprint: true, maxT: 200 });
    const battery = sim().parts.find((p) => p.id === "battery");
    yield* use(battery, (f) => f.ref === battery, 1.4);
    yield* walk(LAYOUT.cave.x, LAYOUT.cave.z + LAYOUT.cave.r + 5, 2);
    say("antenna at the crash");
    yield* upkeep();
    const antenna = sim().parts.find((p) => p.id === "antenna");
    yield* use(antenna, (f) => f.ref === antenna, 1.4);
    say("back to the radio");
    yield* upkeep();
    for (const [x, z] of [
      [S.x - 36, S.z],
      [S.x - 22, S.z],
    ])
      yield* walk(x, z, 3, { sprint: true, maxT: 200 });
    yield* use(LAYOUT.radio, (f) => f.kind === "radio", 1.2);
    say("hold out");
    while (!sim().flags.heliLanded) {
      yield* upkeep();
      yield* idle(1);
    }
    say("board");
    yield* use(LAYOUT.helipad, (f) => f.kind === "heli", 3);
    yield* idle(1);
  }

  plan = campaign();
  let doneFlag = false;
  return {
    step() {
      const s = sim();
      if (god) {
        s.player.hp = Math.max(s.player.hp, 60);
        s.player.hunger = Math.max(s.player.hunger, 30);
        s.player.thirst = Math.max(s.player.thirst, 30);
      }
      if (s.player.dead) {
        if (s.player.deadT > 1) s.respawn();
        return {};
      }
      if (doneFlag) return {};
      const r = plan.next();
      if (r.done) {
        doneFlag = true;
        return {};
      }
      const inp = r.value || {};
      if (inp.craft) {
        s.craft(inp.craft);
        return { camYaw: s.player.yaw };
      }
      return inp;
    },
    get done() {
      return doneFlag;
    },
  };
}
