/**
 * Haunted Mansion Escape — plain Three.js room-view renderer.
 *
 * Exactly one room is built at a time (from ROOMS data + props.js) and fully
 * disposed when you leave it. The camera stands near the front wall; the
 * pointer gently steers the gaze, clicking a hotspot glides the camera up to
 * it, and room changes dolly in from the doorway. Candle/fire lights flicker,
 * dust drifts, and now and then something pale crosses the far end of a room.
 */
import * as THREE from "three";
import { ROOMS, ROOM_SIZE, HOTSPOTS } from "./data.js";
import { PROPS } from "./props.js";
import { woodCanvas, stoneCanvas, wallpaperCanvas, flameCanvas, glowCanvas, ghostCanvas } from "./art.js";

const { W, D, H } = ROOM_SIZE;
const CAM_BASE = new THREE.Vector3(0, 1.62, D / 2 - 0.75);
const LOOK_BASE = new THREE.Vector3(0, 1.3, -D / 2);
const DOOR_FLAGS = { libraryDoor: "door_library", diningDoor: "door_dining", bedroomDoor: "door_bedroom", studyDoor: "door_study", musicDoor: "door_music", basementDoor: "door_basement", galleryDoor: "door_gallery" };
const PRESETS = {
  brass: ["#b8892a", { metalness: 0.85, roughness: 0.32 }],
  iron: ["#2a2826", { metalness: 0.7, roughness: 0.55 }],
  silver: ["#cfd2d6", { metalness: 0.9, roughness: 0.25 }],
};
const HILITE = new THREE.Color("#ffb85a");

