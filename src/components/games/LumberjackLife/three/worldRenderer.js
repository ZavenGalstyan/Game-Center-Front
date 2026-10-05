/**
 * Lumberjack Life — the world renderer + frame driver.
 *
 * One instance per game session (and one for the menu showcase). It owns
 * every Three.js object it creates and disposes all of them; R3F only
 * provides the renderer, camera, resize handling and the frame loop.
 *
 * frame(dt):
 *   input → camera look → engine input (camera-relative) → stepWorld
 *   → events (sound / particles / camera impulses / forwarded to the UI)
 *   → pose trees, logs, vehicles, the lumberjack → sawmill → effects
 *   → third-person camera (obstruction-aware) → HUD snapshot
 *
 * Paused: the engine is not advanced, every continuous sound is silenced,
 * and input is drained so nothing fires on resume.
 */
import * as THREE from "three";
import { stepWorld, TS } from "../engine/world.js";
import { primaryTarget, resolveInteraction, resolveVehicle, impactPoint } from "../engine/player.js";
import { trunkCollider, blocksAsTrunk, trunkLen, radiusAt } from "../engine/trees.js";
import { clamp, damp, wrap, turnToward, smooth } from "../engine/math.js";
import { MILL_LAYOUT } from "../engine/mill.js";
import { CUT_HEIGHT, SWING } from "../engine/constants.js";
import { MILL, leafColors } from "../data/regions.js";
import { speciesById } from "../data/species.js";
import { buildEnvironment, WORLD_UNIFORMS } from "./environment.js";
import { buildTree, poseTree, disposeTree, disposeTreeCaches } from "./treeMesh.js";
import { buildSawmill } from "./sawmillMesh.js";
import { buildLumberjack, setRigTool, poseLumberjack, rigInteract } from "./lumberjack.js";
import { buildCart, buildTractor, buildTruck, bedSlotPose } from "./vehiclesMesh.js";
import { makeLogMesh, disposeLogMaterials } from "./logMesh.js";
import { createEffects } from "./effects.js";
import { disposeTextures } from "./textures.js";
import { disposeToolCaches } from "./tools3d.js";
import { sound } from "../audio/sound.js";

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");

