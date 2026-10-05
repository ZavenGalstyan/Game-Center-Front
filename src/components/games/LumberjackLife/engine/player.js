/**
 * Lumberjack Life — the lumberjack: movement, tools and interactions.
 *
 * TOOLS
 *  Axe       READY → SWINGING (wind-up) → IMPACT (one frame) → RECOVERY → READY
 *            The target is locked when the swing starts and re-validated at
 *            the impact frame (range, facing, line of sight, tree state).
 *            Damage is applied at most ONCE per swing (`hitDone` latch). A
 *            swing at nothing (or out of range) is a miss: whoosh, no damage.
 *  Chainsaw  OFF → STARTING → IDLE ⇄ CUTTING → STOPPING → OFF
 *            Damage is continuous while held AND a valid target is in reach.
 *
 * INTERACTIONS
 *  `resolveInteraction` is the single source of truth for what E does right
 *  now; the HUD prompt calls the same function, so the prompt can never lie.
 *  Timed actions (pick up, drop, deposit, load, take) change log ownership at
 *  their "grab/release" frame and re-validate first.
 */
import { PLAYER, SWING, CHAINSAW, ACTIONS, CUT_HEIGHT } from "./constants.js";
import { clamp, wrap, yawTo, turnToward, angleDiff, segHitsCircle, pointSegDist } from "./math.js";
import { TS, isChoppable, blocksAsTrunk, trunkCollider, damageTree, damageCut, trunkPoint, radiusAt } from "./trees.js";
import { setOwner, wakeLogs, restOnGround } from "./logs.js";
import { millAccept, deckFree, MILL_LAYOUT, millToWorld } from "./mill.js";
import { bedCenter, bedFull, doorPoint, bedNearIntake, CART } from "./vehicles.js";
import { speciesById } from "../data/species.js";
import { PLAY_RADIUS } from "../data/regions.js";

export function createPlayer(x, z, yaw) {
  return {
    x,
    z,
    y: 0,
    yaw,
    vx: 0,
    vz: 0,
    speed: 0,
    sprinting: false,
    phase: 0,
    stepSide: 0,
    carry: null,
    pulling: false,
    driving: null,
    act: null,
    swing: null, // { t, dur, target, style, hitDone, whooshed, result }
    saw: { state: "OFF", t: 0, cutting: null, biteT: 0 },
    lastHit: null,
  };
}

/* ------------------------------------------------------------ targeting */
const tierOk = (tool, speciesId) => tool.tier >= speciesById(speciesId).minTier;

function losClear(world, P, target) {
  for (const o of world.trees) {
    if (o === target || !blocksAsTrunk(o)) continue;
    if (segHitsCircle(P.x, P.z, target.x, target.z, o.x, o.z, trunkCollider(o) * 0.9)) return false;
  }
  return true;
}

/**
 * What the tool is pointed at. `loose` widens the search for the HUD hint.
 * Returns { kind: 'tree'|'cut', tree, k, surface, ang, valid, reason }
 */
