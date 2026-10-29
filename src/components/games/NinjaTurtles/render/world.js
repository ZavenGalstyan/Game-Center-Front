/**
 * Plain Three.js view of a Game: scene + lights + scenery, one model per
 * actor (created/removed as the sim spawns/despawns them), blob shadows,
 * enemy health bars, "!" alert markers, telegraph rings, the Shredder's
 * dash lane, weapon swipe arcs, pooled particles and shock rings, and the
 * smoothed third-person camera (the sim decides how far back it may sit).
 */
import * as THREE from "three";
import { buildCharacter, poseCharacter, buildDummy } from "./characters.js";
import { buildScenery, buildItem } from "./scenery.js";
import { ENEMIES, SPECIAL_DUR, DODGE } from "../data/turtles.js";
import { cameraClear } from "../engine/world.js";

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const blobTexture = () =>
  canvasTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, "rgba(0,0,0,0.6)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
const dotTexture = () =>
  canvasTexture(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.4, "rgba(255,255,255,0.8)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
  });
const alertTexture = () =>
  canvasTexture(64, 64, (g) => {
    g.font = "900 56px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "#3a0000";
    g.strokeText("!", 32, 34);
    g.fillStyle = "#ffd02a";
    g.fillText("!", 32, 34);
  });

export function createWorld(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "tmnt-canvas";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 400);
  const hemi = new THREE.HemisphereLight("#ffffff", "#6a7a4a", 1.2);
  const sun = new THREE.DirectionalLight("#fff2dc", 2);
  scene.add(hemi, sun, sun.target);

  const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  blobGeo.userData.shared = true;
  const alertMat = new THREE.SpriteMaterial({ map: alertTexture(), depthTest: false, transparent: true });

  // particles
  const NP = 240;
  const pPos = new Float32Array(NP * 3);
  const pCol = new Float32Array(NP * 3);
  const pVel = new Float32Array(NP * 3);
  const pLife = new Float32Array(NP);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.26, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  points.frustumCulled = false;
  let pNext = 0;
  for (let i = 0; i < NP; i++) pPos[i * 3 + 1] = -999;
  const col = new THREE.Color();
  function burst(x, y, z, n, color, speed = 4, up = 2) {
    col.set(color);
    for (let k = 0; k < n; k++) {
      const i = pNext;
      pNext = (pNext + 1) % NP;
      pPos[i * 3] = x;
      pPos[i * 3 + 1] = y;
      pPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 0.5;
      pVel[i * 3] = Math.cos(a) * speed * (0.4 + Math.random() * 0.6);
      pVel[i * 3 + 1] = up * (0.5 + Math.random()) + e;
      pVel[i * 3 + 2] = Math.sin(a) * speed * (0.4 + Math.random() * 0.6);
      pCol[i * 3] = col.r;
      pCol[i * 3 + 1] = col.g;
      pCol[i * 3 + 2] = col.b;
      pLife[i] = 0.35 + Math.random() * 0.35;
    }
  }
  // shock rings
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false;
    rings.push({ m, t: 1, r: 1, dur: 0.4 });
  }
  let ringNext = 0;
  function ring(x, z, r, color, dur = 0.4) {
    const R = rings[ringNext];
    ringNext = (ringNext + 1) % rings.length;
    R.m.position.set(x, 0.06, z);
    R.m.material.color.set(color);
    R.t = 0;
    R.r = r;
    R.dur = dur;
    R.m.visible = true;
  }
  // weapon swipe arcs (a flat crescent in front of the attacker)
  const swipes = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 24, 1, -Math.PI * 0.42, Math.PI * 0.84), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.geometry.rotateX(-Math.PI / 2);
    m.geometry.rotateY(-Math.PI / 2); // arc centred on +Z (forward)
    m.visible = false;
    swipes.push({ m, t: 1 });
  }
  let swipeNext = 0;
  function swipe(x, y, z, facing, r, color) {
    const S = swipes[swipeNext];
    swipeNext = (swipeNext + 1) % swipes.length;
    S.m.position.set(x, y, z);
    S.m.rotation.set(0, facing, 0);
    S.m.scale.set(r, 1, r);
    S.m.material.color.set(color);
    S.t = 0;
    S.m.visible = true;
  }
  // telegraphs: a ring under each winding-up foe + the Shredder's dash lane
  const teleGeo = new THREE.RingGeometry(0.75, 1, 32);
  teleGeo.rotateX(-Math.PI / 2);
  const laneGeo = new THREE.PlaneGeometry(1, 1);
  laneGeo.rotateX(-Math.PI / 2);
  laneGeo.translate(0, 0, 0.5);
  const lane = new THREE.Mesh(laneGeo, new THREE.MeshBasicMaterial({ color: "#ff2a2a", transparent: true, opacity: 0.3, depthWrite: false }));
  const laneEdge = new THREE.Mesh(laneGeo, new THREE.MeshBasicMaterial({ color: "#ff6a4a", transparent: true, opacity: 0.6, depthWrite: false, wireframe: false }));

  let levelGroup = null;
  let fxGroup = null;
  let safeZone = null;
  const actors = new Map(); // id -> {R, blob, bar, tele, alert}
  const dummies = [];
  const npcs = [];
  const items = new Map();
  let civA = null;
  let water = null;
  const cam = { x: 0, y: 3, z: -6, tx: 0, ty: 1, tz: 0, dist: 6, shake: 0, init: false };
  let t = 0;

  /** Free a level's geometries, its own materials and their own textures (shared caches survive). */
  function disposeTree(o) {
    const seen = new Set();
    o.traverse((n) => {
      if (!(n.isMesh || n.isPoints)) return;
      if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose?.();
      for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
        if (!m || seen.has(m) || m.userData.shared || m === blobMat) continue;
        seen.add(m);
        if (m.map && !m.map.userData.shared) m.map.dispose();
        m.dispose();
      }
    });
  }
  function removeActor(id) {
    const a = actors.get(id);
    if (!a) return;
    scene.remove(a.R.root, a.blob, a.bar, a.tele, a.alert);
    for (const m of a.R.mats) m.dispose();
    a.tele.material.dispose();
    for (const c of a.bar.children) {
      c.geometry.dispose();
      c.material.dispose();
    }
    actors.delete(id);
  }
  function clear() {
    for (const id of [...actors.keys()]) removeActor(id);
    dummies.length = 0;
    npcs.length = 0;
    items.clear();
    civA = null;
    if (levelGroup) {
      scene.remove(levelGroup);
      disposeTree(levelGroup);
    }
    if (fxGroup) scene.remove(fxGroup);
    levelGroup = fxGroup = safeZone = null;
  }

  function makeBar(w = 1, color = "#e84a3a") {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.14), new THREE.MeshBasicMaterial({ color: "#1a1010", transparent: true, opacity: 0.75, depthTest: false }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 0.09), new THREE.MeshBasicMaterial({ color, depthTest: false }));
    fg.position.z = 0.001;
    bg.renderOrder = 10;
    fg.renderOrder = 11;
    g.add(bg, fg);
    g.userData = { fg, w: w - 0.04 };
    g.visible = false;
    return g;
  }

  function addActor(id, kind, variant) {
    const R = buildCharacter(kind, variant);
    const blob = new THREE.Mesh(blobGeo, blobMat);
    const tele = new THREE.Mesh(teleGeo, new THREE.MeshBasicMaterial({ color: "#ff4a2a", transparent: true, opacity: 0, depthWrite: false }));
    tele.visible = false;
    const bar = makeBar(kind === "elite" ? 1.3 : 1, kind === "elite" ? "#c84ae8" : "#e84a3a");
    const alert = new THREE.Sprite(alertMat);
    alert.scale.set(0.6, 0.6, 1);
    alert.visible = false;
    alert.renderOrder = 12;
    scene.add(R.root, blob, tele, bar, alert);
    const a = { R, blob, bar, tele, alert, alertT: 0, kind };
    actors.set(id, a);
    return a;
  }

  /** Build everything for a new Game (call once per mission start). */
  function setGame(game) {
    clear();
    const { group, env } = buildScenery(game.level);
    levelGroup = group;
    scene.add(levelGroup);
    water = group.getObjectByName("water");
    safeZone = group.getObjectByName("safeZone");
    scene.background = env.background;
    scene.fog = env.fog;
    hemi.color.set(env.hemi[0]);
    hemi.groundColor.set(env.hemi[1]);
    hemi.intensity = env.hemi[2];
    sun.color.set(env.sun[0]);
    sun.intensity = env.sun[1];
    sun.position.set(...env.sun[2]);
    fxGroup = new THREE.Group();
    fxGroup.add(points, lane, laneEdge, ...rings.map((r) => r.m), ...swipes.map((s) => s.m));
    lane.visible = laneEdge.visible = false;
    scene.add(fxGroup);
    for (const d of game.dummies) {
      const D = buildDummy();
      D.root.position.set(d.x, 0, d.z);
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.position.set(d.x, 0.02, d.z);
      blob.scale.setScalar(1.1);
      levelGroup.add(D.root, blob);
      dummies.push({ D, ref: d });
    }
    for (const n of game.npcs) {
      const R = buildCharacter(n.id);
      R.root.position.set(n.x, 0, n.z);
      R.root.rotation.y = n.facing;
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.position.set(n.x, 0.02, n.z);
      blob.scale.setScalar(1);
      levelGroup.add(R.root, blob);
      npcs.push({ R, ref: n });
    }
    for (const it of game.items) {
      const m = buildItem();
      m.position.set(it.x, 0, it.z);
      levelGroup.add(m);
      items.set(it.id, { m, ref: it });
    }
    if (game.civ) {
      const R = buildCharacter("civilian");
      const blob = new THREE.Mesh(blobGeo, blobMat);
      levelGroup.add(R.root, blob);
      civA = { R, blob };
    }
    addActor(0, game.hero.id);
    cam.init = false;
    t = 0;
  }

  /** Map sim state → animation name + progress for the posing code. */
  function playerAnim(P, game) {
    const H = game.hero;
    switch (P.state) {
      case "light": {
        const tm = game.moveTiming(P);
        return { anim: "light", p: P.st / tm.dur, combo: P.combo, style: H.anims.light[Math.max(0, P.combo - 1)] };
      }
      case "heavy": {
        const tm = game.moveTiming(P);
        return { anim: "heavy", p: P.st / tm.dur, style: H.anims.heavy };
      }
      case "special":
        return { anim: "special", p: P.st / SPECIAL_DUR[H.special.id], special: H.special.id };
      case "dodge":
        return { anim: "dodge", p: P.st / DODGE.dur };
      case "hit":
        return { anim: "hit", p: P.st / 0.36 };
      case "ko":
        return { anim: "ko", p: P.st / 1.2 };
      default:
        if (game.status === "won" || (game.cleared && game.endT < 1)) return { anim: "victory", p: 0 };
        return { anim: P.grounded || P.y < 0.05 ? "move" : "air", p: 0 };
    }
  }
  function enemyAnim(e) {
    const D = ENEMIES[e.kind];
    switch (e.state) {
      case "windup":
        return { anim: "windup", p: e.st / (e.kind === "shredder" ? (e.phase === 2 ? 0.42 : 0.55) : D.windup) };
      case "strike":
        if (e.kind === "shredder") return e.st < 0.38 ? { anim: "strike", p: e.st / 0.38, combo: 1 } : { anim: "strike", p: (e.st - 0.38) / 0.34, combo: 2 };
        return { anim: "strike", p: e.st / 0.34, combo: 1 };
      case "hurt":
        return { anim: "hurt", p: e.st / (e.stunT || 0.4) };
      case "stagger":
        return { anim: "stagger", p: e.st / 0.75 };
      case "ko":
        return e.kind === "shredder" ? { anim: "kneelKo", p: e.st / 2.2 } : { anim: "ko", p: e.st / 1.2 };
      case "intro":
        return { anim: e.st < 0.3 ? "move" : "taunt", p: (e.st - 0.3) / 1.4 };
      case "roar":
        return { anim: "taunt", p: e.st / 1.4 };
      case "aim":
        return { anim: "aim", p: e.st / 0.9 };
      case "rush":
        return { anim: "rush", p: 0 };
      case "tired":
        return { anim: "tired", p: 0 };
      default:
        return { anim: "move", p: 0 };
    }
  }

  function syncActor(a, o, st, dt, maxSpeed) {
    a.R.root.position.set(o.x, o.y || 0, o.z);
    a.R.root.rotation.y = o.facing;
    poseCharacter(a.R, { ...st, t, speed: o.speed || 0, maxSpeed, grounded: (o.y || 0) < 0.05, flash: o.flash || 0 }, dt);
    const lift = Math.min(1, (o.y || 0) / 3);
    a.blob.position.set(o.x, 0.025, o.z);
    a.blob.scale.setScalar(o.r * 2.6 * (1 - lift * 0.5));
  }

  /** Handle sim events that need visuals. */
  function onEvents(game, events) {
    const P = game.player;
    for (const e of events) {
      switch (e.type) {
        case "swing":
          if (e.enemy == null && (e.move === "light" || e.move === "heavy")) {
            const H = game.hero;
            const r = (e.move === "heavy" ? H.heavy.range : H.light.range) + 0.2;
            swipe(P.x, P.y + 0.9, P.z, P.facing, r, H.mask);
          } else if (e.enemy != null) {
            const en = game.enemies.find((q) => q.id === e.enemy);
            if (en) swipe(en.x, 1.0, en.z, en.facing, ENEMIES[en.kind].range + 0.2, "#ff6a4a");
          }
          break;
        case "hit": {
          const big = e.move === "special" || e.move === "heavy" || e.move === "finisher";
          burst(e.x, e.y, e.z, e.dummy ? 8 : big ? 18 : 11, e.dummy ? "#ffe0a0" : big ? "#ffd060" : "#fff2b0", big ? 5 : 3.5);
          if (big) cam.shake = Math.max(cam.shake, 0.14);
          break;
        }
        case "hurt":
          burst(e.x, e.y, e.z, 12, "#ff5a4a", 3.5);
          cam.shake = Math.max(cam.shake, 0.22);
          break;
        case "shock":
          ring(e.x, e.z, e.r, e.color, e.heavy ? 0.55 : 0.4);
          burst(e.x, 0.3, e.z, e.heavy ? 26 : 16, e.color, e.r * 1.6, 1.2);
          if (e.heavy) cam.shake = Math.max(cam.shake, 0.45);
          break;
        case "wave":
          for (let k = 0; k < 18; k++) {
            const d = 0.8 + Math.random() * (e.range - 0.8);
            const sp = (Math.random() - 0.5) * 1.1;
            burst(e.x + Math.sin(e.facing + sp) * d, 0.3, e.z + Math.cos(e.facing + sp) * d, 1, "#c8a0ff", 1.2, 1.6);
          }
          ring(e.x + Math.sin(e.facing) * 2.4, e.z + Math.cos(e.facing) * 2.4, 2.6, "#c8a0ff");
          ring(e.x + Math.sin(e.facing) * 4.8, e.z + Math.cos(e.facing) * 4.8, 2.2, "#c8a0ff", 0.55);
          cam.shake = Math.max(cam.shake, 0.3);
          break;
        case "heal":
          burst(e.x, 0.8, e.z, 18, "#8aff9a", 2, 3);
          break;
        case "freed":
          burst(e.x, 1, e.z, 22, "#ffe07a", 2.5, 2.5);
          break;
        case "ko":
          if (e.id !== 0) burst(e.x, 1, e.z, 20, "#ffffff", 3, 2);
          break;
        case "land":
          burst(P.x, 0.1, P.z, 5, "#d8d0c0", 1.6, 0.4);
          break;
        case "alert": {
          const a = actors.get(e.id);
          if (a) a.alertT = 1.1;
          break;
        }
        case "taunt":
          cam.shake = Math.max(cam.shake, e.big ? 0.35 : 0.15);
          if (game.boss) ring(game.boss.x, game.boss.z, 5, "#ff6a8a", 0.6);
          break;
        case "rush":
          cam.shake = Math.max(cam.shake, 0.2);
          break;
        case "block":
          burst(e.x, e.y, e.z, 6, "#9ab8ff", 2);
          break;
        default:
          break;
      }
    }
  }

  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const segT = new THREE.Vector3();
  function fadeNearCamera(R, isPlayer) {
    tmpC.copy(R.root.position);
    tmpC.y += R.H * 0.5;
    const d = camera.position.distanceTo(tmpC);
    const near = 0.7 + R.H * 0.45;
    let op = Math.max(0.18, Math.min(1, (d - near * 0.55) / (near * 0.45)));
    if (!isPlayer) {
      // a foe standing between the lens and the turtle is see-through
      segT.set(cam.tx, cam.ty, cam.tz).sub(camera.position);
      const L2 = segT.lengthSq();
      const k = L2 > 1e-6 ? tmpV.copy(tmpC).sub(camera.position).dot(segT) / L2 : -1;
      if (k > 0 && k < 0.92) {
        const off = tmpV.copy(camera.position).addScaledVector(segT, k).distanceTo(tmpC);
        if (off < R.H * 0.32 + 0.25) op = Math.min(op, 0.3);
      }
    }
    if (Math.abs(op - (R.state.op ?? 1)) < 0.01) return;
    R.state.op = op;
    const tr = op < 0.99;
    for (const m of R.mats) {
      if (m.transparent !== tr) {
        m.transparent = tr;
        m.needsUpdate = true;
      }
      m.opacity = tr ? op : 1;
    }
  }

  function render(game, dt, opts = {}) {
    t += dt;
    const P = game.player;
    const camQ = camera.quaternion;
    // spawn/despawn enemy models
    for (const e of game.enemies) if (!actors.has(e.id)) addActor(e.id, e.kind, e.id);
    for (const [id, a] of actors) {
      if (id === 0) continue;
      if (!game.enemies.some((e) => e.id === id)) removeActor(id);
    }
    const pa = actors.get(0);
    if (pa) syncActor(pa, P, playerAnim(P, game), dt, game.hero.speed);
    let rusher = null;
    for (const e of game.enemies) {
      const a = actors.get(e.id);
      if (!a) continue;
      syncActor(a, e, enemyAnim(e), dt, ENEMIES[e.kind].speed);
      // telegraph ring under a winding-up attacker
      const tele = e.state === "windup" && !e.dead;
      a.tele.visible = tele;
      if (tele) {
        const p = Math.min(1, e.st / (e.kind === "shredder" ? 0.5 : ENEMIES[e.kind].windup));
        a.tele.position.set(e.x, 0.05, e.z);
        a.tele.scale.setScalar(e.r + 0.5 + p * 1.2);
        a.tele.material.opacity = 0.35 + p * 0.5;
      }
      // floating health bar (the Shredder's is in the HUD)
      const showBar = e.kind !== "shredder" && !e.dead && (e.hp < e.maxHp || e.alert);
      a.bar.visible = showBar;
      if (showBar) {
        a.bar.position.set(e.x, (e.y || 0) + a.R.H + 0.35, e.z);
        a.bar.quaternion.copy(camQ);
        const f = Math.max(0, e.hp / e.maxHp);
        a.bar.userData.fg.scale.x = Math.max(0.001, f);
        a.bar.userData.fg.position.x = -(1 - f) * a.bar.userData.w * 0.5;
      }
      a.alertT = Math.max(0, a.alertT - dt);
      a.alert.visible = a.alertT > 0 && !e.dead;
      if (a.alert.visible) a.alert.position.set(e.x, a.R.H + 0.75 + (1.1 - a.alertT) * 0.3, e.z);
      if (e.lane) rusher = e;
    }
    lane.visible = laneEdge.visible = !!rusher;
    if (rusher) {
      const L = rusher.lane;
      lane.position.set(L.x0, 0.045, L.z0);
      lane.rotation.y = L.facing;
      lane.scale.set(L.width * 2, 1, L.len);
      laneEdge.position.copy(lane.position);
      laneEdge.rotation.y = L.facing;
      laneEdge.position.y = 0.05;
      const pulse = rusher.state === "rush" ? 1 : 0.5 + 0.5 * Math.sin(t * 18);
      laneEdge.scale.set(L.width * 0.5, 1, L.len);
      lane.material.opacity = 0.2 + 0.2 * pulse;
      laneEdge.material.opacity = 0.35 + 0.4 * pulse;
    }
    for (const { D, ref } of dummies) {
      const w = ref.wob * Math.sin(t * 20) * 0.35;
      D.post.rotation.x = ref.wobZ * w;
      D.post.rotation.z = -ref.wobX * w;
    }
    for (const { R, ref } of npcs) {
      const near = Math.hypot(P.x - ref.x, P.z - ref.z) < 4;
      if (near) R.root.rotation.y += (Math.atan2(P.x - ref.x, P.z - ref.z) - R.root.rotation.y) * Math.min(1, dt * 4);
      poseCharacter(R, { anim: game.talk && near ? "talk" : "idle", p: 0, t, speed: 0 }, dt);
    }
    if (civA && game.civ) {
      const C = game.civ;
      civA.R.root.position.set(C.x, 0, C.z);
      civA.R.root.rotation.y = C.facing;
      const anim = C.state === "tied" ? "tied" : C.state === "safe" ? "cheer" : "move";
      poseCharacter(civA.R, { anim, p: 0, t, speed: C.speed, maxSpeed: 5 }, dt);
      civA.blob.position.set(C.x, 0.025, C.z);
      civA.blob.scale.setScalar(1);
    }
    if (safeZone) {
      safeZone.visible = game.cur?.id === "escort" || (game.civ && game.civ.state === "safe");
      safeZone.material.opacity = 0.4 + Math.sin(t * 4) * 0.15;
    }
    for (const { m, ref } of items.values()) {
      m.visible = !ref.taken;
      m.userData.spin.rotation.y = t * 1.6;
      m.userData.spin.position.y = 0.9 + Math.sin(t * 2.4 + ref.id) * 0.12;
      m.userData.beam.material.opacity = 0.14 + Math.sin(t * 3 + ref.id) * 0.05;
    }
    if (water) water.material.emissiveIntensity = 0.32 + Math.sin(t * 1.5) * 0.06;
    // particles
    for (let i = 0; i < NP; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pPos[i * 3 + 1] = -999;
        continue;
      }
      pVel[i * 3 + 1] -= 9 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] = Math.max(0.05, pPos[i * 3 + 1] + pVel[i * 3 + 1] * dt);
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    for (const R of rings) {
      if (!R.m.visible) continue;
      R.t += dt / R.dur;
      if (R.t >= 1) {
        R.m.visible = false;
        continue;
      }
      R.m.scale.setScalar(R.r * (0.25 + 0.75 * Math.sqrt(R.t)));
      R.m.material.opacity = 0.9 * (1 - R.t);
    }
    for (const S of swipes) {
      if (!S.m.visible) continue;
      S.t += dt / 0.22;
      if (S.t >= 1) {
        S.m.visible = false;
        continue;
      }
      S.m.material.opacity = 0.55 * Math.sin(Math.min(1, S.t * 1.4) * Math.PI);
    }

    // camera: smooth target, distance shrinks fast and recovers slowly
    const C = game.cam;
    if (C.target) {
      const kt = cam.init ? 1 - Math.exp(-14 * dt) : 1;
      cam.tx += (C.target.x - cam.tx) * kt;
      cam.ty += (C.target.y - cam.ty) * kt;
      cam.tz += (C.target.z - cam.tz) * kt;
      const kd = !cam.init ? 1 : C.dist < cam.dist ? 1 - Math.exp(-22 * dt) : 1 - Math.exp(-3 * dt);
      cam.dist += (C.dist - cam.dist) * kd;
      cam.init = true;
      const d = Math.min(cam.dist, C.dist + 0.25);
      let x = cam.tx - C.fwd.x * d, y = cam.ty - C.fwd.y * d, z = cam.tz - C.fwd.z * d;
      if (cam.shake > 0) {
        cam.shake = Math.max(0, cam.shake - dt * 1.8);
        const s = cam.shake * 0.35;
        x += (Math.random() - 0.5) * s;
        y += (Math.random() - 0.5) * s;
        z += (Math.random() - 0.5) * s;
      }
      camera.position.set(x, Math.max(0.35, y), z);
      tmpV.set(cam.tx + C.fwd.x * 2, cam.ty + C.fwd.y * 2 + 0.15, cam.tz + C.fwd.z * 2);
      camera.lookAt(tmpV);
    }
    if (opts.victoryOrbit) {
      // slow orbit around the turtle standing over the fallen Shredder
      const a = t * 0.3;
      const fx = -Math.sin(a) * 0.9, fy = -0.38, fz = -Math.cos(a) * 0.9;
      const d = cameraClear(game.col, P.x, 1.1, P.z, fx, fy, fz, 5.5);
      camera.position.set(P.x - fx * d, Math.max(0.6, 1.1 - fy * d), P.z - fz * d);
      camera.lookAt(P.x, 0.9, P.z);
    }
    for (const [id, a] of actors) fadeNearCamera(a.R, id === 0 || !!opts.victoryOrbit);
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 72 : 58;
    camera.updateProjectionMatrix();
  }

  /** World point → CSS pixel position inside the canvas, or null if behind. */
  function project(x, y, z) {
    tmpV.set(x, y, z).project(camera);
    if (tmpV.z > 1) return null;
    const el = renderer.domElement;
    return { x: ((tmpV.x + 1) / 2) * el.clientWidth, y: ((1 - tmpV.y) / 2) * el.clientHeight };
  }

  function dispose() {
    clear();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { setGame, render, onEvents, resize, project, dispose, renderer, scene, camera };
}