export function createWorldRenderer({ scene, camera, gl, world, settings, progress, showcase = false, onEvents = null }) {
  const region = world.region;
  const H = world.terrain.heightAt;
  const shadows = settings.shadows && settings.graphics !== "low";
  gl.shadowMap.enabled = shadows;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.02;
  camera.near = 0.08;
  camera.far = 900;
  camera.fov = 55;
  camera.updateProjectionMatrix();

  const env = buildEnvironment(region, world, settings);
  scene.add(env.group);
  scene.fog = env.fog;
  scene.background = env.background;

  const ctx = { region, shadows, reducedMotion: settings.reducedMotion };

  /* ---------------- trees */
  const treeGroup = new THREE.Group();
  scene.add(treeGroup);
  const trees = new Map();
  const addTree = (t) => {
    const vis = buildTree(t, region, { shadows });
    treeGroup.add(vis.root);
    trees.set(t.id, vis);
  };
  world.trees.forEach(addTree);

  /* ---------------- sawmill */
  let mill = buildSawmill(region, world, { shadows, upgrades: progress.sawmillUpgrades, buildings: world.buildings });
  scene.add(mill.group);

  /* ---------------- lumberjack */
  const rig = buildLumberjack({ shadows });
  scene.add(rig.root);
  setRigTool(rig, world.tool);

  /* ---------------- vehicles */
  let cartVis = null;
  const vehVis = new Map();
  function syncVehicles() {
    if (world.cart && !cartVis) {
      cartVis = buildCart({ shadows });
      scene.add(cartVis.root);
    }
    for (const v of world.vehicles) {
      if (vehVis.has(v.id)) continue;
      const vis = v.kind === "truck" ? buildTruck(v.def, { shadows }) : buildTractor(v.def, { shadows });
      scene.add(vis.root);
      if (vis.trailer) scene.add(vis.trailer);
      vehVis.set(v.id, vis);
    }
  }
  syncVehicles();

  /* ---------------- logs */
  const logs = new Map(); // id → { mesh, owner, pose, tween }
  const logGroup = new THREE.Group();
  scene.add(logGroup);

  /* ---------------- effects */
  const fx = createEffects(scene, { quality: settings.graphics, particles: settings.particles, ground: H });
  fx.setWeather(region.weather);

  /* ---------------- camera */
  const P = world.player;
  const cam = {
    yaw: P.yaw,
    pitch: 0.36,
    dist: 5.4,
    cur: 5.4,
    focus: new THREE.Vector3(P.x, P.y + 1.55, P.z),
    shake: 0,
    kick: 0,
    orbit: 0,
  };
  const boxes = MILL_LAYOUT.boxes.map((b, i) => ({ x0: MILL.x + b.x0, x1: MILL.x + b.x1, z0: MILL.z + b.z0, z1: MILL.z + b.z1, h: i === 4 ? 4.2 : i === 3 ? 2 : i === 2 ? 1.7 : 1.1 }));

  /* ---------------- state */
  let time = 0;
  let swingId = 0;
  let lastSwing = null;
  const hud = { prompt: null, target: null, vehicle: null, tool: world.tool.id, carry: false, driving: null, pulling: false, saw: "OFF", cart: null };
  let lastEvents = [];
  const showcaseBot = showcase ? { t: 0, tree: null, phase: 0 } : null;
  let disposed = false;

  /* ================================================================ helpers */
  const toLocal = (wx, wy, wz, out) => {
    const dx = wx - rig.root.position.x;
    const dz = wz - rig.root.position.z;
    const yaw = rig.root.rotation.y;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return out.set(dx * c - dz * s, wy - rig.root.position.y, dx * s + dz * c);
  };

  function logTargetPose(log, out) {
    switch (log.owner) {
      case "WORLD":
        out.x = log.x;
        out.y = log.y;
        out.z = log.z;
        out.yaw = log.yaw;
        out.pitch = log.pitch;
        out.roll = log.roll;
        out.vis = 1;
        return out;
      case "PLAYER": {
        // on the right shoulder, along the walking direction
        _v.set(-0.17, 0.33, 0.06);
        rig.chest.localToWorld(_v);
        out.x = _v.x;
        out.y = _v.y + log.r * 0.6;
        out.z = _v.z;
        out.yaw = P.yaw;
        out.pitch = 0.1;
        out.roll = 0;
        out.vis = 1;
        return out;
      }
      case "CART":
      case "BED": {
        const v = log.owner === "CART" ? world.cart : world.vehicles.find((x) => x.id === log.holder);
        const vis = log.owner === "CART" ? cartVis : vehVis.get(log.holder);
        if (!v || !vis) return null;
        let maxR = 0;
        for (const id of v.logs) {
          const l = world.logs.get(id);
          if (l) maxR = Math.max(maxR, l.r);
        }
        const i = v.logs.indexOf(log.id);
        return bedSlotPose(v, vis, i < 0 ? 0 : i, log, maxR, out);
      }
      case "MILL":
        return mill.logPose(world, log, out);
      default:
        return null;
    }
  }

  const _pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, vis: 1 };
  function updateLogs(dt) {
    // add / remove
    for (const [id, L] of logs) {
      if (!world.logs.has(id)) {
        L.mesh.removeFromParent();
        L.mesh.geometry.dispose();
        logs.delete(id);
      }
    }
    for (const log of world.logs.values()) {
      let L = logs.get(log.id);
      if (!L) {
        const mesh = makeLogMesh(log, { shadows });
        logGroup.add(mesh);
        L = { mesh, owner: log.owner, tween: null, pos: new THREE.Vector3(), q: new THREE.Quaternion(), init: false };
        logs.set(log.id, L);
      }
      const T = logTargetPose(log, _pose);
      if (!T) {
        L.mesh.visible = false;
        continue;
      }
      L.mesh.visible = true;
      _e.set(-T.pitch, T.yaw, T.roll);
      _q.setFromEuler(_e);
      _v.set(T.x, T.y, T.z);
      if (!L.init) {
        L.pos.copy(_v);
        L.q.copy(_q);
        L.init = true;
      }
      if (L.owner !== log.owner) {
        L.tween = { from: L.pos.clone(), fq: L.q.clone(), t: 0, dur: log.owner === "MILL" && L.owner === "PLAYER" ? 0.4 : log.owner === "PLAYER" ? 0.32 : 0.36, arc: log.owner !== "PLAYER" && L.owner !== "WORLD" ? 0.35 : 0.08 };
        L.owner = log.owner;
      }
      if (L.tween) {
        const tw = L.tween;
        tw.t += dt;
        const k = smooth(clamp(tw.t / tw.dur, 0, 1));
        L.pos.lerpVectors(tw.from, _v, k);
        L.pos.y += Math.sin(Math.PI * k) * tw.arc;
        L.q.slerpQuaternions(tw.fq, _q, k);
        if (tw.t >= tw.dur) L.tween = null;
      } else {
        L.pos.copy(_v);
        L.q.copy(_q);
      }
      L.mesh.position.copy(L.pos);
      L.mesh.quaternion.copy(L.q);
      L.mesh.scale.set(1, 1, T.vis);
    }
  }

  function grabPoints(logId) {
    const L = logs.get(logId);
    if (!L) return null;
    const log = world.logs.get(logId);
    const r = log ? log.r : 0.2;
    _v.set(0, r * 0.7, 0.32).applyQuaternion(L.q).add(L.pos);
    _v2.set(0, r * 0.7, -0.32).applyQuaternion(L.q).add(L.pos);
    const a = toLocal(_v.x, _v.y, _v.z, new THREE.Vector3());
    const b = toLocal(_v2.x, _v2.y, _v2.z, new THREE.Vector3());
    // left hand takes the point on the character's left (+x)
    return a.x > b.x ? { a, b } : { a: b, b: a };
  }

  /* ================================================================ camera */
  function cameraLimit(fx0, fy0, fz0, dx, dy, dz, want) {
    let lim = want;
    const ex = fx0 + dx * want;
    const ez = fz0 + dz * want;
    const sx = ex - fx0;
    const sz = ez - fz0;
    const l2 = sx * sx + sz * sz;
    for (const t of world.trees) {
      if (!blocksAsTrunk(t)) continue;
      if (Math.abs(t.x - fx0) > want + 2 || Math.abs(t.z - fz0) > want + 2) continue;
      const u = l2 > 1e-6 ? clamp(((t.x - fx0) * sx + (t.z - fz0) * sz) / l2, 0, 1) : 0;
      const cx = fx0 + sx * u;
      const cz = fz0 + sz * u;
      const d = Math.hypot(t.x - cx, t.z - cz);
      const yAt = fy0 + dy * want * u;
      if (d < trunkCollider(t) + 0.3 && yAt < t.y + t.height * 0.55) lim = Math.min(lim, Math.max(0.9, u * want - 0.35));
    }
    for (const b of boxes) {
      // slab test in 2D
      let t0 = 0;
      let t1 = 1;
      const ok = [[sx, fx0, b.x0, b.x1], [sz, fz0, b.z0, b.z1]].every(([d, o, lo, hi]) => {
        if (Math.abs(d) < 1e-6) return o >= lo && o <= hi;
        let a = (lo - o) / d;
        let c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        return t0 <= t1;
      });
      if (ok && t0 > 0) {
        const yAt = fy0 + dy * want * t0;
        if (yAt < mill.baseY + b.h) lim = Math.min(lim, Math.max(0.9, t0 * want - 0.3));
      }
    }
    // terrain between the player and the camera
    for (let k = 1; k <= 8; k++) {
      const u = k / 8;
      const d = want * u;
      const y = fy0 + dy * d;
      if (y < H(fx0 + dx * d, fz0 + dz * d) + 0.3) {
        lim = Math.min(lim, Math.max(1.0, d - 0.4));
        break;
      }
    }
    return lim;
  }

  function updateCamera(dt, look) {
    const S = settings;
    const driving = P.driving ? world.vehicles.find((v) => v.id === P.driving) : null;
    if (showcase) {
      cam.orbit += dt * 0.045;
      const cx = MILL.x - 4;
      const cz = MILL.z + 9;
      const r = 21;
      const x = cx + Math.sin(cam.orbit + 2.2) * r;
      const z = cz + Math.cos(cam.orbit + 2.2) * r;
      const y = Math.max(H(x, z) + 5.5, mill.baseY + 6.5);
      camera.position.set(x, y, z);
      camera.lookAt(cx, mill.baseY + 1.8, cz - 1);
      return;
    }
    const sens = 0.0024 * S.sensitivity;
    const [dx, dy] = look;
    cam.yaw = wrap(cam.yaw - dx * sens);
    cam.pitch = clamp(cam.pitch + dy * sens * (S.invertY ? -1 : 1), -0.22, 1.12);
    if (driving) {
      const idle = performance.now() - (lastLookAt.v || 0) > 1400;
      if (idle && Math.abs(driving.speed) > 0.5) {
        const back = driving.speed < -0.3 ? wrap(driving.yaw + Math.PI) : driving.yaw;
        cam.yaw = turnToward(cam.yaw, back, dt * 1.6);
        cam.pitch = damp(cam.pitch, 0.32, 1.5, dt);
      }
    }
    if (dx || dy) lastLookAt.v = performance.now();
    const want = driving ? (driving.kind === "truck" ? 11 : 9) : P.carry ? 5.6 : 5.2;
    cam.dist = damp(cam.dist, want, 3, dt);
    const fyOff = driving ? 2.3 : 1.55;
    const fxT = driving ? driving.x : P.x;
    const fzT = driving ? driving.z : P.z;
    const fyT = (driving ? driving.y : P.y) + fyOff;
    cam.focus.x = damp(cam.focus.x, fxT, 14, dt);
    cam.focus.z = damp(cam.focus.z, fzT, 14, dt);
    cam.focus.y = damp(cam.focus.y, fyT, 9, dt);
    const cp = Math.cos(cam.pitch);
    const ddx = -Math.sin(cam.yaw) * cp;
    const ddy = Math.sin(cam.pitch);
    const ddz = -Math.cos(cam.yaw) * cp;
    const lim = cameraLimit(cam.focus.x, cam.focus.y, cam.focus.z, ddx, ddy, ddz, cam.dist);
    cam.cur = lim < cam.cur ? damp(cam.cur, lim, 22, dt) : damp(cam.cur, lim, 3.5, dt);
    let x = cam.focus.x + ddx * cam.cur;
    let y = cam.focus.y + ddy * cam.cur;
    let z = cam.focus.z + ddz * cam.cur;
    y = Math.max(y, H(x, z) + 0.45);
    // impulses (subtle; off with Camera Shake, damped by Reduced Motion)
    const shakeK = !S.cameraShake ? 0 : S.reducedMotion ? 0.35 : 1;
    cam.shake = Math.max(0, cam.shake - dt * 2.4);
    cam.kick = Math.max(0, cam.kick - dt * 9);
    const sh = cam.shake * cam.shake * 0.18 * shakeK;
    x += Math.sin(time * 41) * sh;
    y += Math.sin(time * 37 + 1) * sh;
    z += Math.cos(time * 43) * sh;
    const kick = cam.kick * 0.05 * shakeK;
    camera.position.set(x - ddx * kick, y - kick * 0.4, z - ddz * kick);
    camera.lookAt(cam.focus.x, cam.focus.y - kick * 0.6 + 0.05, cam.focus.z);
  }
  const lastLookAt = { v: 0 };

  /* ================================================================ events */
  const surface = region.ground.cover === "snow" ? "snow" : "grass";
  function handleEvents(events) {
    for (const ev of events) {
      const quiet = showcase;
      switch (ev.type) {
        case "swing":
          if (!quiet || Math.random() < 1) sound.axeSwing(ev.style === "down" ? 1.1 : 1);
          break;
        case "hit": {
          const sp = speciesById(ev.species);
          const dist = Math.hypot(ev.x - camera.position.x, ev.z - camera.position.z);
          sound.axeHit(quiet ? 0.5 : 1, 0);
          if (ev.kind === "cut") sound.chopSection();
          const nx = ev.kind === "cut" ? (P.x - ev.x) / Math.max(0.1, Math.hypot(P.x - ev.x, P.z - ev.z)) : ev.nx;
          const nz = ev.kind === "cut" ? (P.z - ev.z) / Math.max(0.1, Math.hypot(P.x - ev.x, P.z - ev.z)) : ev.nz;
          fx.woodHit(ev.x, ev.y, ev.z, nx, nz, sp.wood.fresh, sp.bark.base, 1);
          if (ev.kind === "tree") {
            const t = world.trees.find((x) => x.id === ev.treeId);
            if (t && settings.particles) fx.leaves(t.x, t.y + t.height * 0.75, t.z, leafColors(region, sp), 2);
          }
          if (!quiet && dist < 12) cam.kick = 1;
          break;
        }
        case "treeCreak":
          sound.treeCreak();
          break;
        case "treeFallStart":
          sound.treeFallWhoosh();
          break;
        case "treeLand": {
          const t = world.trees.find((x) => x.id === ev.treeId);
          const sp = speciesById(ev.species);
          const d = Math.hypot(ev.x - P.x, ev.z - P.z);
          sound.treeLand(Math.min(1.2, 0.6 + (t ? t.radius : 0.2)), d);
          if (t && t.lie) {
            const pts = [];
            const L = trunkLen(t);
            for (let k = 1; k <= 4; k++) {
              const s = (L * k) / 4;
              const bx = t.x + Math.sin(t.fallYaw) * s;
              const bz = t.z + Math.cos(t.fallYaw) * s;
              pts.push({ x: bx, y: H(bx, bz) + 0.1, z: bz });
            }
            const top = pts[pts.length - 1];
            top.y += 1;
            fx.treeLand(pts, leafColors(region, sp), region.ground.cover === "snow" ? "#f2f6f9" : "#b7a37f");
          }
          if (d < 18) cam.shake = Math.max(cam.shake, 1 - d / 22);
          break;
        }
        case "logSpawn":
          fx.dust(ev.x, ev.y - 0.15, ev.z, region.ground.cover === "snow" ? "#eef3f6" : "#b7a37f", 2, 0.4);
          sound.logImpact(0.6);
          break;
        case "pickup":
          sound.pickup();
          break;
        case "drop":
          sound.drop();
          fx.dust(ev.x, ev.y - 0.15, ev.z, region.ground.cover === "snow" ? "#eef3f6" : "#b7a37f", 3, 0.5);
          break;
        case "deposit":
          setTimeout(() => !disposed && sound.deposit(), 260);
          break;
        case "load":
          setTimeout(() => !disposed && sound.logImpact(0.8), 250);
          break;
        case "millStart":
          if (!quiet) sound.millStart();
          break;
        case "planks":
          if (!quiet) sound.planks();
          break;
        case "footstep":
          if (!quiet) sound.footstep(ev.run, surface);
          break;
        case "saw":
          if (ev.state === "STARTING") sound.chainsawPull();
          break;
        case "sawBite": {
          const sp = speciesById(ev.species);
          const nx = ev.kind === "cut" ? 0 : ev.nx;
          const nz = ev.kind === "cut" ? 0 : ev.nz;
          fx.sawdust(ev.x, ev.y, ev.z, nx || -Math.sin(P.yaw), nz || -Math.cos(P.yaw), sp.wood.fresh);
          break;
        }
        case "bump":
          sound.bump(ev.power);
          cam.shake = Math.max(cam.shake, 0.35);
          break;
        case "boardUse":
        case "sellUse":
          rigInteract(rig);
          break;
        default:
      }
    }
  }

  /* ================================================================ showcase bot (menu) */
  function showcaseInput(inp, dt) {
    const B = showcaseBot;
    if (!B.tree) {
      // a tree near the yard, in view of the orbit
      let best = null;
      let bd = Infinity;
      for (const t of world.trees) {
        if (t.state !== TS.STANDING || speciesById(t.species).minTier > 1) continue;
        const d = Math.hypot(t.x - (MILL.x - 8), t.z - (MILL.z + 22));
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      B.tree = best;
      if (best) {
        const a = Math.atan2(MILL.x - best.x, MILL.z - best.z);
        P.x = best.x + Math.sin(a) * (best.radius + SWING.ideal);
        P.z = best.z + Math.cos(a) * (best.radius + SWING.ideal);
        P.yaw = Math.atan2(best.x - P.x, best.z - P.z);
        P.y = H(P.x, P.z);
      }
    }
    B.t += dt;
    if (B.t > 1.35) {
      B.t = 0;
      inp.primaryPressed = true;
    }
    const t = B.tree;
    if (t && t.hp < t.maxHp * 0.45) {
      t.hp = t.maxHp * 0.62;
      t.cutProgress = 1 - t.hp / t.maxHp;
    }
    // keep the mill busy
    if (!world.mill.cur && world.mill.queue.length < 2) {
      const sp = speciesById(region.species[0][0]);
      const id = `S${++world.logSeq}`;
      const log = { id, species: sp.id, len: sp.logLen, rA: 0.22, rB: 0.19, r: 0.205, x: MILL.x, z: MILL.z, y: 0, yaw: Math.PI / 2, pitch: 0, roll: 0, v: 0, owner: "PLAYER", holder: null, slot: -1, sleeping: true, sleepT: 0, collected: true, treeId: null };
      world.logs.set(id, log);
      log.owner = "MILL";
      world.mill.queue.push(id);
    }
  }

  /* ================================================================ frame */
  const inp = { mx: 0, mz: 0, ax: 0, ay: 0, sprint: false, brake: false, primaryHeld: false, primaryPressed: false, interactPressed: false, vehiclePressed: false };

  function frame(rawDt, input, live) {
    if (disposed) return;
    const dt = Math.min(0.1, rawDt);
    time += dt;
    WORLD_UNIFORMS.uTime.value = time;
    const paused = live.paused;
    let look = [0, 0];

    if (!showcase && input) {
      look = input.consumeLook();
      if (paused) {
        look = [0, 0];
        input.take("primary");
        input.take("interact");
        input.take("vehicle");
      }
    }

    if (!paused) {
      if (showcase) {
        inp.mx = inp.mz = inp.ax = inp.ay = 0;
        showcaseInput(inp, dt);
      } else {
        const a = input.axes();
        const cy = cam.yaw;
        // camera-relative: forward = (sin yaw, cos yaw); right = (−cos yaw, sin yaw)
        inp.mx = Math.sin(cy) * a.y - Math.cos(cy) * a.x;
        inp.mz = Math.cos(cy) * a.y + Math.sin(cy) * a.x;
        inp.ax = a.x;
        inp.ay = a.y;
        inp.sprint = input.sprint();
        inp.brake = input.brake();
        inp.primaryHeld = input.primaryHeld();
        if (input.take("primary")) inp.primaryPressed = true;
        if (input.take("interact")) inp.interactPressed = true;
        if (input.take("vehicle")) inp.vehiclePressed = true;
      }
      world.inputLocked = false;
      stepWorld(world, inp, dt);
      if (world.events.length) {
        const evs = world.events.slice();
        world.events.length = 0;
        handleEvents(evs);
        if (onEvents) onEvents(evs);
        lastEvents = evs;
      }
    } else {
      inp.primaryHeld = false;
    }

    /* ---- trees */
    for (const t of world.trees) {
      let vis = trees.get(t.id);
      if (vis && vis.variant !== t.variant) {
        disposeTree(vis);
        trees.delete(t.id);
        vis = null;
      }
      if (!vis) {
        addTree(t);
        vis = trees.get(t.id);
      }
      poseTree(vis, time, dt, ctx);
    }

    /* ---- vehicles */
    syncVehicles();
    if (cartVis && world.cart) cartVis.update(world.cart, dt);
    for (const v of world.vehicles) {
      const vis = vehVis.get(v.id);
      if (vis) vis.update(v, dt);
    }

    /* ---- the lumberjack */
    if (rig.toolId !== world.tool.id) setRigTool(rig, world.tool);
    const driving = P.driving ? world.vehicles.find((v) => v.id === P.driving) : null;
    if (driving) {
      const vis = vehVis.get(driving.id);
      const c = Math.cos(driving.yaw);
      const s = Math.sin(driving.yaw);
      const sx = vis.seatX || 0;
      rig.root.position.set(driving.x + vis.seatZ * s + sx * c, driving.y + vis.seatY, driving.z + vis.seatZ * c - sx * s);
      rig.root.rotation.set(0, driving.yaw, 0);
    } else {
      rig.root.position.set(P.x, P.y, P.z);
      rig.root.rotation.set(0, P.yaw, 0);
    }
    rig.root.updateMatrixWorld(true);
    const S = {
      mode: "loco",
      speed: P.speed,
      phase: P.phase,
      dt,
      time,
      ready: 0,
      ground: (lx, lz) => {
        const yaw = rig.root.rotation.y;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        return H(P.x + lx * c + lz * s, P.z - lx * s + lz * c) - P.y;
      },
    };
    if (P.swing && world.tool.kind === "axe") {
      if (P.swing !== lastSwing) {
        lastSwing = P.swing;
        swingId++;
      }
      const W = P.swing;
      let impact = null;
      let trunkC = null;
      if (W.target) {
        const ip = impactPoint(world, W.target);
        impact = toLocal(ip.x, ip.y, ip.z, new THREE.Vector3());
        if (W.target.kind === "tree") {
          // aim a touch into the bark so the edge visibly bites
          const t = W.target.tree;
          trunkC = toLocal(t.x, t.y + CUT_HEIGHT, t.z, new THREE.Vector3());
          impact.lerp(trunkC, Math.min(0.35, 0.04 / Math.max(0.05, t.radius)));
        } else {
          trunkC = impact.clone();
          impact.y -= 0.03;
        }
      }
      S.mode = "swing";
      S.swing = { id: swingId, t: W.t / W.dur, style: W.style, result: W.result, impact, trunkC };
    } else if (P.act) {
      S.mode = "act";
      const A = P.act;
      const logId = A.type === "pickup" ? A.logId : P.carry || (A.type === "take" ? null : null);
      S.act = { type: A.type, k: A.t / A.dur, at: A.at / A.dur, grab: logId ? grabPoints(logId) : P.carry ? grabPoints(P.carry) : null };
    } else if (driving) {
      S.mode = "drive";
      S.drive = { steer: driving.steer };
    } else if (P.pulling && cartVis) {
      S.mode = "pull";
      const L = new THREE.Vector3();
      const R = new THREE.Vector3();
      cartVis.update(world.cart, 0);
      cartVis.handlePoints(world.cart, L, R);
      S.pull = { L: toLocal(L.x, L.y, L.z, L), R: toLocal(R.x, R.y, R.z, R) };
    } else if (P.carry) {
      S.mode = "carry";
      S.carryLog = world.logs.get(P.carry) || { len: 1.8, r: 0.2 };
    } else if (world.tool.kind === "chainsaw" && P.saw.state !== "OFF") {
      S.mode = "saw";
      const cutting = P.saw.state === "CUTTING" && P.lastHit && time - 0 >= 0;
      let target = null;
      let kind = "tree";
      if (P.saw.state === "CUTTING" && P.lastHit) {
        target = toLocal(P.lastHit.x, P.lastHit.y, P.lastHit.z, new THREE.Vector3());
        kind = P.saw.cutting ? P.saw.cutting.kind : "tree";
      }
      S.saw = { state: P.saw.state, t: P.saw.t, cut: cutting && !!target, target, kind };
    }
    if (S.mode === "loco" && world.tool.kind === "axe" && !showcase) {
      const tg = primaryTarget(world, true);
      S.ready = tg && !tg.reason && tg.surface < 2.2 ? 1 : 0;
    }
    if (showcase) S.ready = 1;
    poseLumberjack(rig, S);
    rig.root.visible = true;

    /* ---- logs, mill, effects */
    updateLogs(dt);
    mill.update(dt, world, time, settings.particles ? fx : null, ctx);
    // chainsaw chain scroll
    if (rig.tool && rig.tool.userData.chainTex) rig.tool.userData.chainTex.offset.x -= dt * (P.saw.state === "CUTTING" ? 9 : P.saw.state === "IDLE" ? 2.5 : 0);
    fx.update(dt, camera.position, time, region.weather === "snow" ? 1.4 : 1);
    updateCamera(dt, look);
    // DEV-only inspection camera (visual QA): window.__llCam = { pos:[x,y,z], look:[x,y,z] } relative to the player
    if (import.meta.env.DEV && !showcase && typeof window !== "undefined" && window.__llCam) {
      const o = window.__llCam;
      camera.position.set(P.x + o.pos[0], P.y + o.pos[1], P.z + o.pos[2]);
      camera.lookAt(P.x + o.look[0], P.y + o.look[1], P.z + o.look[2]);
    }
    env.update(showcase ? { x: MILL.x - 4, y: mill.baseY, z: MILL.z + 6 } : cam.focus, camera.position);

    /* ---- continuous audio */
    if (paused || showcase) {
      sound.chainsaw("OFF", false);
      sound.millSaw(0, false, 0);
      sound.conveyor(false, 0);
      sound.engine(false, 0, 0);
    } else {
      sound.chainsaw(world.tool.kind === "chainsaw" ? P.saw.state : "OFF", P.saw.state === "CUTTING");
      const md = Math.hypot(P.x - MILL.x, P.z - MILL.z);
      const near = clamp(1 - (md - 6) / 34, 0.05, 1);
      const c = world.mill.cur;
      sound.millSaw(world.mill.sawSpin, !!c && c.phase === "cut", near);
      sound.conveyor(!!c && (c.phase === "roll" || c.phase === "feed" || c.phase === "out"), near);
      sound.engine(!!driving, driving ? driving.speed : 0, driving ? driving.throttle : 0);
    }

    /* ---- HUD snapshot (read by React at ~8 Hz) */
    if (!showcase) {
      const it = resolveInteraction(world);
      const vr = resolveVehicle(world);
      hud.prompt = it ? { kind: it.kind, label: it.label, sub: it.sub || null, ok: it.ok } : null;
      hud.vehicle = vr ? { kind: vr.kind, label: vr.label } : null;
      const tg = !P.carry && !P.driving && !P.pulling ? primaryTarget(world, true) : null;
      if (tg) {
        const t = tg.tree;
        const sp = speciesById(t.species);
        if (tg.kind === "tree") hud.target = { name: sp.name, kind: "tree", progress: t.cutProgress, valid: tg.valid, reason: tg.reason, inReach: tg.inReach, state: t.state };
        else {
          const c = t.cuts[tg.k];
          hud.target = { name: `${sp.name} trunk`, kind: "cut", progress: c ? 1 - c.hp / c.maxHp : 0, valid: tg.valid, reason: null, inReach: tg.inReach, left: t.cuts.filter((x) => !x.done).length };
        }
      } else hud.target = null;
      hud.tool = world.tool.id;
      hud.carry = !!P.carry;
      hud.driving = driving ? { name: driving.def.name, load: driving.logs.length, cap: driving.cap, speed: Math.abs(driving.speed) } : null;
      hud.pulling = P.pulling;
      hud.saw = P.saw.state;
      hud.cart = world.cart ? { load: world.cart.logs.length, cap: world.cart.cap } : null;
      hud.unloading = !!world.unload;
      live.hud = hud;
    }
  }

  return {
    frame,
    world,
    cam,
    rig,
    fx,
    get lastEvents() {
      return lastEvents;
    },
    /** sawmill upgrades / growth buildings changed → rebuild the yard */
    rebuildMill(prog) {
      mill.dispose();
      mill = buildSawmill(region, world, { shadows, upgrades: prog.sawmillUpgrades, buildings: world.buildings });
      scene.add(mill.group);
    },
    setPixelScale(h) {
      fx.setPixelScale(h);
    },
    resetCamera() {
      cam.yaw = P.yaw;
      cam.pitch = 0.36;
      cam.focus.set(P.x, P.y + 1.55, P.z);
      cam.cur = cam.dist;
    },
    dispose() {
      disposed = true;
      sound.stopLoops();
      env.dispose();
      for (const vis of trees.values()) disposeTree(vis);
      trees.clear();
      treeGroup.removeFromParent();
      mill.dispose();
      rig.root.removeFromParent();
      rig.dispose();
      if (cartVis) cartVis.dispose();
      for (const v of vehVis.values()) v.dispose();
      for (const L of logs.values()) {
        L.mesh.removeFromParent();
        L.mesh.geometry.dispose();
      }
      logs.clear();
      logGroup.removeFromParent();
      fx.dispose();
      scene.fog = null;
      scene.background = null;
    },
  };
}

/** free module-level caches (textures, materials, crown variants) when the game unmounts */
export function disposeRendererCaches() {
  disposeTreeCaches();
  disposeLogMaterials();
  disposeToolCaches();
  disposeTextures();
}

export { radiusAt };
