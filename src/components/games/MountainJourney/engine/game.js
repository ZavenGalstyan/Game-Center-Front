/**
 * Mountain Journey — one level attempt: the single authoritative simulation.
 *
 *   PLAYING         explorer controller, triggers (checkpoints, badges, keys,
 *                   finish), interaction prompts (E), climb detection
 *   CLIMBING        a ledge (fixed 1.15 s hang → pull → stand) or a ladder
 *                   (W/S along it, mounts over the top); input can't start
 *                   another climb, moving does nothing until it ends
 *   VIEWPOINT       camera pans the panorama for VIEW_TIME, then PLAYING
 *   FALLING         a fall / deep water / pit: the camera holds, then →
 *   RESPAWNING      fade, teleport to the last checkpoint at mid-fade, → PLAYING
 *   LEVEL_COMPLETE  terminal; `complete` is emitted exactly once
 *
 * Every transition goes through setState(), which refuses anything out of
 * a terminal state, so restarts / double inputs can't re-enter a flow.
 * Puzzle state (levers, keys, gates, crate, switches) persists across
 * respawns: a fall never undoes progress within the attempt.
 *
 * game.events is a queue the UI / audio drain each frame.
 */
import { STATE, STEP, PHYS, CLIMB, RESPAWN, VIEW_TIME } from "./constants.js";
import { buildLevel } from "./builder.js";
import { createPlayer, stepPlayer, groundUnder } from "./player.js";
import { clamp, easeInOut, smoothstep, wrapAngle } from "./rng.js";
import { regionOfLevel } from "../data/regions.js";

export { STATE };

