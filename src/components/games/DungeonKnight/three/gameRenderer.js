/**
 * Dungeon Knight — per-canvas orchestrator. Owns every Three object of the
 * playing view and, each frame:
 *
 *   input → engine (fixed steps, clamped dt, hit-stop) → events (audio,
 *   particles, camera kicks, HUD / progress callbacks) → camera → knight
 *   pose → enemy poses + telegraphs → room animation → effects
 *
 * setWorld() swaps rooms in place (old room + enemies disposed, new ones
 * built) — the WebGL context, loop and listeners live for the whole run.
 * React never re-renders per frame: bars and prompts are written to DOM
 * nodes through `hooks.onFrame`.
 */
import * as THREE from "three";
import { stepWorld, drainEvents, bossOf } from "../engine/world.js";
import { createCamera, updateCamera, snapCamera, kick, CAM } from "../engine/camera.js";
import { buildRoomMeshes } from "./roomMeshes.js";
import { createKnightView, refreshKnightView, updateKnightView, swordEnds } from "./knightView.js";
import { createEnemyView, updateEnemyView, disposeEnemyView } from "./enemies.js";
import { createEffects } from "./effects.js";
import { themeOf } from "../data/themes.js";
import { applyEnvironment, releaseEnvironment } from "./materials.js";
import { itemById } from "../data/items.js";
import { sound } from "../audio/sound.js";

const HIT_FX = { soft: "slime", bone: "bone", armor: "armor", stone: "stone" };
const DEATH_COL = { slime: "#4fd0a8", skeleton: "#cfc6b0", shieldSkel: "#cfc6b0", bat: "#3a2a30", spider: "#2a2626", mage: "#6a5aa0", darkKnight: "#2a2a35", golem: "#7a746a" };

