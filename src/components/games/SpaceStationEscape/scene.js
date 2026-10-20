/**
 * Space Station Escape — plain Three.js sector-view renderer.
 *
 * Exactly one sector is built at a time (ROOMS data + props.js) and fully
 * disposed when you leave it. The camera stands near the front bulkhead; the
 * pointer steers the gaze, clicking a hotspot glides the camera up to it, and
 * sector changes dolly in through the door. Until main power is restored the
 * station runs on red emergency lighting with rotating alarm beacons.
 */
import * as THREE from "three";
import { ROOMS, ROOM_SIZE, HOTSPOTS } from "./data.js";
import { PROPS } from "./props.js";
import { panelCanvas, gratingCanvas, ceilingCanvas, glowCanvas } from "./art.js";

const { W, D, H } = ROOM_SIZE;
const CAM_BASE = new THREE.Vector3(0, 1.62, D / 2 - 0.75);
const LOOK_BASE = new THREE.Vector3(0, 1.35, -D / 2);
const DOOR_FLAGS = { engDoor: "door_engineering", medDoor: "door_medical", lifeDoor: "door_lifesupport", secDoor: "door_security" };
const READY_FLAGS = { engDoor: "termOK", medDoor: "power", lifeDoor: "quarantineOff", secDoor: "lifeSupport" };
const PRESETS = {
  steel: ["#5a626e", { metalness: 0.7, roughness: 0.38 }],
  dark: ["#1a1e25", { metalness: 0.6, roughness: 0.5 }],
  chrome: ["#c8d0d8", { metalness: 0.95, roughness: 0.18 }],
};
const HILITE = new THREE.Color("#4fd8ff");
const RED = new THREE.Color("#ff2a2a");