export function primaryTarget(world, loose = false) {
  const P = world.player;
  const tool = world.tool;
  if (P.carry || P.driving || P.pulling) return null;
  const reach = tool.kind === "chainsaw" ? tool.bar + CHAINSAW.reachExtra : tool.reach;
  const look = loose ? 2.6 : reach + 0.4;
  let best = null;
  let bestScore = Infinity;
  for (const t of world.trees) {
    if (t.state !== TS.STANDING && t.state !== TS.BEING_CUT) continue;
    const d = Math.hypot(t.x - P.x, t.z - P.z);
    const surface = d - t.radius;
    if (surface > look) continue;
    const ang = Math.abs(angleDiff(P.yaw, yawTo(P.x, P.z, t.x, t.z)));
    if (ang > (loose ? 1.25 : 1.0)) continue;
    const score = surface + ang * 1.2;
    if (score < bestScore) {
      bestScore = score;
      best = { kind: "tree", tree: t, k: -1, surface, ang };
    }
  }
  for (const t of world.trees) {
    if (t.state !== TS.FALLEN) continue;
    for (const c of t.cuts) {
      if (c.done) continue;
      const p = trunkPoint(t, c.s);
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d > (loose ? 2.6 : reach + 0.55)) continue;
      const ang = Math.abs(angleDiff(P.yaw, yawTo(P.x, P.z, p.x, p.z)));
      if (ang > (loose ? 1.3 : 1.05)) continue;
      const score = d + ang * 1.2 - 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = { kind: "cut", tree: t, k: c.k - 1, surface: d - radiusAt(t, c.s), ang, px: p.x, pz: p.z };
      }
    }
  }
  if (!best) return null;
  best.reason = null;
  if (best.kind === "tree" && best.tree.grow < 1) best.reason = "Young tree — still growing";
  else if (best.kind === "tree" && !tierOk(tool, best.tree.species)) best.reason = `Needs a stronger tool (tier ${speciesById(best.tree.species).minTier})`;
  best.inReach = best.kind === "tree" ? best.surface <= reach && best.surface >= SWING.minSurface - 0.1 : best.surface <= reach + 0.2;
  best.valid = !best.reason && best.inReach && best.ang <= SWING.facing && (best.kind === "cut" || losClear(world, P, best.tree));
  return best;
}

/** re-validate a locked target at the impact frame */
function stillValid(world, tg) {
  const P = world.player;
  const tool = world.tool;
  const t = tg.tree;
  const reach = tool.kind === "chainsaw" ? tool.bar + CHAINSAW.reachExtra : tool.reach;
  if (tg.kind === "tree") {
    if (!isChoppable(t) || !tierOk(tool, t.species)) return false;
    const surface = Math.hypot(t.x - P.x, t.z - P.z) - t.radius;
    if (surface > reach || surface < SWING.minSurface - 0.15) return false;
    if (Math.abs(angleDiff(P.yaw, yawTo(P.x, P.z, t.x, t.z))) > SWING.facing) return false;
    return losClear(world, P, t);
  }
  if (t.state !== TS.FALLEN) return false;
  const c = t.cuts[tg.k];
  if (!c || c.done) return false;
  const p = trunkPoint(t, c.s);
  const d = Math.hypot(p.x - P.x, p.z - P.z);
  if (d > reach + 0.25) return false;
  return Math.abs(angleDiff(P.yaw, yawTo(P.x, P.z, p.x, p.z))) <= SWING.facing + 0.15;
}

/** the impact point on the wood (for particles / cut marks / sound position) */
export function impactPoint(world, tg) {
  const P = world.player;
  const t = tg.tree;
  if (tg.kind === "tree") {
    const yaw = yawTo(t.x, t.z, P.x, P.z);
    return { x: t.x + Math.sin(yaw) * t.radius, y: t.y + CUT_HEIGHT, z: t.z + Math.cos(yaw) * t.radius, nx: Math.sin(yaw), nz: Math.cos(yaw) };
  }
  const c = t.cuts[tg.k];
  const p = trunkPoint(t, c.s);
  const r = radiusAt(t, c.s);
  return { x: p.x, y: p.y + r, z: p.z, nx: 0, nz: 0 };
}

/** the spot the swing wind-up steps the player toward */
function assistGoal(world, tg) {
  const P = world.player;
  const t = tg.tree;
  if (tg.kind === "tree") {
    const ideal = t.radius + (world.tool.kind === "chainsaw" ? CHAINSAW.ideal : SWING.ideal);
    const yaw = yawTo(t.x, t.z, P.x, P.z);
    return { x: t.x + Math.sin(yaw) * ideal, z: t.z + Math.cos(yaw) * ideal, fx: t.x, fz: t.z };
  }
  const c = t.cuts[tg.k];
  const p = trunkPoint(t, c.s);
  const L = t.lie;
  // stand beside the trunk (perpendicular), on the side the player is already on
  let px = -L.dz;
  let pz = L.dx;
  const pl = Math.hypot(px, pz) || 1;
  px /= pl;
  pz /= pl;
  if ((P.x - p.x) * px + (P.z - p.z) * pz < 0) {
    px = -px;
    pz = -pz;
  }
  const ideal = SWING.idealDown + radiusAt(t, c.s) * 0.4;
  return { x: p.x + px * ideal, z: p.z + pz * ideal, fx: p.x, fz: p.z };
}