export function createGameRenderer({ scene, camera, gl, settingsRef, hooks = {} }) {
  const settings = settingsRef.current;
  const quality = settings.graphics;
  const shadows = settings.shadows !== "off" && quality !== "low";
  gl.shadowMap.enabled = shadows;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.15;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  applyEnvironment(gl, scene, 0.32);

  /* ---------------- lights (re-tinted per dungeon) */
  const hemi = new THREE.HemisphereLight("#5a6a8f", "#2a1e16", 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight("#ffd9a8", 0.9);
  key.position.set(4, 16, -6);
  scene.add(key, key.target);
  if (shadows) {
    key.castShadow = true;
    const size = settings.shadows === "high" && quality === "high" ? 2048 : settings.shadows === "high" ? 1536 : 1024;
    key.shadow.mapSize.set(size, size);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 3;
  }
  // a soft warm lantern-glow that follows the knight (readability in dark corners)
  const fill = new THREE.PointLight("#ffd8b0", 2.2, 10, 1.6);
  scene.add(fill);

  const fx = createEffects(scene, { particles: settings.particles, quality, reducedMotion: settings.reducedMotion });
  const cam = createCamera(0);
  camera.near = 0.08;
  camera.far = 80;
  camera.fov = CAM.FOV;
  camera.updateProjectionMatrix();

  let W = null;
  let room = null;
  let knight = null;
  let theme = themeOf("cellar");
  const enemyViews = new Map();
  let paused = false;
  let time = 0;
  let lastPhase = 0;
  const hilt = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function clearRoom() {
    if (room) room.dispose();
    room = null;
    for (const v of enemyViews.values()) disposeEnemyView(v);
    enemyViews.clear();
    fx.clear();
  }

  function setWorld(world, equipped) {
    clearRoom();
    W = world;
    theme = themeOf(W.dungeon.theme);
    scene.background = new THREE.Color(theme.bg);
    scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar + (W.layout.big ? 8 : 0));
    hemi.color.set(theme.hemiSky);
    hemi.groundColor.set(theme.hemiGround);
    hemi.intensity = theme.hemi;
    key.color.set(theme.key);
    key.intensity = theme.keyI;
    const span = Math.max(W.geo.hx, W.geo.hz) + 3;
    if (shadows) {
      const sc = key.shadow.camera;
      sc.left = -span;
      sc.right = span;
      sc.top = span;
      sc.bottom = -span;
      sc.near = 1;
      sc.far = 40;
      sc.updateProjectionMatrix();
    }
    key.position.set(span * 0.3, 18, -span * 0.4);
    key.target.position.set(0, 0, 0);
    room = buildRoomMeshes(W, theme, quality, { shadows });
    scene.add(room.group);
    if (!knight) {
      knight = createKnightView(equipped, shadows);
      scene.add(knight.rig.root);
    } else refreshKnightView(knight, equipped, scene);
    knight.rig.gait.lastX = null;
    for (const e of W.enemies) {
      const v = createEnemyView(e, W.dungeon.theme, { shadows });
      scene.add(v.root, v.tele);
      enemyViews.set(e.uid, v);
    }
    snapCamera(cam, W, W.player.yaw, settingsRef.current);
    applyCamera(0);
  }

  function setEquipment(equipped) {
    if (knight) refreshKnightView(knight, equipped, scene);
  }

  function applyCamera() {
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(cam.lx, cam.ly, cam.lz);
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
  }

  /* ---------------- events → presentation */
  function handleEvents(events) {
    const s = settingsRef.current;
    const p = W.player;
    for (const e of events) {
      switch (e.type) {
        case "swing":
          sound.swing(e.heavy);
          break;
        case "hit": {
          sound.hit(e.sound, e.heavy, e.killed);
          fx.hit(e.x, e.y, e.z, e.family === "slime" ? "slime" : HIT_FX[e.sound] || "soft", e.heavy, p.yaw);
          kick(cam, e.heavy ? 0.9 : 0.45, s, Math.random() - 0.5, -1);
          break;
        }
        case "enemyBlock":
          sound.enemyShield();
          fx.sparks(e.x, e.y, e.z, "#ffd27a", 20);
          kick(cam, 0.35, s, 0.5, -0.4);
          break;
        case "clank":
          sound.clank();
          fx.sparks(e.x, e.y, e.z, "#ffe6b8", 12);
          kick(cam, 0.25, s, 0.4, -0.2);
          break;
        case "enemyTele":
          sound.telegraph(e.enemy, e.boss);
          break;
        case "enemyAttack":
          sound.enemySwing(e.kind, e.boss);
          break;
        case "slam":
          sound.slam();
          fx.slam(e.x, e.z, e.r, theme.accent);
          kick(cam, 0.6, s, 0, -1);
          break;
        case "playerHurt":
          sound.hurt();
          kick(cam, 1.0, s, (Math.random() - 0.5) * 1.4, -0.8);
          fx.burst(p.x, 1.2, p.z, "#ff6a5a");
          break;
        case "block": {
          sound.block(e.hp > 0);
          knight.rig.arms.L.hand.getWorldPosition(tmp);
          fx.sparks(tmp.x + Math.sin(p.yaw) * 0.2, tmp.y + 0.1, tmp.z + Math.cos(p.yaw) * 0.2, "#ffd27a", 16);
          kick(cam, 0.5, s, 0, -0.6);
          break;
        }
        case "guardBreak":
          sound.guardBreak();
          knight.rig.arms.L.hand.getWorldPosition(tmp);
          fx.sparks(tmp.x, tmp.y, tmp.z, "#ffb04a", 34);
          kick(cam, 1.2, s, 0.8, -0.8);
          break;
        case "dodge":
          sound.dodge();
          fx.dust(p.x, p.z, 8, theme.floor, 0.8);
          break;
        case "evade":
          sound.evade();
          fx.evade(p.x, p.z);
          break;
        case "notice":
          sound.notice();
          break;
        case "enemyDeath": {
          sound.enemyDeath(e.enemy);
          fx.death(e.x, e.z, DEATH_COL[e.enemy] || theme.trim, e.boss);
          if (e.gold) fx.goldBurst(e.x, e.z);
          if (e.boss) {
            sound.bossDefeat();
            kick(cam, 1.4, s, 0, -1);
          }
          break;
        }
        case "roomClear":
          sound.roomClear();
          if (e.boss) sound.music("dungeon");
          break;
        case "doorsOpen":
          setTimeout(() => sound.door(true), 250);
          break;
        case "doorsClose":
          sound.door(false);
          break;
        case "fightStart":
          if (e.boss) {
            sound.bossIntro();
            sound.music("boss");
          }
          break;
        case "bossPhase":
          kick(cam, 0.8, s, 0, -1);
          sound.bossIntro();
          break;
        case "chestAppear":
          if (W.chest) fx.dust(W.chest.x, W.chest.z, 14, theme.floor, 1.2);
          sound.door(true);
          break;
        case "chestOpen":
          sound.chest();
          fx.loot(e.x, 0.6, e.z);
          break;
        case "shrine":
          sound.shrine();
          if (W.shrine) fx.shrine(p.x, p.z);
          break;
        case "potion":
          sound.potion();
          fx.heal(p.x, p.z);
          break;
        case "potionEmpty":
        case "potionFull":
          sound.deny();
          break;
        case "noStamina":
          sound.noStamina();
          break;
        case "playerDeath":
          sound.death();
          sound.music(null);
          break;
        case "orbBurst":
          sound.orbBurst();
          fx.burst(e.x, e.y, e.z, theme.accent);
          break;
        default:
          break;
      }
      if (hooks.onEvent) hooks.onEvent(e);
    }
  }

  /* ---------------- per-frame */
  function frame(rawDt, input) {
    if (!W) return;
    const dt = Math.min(Number.isFinite(rawDt) ? rawDt : 0, 0.05);
    time += dt;
    const s = settingsRef.current;
    const boss = bossOf(W);
    let look = [0, 0];
    if (!paused) {
      look = input.consumeLook();
      const raw = input.frame(cam.yaw);
      stepWorld(W, dt, raw);
      handleEvents(drainEvents(W));
    } else input.consumeLook();
    updateCamera(cam, W, look[0], look[1], paused ? 0 : dt, {
      sensitivity: s.mouseSensitivity, invertY: s.invertY, touch: input.isTouch, boss: !!boss && !boss.dead, settings: s,
    });
    applyCamera();

    // knight
    const p = W.player;
    updateKnightView(knight, p, paused ? 0 : dt, time);
    // footsteps from the stride phase
    const ph = knight.rig.gait.phase;
    if (!paused && knight.rig.gait.amp > 0.4 && (Math.floor(ph * 2) !== Math.floor(lastPhase * 2))) {
      sound.step(p.sprinting, W.dungeon.theme === "frozen" ? "ice" : W.dungeon.theme === "crypt" ? "moss" : "stone");
      if (p.sprinting) fx.dust(p.x, p.z, 2, theme.floor, 0.4);
    }
    lastPhase = ph;
    // sword trail during the swing
    if (p.act && p.act.type === "attack" && p.act.t >= p.act.su * 0.6 && p.act.t <= p.act.su + p.act.ac + 0.05 && swordEnds(knight, hilt, tip)) {
      const w = itemById(knight.equipped.weapon);
      fx.trailPush(hilt.x, hilt.y, hilt.z, tip.x, tip.y, tip.z, (w && w.look.glow) || (p.act.name === "heavy" ? "#ffd9a8" : "#d8ecff"));
    }
    fill.position.set(p.x, 3.4, p.z);

    // enemies
    for (const e of W.enemies) {
      const v = enemyViews.get(e.uid);
      if (v) updateEnemyView(v, W, camera, time, paused ? 0 : dt);
    }
    fx.syncOrbs(W.projectiles);
    room.update(W, time, paused ? 0 : dt);
    fx.update(paused ? 0 : dt);
    if (hooks.onFrame) hooks.onFrame(W, cam, camera);
  }

  function resize(w, h) {
    fx.setScale(h * gl.getPixelRatio(), camera.fov);
  }

  return {
    setWorld,
    setEquipment,
    frame,
    resize,
    setPaused(v) {
      paused = !!v;
    },
    get world() {
      return W;
    },
    get cam() {
      return cam;
    },
    snap() {
      if (W) snapCamera(cam, W, W.player.yaw, settingsRef.current);
    },
    levelUp() {
      if (W) fx.levelUp(W.player.x, W.player.z);
    },
    dispose() {
      clearRoom();
      if (knight) knight.rig.root.removeFromParent();
      fx.dispose();
      scene.remove(hemi, key, key.target, fill);
      scene.environment = null;
      releaseEnvironment(gl);
      key.dispose();
      fill.dispose();
      hemi.dispose();
    },
  };
}