export function createScene(container) {
  const canvas = document.createElement("canvas");
  canvas.className = "sse-canvas";
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#020306");
  scene.fog = new THREE.FogExp2("#05070c", 0.04);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 60);
  camera.position.copy(CAM_BASE);

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
  const glowTex = sharedTex("glow", () => glowCanvas());

  let room = null;
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
  let flickerAt = 6 + Math.random() * 8, flickerUntil = 0;
  const emergency = () => !state?.f.power;

  /* ------------------------------------------------------------ build */
  function buildRoom(id) {
    const def = ROOMS[id];
    const st = def.style;
    const group = new THREE.Group();
    const r = { id, group, hotspots: new Map(), frames: [], states: [], lights: [], owned: [], strips: [], panels: [] };
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
      const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, ...o });
      if (key) matCache.set(key, m);
      return m;
    };
    const ctx = { T, mat, onState: (f) => r.states.push(f), onFrame: (f) => r.frames.push(f) };

    // shell
    const floorTex = sharedTex("grating", () => gratingCanvas(2), [4, 4]);
    r.owned.push(floorTex);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, metalness: 0.6, roughness: 0.45 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    const wallTex = sharedTex("panel" + st.wall, () => panelCanvas(st.wall, id.length), [3, 1.4]);
    r.owned.push(wallTex);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, metalness: st.bright ? 0.2 : 0.55, roughness: st.bright ? 0.5 : 0.45 });
    const accent = new THREE.MeshStandardMaterial({ color: "#000", emissive: st.accent, emissiveIntensity: 2.2 });
    r.accent = accent;
    const wall = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      m.position.set(x, H / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      group.add(m);
      for (const y of [0.12, H - 0.25]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, 0.04), accent);
        s.position.set(x, y, z);
        s.rotation.y = ry;
        s.translateZ(0.03);
        group.add(s);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.1), mat("dark"));
      base.position.set(x, 0.05, z);
      base.rotation.y = ry;
      base.translateZ(0.05);
      group.add(base);
    };
    wall(W, 0, -D / 2, 0);
    wall(W, 0, D / 2, Math.PI);
    wall(D, -W / 2, 0, Math.PI / 2);
    wall(D, W / 2, 0, -Math.PI / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: sharedTex("ceil", ceilingCanvas, [4, 4]), roughness: 0.8, metalness: 0.4 }));
    r.owned.push(ceil.material.map);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    group.add(ceil);
    // ceiling light panels
    const panelMat = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#dff2ff", emissiveIntensity: 2 });
    r.panelMat = panelMat;
    for (const [x, z] of [[-2, -2.4], [2, -2.4], [-2, 0.4], [2, 0.4]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.5), panelMat);
      p.position.set(x, H - 0.02, z);
      group.add(p);
    }

    // props
    for (const p of def.props) {
      const make = PROPS[p.k];
      if (!make) continue;
      const o = { ...(p.o || {}) };
      if (p.hs && DOOR_FLAGS[p.hs]) {
        o.openFlag = DOOR_FLAGS[p.hs];
        o.readyFlag = READY_FLAGS[p.hs];
      }
      const g = make(ctx, o);
      g.position.set(...p.p);
      if (p.r) g.rotation.y = p.r;
      if (p.hs) {
        g.userData.hs = p.hs;
        g.traverse((m) => {
          if (m.isMesh && m.material.isMeshStandardMaterial) m.material = m.material.clone();
        });
        if (p.k === "workbench") {
          // open-frame furniture: an invisible hit box so the gap under it still counts
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
          g.add(proxy);
        }
        r.hotspots.set(p.hs, g);
      }
      group.add(g);
    }

    // lights
    const amb = new THREE.HemisphereLight("#a8c4e8", "#1a1f28", st.bright ? 0.9 : 0.55);
    group.add(amb);
    r.ambient = amb;
    r.ambientBase = amb.intensity;
    const spot = new THREE.SpotLight("#e8f4ff", 26, 15, 1.0, 0.7, 1.5);
    spot.position.set(0.6, H - 0.2, 1.2);
    spot.target.position.set(-0.2, 0, -2.4);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0006;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 13;
    group.add(spot, spot.target);
    r.spot = spot;
    const beaconGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.16, 12);
    for (const l of def.lights) {
      const [x, y, z] = l.p;
      const cfg = {
        panel: ["#dff2ff", 6, 10],
        screen: ["#3fb6ff", 2.4, 4],
        alarm: ["#ff2020", 9, 9],
        reactor: ["#2a9fff", 8, 8],
        tank: ["#5fffb0", 3, 5],
        laser: ["#ff2a3a", 5, 6],
        pod: ["#ffffff", 7, 7],
      }[l.k];
      const light = new THREE.PointLight(cfg[0], cfg[1], cfg[2], 1.5);
      light.position.set(x, y, z);
      light.userData = { kind: l.k, base: cfg[1], phase: Math.random() * 10 };
      if (l.k === "alarm") {
        const b = new THREE.Mesh(beaconGeo, new THREE.MeshStandardMaterial({ color: "#300", emissive: "#ff2020", emissiveIntensity: 2 }));
        b.position.set(x, y + 0.2, z);
        group.add(b);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ff3030", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
        halo.position.copy(b.position);
        halo.scale.setScalar(1.4);
        group.add(halo);
        light.userData.beacon = b;
        light.userData.halo = halo;
      }
      group.add(light);
      r.lights.push(light);
    }

    // floating motes
    const N = 220;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * W, Math.random() * H, (Math.random() - 0.5) * D], i * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    r.dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: glowTex, size: 0.03, color: "#9fd8ff", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    group.add(r.dust);
    scene.fog.density = st.fog;
    return r;
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
        if (!u.saved) u.saved = { c: m.material.emissive.clone(), i: m.material.emissiveIntensity };
        m.material.emissive.copy(u.saved.c).lerp(HILITE, 0.6);
        m.material.emissiveIntensity = Math.max(u.saved.i, 0.4);
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
    for (const h of ray.intersectObject(room.group, true)) {
      if (h.object.isSprite || h.object.isPoints || !visibleChain(h.object)) continue;
      let o = h.object;
      while (o && !o.userData.hs) o = o.parent;
      if (o) return o.userData.hs;
      const m = h.object.material;
      if (h.object.isMesh && !m.transparent && !(m.blending === THREE.AdditiveBlending)) return null;
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
    const dist = THREE.MathUtils.clamp(Math.max(size.x, size.y, size.z) * 1.15 + 0.6, 1.1, 3.4);
    let pos;
    if (size.y < 0.12 && c.y < 0.3) pos = c.clone().add(new THREE.Vector3(0, 2.0, 1.5));
    else {
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
      n.y = 0;
      n.normalize();
      pos = c.clone().addScaledVector(n, dist);
      pos.y = THREE.MathUtils.clamp(c.y + 0.3, 1.0, 2.7);
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -W / 2 + 0.5, W / 2 - 0.5);
    pos.z = THREE.MathUtils.clamp(pos.z, -D / 2 + 0.5, D / 2 - 0.4);
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

    let wantPos, wantLook;
    const fp = focusId && focusPose(focusId);
    if (escapeT >= 0) {
      escapeT += dt;
      wantPos = CAM_BASE.clone().add(new THREE.Vector3(0, 0.2, -1.2));
      wantLook = new THREE.Vector3(0, 1.6 + Math.min(escapeT, 3) * 0.7, -D / 2 - escapeT * 1.5);
      if (escapeT > 1.2) scene.fog.color.lerp(new THREE.Color("#dff2ff"), dt * 0.5);
    } else if (fp) {
      wantPos = fp.pos;
      wantLook = fp.look;
    } else {
      look.x += (look.tx - look.x) * Math.min(1, dt * 3);
      look.y += (look.ty - look.y) * Math.min(1, dt * 3);
      const drift = mode === "menu" ? Math.sin(time * 0.12) * 0.5 : 0;
      wantPos = CAM_BASE.clone().add(new THREE.Vector3(drift + look.x * 0.25, Math.sin(time * 0.6) * 0.01, dolly));
      const yaw = look.x * 0.55 + (mode === "menu" ? Math.sin(time * 0.09) * 0.2 : 0);
      const d = wantPos.distanceTo(LOOK_BASE);
      wantLook = new THREE.Vector3(wantPos.x + Math.sin(yaw) * d, LOOK_BASE.y + look.y * 1.2, wantPos.z - Math.cos(yaw) * d);
    }
    dolly += (0 - dolly) * Math.min(1, dt * 1.6);
    const k = Math.min(1, dt * 3.2);
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // lighting: red emergency mode until main power is back
    const emerg = emergency();
    if (time > flickerAt) {
      flickerUntil = time + 0.2 + Math.random() * 0.3;
      flickerAt = time + (emerg ? 6 : 18) + Math.random() * 14;
    }
    const dim = time < flickerUntil ? 0.3 + Math.random() * 0.5 : 1;
    for (const l of room.lights) {
      const u = l.userData;
      let i = u.base;
      if (u.kind === "panel") {
        l.color.set(emerg ? "#ff4a3a" : "#dff2ff");
        i *= (emerg ? 0.35 : 1) * dim;
      } else if (u.kind === "alarm") {
        const pulse = emerg ? 0.5 + 0.5 * Math.sin(time * 5 + u.phase) : 0;
        i *= pulse;
        u.beacon.material.emissiveIntensity = emerg ? 0.5 + pulse * 2.5 : 0.1;
        u.halo.material.opacity = emerg ? pulse * 0.8 : 0;
        u.beacon.material.emissive.set(emerg ? "#ff2020" : "#401010");
      } else if (u.kind === "reactor") i *= emerg ? 0.35 : 1 + Math.sin(time * 3) * 0.15;
      else if (u.kind === "laser") i *= state.f.lasersOff ? 0 : 0.85 + Math.sin(time * 20) * 0.15;
      else if (u.kind === "screen") i *= 0.9 + Math.sin(time * 9 + u.phase) * 0.1;
      l.intensity = i;
    }
    room.spot.color.set(emerg ? "#ff6a5a" : "#e8f4ff");
    room.spot.intensity = (emerg ? 8 : 26) * dim;
    room.panelMat.emissive.copy(emerg ? RED : new THREE.Color("#dff2ff"));
    room.panelMat.emissiveIntensity = (emerg ? 0.6 + Math.sin(time * 5) * 0.4 : 2) * dim;
    room.ambient.intensity = room.ambientBase * (emerg ? 0.6 : 1);
    if (escapeT >= 0) room.ambient.intensity += Math.min(3, escapeT * 0.6);
    room.accent.emissiveIntensity = (emerg ? 1.2 : 2.2) * dim;

    const dp = room.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i) + dt * 0.02 * (0.4 + ((i * 7) % 5) / 5);
      if (y > H) y = 0;
      dp.setY(i, y);
      dp.setX(i, dp.getX(i) + Math.sin(time * 0.3 + i) * dt * 0.02);
    }
    dp.needsUpdate = true;

    if (hovered) room.hotspots.get(hovered)?.traverse((m) => m.isMesh && m.material.userData?.saved && (m.material.emissiveIntensity = 0.35 + Math.sin(time * 6) * 0.15));
    for (const f of room.frames) f(time, dt, state);
    renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? 72 : 58;
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
      state = s;
      room = buildRoom(id);
      scene.add(room.group);
      for (const f of room.states) f(s);
      if (enter) {
        dolly = 1.6;
        camPos.copy(CAM_BASE).add(new THREE.Vector3(0, 0, 1.6));
      }
      escapeT = -1;
      scene.fog.color.set("#05070c");
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