function applyAssist(world, goal, dt, speed) {
  const P = world.player;
  P.yaw = turnToward(P.yaw, yawTo(P.x, P.z, goal.fx, goal.fz), 9 * dt);
  const dx = goal.x - P.x;
  const dz = goal.z - P.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.02) {
    const step = Math.min(d, speed * dt);
    const nx = P.x + (dx / d) * step;
    const nz = P.z + (dz / d) * step;
    const r = world.pushCircle(nx, nz, PLAYER.radius, { logs: true, fallen: true });
    P.x = r.x;
    P.z = r.z;
  }
}

/* ------------------------------------------------------------ axe */
function stepAxe(world, inp, dt) {
  const P = world.player;
  const tool = world.tool;
  if (!P.swing) {
    if (inp.primaryPressed && !P.act && !P.carry && !P.pulling) {
      const tg = primaryTarget(world);
      const lock = tg && tg.valid ? tg : tg && !tg.reason && tg.surface <= tool.reach + 0.38 && tg.ang <= 1.0 && (tg.kind === "cut" || losClear(world, P, tg.tree)) ? tg : null;
      P.swing = {
        t: 0,
        dur: tool.swing,
        target: lock,
        style: lock && lock.kind === "cut" ? "down" : "side",
        hitDone: false,
        whooshed: false,
        result: null,
      };
      if (tg && tg.reason && !lock) world.emit({ type: "toast", text: tg.reason, tone: "warn" });
      world.stats.axeSwings++;
      world.stats.toolUse[tool.id] = (world.stats.toolUse[tool.id] || 0) + 1;
    }
    return;
  }
  const S = P.swing;
  const prevT = S.t;
  S.t += dt;
  const impactT = S.dur * SWING.impactAt;
  if (S.target && S.t < impactT) applyAssist(world, assistGoal(world, S.target), dt, SWING.assistSpeed);
  if (!S.whooshed && S.t >= S.dur * SWING.whooshAt) {
    S.whooshed = true;
    world.emit({ type: "swing", style: S.style, tool: tool.id });
  }
  if (!S.hitDone && prevT < impactT && S.t >= impactT) {
    S.hitDone = true; // one damage event per swing, hit or miss
    if (S.target && stillValid(world, S.target)) {
      const tg = S.target;
      const ip = impactPoint(world, tg);
      let dealt = 0;
      if (tg.kind === "tree") dealt = damageTree(world, tg.tree, tool.damage, P.x, P.z);
      else dealt = damageCut(world, tg.tree, tg.k, tool.damage * 1.15);
      if (dealt > 0) {
        S.result = "hit";
        P.lastHit = { t: world.time, ...ip };
        world.emit({ type: "hit", kind: tg.kind, treeId: tg.tree.id, species: tg.tree.species, ...ip, felled: tg.tree.state === TS.FALLING });
      } else {
        S.result = "miss";
        world.emit({ type: "miss" });
      }
    } else {
      S.result = "miss";
      world.emit({ type: "miss" });
    }
  }
  if (S.t >= S.dur) P.swing = null;
}