export function createScene(container, { onGhost, onFlicker } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "hme-canvas";
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050404");
  scene.fog = new THREE.FogExp2("#0a0706", 0.05);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 40);
  camera.position.copy(CAM_BASE);

  /* shared textures live for the whole session */
  const shared = new Map();
  const sharedTex = (key, make, repeat) => {
    if (!shared.has(key)) {
      const t = new THREE.CanvasTexture(make());
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      t.userData.shared = true;
      shared.set(key, t);
    }
    const t = shared.get(key);
    if (!repeat) return t;
    const c = t.clone();
    c.repeat.set(...repeat);
    c.needsUpdate = true;
    c.userData.shared = false;
    return c;
  };
  const flameTex = sharedTex("flame", flameCanvas);
  const glowTex = sharedTex("glow", () => glowCanvas());
  const ghostTex = sharedTex("ghost", ghostCanvas);

  let room = null; // { id, group, hotspots: Map, frames: [], states: [], lights: [], flames: [], ... }
  let state = null;
  let mode = "menu";
  let hovered = null;
  let focusId = null;
  let escapeT = -1;
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  const camPos = CAM_BASE.clone();
  const camLook = LOOK_BASE.clone();
  let dolly = 0;
  let time = 0;
  let flickerAt = 8 + Math.random() * 10, flickerUntil = 0;
  let ghostAt = 25 + Math.random() * 25, ghostT = -1;

  /* ------------------------------------------------------------ room build */
  function buildRoom(id) {
    const def = ROOMS[id];
    const st = def.style;
    const group = new THREE.Group();
    const r = { id, group, hotspots: new Map(), frames: [], states: [], lights: [], flames: [], owned: [] };
    const matCache = new Map();
    const T = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      r.owned.push(t);
      return t;
    };
    const mat = (color, opts = {}) => {
      let col = color;
      let o = opts;
      if (PRESETS[color]) [col, o] = [PRESETS[color][0], { ...PRESETS[color][1], ...opts }];
      const key = Object.keys(o).length ? null : col;
      if (key && matCache.has(key)) return matCache.get(key);
      const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, ...o });
      if (key) matCache.set(key, m);
      return m;
    };
    const flame = (parent, x, y, z, s) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.position.set(x, y, z);
      sp.scale.set(s * 0.5, s, 1);
      sp.userData.base = s;
      sp.userData.phase = Math.random() * 10;
      parent.add(sp);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35, fog: false }));
      glow.position.set(x, y, z);
      glow.scale.setScalar(s * 3.2);
      parent.add(glow);
      r.flames.push(sp, glow);
      glow.userData.base = s * 3.2;
      glow.userData.phase = sp.userData.phase;
      glow.userData.glow = true;
    };
    const ctx = { T, mat, flame, onState: (f) => r.states.push(f), onFrame: (f) => r.frames.push(f) };

    // shell
    const floorTex = st.floor === "stone" ? sharedTex("stone", () => stoneCanvas(2, "#4a4540"), [4, 4]) : st.floor === "planks" ? sharedTex("planks", () => woodCanvas(8, "#6a4c30"), [3, 3]) : sharedTex("wood", () => woodCanvas(1, "#4a2e1c"), [3, 3]);
    r.owned.push(floorTex);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: st.floor === "stone" ? 0.9 : 0.55, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    let wallTex;
    if (st.wallTex === "stone") wallTex = sharedTex("stoneWall", () => stoneCanvas(5, st.wall), [4, 2]);
    else if (st.wallTex === "planks") wallTex = sharedTex("plankWall", () => woodCanvas(12, st.wall), [3, 2]);
    else wallTex = sharedTex("wp" + st.wall, () => wallpaperCanvas(st.wall, id.length), [4, 2]);
    r.owned.push(wallTex);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const wall = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      m.position.set(x, H / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      group.add(m);
      if (!st.wallTex) {
        // wainscot + skirting + crown moulding
        const pan = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.04), mat(st.trim, { roughness: 0.6 }));
        pan.position.set(x, 0.5, z);
        pan.rotation.y = ry;
        pan.translateZ(0.02);
        pan.receiveShadow = true;
        group.add(pan);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.07), mat("#1a0f08"));
        rail.position.set(x, 1.02, z);
        rail.rotation.y = ry;
        rail.translateZ(0.03);
        group.add(rail);
        const crown = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.12), mat("#1a0f08"));
        crown.position.set(x, H - 0.07, z);
        crown.rotation.y = ry;
        crown.translateZ(0.05);
        group.add(crown);
      }
    };
    wall(W, 0, -D / 2, 0);
    wall(W, 0, D / 2, Math.PI);
    wall(D, -W / 2, 0, Math.PI / 2);
    wall(D, W / 2, 0, -Math.PI / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(st.ceiling, { roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    group.add(ceil);
    if (st.attic) {
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, 0.16), mat("#2a1c10"));
        b.position.set(0, H - 0.3, -D / 2 + 0.6 + i * 1.4);
        b.castShadow = true;
        group.add(b);
      }
      for (const x of [-2.2, 2.2]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, D), mat("#2a1c10"));
        b.position.set(x, H - 0.15, 0);
        group.add(b);
      }
    }

    // props
    for (const p of def.props) {
      const make = PROPS[p.k];
      if (!make) continue;
      const o = { ...(p.o || {}) };
      if (p.hs && DOOR_FLAGS[p.hs]) o.openFlag = DOOR_FLAGS[p.hs];
      if (p.hs === "hatch") o.openFlag = "door_attic";
      const g = make(ctx, o);
      g.position.set(...p.p);
      if (p.r) g.rotation.y = p.r;
      if (p.show) r.states.push((s) => (g.visible = p.show(s)));
      if (p.hs) {
        g.userData.hs = p.hs;
        g.traverse((m) => {
          if (!m.isMesh) return;
          m.material = m.material.clone();
          m.userData.hsMat = true;
        });
        if (p.k === "desk" || p.k === "workbench") {
          // open-frame furniture: an invisible hit box so the knee space still counts
          const [pos, rot] = [g.position.clone(), g.rotation.y];
          g.position.set(0, 0, 0);
          g.rotation.y = 0;
          g.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(g);
          g.position.copy(pos);
          g.rotation.y = rot;
          const size = b.getSize(new THREE.Vector3());
          const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
          proxy.position.copy(b.getCenter(new THREE.Vector3()));
          proxy.userData.proxy = true;
          g.add(proxy);
        }
        r.hotspots.set(p.hs, g);
      }
      group.add(g);
    }

    // lights
    const amb = new THREE.HemisphereLight("#9a8aaa", "#2a180e", st.ambient * 2);
    group.add(amb);
    r.ambient = amb;
    const spot = new THREE.SpotLight(st.spot || "#ffd9a0", st.dark ? 6 : 22, 14, 0.95, 0.75, 1.6);
    spot.position.set(0.6, st.attic ? H - 0.8 : H - 0.15, 1.2);
    spot.target.position.set(-0.2, 0, -2.2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0006;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 12;
    group.add(spot, spot.target);
    r.spot = spot;
    r.spotBase = spot.intensity;
    for (const l of def.lights) {
      const [x, y, z] = l.p;
      let light;
      if (l.k === "moon") {
        light = new THREE.SpotLight("#7f9cff", 14, 12, 0.7, 0.8, 1.2);
        light.position.set(x, y, z);
        light.target.position.set(x * 0.2, 0, z * 0.6 - 0.5);
        light.userData.flicker = 0;
        group.add(light.target);
      } else {
        const cfg = {
          candle: ["#ffb35a", 3.2, 5],
          fire: ["#ff7a2a", 7, 7],
          chandelier: ["#ffc77a", 6, 9],
          lamp: ["#ffd28a", 3.2, 5],
          lantern: ["#ffb460", 7, 8],
          bulb: ["#ffe2a8", 6, 8],
          rune: ["#ff5a3a", 3, 7],
        }[l.k];
        light = new THREE.PointLight(cfg[0], cfg[1], cfg[2], 1.6);
        light.position.set(x, y, z);
        light.userData.flicker = l.k === "candle" || l.k === "fire" || l.k === "lantern" ? (l.k === "fire" ? 0.35 : 0.18) : 0.04;
        if (l.k === "chandelier") group.add(chandelier(mat, flame, x, y, z));
        if (l.k === "lantern") group.add(lantern(mat, flame, x, y, z));
        if (l.k === "bulb") {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), mat("#fff", { emissive: "#ffe0a0", emissiveIntensity: 0 }));
          b.position.set(x, y, z);
          group.add(b);
          const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, H - y), mat("#111"));
          cord.position.set(x, (H + y) / 2, z);
          group.add(cord);
          light.userData.bulb = b;
        }
      }
      light.userData.base = light.intensity;
      light.userData.kind = l.k;
      light.userData.power = l.power;
      light.userData.phase = Math.random() * 100;
      group.add(light);
      r.lights.push(light);
    }

    // dust motes
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * W, Math.random() * H, (Math.random() - 0.5) * D], i * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: glowTex, size: 0.035, color: "#ffe6c0", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    group.add(dust);
    r.dust = dust;

    // ghost
    const ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTex, transparent: true, opacity: 0, depthWrite: false, fog: true }));
    ghost.scale.set(0.8, 1.6, 1);
    ghost.visible = false;
    group.add(ghost);
    r.ghost = ghost;

    scene.fog.density = st.fog;
    return r;
  }

  function chandelier(mat, flame, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const brass = mat("brass");
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, H - y), brass);
    chain.position.y = (H - y) / 2;
    g.add(chain);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 8, 32), brass);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), mat("#efe6d0", { emissive: "#3a2a10" }));
      c.position.set(Math.cos(a) * 0.45, 0.07, Math.sin(a) * 0.45);
      g.add(c);
      flame(g, c.position.x, 0.17, c.position.z, 0.06);
    }
    return g;
  }
  function lantern(mat, flame, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y - 0.12, z);
    const iron = mat("iron");
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 8), mat("#ffcf8a", { transparent: true, opacity: 0.35, emissive: "#ff9a3a", emissiveIntensity: 0.6 }));
    g.add(glass);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 8), iron);
    cap.position.y = 0.15;
    g.add(cap);
    flame(g, 0, 0, 0, 0.08);
    return g;
  }

  function disposeRoom(r) {
    if (!r) return;
    scene.remove(r.group);
    r.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (m.map && !m.map.userData.shared) m.map.dispose();
        m.dispose();
      }
      if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    for (const t of r.owned) if (!t.userData.shared) t.dispose();
  }

  /* ------------------------------------------------------------ highlight */
  function setHighlight(id, on) {
    const g = room?.hotspots.get(id);
    if (!g) return;
    g.traverse((m) => {
      if (!m.isMesh || !m.material.emissive) return;
      const u = m.material.userData;
      if (on) {
        if (!u.saved) {
          u.saved = { c: m.material.emissive.clone(), i: m.material.emissiveIntensity };
        }
        m.material.emissive.copy(u.saved.c).lerp(HILITE, 0.55);
        m.material.emissiveIntensity = Math.max(u.saved.i, 0.35);
      } else if (u.saved) {
        m.material.emissive.copy(u.saved.c);
        m.material.emissiveIntensity = u.saved.i;
        u.saved = null;
      }
    });
  }

  /* ------------------------------------------------------------ picking */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const visibleChain = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  function pickAt(clientX, clientY) {
    if (!room) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(room.group, true);
    for (const h of hits) {
      if (h.object.isSprite || h.object.isPoints || !visibleChain(h.object)) continue;
      let o = h.object;
      while (o && !o.userData.hs) o = o.parent;
      if (o) return o.userData.hs;
      // a solid non-hotspot surface in front blocks the click
      if (h.object.isMesh && !h.object.material.transparent) return null;
    }
    return null;
  }

  /* ------------------------------------------------------------ camera */
  const tmpBox = new THREE.Box3();
  const tmpV = new THREE.Vector3();
  function focusPose(id) {
    const g = room?.hotspots.get(id);
    if (!g) return null;
    tmpBox.setFromObject(g);
    const c = tmpBox.getCenter(new THREE.Vector3());
    const size = tmpBox.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    const dist = THREE.MathUtils.clamp(span * 1.25 + 0.6, 1.1, 3.2);
    let pos;
    if (c.y > H - 0.4) pos = c.clone().add(new THREE.Vector3(0, -1.9, 1.6));
    else if (size.y < 0.12 && c.y < 0.3) pos = c.clone().add(new THREE.Vector3(0, 2.0, 1.5));
    else {
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
      n.y = 0;
      n.normalize();
      pos = c.clone().addScaledVector(n, dist);
      pos.y = THREE.MathUtils.clamp(c.y + 0.25, 1.0, 2.6);
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -W / 2 + 0.5, W / 2 - 0.5);
    pos.z = THREE.MathUtils.clamp(pos.z, -D / 2 + 0.5, D / 2 - 0.4);
    pos.y = THREE.MathUtils.clamp(pos.y, 0.6, H - 0.3);
    return { pos, look: c };
  }

  /* ------------------------------------------------------------ loop */
  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (!room || !state) return;

    // camera target
    let wantPos, wantLook;
    const fp = focusId && focusPose(focusId);
    if (escapeT >= 0) {
      escapeT += dt;
      const k = Math.min(1, escapeT / 3.2);
      wantPos = new THREE.Vector3(0, 1.5, THREE.MathUtils.lerp(CAM_BASE.z - 1.5, -D / 2 - 0.6, k * k));
      wantLook = new THREE.Vector3(0, 1.45, -D / 2 - 3);
      scene.fog.color.lerp(new THREE.Color("#fff4e0"), dt * 0.6);
      scene.fog.density += (0.12 - scene.fog.density) * dt * 0.5;
    } else if (fp) {
      wantPos = fp.pos;
      wantLook = fp.look;
    } else {
      look.x += (look.tx - look.x) * Math.min(1, dt * 3);
      look.y += (look.ty - look.y) * Math.min(1, dt * 3);
      const drift = mode === "menu" ? Math.sin(time * 0.12) * 0.5 : 0;
      wantPos = CAM_BASE.clone().add(new THREE.Vector3(drift + look.x * 0.25, Math.sin(time * 0.6) * 0.012, dolly));
      const yaw = look.x * 0.55 + (mode === "menu" ? Math.sin(time * 0.09) * 0.18 : 0);
      const d = wantPos.distanceTo(LOOK_BASE);
      wantLook = new THREE.Vector3(wantPos.x + Math.sin(yaw) * d, LOOK_BASE.y + look.y * 1.2, wantPos.z - Math.cos(yaw) * d);
    }
    dolly += (0 - dolly) * Math.min(1, dt * 1.6);
    const k = Math.min(1, dt * (escapeT >= 0 ? 1.2 : 3.2));
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // lights
    if (time > flickerAt) {
      flickerUntil = time + 0.35 + Math.random() * 0.4;
      flickerAt = time + 14 + Math.random() * 20;
      if (mode === "play") onFlicker?.();
    }
    const dim = time < flickerUntil ? 0.25 + Math.random() * 0.4 : 1;
    const powered = Boolean(state.f.power);
    for (const l of room.lights) {
      const u = l.userData;
      const n = 1 + (Math.sin(time * 9 + u.phase) * 0.5 + Math.sin(time * 23.7 + u.phase * 2) * 0.3 + Math.sin(time * 3.1 + u.phase) * 0.2) * u.flicker;
      let on = 1;
      if (u.power) on = powered ? 1 : 0;
      if (u.kind === "rune") {
        l.color.set(state.f.altarLit ? "#6a9cff" : "#ff5a3a");
        on = state.f.altarLit ? 2.2 : 1;
      }
      l.intensity = u.base * n * on * (u.kind === "moon" ? 1 : dim);
      if (u.bulb) u.bulb.material.emissiveIntensity = on * 2.5;
    }
    room.spot.intensity = room.spotBase * (ROOMS[room.id].style.dark && !powered ? 0.5 : 1) * (0.92 + Math.sin(time * 0.7) * 0.08);
    if (escapeT >= 0) room.ambient.intensity += (3 - room.ambient.intensity) * dt * 0.5;
    for (const f of room.flames) {
      const u = f.userData;
      const s = u.base * (0.9 + Math.sin(time * 14 + u.phase) * 0.08 + Math.sin(time * 31 + u.phase) * 0.05) * (dim < 1 ? 0.7 : 1);
      if (u.glow) f.scale.setScalar(s);
      else f.scale.set(s * 0.5, s, 1);
    }
    const dp = room.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i) + dt * 0.03 * (0.4 + ((i * 7) % 5) / 5);
      if (y > H) y = 0;
      dp.setY(i, y);
      dp.setX(i, dp.getX(i) + Math.sin(time * 0.3 + i) * dt * 0.02);
    }
    dp.needsUpdate = true;

    // ghost
    if (ghostT < 0 && time > ghostAt && !focusId && escapeT < 0) {
      ghostT = 0;
      const side = Math.random() < 0.5 ? -1 : 1;
      room.ghost.position.set(side * (2.6 + Math.random() * 1.2), 1.15, -D / 2 + 0.7);
      room.ghost.userData.vx = -side * 0.35;
      room.ghost.visible = true;
      if (mode === "play") onGhost?.();
    }
    if (ghostT >= 0) {
      ghostT += dt;
      const a = ghostT < 1.2 ? ghostT / 1.2 : ghostT < 2.6 ? 1 : Math.max(0, 1 - (ghostT - 2.6) / 1.4);
      room.ghost.material.opacity = a * 0.32;
      room.ghost.position.x += room.ghost.userData.vx * dt;
      if (ghostT > 4) {
        ghostT = -1;
        room.ghost.visible = false;
        ghostAt = time + 35 + Math.random() * 40;
      }
    }

    if (hovered) {
      const g = room.hotspots.get(hovered);
      g?.traverse((m) => m.isMesh && m.material.userData.saved && (m.material.emissiveIntensity = 0.3 + Math.sin(time * 5) * 0.12));
    }
    for (const f of room.frames) f(time, dt, state);
    renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? 72 : 58; // portrait screens get a wider view
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    loadRoom(id, s, { enter = true } = {}) {
      if (hovered) setHighlight(hovered, false);
      hovered = null;
      focusId = null;
      disposeRoom(room);
      room = buildRoom(id);
      scene.add(room.group);
      state = s;
      for (const f of room.states) f(s);
      if (enter) {
        dolly = 1.6;
        camPos.copy(CAM_BASE).add(new THREE.Vector3(0, 0, 1.6));
      }
      escapeT = -1;
      scene.fog.color.set("#0a0706");
    },
    get roomId() {
      return room?.id;
    },
    setState(s) {
      state = s;
      if (room) for (const f of room.states) f(s);
    },
    setMode(m) {
      mode = m;
      if (m !== "play") this.hover(null);
    },
    hover(id) {
      if (id === hovered) return;
      if (hovered) setHighlight(hovered, false);
      hovered = id;
      if (id) setHighlight(id, true);
    },
    pick: pickAt,
    look(nx, ny) {
      look.tx = THREE.MathUtils.clamp(nx, -1, 1);
      look.ty = THREE.MathUtils.clamp(ny, -1, 1);
    },
    nudgeLook(dx, dy) {
      look.tx = THREE.MathUtils.clamp(look.tx + dx, -1, 1);
      look.ty = THREE.MathUtils.clamp(look.ty + dy, -1, 1);
    },
    focus(id) {
      focusId = id;
    },
    /** Screen-space anchor for every visible hotspot (for the "show hotspots" overlay). */
    hotspotScreens() {
      if (!room) return [];
      const out = [];
      const rect = canvas.getBoundingClientRect();
      room.hotspots.forEach((g, id) => {
        if (!visibleChain(g)) return;
        tmpBox.setFromObject(g);
        tmpBox.getCenter(tmpV).project(camera);
        if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.05 || Math.abs(tmpV.y) > 1.05) return;
        out.push({ id, name: HOTSPOTS[id].name, x: ((tmpV.x + 1) / 2) * rect.width, y: ((1 - tmpV.y) / 2) * rect.height });
      });
      return out;
    },
    playEscape() {
      focusId = null;
      escapeT = 0;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposeRoom(room);
      room = null;
      shared.forEach((t) => t.dispose());
      shared.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
