/**
 * Mario Adventure 3D — the renderer for one world (one level session).
 *
 * Built once per level; frame(dt) then:
 *   1. reads input (or the menu autopilot), advances the engine with a
 *      fixed step, updates the orbit camera
 *   2. drains engine events → sounds, particles, camera shake, HUD callback
 *   3. syncs every moving object (platforms, coins, enemies, boss, shots …)
 *   4. animates Mario and places the THREE camera
 *
 * Fullscreen / resize never rebuild anything. dispose() frees every
 * geometry, material and texture this level created.
 */
import * as THREE from "three";
import { advance } from "../engine/world.js";
import { updateCamera, addShake } from "../engine/camera.js";
import { groundAt } from "../engine/collision.js";
import { firebarBalls } from "../engine/hazards.js";
import { POWER } from "../engine/config.js";
import { createMario } from "./mario.js";
import { createEnvironment } from "./environment.js";
import { buildTerrain } from "./terrainMesh.js";
import { createBank, tex } from "./materials.js";
import {
  createGeoBank,
  createInstancer,
  makePlatform,
  syncPlatform,
  makeBlock,
  syncBlock,
  makePipe,
  makeCoins,
  syncCoins,
  makeCheckpoint,
  syncCheckpoint,
  makeGoal,
  syncGoal,
  makeStar,
  makePickup,
  makeSign,
  makeHazard,
  addDeco,
  makeWaterfall,
} from "./props.js";
import { makeEnemy, animateEnemy, alertMaterial } from "./enemyModels.js";
import { createEffects, createBlobShadow } from "./effects.js";
import { makeBoss, animateBoss } from "./bossModels.js";
import { sound } from "../audio/sound.js";

const SHOT_STYLE = {
  cannonball: ["#26262c", 0.35, 0.6],
  fireball: ["#ff8a1f", 1.4, 0.6],
  wisp: ["#ff5a1f", 1.6, 0.6],
  snowball: ["#ffffff", 0.15, 0.9],
  bubble: ["#8fe3ff", 0.5, 0.2],
  rock: ["#8a6a4a", 0.1, 0.9],
  sand: ["#e8c27a", 0.2, 0.9],
  ice: ["#bfe9ff", 0.5, 0.2],
  beam: ["#ff3a1f", 2, 0.5],
};