/* ------------------------------------------------------------ chainsaw */
function stepChainsaw(world, inp, dt) {
  const P = world.player;
  const tool = world.tool;
  const saw = P.saw;
  const held = inp.primaryHeld && !P.act && !P.carry && !P.pulling;
  saw.t += dt;
  if (saw.state === "OFF") {
    if (held || inp.primaryPressed) {
      saw.state = "STARTING";
      saw.t = 0;
      world.emit({ type: "saw", state: "STARTING" });
    }
    return;
  }
  if (saw.state === "STARTING") {
    if (saw.t >= CHAINSAW.startTime) {
      saw.state = "IDLE";
      saw.t = 0;
      world.emit({ type: "saw", state: "IDLE" });
    }
    return;
  }
  if (saw.state === "STOPPING") {
    if (saw.t >= CHAINSAW.stopTime) {
      saw.state = "OFF";
      saw.t = 0;
      world.emit({ type: "saw", state: "OFF" });
    }
    return;
  }
  // IDLE / CUTTING
  let tg = null;
  if (held) {
    tg = primaryTarget(world);
    if (tg && !tg.valid) {
      // close the last few centimetres for the operator
      if (!tg.reason && tg.surface <= tool.bar + CHAINSAW.reachExtra + 0.4 && tg.ang < 1.0) applyAssist(world, assistGoal(world, tg), dt, 1.4);
      tg = null;
    }
  }
  if (tg) {
    if (saw.state !== "CUTTING") {
      saw.state = "CUTTING";
      saw.t = 0;
      world.emit({ type: "saw", state: "CUTTING" });
    }
    applyAssist(world, assistGoal(world, tg), dt, 1.2);
    saw.cutting = { kind: tg.kind, treeId: tg.tree.id, k: tg.k };
    const dmg = tool.dps * dt;
    if (tg.kind === "tree") damageTree(world, tg.tree, dmg, P.x, P.z);
    else damageCut(world, tg.tree, tg.k, dmg * 1.15);
    world.stats.chainsawTime += dt;
    world.stats.toolUse[tool.id] = (world.stats.toolUse[tool.id] || 0) + dt;
    saw.biteT -= dt;
    if (saw.biteT <= 0) {
      saw.biteT = 0.09;
      const ip = impactPoint(world, tg);
      P.lastHit = { t: world.time, ...ip };
      world.emit({ type: "sawBite", ...ip, species: tg.tree.species, kind: tg.kind });
    }
  } else if (saw.state === "CUTTING") {
    saw.state = "IDLE";
    saw.t = 0;
    saw.cutting = null;
    world.emit({ type: "saw", state: "IDLE" });
  }
}

export function stopChainsaw(world, instant = false) {
  const saw = world.player.saw;
  if (saw.state === "OFF") return;
  saw.cutting = null;
  if (instant) {
    saw.state = "OFF";
    saw.t = 0;
  } else if (saw.state !== "STOPPING") {
    saw.state = "STOPPING";
    saw.t = 0;
  }
  world.emit({ type: "saw", state: instant ? "OFF" : "STOPPING" });
}

/* ------------------------------------------------------------ interactions */
const nearPt = (P, x, z, r) => Math.hypot(P.x - x, P.z - z) <= r;

function nearestWorldLog(world, maxD) {
  const P = world.player;
  let best = null;
  let bd = maxD;
  for (const l of world.logs.values()) {
    if (l.owner !== "WORLD") continue;
    const ax = l.x - Math.sin(l.yaw) * l.len * 0.5;
    const az = l.z - Math.cos(l.yaw) * l.len * 0.5;
    const bx = l.x + Math.sin(l.yaw) * l.len * 0.5;
    const bz = l.z + Math.cos(l.yaw) * l.len * 0.5;
    const ps = pointSegDist(P.x, P.z, ax, az, bx, bz);
    const ang = Math.abs(angleDiff(P.yaw, yawTo(P.x, P.z, ps.cx, ps.cz)));
    const d = ps.d - l.r + ang * 0.35;
    if (d < bd) {
      bd = d;
      best = l;
    }
  }
  return best;
}