export function createGame(def, opts = {}) {
  const region = regionOfLevel(def.id);
  const L = buildLevel(def, region);
  const found = new Set(opts.found || []); // badge indexes found on earlier attempts
  const G = {
    def,
    region,
    L,
    state: STATE.PLAYING,
    time: 0, // simulated seconds (includes respawn / viewpoint)
    levelTime: 0, // timer shown & saved
    acc: 0,
    player: createPlayer(L.spawn),
    cam: { yaw: L.spawn.h, pitch: 0.32, idle: 9, manual: 0 },
    flags: Object.create(null),
    events: [],
    checkpoint: { x: L.spawn.x, z: L.spawn.z, y: L.spawn.y, h: L.spawn.h, idx: 0 },
    cpReached: new Set(),
    collected: new Set(),
    foundBefore: found,
    viewed: new Set(),
    keys: new Set(),
    lockMove: 0,
    prompt: null,
    climb: null,
    view: null,
    fall: null,
    respawn: null,
    animAction: null, // { name, t } interact / victory
    run: { distance: 0, jumps: 0, falls: 0, playtime: 0 },
    completed: false,
    platforms: [],
    crates: [],
    opts,
  };
  G.emit = (e) => G.events.push(e);

  // --- dynamic world ---------------------------------------------------------
  for (const pd of L.platforms) {
    const pl = { ...pd, x: pd.ax, y: pd.ay, z: pd.az, dx: 0, dy: 0, dz: 0, f: 0, moving: false };
    pl.solid = L.solids.add({ type: "box", x: pl.x, z: pl.z, y: pl.y, h: pd.h, hw: pd.hw, hd: pd.hd, rot: pd.rot, surf: "wood", dynamic: true });
    pl.solid.platform = pl;
    G.platforms.push(pl);
    placePlatform(pl, 0);
  }
  for (const cd of L.crates) {
    const cr = { ...cd, x: cd.x0, z: cd.z0, pos: 0 };
    cr.solid = L.solids.add({ type: "box", x: cr.x, z: cr.z, y: cd.y - 0.05, h: cd.size * 2 + 0.05, hw: cd.size, hd: cd.size, rot: cd.h, surf: "wood", dynamic: true, crate: true });
    G.crates.push(cr);
  }
  const gateById = new Map(L.gates.map((g) => [g.id, g]));
  const bridgeById = new Map(L.bridges.map((b) => [b.id, b]));
  for (const s of L.solids.all) {
    if (!s.gate) continue;
    if (s.gate.gate) {
      const g = gateById.get(s.gate.gate);
      s.on = () => g.open < 0.5;
    } else if (s.gate.bridge) {
      const b = bridgeById.get(s.gate.bridge);
      s.on = () => b.ext >= 0.999;
    }
  }
  for (const g of L.gates) g.open = 0;
  for (const b of L.bridges) b.ext = 0;

  G.setState = (s) => {
    if (G.state === STATE.LEVEL_COMPLETE) return false;
    G.state = s;
    return true;
  };

  G.onCrateHome = (cr) => {
    if (G.flags[`crate:${cr.id}`]) return;
    G.flags[`crate:${cr.id}`] = true;
    G.emit({ type: "plate", id: cr.id });
    checkGates();
  };

  // --- wind --------------------------------------------------------------------
  G.windAt = (x, z) => {
    for (const W of L.wind) {
      let best = Infinity;
      let bh = 0;
      for (let i = 1; i < W.nodes.length; i++) {
        const a = W.nodes[i - 1];
        const b = W.nodes[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (len * len), 0, 1);
        const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
        if (d < best) {
          best = d;
          bh = Math.atan2(dx, dz);
        }
      }
      if (best > W.w) continue;
      const gust = 0.5 + 0.5 * Math.sin((G.time / W.period) * Math.PI * 2);
      const s = W.base + W.gust * gust * gust;
      W.now = s;
      return { x: -Math.cos(bh) * W.sgn * s, z: Math.sin(bh) * W.sgn * s, s };
    }
    return null;
  };
  G.windStrength = () => {
    const v = G.windAt(G.player.x, G.player.z);
    return v ? v.s : 0;
  };

  // --- gates ---------------------------------------------------------------------
  function needsMet(g) {
    const n = g.needs || {};
    if (n.key) return G.keys.has(n.key);
    if (n.crate) return !!G.flags[`crate:${n.crate}`];
    if (n.switches) return n.switches.every((s) => G.flags[`sw:${s}`]);
    return true;
  }
  function openGate(g) {
    if (G.flags[`gate:${g.id}`]) return;
    G.flags[`gate:${g.id}`] = "opening";
    G.emit({ type: "gateOpen", id: g.id, kind: g.kind, x: g.x, z: g.z });
  }
  function checkGates() {
    for (const g of L.gates) if (!g.needs.key && needsMet(g)) openGate(g);
  }

  // --- interaction (E) ----------------------------------------------------------
  function interactables() {
    const P = G.player;
    const list = [];
    for (const lv of L.levers) {
      if (G.flags[`lever:${lv.id}`]) continue;
      list.push({ d: Math.hypot(P.x - lv.x, P.z - lv.z), r: lv.r, text: "Pull lever", kind: "lever", obj: lv });
    }
    for (const sw of L.switches) {
      if (G.flags[`sw:${sw.id}`]) continue;
      list.push({ d: Math.hypot(P.x - sw.x, P.z - sw.z), r: sw.r, text: sw.crystal ? "Touch the crystal" : "Activate switch", kind: "switch", obj: sw });
    }
    for (const g of L.gates) {
      if (!g.needs.key || G.flags[`gate:${g.id}`]) continue;
      const have = G.keys.has(g.needs.key);
      list.push({ d: Math.hypot(P.x - g.x, P.z - g.z), r: g.r, text: have ? "Unlock gate" : "Locked — find the key", kind: "gate", obj: g, disabled: !have });
    }
    for (const vp of L.viewpoints) {
      list.push({ d: Math.hypot(P.x - vp.x, P.z - vp.z), r: vp.r, text: G.viewed.has(vp.id) ? `Enjoy the view — ${vp.name}` : `Viewpoint — ${vp.name}`, kind: "view", obj: vp });
    }
    let best = null;
    for (const it of list) {
      if (it.d > it.r) continue;
      if (Math.abs(G.player.y - (it.obj.y ?? G.player.y)) > 1.6) continue;
      if (!best || it.d < best.d) best = it;
    }
    return best;
  }

  function doInteract(it) {
    if (it.disabled) {
      G.emit({ type: "locked", id: it.obj.id });
      return;
    }
    const P = G.player;
    const o = it.obj;
    P.facing = Math.atan2(o.x - P.x, o.z - P.z);
    if (it.kind === "view") {
      startView(o);
      return;
    }
    G.animAction = { name: "interact", t: 0 };
    G.lockMove = 0.55;
    if (it.kind === "lever") {
      G.flags[`lever:${o.id}`] = true;
      G.flags[`extending:${o.target}`] = true;
      G.emit({ type: "lever", id: o.id, x: o.x, z: o.z });
    } else if (it.kind === "switch") {
      G.flags[`sw:${o.id}`] = true;
      G.emit({ type: "switch", id: o.id, crystal: !!o.crystal, x: o.x, z: o.z });
      checkGates();
    } else if (it.kind === "gate") {
      openGate(o);
    }
  }

  // --- climbing ----------------------------------------------------------------
  function climbAvailable() {
    const P = G.player;
    for (const cl of L.climbs) {
      const rx = P.x - cl.x;
      const rz = P.z - cl.z;
      const dn = rx * cl.nx + rz * cl.nz; // distance in front of the face
      if (dn < -0.05 || dn > CLIMB.reach) continue;
      const lat = Math.abs(rx * cl.nz - rz * cl.nx);
      if (lat > cl.half) continue;
      const onBase = P.grounded && Math.abs(P.y - cl.baseY) < 0.6;
      const reachAir = !P.grounded && P.y > cl.topY - 2.55 && P.y < cl.topY - 0.5;
      if (!onBase && !reachAir) continue;
      // facing the wall (or pushing into it)
      const face = Math.sin(P.facing) * -cl.nx + Math.cos(P.facing) * -cl.nz;
      if (face < 0.35) continue;
      return cl;
    }
    return null;
  }
  function startClimb(cl) {
    if (G.state !== STATE.PLAYING || G.climb) return;
    const P = G.player;
    const lat = (P.x - cl.x) * cl.nz - (P.z - cl.z) * cl.nx;
    const latC = cl.kind === "ladder" ? 0 : clamp(lat, -cl.half + 0.2, cl.half - 0.2);
    // hang point on the face (slightly in front), stand point on top
    const fx = cl.x + cl.nz * latC + cl.nx * (PHYS.radius + 0.06);
    const fz = cl.z - cl.nx * latC + cl.nz * (PHYS.radius + 0.06);
    const topX = cl.x + cl.nz * latC - cl.nx * 0.75;
    const topZ = cl.z - cl.nx * latC - cl.nz * 0.75;
    G.climb = { cl, t: 0, from: { x: P.x, y: P.y, z: P.z }, face: { x: fx, z: fz }, top: { x: topX, z: topZ, y: cl.topY }, h: 0, mount: -1 };
    P.vx = P.vy = P.vz = 0;
    P.facing = Math.atan2(-cl.nx, -cl.nz);
    P.grounded = false;
    G.setState(STATE.CLIMBING);
    G.emit({ type: cl.kind === "ladder" ? "ladderStart" : "climbStart", id: cl.id });
  }
  function stepClimb(inp, dt) {
    const C = G.climb;
    const P = G.player;
    const cl = C.cl;
    C.t += dt;
    if (cl.kind === "ledge") {
      const T = CLIMB.ledgeTime;
      const k = C.t / T;
      if (k < 0.3) {
        // reach: move onto the face and up to a hang
        const s = easeInOut(k / 0.3);
        P.x = C.from.x + (C.face.x - C.from.x) * s;
        P.z = C.from.z + (C.face.z - C.from.z) * s;
        P.y = C.from.y + (cl.topY - 1.55 - C.from.y) * s;
      } else if (k < 0.72) {
        const s = easeInOut((k - 0.3) / 0.42);
        P.x = C.face.x;
        P.z = C.face.z;
        P.y = cl.topY - 1.55 + 1.6 * s;
      } else if (k < 1) {
        const s = easeInOut((k - 0.72) / 0.28);
        P.x = C.face.x + (C.top.x - C.face.x) * s;
        P.z = C.face.z + (C.top.z - C.face.z) * s;
        P.y = cl.topY + 0.05 * (1 - s);
      } else {
        endClimb();
      }
      return;
    }
    // ladder
    if (C.mount >= 0) {
      C.mount += dt;
      const s = easeInOut(Math.min(1, C.mount / CLIMB.mountTime));
      P.x = C.face.x + (C.top.x - C.face.x) * s;
      P.z = C.face.z + (C.top.z - C.face.z) * s;
      P.y = cl.topY - 0.35 + 0.35 * s;
      if (C.mount >= CLIMB.mountTime) endClimb();
      return;
    }
    // first, step onto the rungs
    const settle = Math.min(1, C.t / 0.25);
    P.x = C.from.x + (C.face.x - C.from.x) * settle;
    P.z = C.from.z + (C.face.z - C.from.z) * settle;
    const dir = clamp(inp.mz, -1, 1);
    C.h = clamp(C.h + dir * CLIMB.ladderSpeed * dt, 0, cl.topY - cl.baseY);
    C.moving = Math.abs(dir) > 0.1;
    P.y = cl.baseY + C.h;
    C.rung = (C.rung || 0) + Math.abs(dir) * dt;
    if (C.rung > 0.38) {
      C.rung = 0;
      G.emit({ type: "step", surf: "ladder" });
    }
    if (P.y >= cl.topY - 0.35) {
      C.mount = 0;
      G.emit({ type: "mount" });
    } else if (dir < -0.1 && C.h <= 0.001 && C.t > 0.35) {
      endClimb(true);
    } else if (inp.jumpPressed && C.t > 0.3) {
      // let go: drop back off the ladder
      endClimb(true);
      P.vx = cl.nx * 2.2;
      P.vz = cl.nz * 2.2;
      P.vy = 2;
      P.grounded = false;
    }
  }
  function endClimb(bottom = false) {
    const P = G.player;
    const cl = G.climb.cl;
    G.climb = null;
    G.climbCooldown = 0.5;
    if (!bottom) {
      P.y = cl.topY;
      const g = groundUnder(G, P.x, P.z, P.y + 0.1);
      P.y = Math.max(P.y, g.h);
      P.grounded = true;
    }
    P.vy = 0;
    P.landT = 0.2;
    G.setState(STATE.PLAYING);
    G.emit({ type: "climbEnd", id: cl.id });
  }

  // --- viewpoints ---------------------------------------------------------------
  function startView(vp) {
    G.view = { vp, t: 0, first: !G.viewed.has(vp.id) };
    G.setState(STATE.VIEWPOINT);
    G.player.vx = G.player.vz = 0;
    G.player.facing = vp.cam.h;
    if (G.view.first) {
      G.viewed.add(vp.id);
      G.emit({ type: "viewpoint", id: vp.id, name: vp.name, first: true });
    } else G.emit({ type: "viewpoint", id: vp.id, name: vp.name, first: false });
  }

  // --- falls / respawn ---------------------------------------------------------
  function startFall(cause) {
    if (G.state !== STATE.PLAYING) return;
    G.fall = { t: 0, cause };
    G.setState(STATE.FALLING);
    G.run.falls++;
    G.emit({ type: "fall", cause });
    if (cause === "water") G.emit({ type: "splash", x: G.player.x, z: G.player.z, y: G.player.y });
  }
  function respawnNow() {
    const P = G.player;
    const cp = G.checkpoint;
    P.x = cp.x;
    P.z = cp.z;
    P.y = groundUnder(G, cp.x, cp.z, cp.y + 0.3).h;
    P.vx = P.vy = P.vz = 0;
    P.facing = cp.h;
    P.grounded = true;
    P.groundSolid = null;
    P.lastSafeY = P.y;
    P.jumpBuf = 0;
    P.landT = 9;
    G.cam.yaw = cp.h;
    G.cam.pitch = 0.32;
    G.cam.snap = true;
    G.climb = null;
    G.emit({ type: "respawn" });
  }
  /** Debug / pause-menu: go back to the last checkpoint. */
  G.toCheckpoint = () => {
    if (G.state === STATE.LEVEL_COMPLETE) return;
    G.fall = null;
    G.view = null;
    G.climb = null;
    G.setState(STATE.RESPAWNING);
    G.respawn = { t: 0, moved: false };
  };

  /** Off the trail and well below it (a gorge flank, a valley): that's a fall. */
  function offTrailLow(P) {
    const q = L.terrain.query(P.x, P.z);
    // pit floors are trail nodes too: measure against their rim
    return !!q.node && q.e > 3.6 && P.y < (q.node.topY ?? q.node.y) - 1.2;
  }

  function inPit(P) {
    for (const pt of L.pits) {
      if (P.y > pt.y - 1.05) continue;
      const fx = Math.sin(pt.h);
      const fz = Math.cos(pt.h);
      const along = (P.x - pt.ax) * fx + (P.z - pt.az) * fz;
      if (along < -0.2 || along > pt.len + 0.2) continue;
      const lat = Math.abs((P.x - pt.ax) * fz - (P.z - pt.az) * fx);
      if (lat > pt.hw) continue;
      return true;
    }
    return false;
  }

  // --- the world's own motion ------------------------------------------------
  function placePlatform(pl, t) {
    const cyc = 2 * pl.travel + 2 * pl.pause;
    let u = ((t + pl.phase * cyc) % cyc + cyc) % cyc;
    let f;
    if (u < pl.pause) f = 0;
    else if ((u -= pl.pause) < pl.travel) f = easeInOut(u / pl.travel);
    else if ((u -= pl.travel) < pl.pause) f = 1;
    else f = 1 - easeInOut((u - pl.pause) / pl.travel);
    const x = pl.ax + (pl.bx - pl.ax) * f;
    const y = pl.ay + (pl.by - pl.ay) * f;
    const z = pl.az + (pl.bz - pl.az) * f;
    pl.dx = x - pl.x;
    pl.dy = y - pl.y;
    pl.dz = z - pl.z;
    pl.x = x;
    pl.y = y;
    pl.z = z;
    pl.f = f;
    pl.moving = Math.abs(pl.dx) + Math.abs(pl.dy) + Math.abs(pl.dz) > 1e-6;
    if (pl.solid) {
      pl.solid.x = x;
      pl.solid.y = y;
      pl.solid.z = z;
    }
  }
  function stepWorld(dt) {
    for (const pl of G.platforms) placePlatform(pl, G.time);
    for (const b of L.bridges) {
      if (G.flags[`extending:${b.id}`] && b.ext < 1) {
        b.ext = Math.min(1, b.ext + dt / 1.8);
        if (b.ext >= 1) {
          G.flags[`bridge:${b.id}`] = true;
          G.emit({ type: "bridgeDone", id: b.id });
        }
      }
    }
    for (const g of L.gates) {
      if (G.flags[`gate:${g.id}`] && g.open < 1) {
        g.open = Math.min(1, g.open + dt / 1.4);
        if (g.open >= 1) G.flags[`gate:${g.id}`] = true;
      }
    }
  }

  // --- triggers ---------------------------------------------------------------
  function triggers() {
    const P = G.player;
    for (const cp of L.checkpoints) {
      if (G.cpReached.has(cp.id)) continue;
      if (Math.hypot(P.x - cp.x, P.z - cp.z) < cp.r && Math.abs(P.y - cp.y) < 2) {
        G.cpReached.add(cp.id);
        if (cp.idx >= G.checkpoint.idx) G.checkpoint = { x: cp.x, z: cp.z, y: cp.y, h: cp.h, idx: cp.idx, id: cp.id };
        G.emit({ type: "checkpoint", id: cp.id, idx: cp.idx, kind: cp.kind });
      }
    }
    for (const b of L.badges) {
      if (G.collected.has(b.idx)) continue;
      const dy = P.y + 0.9 - b.y;
      if (Math.hypot(P.x - b.x, P.z - b.z) < 1.05 && Math.abs(dy) < 1.2) {
        G.collected.add(b.idx);
        G.emit({ type: "badge", idx: b.idx, x: b.x, y: b.y, z: b.z, isNew: !G.foundBefore.has(b.idx) });
      }
    }
    for (const k of L.keys) {
      if (G.keys.has(k.id)) continue;
      if (Math.hypot(P.x - k.x, P.z - k.z) < 1.3 && Math.abs(P.y - k.y) < 1.5) {
        G.keys.add(k.id);
        G.flags[`key:${k.id}`] = true;
        G.emit({ type: "key", id: k.id });
      }
    }
    const F = L.finish;
    if (!G.completed && Math.hypot(P.x - F.x, P.z - F.z) < F.r && Math.abs(P.y - F.y) < 1.5 && P.grounded) {
      G.completed = true;
      G.setState(STATE.LEVEL_COMPLETE);
      G.animAction = { name: "victory", t: 0 };
      P.vx = P.vz = 0;
      G.finishT = 0;
      G.emit({ type: "complete", time: G.levelTime, badges: [...G.collected], viewpoints: [...G.viewed] });
    }
  }

  // --- the fixed step ------------------------------------------------------------
  function step(inp) {
    const dt = STEP;
    const P = G.player;
    G.time += dt;
    if (G.state !== STATE.LEVEL_COMPLETE) {
      G.levelTime += dt;
      G.run.playtime += dt;
    } else G.finishT = (G.finishT || 0) + dt;
    G.lockMove = Math.max(0, G.lockMove - dt);
    G.climbCooldown = Math.max(0, (G.climbCooldown || 0) - dt);
    if (G.animAction) {
      G.animAction.t += dt;
      if (G.animAction.name === "interact" && G.animAction.t > 0.7) G.animAction = null;
    }
    // camera input (mouse / touch look) is applied by the caller via G.look()
    stepWorld(dt);

    switch (G.state) {
      case STATE.PLAYING: {
        stepPlayer(G, inp, dt);
        // interactions
        const it = interactables();
        const cl = !G.climbCooldown ? climbAvailable() : null;
        G.prompt = cl ? { text: cl.kind === "ladder" ? "Climb ladder" : "Climb ledge", key: "SPACE" } : it ? { text: it.text, key: it.disabled ? null : "E" } : null;
        if (cl) {
          // jump or E at a ledge climbs; pressing into it for a moment climbs too
          const pushing = Math.hypot(inp.mx, inp.mz) > 0.5;
          G.climbPush = pushing ? (G.climbPush || 0) + dt : 0;
          if (inp.jumpPressed || inp.interactPressed || G.climbPush > (cl.kind === "ladder" ? 0.12 : 0.3)) {
            G.climbPush = 0;
            P.jumpBuf = 0;
            startClimb(cl);
            break;
          }
        } else G.climbPush = 0;
        if (inp.interactPressed && it && !G.lockMove) doInteract(it);
        if (G.state !== STATE.PLAYING) break;
        triggers();
        if (G.state !== STATE.PLAYING) break;
        // hazards
        if (P.wade > PHYS.drownDepth) startFall("water");
        else if (inPit(P)) startFall("pit");
        else if (P.y < P.lastSafeY - PHYS.fallLimit) startFall("fall");
        else if (offTrailLow(P)) startFall("fall");
        break;
      }
      case STATE.CLIMBING:
        G.prompt = null;
        if (G.climb) stepClimb(inp, dt);
        else G.setState(STATE.PLAYING);
        break;
      case STATE.VIEWPOINT: {
        G.prompt = null;
        G.view.t += dt;
        if (G.view.t >= VIEW_TIME || (G.view.t > 1.2 && (inp.interactPressed || inp.jumpPressed))) {
          G.view = null;
          G.cam.snap = false;
          G.setState(STATE.PLAYING);
          G.emit({ type: "viewEnd" });
        }
        break;
      }
      case STATE.FALLING: {
        G.prompt = null;
        G.fall.t += dt;
        // keep falling under gravity (water: sink slowly)
        if (G.fall.cause === "water") P.y -= dt * 0.6;
        else {
          P.vy = Math.max(-PHYS.maxFall, P.vy - PHYS.gravity * dt);
          P.y += P.vy * dt;
          P.x += P.vx * dt * 0.5;
          P.z += P.vz * dt * 0.5;
        }
        if (G.fall.t >= RESPAWN.fallTime) {
          G.fall = null;
          G.respawn = { t: 0, moved: false };
          G.setState(STATE.RESPAWNING);
        }
        break;
      }
      case STATE.RESPAWNING: {
        G.prompt = null;
        const R = G.respawn;
        R.t += dt;
        if (!R.moved && R.t >= RESPAWN.fadeTime / 2) {
          R.moved = true;
          respawnNow();
        }
        if (R.t >= RESPAWN.fadeTime) {
          G.respawn = null;
          G.setState(STATE.PLAYING);
        }
        break;
      }
      case STATE.LEVEL_COMPLETE:
        G.prompt = null;
        P.vx *= 0.9;
        P.vz *= 0.9;
        break;
      default:
        break;
    }
    // camera auto-follow: drift behind the explorer while walking forward
    G.cam.idle += dt;
    if (G.state === STATE.PLAYING && G.cam.idle > 1.4 && P.grounded && P.speed > 1.5 && !G.opts.noAutoCam) {
      const d = wrapAngle(P.facing - G.cam.yaw);
      if (Math.abs(d) < 2.3) G.cam.yaw = wrapAngle(G.cam.yaw + d * Math.min(1, dt * 0.9 * smoothstep(1.4, 3, G.cam.idle)));
    }
  }

  /** Mouse / touch camera look (radians). */
  G.look = (dyaw, dpitch) => {
    if (dyaw === 0 && dpitch === 0) return;
    if (G.state === STATE.VIEWPOINT) return;
    G.cam.yaw = wrapAngle(G.cam.yaw + dyaw);
    G.cam.pitch = clamp(G.cam.pitch + dpitch, -0.45, 1.05);
    G.cam.idle = 0;
  };

  /**
   * Advances the simulation by real seconds `dt` (fixed sub-steps). `input`
   * is engine/input.js's object; edge presses are consumed per call so one
   * key press is one jump / one interaction no matter the frame rate.
   */
  G.tick = (dt, input) => {
    G.acc = Math.min(G.acc + Math.min(dt, 0.1), 0.25);
    const inp = input.frame();
    const sens = 0.0024 * (G.opts.sensitivity ?? 1);
    G.look(-inp.lookDX * sens, inp.lookDY * sens * 0.8);
    let first = true;
    while (G.acc >= STEP) {
      G.acc -= STEP;
      step(first ? inp : { ...inp, jumpPressed: false, interactPressed: false });
      first = false;
    }
    // a press that landed between steps waits for the next one
    if (first) input.unconsume(inp);
  };
  /** Steps exactly n fixed steps with a plain input snapshot (tests / bot). */
  G.stepN = (n, inp) => {
    for (let i = 0; i < n; i++) step(i === 0 ? inp : { ...inp, jumpPressed: false, interactPressed: false });
  };
  G.drain = () => {
    const e = G.events;
    G.events = [];
    return e;
  };
  return G;
}