export function createGameRenderer({ scene, camera, gl, W, world, settingsRef, mode = "game", onEvent, autopilot }) {
  const quality = settingsRef.current.graphics || "medium";
  const shadows = quality !== "low";
  gl.shadowMap.enabled = shadows;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.05;

  const bank = createBank();
  const G = createGeoBank();
  const root = new THREE.Group();
  root.name = "level";
  scene.add(root);
  const ground = (x, z, fb = 0) => {
    const h = W.terrain.height(x, z);
    return Number.isFinite(h) ? h : fb;
  };
  const ctx = { bank, G, world, shadows, root, ground, alertMat: alertMaterial() };

  const env = createEnvironment(scene, world, { shadows, quality, sea: W.sea });
  const detailMap = tex("detail");
  const terrain = buildTerrain(W.terrain, world, { seaY: W.sea.y, detailMap, castShadow: false });
  root.add(terrain.group);

  /* static + dynamic props */
  const platViews = W.platforms.map((pl) => {
    const o = makePlatform(pl, ctx);
    root.add(o);
    return o;
  });
  const blockViews = W.blocks.map((b) => {
    const o = makeBlock(b, ctx);
    root.add(o);
    return o;
  });
  const pipeViews = W.pipes.map((p) => {
    const o = makePipe(p, ctx);
    root.add(o);
    return o;
  });
  const coinView = makeCoins(W.coins, ctx);
  root.add(coinView.group);
  const cpViews = W.checkpoints.map((c) => {
    const o = makeCheckpoint(c, ctx);
    root.add(o);
    return o;
  });
  const goalView = W.goal ? makeGoal(W.goal, ctx) : null;
  if (goalView) root.add(goalView);
  const starView = W.star ? makeStar(ctx, true) : null;
  if (starView) root.add(starView);
  for (const s of W.signs) root.add(makeSign(s, ctx));
  const hazViews = W.hazards.map((h) => {
    const o = makeHazard(h, ctx);
    root.add(o);
    return o;
  });
  const enemyViews = W.enemies.map((e) => {
    const o = makeEnemy(e, ctx);
    root.add(o);
    return o;
  });
  const bossView = W.boss ? makeBoss(W.boss, ctx) : null;
  if (bossView) root.add(bossView);
  const pickupViews = new Map();

  const I = createInstancer(shadows);
  const falls = [];
  for (const d of W.level.deco || []) {
    if (d.t === "waterfall") falls.push(makeWaterfall(d, ctx));
    else addDeco(I, d, ctx);
  }
  for (const f of falls) root.add(f);
  I.build(root);

  /* Mario */
  const mario = createMario({ shadows });
  root.add(mario.root);
  const blob = createBlobShadow();
  root.add(blob.mesh);
  const magnetRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 6, 40), new THREE.MeshBasicMaterial({ color: POWER.magnet.color, transparent: true, opacity: 0.6, depthWrite: false }));
  magnetRing.rotation.x = Math.PI / 2;
  magnetRing.visible = false;
  root.add(magnetRing);

  const fx = createEffects(scene, { reduced: () => !!settingsRef.current.reducedMotion });

  /* projectiles + shock rings (pooled per id) */
  const shotGeo = new THREE.SphereGeometry(1, 16, 12);
  const shotMats = {};
  const shotViews = new Map();
  const ringGeo = new THREE.TorusGeometry(1, 0.22, 6, 48);
  const ringMat = new THREE.MeshStandardMaterial({ color: world.key === "lava" ? "#ff7a1f" : world.key === "snow" ? "#d8f2ff" : "#e8d2a8", emissive: world.key === "lava" ? "#ff3a00" : "#000000", emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
  const ringViews = new Map();

  let paused = false;
  let t = 0;
  let stepDist = 0;
  let auraT = 0;
  let starMusic = false;
  const focus = { x: 0, y: 0, z: 0 };
  const menuCam = { a: 0 };

  function handleEvents() {
    const evs = W.events;
    if (!evs.length) return;
    W.events = [];
    const p = W.player;
    const cam = W.cam;
    const shake = settingsRef.current.reducedMotion ? 0.3 : 1;
    for (const ev of evs) {
      switch (ev.type) {
        case "jump":
          sound.jump(ev.double);
          if (!ev.double) fx.burst("dust", p.x, p.y, p.z, { n: 5, spd: 1.6, size: 0.14, color: dustColor() });
          else fx.burst("aura", p.x, p.y + 0.5, p.z, { color: "#ffffff" });
          break;
        case "land":
          sound.land(ev.impact, ev.surf);
          if (ev.impact > 6) fx.burst("dust", p.x, p.y, p.z, { n: Math.min(10, 3 + ev.impact / 3), spd: 1.5 + ev.impact / 10, color: dustColor() });
          if (ev.impact > 22) addShake(cam, 0.25 * shake);
          break;
        case "coin":
          sound.coin();
          fx.burst("coin", ev.x, ev.y, ev.z);
          break;
        case "stomp":
          sound.stomp();
          fx.burst("stomp", ev.x, ev.y, ev.z);
          break;
        case "enemyShell":
          sound.shell();
          break;
        case "enemyDefeat":
          sound.defeat();
          fx.burst("poof", ev.e.x, ev.e.y + 0.4, ev.e.z);
          break;
        case "hurt":
          sound.hurt();
          fx.burst("hurt", p.x, p.y, p.z);
          addShake(cam, 0.35 * shake);
          break;
        case "die":
          sound.die();
          sound.stopMusic();
          break;
        case "fall":
          sound.fall();
          break;
        case "splash":
          sound.splash();
          fx.burst("splash", ev.x, ev.y, ev.z, { color: world.key === "lava" ? "#ff8a1f" : "#e0f6ff" });
          break;
        case "lavaBurn":
          sound.fire();
          sound.hurt();
          fx.burst("fire", p.x, p.y, p.z);
          break;
        case "respawn":
          fx.burst("poof", p.x, p.y + 0.5, p.z, { color: "#ffffff" });
          break;
        case "checkpoint":
          sound.checkpoint();
          fx.burst("checkpoint", ev.x, ev.y, ev.z);
          break;
        case "hiddenStar":
          sound.hiddenStar();
          fx.burst("star", ev.x, ev.y, ev.z);
          break;
        case "powerup":
          sound.powerup(ev.power);
          fx.burst("powerup", p.x, p.y + 0.8, p.z, { color: POWER[ev.power].color });
          break;
        case "powerEnd":
          sound.powerEnd();
          break;
        case "heart":
          sound.heart();
          fx.burst("powerup", p.x, p.y + 0.8, p.z, { color: "#ff3b5c" });
          break;
        case "blockBump":
          sound.block(ev.empty);
          if (!ev.empty) fx.burst("block", ev.b.x, ev.b.y, ev.b.z);
          break;
        case "itemSprout":
          sound.sprout();
          break;
        case "headBonk":
          sound.bonk();
          break;
        case "spring":
          sound.spring();
          if (ev.solid.owner) ev.solid.owner.squash = 1;
          fx.burst("dust", p.x, p.y, p.z, { n: 6, spd: 2.5 });
          break;
        case "pipe":
        case "pipeOut":
          sound.pipe();
          break;
        case "secret":
        case "secretArea":
          sound.secret();
          break;
        case "goal":
          sound.goal();
          sound.stopMusic();
          break;
        case "victory":
          for (let i = 0; i < 3; i++) fx.burst("firework", p.x + (i - 1) * 3, p.y + 6 + i, p.z + 2, { color: ["#ffd21f", "#ff5a7a", "#5ee7ff"][i] });
          break;
        case "complete":
          sound.complete();
          break;
        case "gameover":
          sound.gameover();
          break;
        case "enemyAlert":
          sound.enemyAlert();
          break;
        case "enemyHop":
          sound.enemyHop();
          break;
        case "enemySwoop":
          sound.swoop();
          break;
        case "enemyCharge":
          sound.charge();
          fx.burst("dust", ev.e.x, ev.e.y, ev.e.z, { n: 6, color: dustColor() });
          break;
        case "enemyWindup":
          sound.warn();
          break;
        case "enemyBonk":
          sound.stomp();
          fx.burst("stomp", ev.e.x, ev.e.y + 1, ev.e.z);
          break;
        case "platformShake":
          sound.crack();
          break;
        case "crusherWarn":
          sound.warn();
          break;
        case "crusherSlam":
          sound.crush();
          fx.burst("dust", ev.h.solid.x, ev.h.low, ev.h.solid.z, { n: 12, spd: 4, size: 0.3, color: dustColor() });
          if (Math.hypot(p.x - ev.h.solid.x, p.z - ev.h.solid.z) < 14) addShake(cam, 0.3 * shake);
          break;
        case "cannonFire": {
          const d = ev.h.def;
          sound.cannon();
          fx.burst("poof", d.x + Math.sin(d.yaw || 0) * 1.2, d.y + 1.4, d.z + Math.cos(d.yaw || 0) * 1.2, { color: "#cccccc" });
          break;
        }
        case "icicleShake":
          sound.crack();
          break;
        case "icicleBreak":
          sound.shatter();
          fx.burst("break", ev.h.def.x, ev.y + 0.2, ev.h.def.z);
          break;
        case "geyser":
          sound.fire();
          break;
        case "shotBurst":
          if (!ev.quiet) fx.burst(ev.s.kind === "fireball" || ev.s.kind === "wisp" ? "fire" : ev.s.kind === "snowball" || ev.s.kind === "ice" ? "break" : "poof", ev.s.x, ev.s.y, ev.s.z);
          break;
        case "bossShoot":
          sound.shoot();
          break;
        case "bossSlam":
          sound.slam();
          fx.burst("shock", ev.x, ev.y, ev.z, { color: dustColor() });
          addShake(cam, 0.45 * shake);
          break;
        case "bossHit":
          sound.bossHit();
          fx.burst("stomp", ev.x, ev.y, ev.z);
          addShake(cam, 0.3 * shake);
          break;
        case "bossRoar":
          sound.bossRoar();
          addShake(cam, 0.2 * shake);
          break;
        case "bossDefeat":
          sound.bossDefeat();
          for (let i = 0; i < 4; i++) fx.burst("firework", ev.x + (i - 1.5) * 2.5, ev.y + 3 + i, ev.z, { color: ["#ffd21f", "#ff5a7a", "#5ee7ff", "#7dff6a"][i] });
          break;
        case "bossDazed":
          sound.enemyAlert();
          break;
        case "bossWarn":
          sound.warn();
          break;
        case "goalReveal":
          sound.secret();
          if (W.goal) fx.burst("star", W.goal.x, W.goal.y + 4, W.goal.z);
          break;
        case "bossEmber":
          fx.burst("ember", ev.x, ev.y, ev.z);
          break;
        case "bossPoof":
          fx.burst("poof", ev.x, ev.y, ev.z, { color: "#ffffff" });
          fx.burst("star", ev.x, ev.y + 1, ev.z);
          break;
        default:
      }
      if (onEvent) onEvent(ev);
    }
  }
  const dustColor = () => (world.key === "snow" ? "#ffffff" : world.key === "desert" ? "#f2d49a" : world.key === "lava" ? "#5a4a4a" : world.key === "ocean" ? "#f7e8c0" : "#e9e1cf");

  function syncShots() {
    const seen = new Set();
    for (const s of W.shots) {
      if (s.dead) continue;
      seen.add(s.id);
      let v = shotViews.get(s.id);
      if (!v) {
        const st = SHOT_STYLE[s.kind] || SHOT_STYLE.cannonball;
        let m = shotMats[s.kind];
        if (!m) m = shotMats[s.kind] = new THREE.MeshStandardMaterial({ color: st[0], emissive: st[1] > 0.4 ? st[0] : "#000000", emissiveIntensity: st[1], roughness: st[2], transparent: s.kind === "bubble", opacity: s.kind === "bubble" ? 0.6 : 1 });
        v = new THREE.Mesh(shotGeo, m);
        v.castShadow = shadows;
        root.add(v);
        shotViews.set(s.id, v);
      }
      v.position.set(s.x, s.y, s.z);
      v.scale.setScalar(s.r);
      v.rotation.x += 0.1;
      if ((s.kind === "fireball" || s.kind === "wisp") && Math.random() < 0.5) fx.burst("ember", s.x, s.y, s.z);
    }
    for (const [id, v] of shotViews) {
      if (!seen.has(id)) {
        root.remove(v);
        shotViews.delete(id);
      }
    }
    const rs = new Set();
    W.rings.forEach((g, i) => {
      if (g.dead) return;
      const key = g.id ?? i;
      g.id = key;
      rs.add(key);
      let v = ringViews.get(key);
      if (!v) {
        v = new THREE.Mesh(ringGeo, ringMat);
        v.rotation.x = Math.PI / 2;
        root.add(v);
        ringViews.set(key, v);
      }
      v.position.set(g.x, g.y + 0.25, g.z);
      v.scale.set(g.r, g.r, 1.6);
    });
    for (const [k, v] of ringViews) {
      if (!rs.has(k)) {
        root.remove(v);
        ringViews.delete(k);
      }
    }
  }

  const balls = [];
  function syncWorld(dt) {
    W.platforms.forEach((pl, i) => syncPlatform(platViews[i], pl, t));
    W.blocks.forEach((b, i) => syncBlock(blockViews[i], b));
    pipeViews.forEach((v) => {
      if (v.userData.ring) {
        v.userData.ring.rotation.z = t;
        v.userData.ring.material.opacity = 0.35 + Math.sin(t * 3) * 0.2;
      }
    });
    syncCoins(coinView, W.coins, t);
    for (const f of falls) {
      f.userData.tex.offset.y = -t * 0.9;
      if (dt > 0 && Math.random() < 0.3) {
        const d = f.userData.d;
        fx.burst("trail", d.x + (Math.random() - 0.5) * d.w, d.y + 0.2, d.z + 0.6, { color: "#ffffff" });
      }
    }
    W.checkpoints.forEach((c, i) => syncCheckpoint(cpViews[i], c, t));
    if (goalView) syncGoal(goalView, W.goal, W, t);
    if (starView) {
      const s = W.star;
      starView.visible = !s.taken;
      starView.position.set(s.x, s.y + Math.sin(t * 2) * 0.15, s.z);
      starView.userData.star.rotation.y = t * 2.2;
      if (starView.userData.halo) {
        starView.userData.halo.lookAt(camera.position);
        starView.userData.halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      }
      if (!s.taken && Math.random() < 0.15) fx.burst("aura", s.x, s.y - 0.6, s.z, { color: "#fff3a0" });
    }
    // pickups (some appear mid-level from ? blocks)
    for (const k of W.pickups) {
      let v = pickupViews.get(k);
      if (!v) {
        v = makePickup(k.type, ctx);
        root.add(v);
        pickupViews.set(k, v);
      }
      v.visible = !k.taken;
      if (k.taken) continue;
      const rise = k.rise > 0 && k.rise < 1 ? (k.rise - 1) * 1.1 : 0;
      v.position.set(k.x, k.y + rise + Math.sin(t * 2.5 + k.idx) * 0.12, k.z);
      v.userData.core.rotation.y = t * 2;
      v.userData.shell.scale.setScalar(1 + Math.sin(t * 4) * 0.04);
    }
    for (const [k, v] of pickupViews) {
      if (!W.pickups.includes(k)) {
        root.remove(v);
        pickupViews.delete(k);
      }
    }
    W.hazards.forEach((h, i) => {
      const v = hazViews[i];
      if (h.kind === "firebar") {
        firebarBalls(h, balls);
        v.userData.balls.forEach((m, k) => {
          const b = balls[k];
          if (b) m.position.set(b[0], b[1], b[2]);
          m.scale.setScalar(1 + Math.sin(t * 20 + k) * 0.1);
        });
      } else if (h.kind === "crusher") {
        v.position.set(h.solid.x, h.solid.y, h.solid.z);
        if (h.state === "warn") v.position.x += Math.sin(t * 60) * 0.06;
        const w = v.userData.warn;
        w.material.opacity = h.state === "warn" ? 0.45 : h.state === "up" ? 0.18 : 0.3;
      } else if (h.kind === "icicle") {
        v.visible = h.state !== "gone";
        v.position.y = h.y;
        v.position.x = h.def.x + (h.state === "shake" ? Math.sin(t * 50) * 0.05 : 0);
      } else if (h.kind === "geyser") {
        const c = v.userData.column;
        c.visible = h.state === "erupt";
        c.scale.set(1 + Math.sin(t * 25) * 0.05, 1, 1 + Math.cos(t * 25) * 0.05);
        v.userData.pool.scale.setScalar(h.state === "warn" ? 1 + Math.sin(t * 30) * 0.15 : 1);
        if (h.state === "warn" && Math.random() < 0.3) fx.burst(world.key === "lava" ? "ember" : "aura", h.def.x, h.def.y + 0.4, h.def.z);
      } else if (h.kind === "cannon") {
        const k = h.st < 0.15 ? 1 - h.st / 0.15 : 0;
        v.userData.barrel.position.z = 0.3 - k * 0.25;
      }
    });
    W.enemies.forEach((e, i) => animateEnemy(enemyViews[i], e, t));
    if (bossView) {
      animateBoss(bossView, W.boss, W, t);
      if (W.boss.state === "burrow" && dt > 0 && Math.random() < 0.5) fx.burst("step", W.boss.x, W.boss.y, W.boss.z, { color: dustColor() });
    }
    syncShots();
  }

  function syncMario(dt) {
    const p = W.player;
    mario.root.position.set(p.x, p.y, p.z);
    mario.root.rotation.y = p.yaw;
    const anim = p.dead ? "dead" : p.anim;
    mario.animate({ ...p, anim }, dt, { t, power: W.power, reduced: !!settingsRef.current.reducedMotion });
    if (p.dead) mario.root.rotation.y = W.cam.yaw + Math.PI;
    // blob shadow on whatever is underneath
    const th = W.terrain.height(p.x, p.z);
    const sg = groundAt(W.solids, p.x, p.z, 0.15, p.y - 40, p.y + 0.15);
    let gy = Number.isFinite(th) && th <= p.y + 0.15 ? th : -Infinity;
    if (sg > gy) gy = sg;
    blob.place(p.x, gy, p.z, p.y - gy);
    blob.mesh.visible = blob.mesh.visible && !p.dead && !p.pipe;
    // footsteps
    if (p.grounded && (p.anim === "walk" || p.anim === "run")) {
      stepDist += p.speed * dt;
      const stride = p.anim === "run" ? 1.5 : 1.15;
      if (stepDist > stride) {
        stepDist = 0;
        sound.step(p.surf);
        if (p.anim === "run") fx.burst("step", p.x, p.y, p.z, { color: dustColor() });
      }
    }
    // power auras
    auraT += dt;
    const pw = W.power;
    magnetRing.visible = pw.magnet > 0;
    if (magnetRing.visible) {
      magnetRing.position.set(p.x, p.y + 0.8 + Math.sin(t * 3) * 0.3, p.z);
      magnetRing.rotation.z = t * 3;
      magnetRing.material.opacity = pw.magnet < 2.5 ? (Math.floor(t * 8) % 2 ? 0.15 : 0.6) : 0.6;
    }
    if (auraT > 0.05) {
      auraT = 0;
      if (pw.speed > 0 && p.speed > 2) fx.burst("trail", p.x, p.y, p.z, { color: POWER.speed.color });
      if (pw.jump > 0) fx.burst("aura", p.x, p.y, p.z, { color: POWER.jump.color });
      if (pw.star > 0) fx.burst("aura", p.x, p.y, p.z, { color: ["#ff5a7a", "#ffd21f", "#5ee7ff", "#7dff6a"][Math.floor(t * 10) % 4] });
    }
    // star power has its own music
    const starNow = pw.star > 0;
    if (starNow !== starMusic && mode === "game") {
      starMusic = starNow;
      if (onEvent) onEvent({ type: "starMusic", on: starNow });
    }
  }

  function placeCamera() {
    const c = W.cam;
    if (mode === "menu") {
      const p = W.player;
      menuCam.a += 0.0016;
      const r = 9.5;
      camera.position.set(p.x + Math.sin(menuCam.a * 3 + 2.2) * r, p.y + 3.2, p.z + Math.cos(menuCam.a * 3 + 2.2) * r);
      camera.lookAt(p.x, p.y + 1.6, p.z);
      focus.x = p.x;
      focus.y = p.y;
      focus.z = p.z;
      return;
    }
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(c.tx, c.ty, c.tz);
    if (Math.abs(camera.fov - c.fov) > 0.01) {
      camera.fov = c.fov;
      camera.updateProjectionMatrix();
    }
    focus.x = W.player.x;
    focus.y = W.player.y;
    focus.z = W.player.z;
  }

  // first frame: camera already behind Mario
  placeCamera();

  return {
    W,
    mario,
    frame(dt, input) {
      dt = Math.min(dt, 0.1);
      t += dt;
      if (!paused) {
        let raw;
        let look = [0, 0];
        let wheel = 0;
        if (mode === "menu" && autopilot) raw = autopilot(W, dt);
        else if (input) {
          raw = input.frame();
          look = input.consumeLook();
          wheel = input.consumeWheel ? input.consumeWheel() : 0;
        } else raw = { ax: 0, ay: 0 };
        advance(W, raw, dt);
        const s = settingsRef.current;
        if (mode !== "menu") updateCamera(W.cam, W, look[0], look[1], wheel, dt, { sensitivity: s.sensitivity, invertY: s.invertY, assist: s.camAssist !== false });
        handleEvents();
      }
      syncWorld(paused ? 0 : dt);
      syncMario(paused ? 0 : dt);
      if (!paused) fx.update(dt);
      env.update(dt, focus);
      if (world.key === "lava" && !paused && Math.random() < 0.25) {
        const p = W.player;
        fx.burst("ember", p.x + (Math.random() - 0.5) * 30, W.sea.y + 0.5, p.z + (Math.random() - 0.5) * 30);
      }
      if (world.key === "snow" && !paused && Math.random() < 0.5 && !settingsRef.current.reducedMotion) {
        const p = W.player;
        fx.burst("snow", p.x + (Math.random() - 0.5) * 26, p.y + 9, p.z + (Math.random() - 0.5) * 26);
      }
      placeCamera();
    },
    setPaused(p) {
      paused = !!p;
    },
    snapCamera() {
      placeCamera();
    },
    dispose() {
      scene.remove(root);
      env.dispose();
      terrain.dispose();
      fx.dispose();
      blob.dispose();
      mario.dispose();
      magnetRing.geometry.dispose();
      magnetRing.material.dispose();
      shotGeo.dispose();
      for (const m of Object.values(shotMats)) m.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      ctx.alertMat.userData.tex.dispose();
      ctx.alertMat.dispose();
      root.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      bank.dispose();
      G.dispose();
    },
  };
}