function nearBed(world, maxD) {
  const P = world.player;
  const list = [];
  if (world.cart) list.push(world.cart);
  for (const v of world.vehicles) list.push(v);
  let best = null;
  let bd = maxD;
  for (const v of list) {
    const b = bedCenter(v);
    const half = v.kind === "cart" ? 0.9 : v.kind === "truck" ? 3.0 : 1.9;
    const ax = b.x - Math.sin(b.yaw) * half;
    const az = b.z - Math.cos(b.yaw) * half;
    const bx = b.x + Math.sin(b.yaw) * half;
    const bz = b.z + Math.cos(b.yaw) * half;
    const d = pointSegDist(P.x, P.z, ax, az, bx, bz).d - (v.kind === "cart" ? 0.5 : 0.95);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

function dropSpot(world) {
  const P = world.player;
  const log = world.logs.get(P.carry);
  if (!log) return null;
  const yaw = wrap(P.yaw + Math.PI / 2);
  const tries = [[1.05, 0], [1.3, 0.35], [1.3, -0.35], [0.9, 0.7], [0.9, -0.7], [1.6, 0]];
  for (const [d, a] of tries) {
    const x = P.x + Math.sin(P.yaw + a) * d;
    const z = P.z + Math.cos(P.yaw + a) * d;
    if (world.logFits(x, z, wrap(yaw + a), log.len, log.r, log.id)) return { x, z, yaw: wrap(yaw + a) };
  }
  return null;
}

/**
 * What E would do right now → { kind, label, sub?, ok, ... }.
 * `ok:false` entries are shown greyed with their reason.
 */
export function resolveInteraction(world) {
  const P = world.player;
  if (P.driving) {
    const v = world.vehicles.find((x) => x.id === P.driving);
    if (v && v.logs.length && bedNearIntake(v)) return { kind: "unload", source: v, label: "Unload logs onto the intake", ok: deckFree(world.mill) > 0, sub: deckFree(world.mill) > 0 ? null : "Intake deck is full" };
    return null;
  }
  if (P.act || P.swing) return null;
  const intake = millToWorld(MILL_LAYOUT.intake.x, MILL_LAYOUT.intake.z);
  const atIntake = nearPt(P, intake.x, intake.z, 2.6);
  const board = millToWorld(MILL_LAYOUT.board.x, MILL_LAYOUT.board.z);
  const buyer = millToWorld(MILL_LAYOUT.buyer.x, MILL_LAYOUT.buyer.z);

  if (P.carry) {
    if (atIntake) return deckFree(world.mill) > 0 ? { kind: "deposit", label: "Place log on the intake" , ok: true } : { kind: "deposit", label: "Place log on the intake", ok: false, sub: "Intake deck is full" };
    const bed = nearBed(world, 1.0);
    if (bed) return bedFull(bed) ? { kind: "load", bed, label: `Load onto ${bed.kind === "cart" ? "cart" : bed.def.name}`, ok: false, sub: "Full" } : { kind: "load", bed, label: `Load onto ${bed.kind === "cart" ? "the cart" : bed.def.name}`, sub: `${bed.logs.length}/${bed.cap}`, ok: true };
    const spot = dropSpot(world);
    return spot ? { kind: "drop", spot, label: "Drop log", ok: true } : { kind: "drop", label: "Drop log", ok: false, sub: "No room here" };
  }
  if (P.pulling) {
    const c = world.cart;
    if (c && c.logs.length && atIntake && bedNearIntake(c)) return { kind: "unload", source: c, label: "Unload the cart onto the intake", ok: deckFree(world.mill) > 0, sub: deckFree(world.mill) > 0 ? null : "Intake deck is full" };
    return { kind: "release", label: "Let go of the cart", ok: true };
  }
  const log = nearestWorldLog(world, 1.25);
  if (log) return { kind: "pickup", log, label: `Pick up ${speciesById(log.species).name} log`, ok: true };
  if (nearPt(P, board.x, board.z, 2.4)) return { kind: "board", label: world.orderPrompt?.label || "Order board", sub: world.orderPrompt?.sub || null, ok: world.orderPrompt ? world.orderPrompt.ok : false };
  if (nearPt(P, buyer.x, buyer.z, 2.6)) return { kind: "sell", label: world.sellPrompt?.label || "Sell timber", sub: world.sellPrompt?.sub || null, ok: world.sellPrompt ? world.sellPrompt.ok : false };
  // unload a nearby bed straight onto the deck
  if (atIntake) {
    const src = [world.cart, ...world.vehicles].find((v) => v && v.logs.length && bedNearIntake(v));
    if (src) return { kind: "unload", source: src, label: `Unload the ${src.kind === "cart" ? "cart" : src.def.name}`, ok: deckFree(world.mill) > 0, sub: deckFree(world.mill) > 0 ? null : "Intake deck is full" };
  }
  const c = world.cart;
  if (c) {
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    const hx = c.x + fx * CART.handle;
    const hz = c.z + fz * CART.handle;
    if (nearPt(P, hx, hz, 1.2)) return { kind: "grab", label: "Pull the cart", sub: `${c.logs.length}/${c.cap} logs`, ok: true };
  }
  const bed = nearBed(world, 0.8);
  if (bed && bed.logs.length) return { kind: "take", bed, label: "Take a log", ok: true };
  if (c && Math.hypot(P.x - c.x, P.z - c.z) < 2.2) return { kind: "grab", label: "Pull the cart", sub: `${c.logs.length}/${c.cap} logs`, ok: true };
  return null;
}

/** F: get in / out of a vehicle */
export function resolveVehicle(world) {
  const P = world.player;
  if (P.driving) return { kind: "exit", label: "Get out" };
  if (P.carry || P.pulling || P.act || P.swing) return null;
  for (const v of world.vehicles) {
    const d = doorPoint(v);
    if (Math.hypot(P.x - d.x, P.z - d.z) < 2.0 || Math.hypot(P.x - v.x, P.z - v.z) < 2.3) return { kind: "enter", v, label: `Drive the ${v.def.name}` };
  }
  return null;
}

function startAct(world, type, data) {
  const P = world.player;
  const A = ACTIONS[type];
  P.act = { type, t: 0, dur: A.dur, at: A.at, fired: false, ...data };
  if (world.tool.kind === "chainsaw") stopChainsaw(world, true);
}

function doInteract(world) {
  const P = world.player;
  const it = resolveInteraction(world);
  if (!it) return;
  if (!it.ok) {
    if (it.sub) world.emit({ type: "toast", text: it.sub, tone: "warn" });
    return;
  }
  switch (it.kind) {
    case "pickup": {
      P.yaw = turnToward(P.yaw, yawTo(P.x, P.z, it.log.x, it.log.z), 1.2);
      startAct(world, "pickup", { logId: it.log.id });
      break;
    }
    case "drop":
      startAct(world, "drop", { spot: it.spot });
      break;
    case "deposit":
      startAct(world, "deposit", {});
      break;
    case "load":
      startAct(world, "load", { bedId: it.bed.id });
      break;
    case "take":
      startAct(world, "take", { bedId: it.bed.id });
      break;
    case "grab":
      P.pulling = true;
      world.cart.pulled = true;
      if (world.tool.kind === "chainsaw") stopChainsaw(world, true);
      world.emit({ type: "cartGrab" });
      break;
    case "release":
      P.pulling = false;
      world.cart.pulled = false;
      world.emit({ type: "cartRelease" });
      break;
    case "unload":
      world.startUnload(it.source);
      break;
    case "board":
      world.emit({ type: "boardUse" });
      break;
    case "sell":
      world.emit({ type: "sellUse" });
      break;
    default:
  }
}

function findBed(world, id) {
  if (world.cart && world.cart.id === id) return world.cart;
  return world.vehicles.find((v) => v.id === id) || null;
}

function stepAct(world, dt) {
  const P = world.player;
  const A = P.act;
  if (!A) return;
  A.t += dt;
  if (!A.fired && A.t >= A.at) {
    A.fired = true;
    if (A.type === "pickup") {
      const log = world.logs.get(A.logId);
      if (log && log.owner === "WORLD" && !P.carry && setOwner(world, log, "PLAYER")) {
        P.carry = log.id;
        wakeLogs(world, log.x, log.z, 1.2);
        if (!log.collected) {
          log.collected = true;
          world.stats.logsCollected++;
        }
        world.emit({ type: "pickup", logId: log.id, species: log.species });
      }
    } else if (A.type === "drop") {
      const log = world.logs.get(P.carry);
      const spot = A.spot && world.logFits(A.spot.x, A.spot.z, A.spot.yaw, log ? log.len : 1, log ? log.r : 0.2, P.carry) ? A.spot : dropSpot(world);
      if (log && spot && setOwner(world, log, "WORLD")) {
        log.x = spot.x;
        log.z = spot.z;
        log.yaw = spot.yaw;
        restOnGround(world, log);
        P.carry = null;
        world.emit({ type: "drop", logId: log.id, x: log.x, y: log.y, z: log.z });
      } else world.emit({ type: "toast", text: "No room to drop it here", tone: "warn" });
    } else if (A.type === "deposit") {
      const log = world.logs.get(P.carry);
      if (log && millAccept(world, log)) {
        P.carry = null;
        world.stats.logsTransported++;
        world.emit({ type: "deposit", logId: log.id });
      } else world.emit({ type: "toast", text: "Intake deck is full", tone: "warn" });
    } else if (A.type === "load") {
      const bed = findBed(world, A.bedId);
      const log = world.logs.get(P.carry);
      if (bed && log && !bedFull(bed) && !bed.logs.includes(log.id) && setOwner(world, log, bed.kind === "cart" ? "CART" : "BED", bed.id, bed.logs.length)) {
        bed.logs.push(log.id);
        P.carry = null;
        world.emit({ type: "load", logId: log.id, bed: bed.id });
      }
    } else if (A.type === "take") {
      const bed = findBed(world, A.bedId);
      if (bed && bed.logs.length && !P.carry) {
        const id = bed.logs[bed.logs.length - 1];
        const log = world.logs.get(id);
        if (log && setOwner(world, log, "PLAYER")) {
          bed.logs.pop();
          P.carry = id;
          world.emit({ type: "pickup", logId: id, species: log.species });
        }
      }
    }
  }
  if (A.t >= A.dur) P.act = null;
}

/* ------------------------------------------------------------ movement */
function stepMovement(world, inp, dt) {
  const P = world.player;
  const locked = !!P.act || !!P.swing || P.saw.state === "CUTTING";
  let mx = locked ? 0 : inp.mx;
  let mz = locked ? 0 : inp.mz;
  const m = Math.min(1, Math.hypot(mx, mz));
  const sprint = inp.sprint && !locked && m > 0.3;
  const top = P.carry ? (sprint ? PLAYER.carryRun : PLAYER.carryWalk) : P.pulling ? (sprint ? PLAYER.pullRun : PLAYER.pullWalk) : sprint ? PLAYER.run : PLAYER.walk;
  const tvx = m > 0.01 ? (mx / (Math.hypot(mx, mz) || 1)) * top * m : 0;
  const tvz = m > 0.01 ? (mz / (Math.hypot(mx, mz) || 1)) * top * m : 0;
  const rate = m > 0.01 ? PLAYER.accel : PLAYER.decel;
  const dvx = tvx - P.vx;
  const dvz = tvz - P.vz;
  const dl = Math.hypot(dvx, dvz);
  const maxDv = rate * dt;
  if (dl <= maxDv) {
    P.vx = tvx;
    P.vz = tvz;
  } else {
    P.vx += (dvx / dl) * maxDv;
    P.vz += (dvz / dl) * maxDv;
  }
  let sp = Math.hypot(P.vx, P.vz);
  if (sp > 0.01) {
    // slopes: slow uphill, refuse what's too steep
    const slope = world.terrain.slopeAlong(P.x, P.z, P.vx / sp, P.vz / sp);
    if (slope > 0.25) {
      const k = clamp(1 - (slope - 0.25) / (PLAYER.maxSlope - 0.25), 0, 1);
      P.vx *= 0.4 + 0.6 * k;
      P.vz *= 0.4 + 0.6 * k;
      if (slope > PLAYER.maxSlope) {
        P.vx = 0;
        P.vz = 0;
      }
    }
  }
  const ox = P.x;
  const oz = P.z;
  let nx = P.x + P.vx * dt;
  let nz = P.z + P.vz * dt;
  const r = world.pushCircle(nx, nz, PLAYER.radius, { logs: true, fallen: true, skipCart: P.pulling });
  nx = r.x;
  nz = r.z;
  const d = Math.hypot(nx, nz);
  if (d > PLAY_RADIUS) {
    nx *= PLAY_RADIUS / d;
    nz *= PLAY_RADIUS / d;
  }
  P.x = nx;
  P.z = nz;
  const moved = Math.hypot(P.x - ox, P.z - oz);
  P.speed = moved / dt;
  // collisions eat velocity so we don't keep pushing into a wall
  if (dt > 0 && P.speed < sp * 0.5) {
    P.vx *= 0.6;
    P.vz *= 0.6;
  }
  sp = Math.hypot(P.vx, P.vz);
  if (m > 0.05 && !locked) P.yaw = turnToward(P.yaw, Math.atan2(mx, mz), PLAYER.turnRate * dt);
  P.sprinting = sprint && P.speed > PLAYER.walk + 0.3;
  // gait phase advances with distance → feet stay planted (no sliding)
  const stride = P.speed > PLAYER.walk + 0.4 ? PLAYER.runStride : PLAYER.stride;
  const prev = P.phase;
  P.phase += (moved / stride) * Math.PI * 2;
  if (Math.floor(prev / Math.PI) !== Math.floor(P.phase / Math.PI) && moved > 0) {
    P.stepSide ^= 1;
    world.emit({ type: "footstep", run: P.sprinting, x: P.x, z: P.z, side: P.stepSide });
  }
  world.stats.distanceWalked += moved;
}

/* ------------------------------------------------------------ main */
export function stepPlayer(world, inp, dt) {
  const P = world.player;
  if (P.driving) {
    const v = world.vehicles.find((x) => x.id === P.driving);
    if (v) {
      P.x = v.x;
      P.z = v.z;
      P.yaw = v.yaw;
      P.y = v.y;
      P.speed = 0;
    }
    if (inp.interactPressed) doInteract(world);
    if (inp.vehiclePressed) exitVehicle(world);
    return;
  }
  if (inp.vehiclePressed) {
    const r = resolveVehicle(world);
    if (r && r.kind === "enter") {
      enterVehicle(world, r.v);
      return;
    }
  }
  if (inp.interactPressed && !P.swing && !P.act) doInteract(world);
  stepAct(world, dt);
  if (world.tool.kind === "axe") stepAxe(world, inp, dt);
  else stepChainsaw(world, inp, dt);
  stepMovement(world, inp, dt);
  P.y = world.terrain.heightAt(P.x, P.z);
}

export function enterVehicle(world, v) {
  const P = world.player;
  if (P.carry || P.pulling) return false;
  if (world.tool.kind === "chainsaw") stopChainsaw(world, true);
  P.swing = null;
  P.act = null;
  P.driving = v.id;
  v.occupied = true;
  P.vx = P.vz = 0;
  world.emit({ type: "vehicle", on: true, id: v.id });
  return true;
}

export function exitVehicle(world) {
  const P = world.player;
  const v = world.vehicles.find((x) => x.id === P.driving);
  if (!v) {
    P.driving = null;
    return;
  }
  if (Math.abs(v.speed) > 1.5) {
    world.emit({ type: "toast", text: "Stop the vehicle first", tone: "warn" });
    return;
  }
  const rx = Math.cos(v.yaw);
  const rz = -Math.sin(v.yaw);
  const along = v.kind === "truck" ? 2.2 : -0.1;
  const cands = [[1.9, along], [-1.9, along], [2.6, along - 1.2], [-2.6, along - 1.2], [0, v.kind === "truck" ? 5 : 3.4]];
  for (const [side, al] of cands) {
    const x = v.x + rx * side + Math.sin(v.yaw) * al;
    const z = v.z + rz * side + Math.cos(v.yaw) * al;
    const r = world.pushCircle(x, z, PLAYER.radius, { logs: true, fallen: true });
    if (Math.hypot(r.x - x, r.z - z) < 0.05 && Math.hypot(x, z) < PLAY_RADIUS) {
      P.x = x;
      P.z = z;
      P.yaw = v.yaw;
      P.driving = null;
      v.occupied = false;
      v.speed = 0;
      P.y = world.terrain.heightAt(x, z);
      world.emit({ type: "vehicle", on: false, id: v.id });
      return;
    }
  }
  world.emit({ type: "toast", text: "No room to get out here", tone: "warn" });
}
