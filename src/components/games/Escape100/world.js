/**
 * Escape 100 — the plain Three.js world.
 *
 * Exactly one room exists at a time: built from the level data + its chapter
 * theme, disposed completely when the level changes. The camera stands in the
 * middle of the room and looks around (drag / touch-drag, wheel / pinch to
 * zoom). Tapping an object glides the camera to a close-up of it (drag there
 * to inspect it from other angles; Back / Esc returns). Picking is a raycast
 * against meshes tagged { oid, part }.
 */
import * as THREE from "three";
import { THEMES } from "./themes.js";
import { BUILDERS, makeKit } from "./props.js";
import { makeDecor } from "./decor.js";
import { itemModel, disposeTree } from "./models.js";
import * as A from "./art.js";
import { test as testCond, visible } from "./engine.js";

const QUALITY = {
  low: { ratio: 1, shadows: false, shadowSize: 512, dust: 0, aa: false },
  medium: { ratio: 1.5, shadows: true, shadowSize: 1024, dust: 120, aa: true },
  high: { ratio: 2, shadows: true, shadowSize: 2048, dust: 260, aa: true },
};
const EYE = 1.62;
const tmpV = new THREE.Vector3();

function rngFor(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** world-space placement of an `at` spec in a w×d room */
export function placement(at, room) {
  const { w, d } = room;
  if (at.w) {
    const off = at.off ?? 0;
    switch (at.w) {
      case "N":
        return { pos: new THREE.Vector3(at.x, at.y, -d / 2 + off + 0.005), rot: 0, wall: "N" };
      case "S":
        return { pos: new THREE.Vector3(-at.x, at.y, d / 2 - off - 0.005), rot: Math.PI, wall: "S" };
      case "E":
        return { pos: new THREE.Vector3(w / 2 - off - 0.005, at.y, at.x), rot: -Math.PI / 2, wall: "E" };
      case "W":
        return { pos: new THREE.Vector3(-w / 2 + off + 0.005, at.y, -at.x), rot: Math.PI / 2, wall: "W" };
      default:
    }
  }
  return { pos: new THREE.Vector3(at.x, at.y ?? 0, at.z), rot: -((at.r ?? 0) * Math.PI) / 180, wall: null };
}

export function createWorld(container, opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "e100-canvas";
  container.appendChild(canvas);
  let quality = QUALITY[opts.quality] ? opts.quality : "medium";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const applyQuality = () => {
    const q = QUALITY[quality];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
    renderer.shadowMap.enabled = q.shadows;
  };
  applyQuality();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.03, 60);
  camera.position.set(0, EYE, 0.4);

  /* ---------- shared (session-long) textures ---------- */
  const shared = new Map();
  const sharedTex = (key, make, repeat) => {
    if (!shared.has(key)) {
      const t = new THREE.CanvasTexture(make());
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      shared.set(key, t);
    }
    const base = shared.get(key);
    if (!repeat) return base;
    const c = base.clone();
    c.repeat.set(...repeat);
    c.needsUpdate = true;
    c.userData.clone = true;
    return c;
  };
  const dustTex = sharedTex("dust", () => A.dustSprite(64));
  const TEXGEN = {
    stone: (o) => A.stoneBlocks(o),
    concrete: (o) => A.concrete(o),
    planks: (o) => A.planks(o),
    wallpaper: (o) => A.wallpaper(o),
    tiles: (o) => A.tiles(o),
    metal: (o) => A.metalPlates(o),
    sandstone: (o) => A.sandstone(o),
    carpet: (o) => A.carpet(o),
    space: (o) => A.spacePanel(o),
    surreal: (o) => A.surreal(o),
  };

  /* ---------- state ---------- */
  let room = null; // { L, theme, group, visuals: Map, owned: [], lights: [], tickers: [] }
  let mode = "menu"; // menu | room | exit
  const view = { yaw: 0, pitch: -0.05, fov: 62, tyaw: 0, tpitch: -0.05, tfov: 62 };
  const focus = { id: null, target: new THREE.Vector3(), pos: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 1, oyaw: 0, opitch: 0, zoom: 1 };
  const camPos = new THREE.Vector3(0, EYE, 0.4), camLook = new THREE.Vector3(0, EYE, -3);
  const wantPos = camPos.clone(), wantLook = camLook.clone();
  let hovered = null;
  let time = 0;
  let exitT = -1;
  let gameState = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /* ---------- menu scene: an endless corridor of doors ---------- */
  const menu = new THREE.Group();
  {
    const mk = makeKit(THEMES[1], []);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(6, 80), new THREE.MeshStandardMaterial({ map: sharedTex("menuFloor", () => A.planks({ base: "#4a2e1c", n: 6 }), [2, 20]), roughness: 0.7 }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.z = -36;
    fl.receiveShadow = true;
    menu.add(fl);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 4), new THREE.MeshStandardMaterial({ map: sharedTex("menuWall", () => A.wallpaper({ base: "#3a1a26" }), [20, 1]), roughness: 0.9 }));
      wall.rotation.y = (-s * Math.PI) / 2;
      wall.position.set(s * 3, 2, -36);
      menu.add(wall);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(6, 80), new THREE.MeshStandardMaterial({ color: "#1a120c", roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 4, -36);
    menu.add(ceil);
    for (let i = 0; i < 12; i++) {
      for (const s of [-1, 1]) {
        const d = BUILDERS.door(mk, { id: "m", style: ["panel", "cell", "vault", "hotel", "stone", "airlock"][(i + (s > 0 ? 3 : 0)) % 6] }, null, THEMES[(i * 3 + (s > 0 ? 1 : 0)) % 10]);
        d.group.position.set(s * 2.98, 0, -3 - i * 6 + (s > 0 ? 3 : 0));
        d.group.rotation.y = (-s * Math.PI) / 2;
        d.group.scale.setScalar(0.95);
        menu.add(d.group);
        menu.userData.doors = menu.userData.doors || [];
        menu.userData.doors.push(d);
        if (i % 4 === 1 && s < 0) d.update({ open: true, locked: false });
        else d.update({ open: false, locked: true });
      }
      const lamp = new THREE.PointLight("#ffb46a", 6, 9, 1.6);
      lamp.position.set(0, 3.6, -i * 6);
      menu.add(lamp);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffd9a0" }));
      bulb.position.copy(lamp.position);
      menu.add(bulb);
    }
    // the final door at the end, glowing
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), new THREE.MeshBasicMaterial({ color: "#fff2c8" }));
    glow.position.set(0, 1.3, -74);
    menu.add(glow);
    menu.add(new THREE.HemisphereLight("#d8b090", "#1a100a", 0.5));
  }

  /* ---------- inventory icons + inspect view (second small renderer) ---------- */
  const mini = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    let r = null;
    try {
      r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.setPixelRatio(1);
      r.setSize(256, 256, false);
    } catch {
      r = null;
    }
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight("#ffffff", "#40383a", 1.6));
    const key = new THREE.DirectionalLight("#fff4e0", 2.4);
    key.position.set(1, 2, 2);
    sc.add(key);
    const env = new THREE.PMREMGenerator(r || renderer);
    const roomEnv = new THREE.Scene();
    roomEnv.add(new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: "#8a7a6a", side: THREE.BackSide })));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    lamp.position.set(2, 3, 2);
    roomEnv.add(lamp);
    let envTex = null;
    try {
      envTex = env.fromScene(roomEnv, 0.04).texture;
      sc.environment = envTex;
    } catch {
      /* no env */
    }
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    cam.position.set(0, 0.12, 0.7);
    cam.lookAt(0, 0, 0);
    const holder = new THREE.Group();
    sc.add(holder);
    const icons = new Map();
    const fit = (m) => {
      const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      const k = 0.26 / Math.max(s.x, s.y, s.z, 0.01);
      m.scale.multiplyScalar(k);
      m.position.sub(c.multiplyScalar(k));
    };
    let inspectObj = null, rotX = 0.3, rotY = 0.5;
    return {
      canvas: cv,
      icon(id, def) {
        if (icons.has(id)) return icons.get(id);
        if (!r) return null;
        const m = itemModel(def);
        const wrap = new THREE.Group();
        wrap.add(m);
        fit(m);
        wrap.rotation.set(0.5, -0.6, 0.1);
        holder.add(wrap);
        r.setClearColor(0x000000, 0);
        r.render(sc, cam);
        const url = cv.toDataURL("image/png");
        holder.remove(wrap);
        disposeTree(wrap);
        icons.set(id, url);
        return url;
      },
      showInspect(def) {
        this.hideInspect();
        if (!r) return;
        const m = itemModel(def);
        inspectObj = new THREE.Group();
        inspectObj.add(m);
        fit(m);
        holder.add(inspectObj);
        rotX = 0.35;
        rotY = 0.6;
      },
      hideInspect() {
        if (inspectObj) {
          holder.remove(inspectObj);
          disposeTree(inspectObj);
          inspectObj = null;
        }
      },
      drag(dx, dy) {
        rotY += dx * 0.012;
        rotX = Math.max(-1.4, Math.min(1.4, rotX + dy * 0.012));
      },
      render(dt) {
        if (!r || !inspectObj) return;
        rotY += dt * 0.25;
        inspectObj.rotation.set(rotX, rotY, 0);
        r.setClearColor(0x000000, 0);
        r.render(sc, cam);
      },
      dispose() {
        this.hideInspect();
        envTex?.dispose();
        env.dispose();
        r?.dispose();
      },
    };
  })();

  /* ---------- room building ---------- */
  function disposeRoom() {
    if (!room) return;
    scene.remove(room.group);
    room.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material)
        for (const m of [].concat(o.material)) {
          for (const k of ["map", "emissiveMap"]) if (m[k] && (m[k].userData.clone || !isShared(m[k]))) m[k].dispose();
          m.dispose();
        }
      if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
    });
    for (const x of room.owned) if (!(x.isTexture && isShared(x))) x.dispose?.();
    room = null;
    hovered = null;
  }
  const isShared = (t) => [...shared.values()].includes(t);

  function buildRoom(L) {
    disposeRoom();
    const theme = THEMES[Math.floor((L.id - 1) / 10)] || THEMES[0];
    const { w, d, h } = L.room;
    const owned = [];
    const group = new THREE.Group();
    const kit = makeKit(theme, owned);
    kit.starTex = () => sharedTex("stars", () => A.starfield(1024, 5));
    const rnd = rngFor(L.id * 31 + 7);
    const visuals = new Map();
    const tickers = [];

    scene.background = new THREE.Color(theme.bg);
    scene.fog = new THREE.FogExp2(theme.fog[0], theme.fog[1]);
    renderer.toneMappingExposure = theme.exposure;

    // surfaces
    const surf = (spec, key, rep) => new THREE.MeshStandardMaterial({ map: sharedTex(`${theme.key}-${key}`, () => TEXGEN[spec.tex](spec.opts || {}), rep), roughness: spec.tex === "metal" ? 0.55 : 0.88, metalness: spec.tex === "metal" ? 0.35 : 0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), surf(theme.floor, "floor", [theme.floor.repeat[0] * (w / 8), theme.floor.repeat[1] * (d / 7)]));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), surf(theme.ceiling, "ceil", theme.ceiling.repeat));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    group.add(ceil);
    const walls = [
      [w, new THREE.Vector3(0, h / 2, -d / 2), 0],
      [w, new THREE.Vector3(0, h / 2, d / 2), Math.PI],
      [d, new THREE.Vector3(w / 2, h / 2, 0), -Math.PI / 2],
      [d, new THREE.Vector3(-w / 2, h / 2, 0), Math.PI / 2],
    ];
    for (const [len, pos, rot] of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), surf(theme.wall, `wall${len}`, [theme.wall.repeat[0] * (len / 8), theme.wall.repeat[1]]));
      m.position.copy(pos);
      m.rotation.y = rot;
      m.receiveShadow = true;
      group.add(m);
      // baseboard + crown trim
      const trimM = kit.std(theme.trim, 0.6, 0.2);
      for (const [y, hh] of [[0.07, 0.14], [h - 0.06, 0.12]]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(len, hh, 0.05), trimM);
        t.position.copy(pos).add(new THREE.Vector3(0, y - h / 2, 0).add(new THREE.Vector3(Math.sin(rot) * 0.025, 0, Math.cos(rot) * 0.025)));
        t.rotation.y = rot;
        t.receiveShadow = true;
        group.add(t);
      }
    }

    // lights
    const amb = new THREE.AmbientLight(theme.ambient[0], theme.ambient[1]);
    const hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]);
    group.add(amb, hemi);
    const q = QUALITY[quality];
    const key = new THREE.SpotLight(theme.lamps[0].color, theme.lamps[0].power * 2.2, 14, 1.15, 0.6, 1.4);
    key.position.set(0.3, h - 0.15, 0.4);
    key.target.position.set(0, 0, 0);
    key.castShadow = q.shadows;
    key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    group.add(key, key.target);
    const flickers = [];
    for (const lamp of theme.lamps) buildLamps(lamp, group, kit, theme, L.room, flickers, tickers);

    // interactive objects
    const occupied = { N: [], S: [], E: [], W: [] };
    const floorBlocks = []; // { x, z, r } — things standing in the room that decor must avoid
    for (const o of L.objects) {
      if (o.kind === "prop") continue;
      const v = BUILDERS[o.kind](kit, o, L, theme);
      const p = placement(o.at, L.room);
      v.group.position.copy(p.pos);
      v.group.rotation.y = p.rot;
      v.wall = p.wall;
      v.def = o;
      // own materials so hover highlight never bleeds into other objects
      v.group.traverse((n) => {
        if (n.isMesh && n.material && !n.userData.noHilite) {
          n.material = n.material.clone();
          owned.push(n.material);
          n.userData.baseEmissive = n.material.emissive ? n.material.emissive.clone() : null;
          n.userData.baseEI = n.material.emissiveIntensity;
        }
      });
      group.add(v.group);
      visuals.set(o.id, v);
      if (p.wall) occupied[p.wall].push([o.at.x - v.size.w / 2 - 0.15, o.at.x + v.size.w / 2 + 0.15, o.at.y, o.at.y + v.size.h]);
      if (!p.wall || (o.at.off ?? 0) > 0.3) floorBlocks.push({ x: p.pos.x, z: p.pos.z, r: Math.max(v.size.w, v.size.d) / 2 + 0.2 });
    }
    // explicit props
    const decor = makeDecor(kit, theme, rnd);
    for (const o of L.objects.filter((o) => o.kind === "prop")) {
      const g = new THREE.Group();
      const info = (decor[o.style] || decor.crates)(g);
      const p = placement(o.at, L.room);
      g.position.copy(p.pos);
      g.rotation.y = p.rot;
      group.add(g);
      decorExtras(info, g, group, tickers, flickers);
      if (p.wall) occupied[p.wall].push([o.at.x - info.w / 2 - 0.1, o.at.x + info.w / 2 + 0.1, 0, 3]);
      floorBlocks.push({ x: p.pos.x, z: p.pos.z, r: Math.max(info.w, info.d) / 2 });
    }
    // automatic set dressing in free wall space
    const wallLen = { N: w, S: w, E: d, W: d };
    const pool = theme.decor;
    let pi = Math.floor(rnd() * pool.length);
    for (const wall of ["N", "E", "S", "W"]) {
      const len = wallLen[wall], segs = occupied[wall].filter((r) => r[2] < 2.2).sort((a, b) => a[0] - b[0]);
      let x = -len / 2 + 0.35;
      const gaps = [];
      for (const r of segs) {
        if (r[0] - x > 0.5) gaps.push([x, r[0]]);
        x = Math.max(x, r[1]);
      }
      if (len / 2 - 0.35 - x > 0.5) gaps.push([x, len / 2 - 0.35]);
      for (const [a, b] of gaps) {
        let cursor = a;
        for (let tries = 0; tries < 4 && b - cursor > 0.5; tries++) {
          const name = pool[pi++ % pool.length];
          const g = new THREE.Group();
          const info = decor[name](g);
          if (info.w > b - cursor) {
            g.traverse((n) => n.geometry?.dispose());
            continue;
          }
          const cx = cursor + info.w / 2 + rnd() * Math.min(0.3, b - cursor - info.w);
          const p = placement({ w: wall, x: cx, y: 0, off: info.place === "floor" ? info.d / 2 + 0.15 : 0 }, L.room);
          // keep clear of puzzle objects standing out in the room
          const inward = new THREE.Vector3(Math.sin(p.rot), 0, Math.cos(p.rot)).multiplyScalar(info.place === "floor" ? 0 : info.d / 2);
          const c = p.pos.clone().add(inward), rr = Math.max(info.w, info.d) / 2;
          if (floorBlocks.some((f) => Math.hypot(f.x - c.x, f.z - c.z) < f.r + rr)) {
            g.traverse((n) => n.geometry?.dispose());
            cursor += 0.4;
            continue;
          }
          g.position.copy(p.pos);
          g.rotation.y = p.rot;
          group.add(g);
          decorExtras(info, g, group, tickers, flickers);
          cursor = cx + info.w / 2 + 0.25;
        }
      }
    }
    // dust
    if (q.dust) {
      const n = q.dust, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([(rnd() - 0.5) * w, rnd() * h, (rnd() - 0.5) * d], i * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const dust = new THREE.Points(geo, new THREE.PointsMaterial({ map: dustTex, size: 0.035, transparent: true, opacity: 0.35, depthWrite: false, color: theme.key === "dimension" ? "#c8a0ff" : "#fff2d8" }));
      group.add(dust);
      tickers.push((dt) => {
        const a = geo.attributes.position.array;
        for (let i = 0; i < n; i++) {
          a[i * 3 + 1] += dt * 0.03 * (0.5 + ((i * 7) % 5) / 5);
          a[i * 3] += Math.sin(time * 0.3 + i) * dt * 0.02;
          if (a[i * 3 + 1] > h) a[i * 3 + 1] = 0;
        }
        geo.attributes.position.needsUpdate = true;
      });
    }
    scene.add(group);
    room = { L, theme, group, visuals, owned, tickers, flickers, key };
    // start view: face the exit door
    const door = L.objects.find((o) => o.kind === "door");
    const dp = placement(door.at, L.room).pos;
    view.yaw = view.tyaw = Math.atan2(-dp.x, -dp.z);
    view.pitch = view.tpitch = -0.08;
    view.fov = view.tfov = 64;
    focus.id = null;
    camPos.set(Math.sin(view.yaw) * -0.6, EYE, Math.cos(view.yaw) * -0.6).multiplyScalar(1);
    camPos.y = EYE;
    exitT = -1;
    mode = "room";
  }

  function decorExtras(info, g, group, tickers, flickers) {
    if (info.light) {
      const [x, y, z, c, p] = info.light;
      const l = new THREE.PointLight(c, p, 5, 1.8);
      l.position.set(x, y, z);
      g.add(l);
      if (info.flicker) flickers.push({ light: l, base: p, mesh: info.flicker });
    }
    if (info.swing) tickers.push(() => (info.swing.rotation.z = Math.sin(time * 2.2) * 0.18));
    if (info.spin) tickers.push((dt) => (info.spin.rotation.z += dt * 0.25));
    if (info.bob) tickers.push(() => info.bob.forEach((c) => ((c.position.y = c.userData.base + Math.sin(time * 0.8 + c.userData.ph) * 0.12), (c.rotation.y += 0.004), (c.rotation.x += 0.002))));
    void group;
  }

  function buildLamps(lamp, group, kit, theme, R, flickers, tickers) {
    const { w, d, h } = R;
    const add = (x, y, z, power, dist = 9, mesh) => {
      const l = new THREE.PointLight(lamp.color, power, dist, 1.6);
      l.position.set(x, y, z);
      group.add(l);
      if (lamp.flicker || lamp.kind === "torches") flickers.push({ light: l, base: power, mesh });
      return l;
    };
    switch (lamp.kind) {
      case "cage":
      case "caged": {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), kit.glow(lamp.color, 3));
        bulb.position.set(0, h - 0.35, 0);
        group.add(bulb);
        const cage = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: "#2a2826", wireframe: true }));
        cage.position.copy(bulb.position);
        group.add(cage);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), kit.dark());
        cord.position.set(0, h - 0.15, 0);
        group.add(cord);
        add(0, h - 0.45, 0, lamp.power);
        tickers.push(() => (bulb.position.x = cage.position.x = Math.sin(time * 0.7) * 0.02));
        break;
      }
      case "chandelier": {
        const g = new THREE.Group();
        g.position.set(0, h - 0.6, 0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 8, 32), kit.metal(theme.metal, 0.3));
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), kit.glow(lamp.color, 3));
          f.position.set(Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45);
          f.scale.y = 1.5;
          g.add(f);
        }
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), kit.metal(theme.metal));
        chain.position.y = 0.3;
        g.add(chain);
        group.add(g);
        add(0, h - 0.5, 0, lamp.power);
        break;
      }
      case "tube":
      case "strip":
        for (const x of [-w / 4, w / 4]) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, d * 0.6), kit.glow(lamp.color, 2.2));
          t.position.set(x, h - 0.04, 0);
          group.add(t);
          add(x, h - 0.4, 0, lamp.power * 0.6);
        }
        break;
      case "torches":
      case "sconces":
        for (const [x, z, ry] of [[-w / 2 + 0.12, -d / 4, Math.PI / 2], [w / 2 - 0.12, -d / 4, -Math.PI / 2], [-w / 2 + 0.12, d / 4, Math.PI / 2], [w / 2 - 0.12, d / 4, -Math.PI / 2]]) {
          const g = new THREE.Group();
          g.position.set(x, 2.1, z);
          g.rotation.y = ry;
          const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.025, 0.25, 8), kit.metal(theme.metal, 0.5));
          holder.rotation.x = 0.4;
          holder.position.z = 0.08;
          g.add(holder);
          const fl = new THREE.Mesh(lamp.kind === "torches" ? new THREE.ConeGeometry(0.06, 0.18, 8) : new THREE.SphereGeometry(0.06, 10, 8), kit.glow(lamp.color, 3));
          fl.position.set(0, 0.17, 0.13);
          g.add(fl);
          group.add(g);
          const l = add(x + (x > 0 ? -0.35 : 0.35), 2.3, z, lamp.power, 7, fl);
          void l;
        }
        break;
      case "industrial": {
        for (const x of [-w / 4, w / 4]) {
          const dome = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 16, 1, true), kit.metal("#3a3a3a", 0.5));
          dome.position.set(x, h - 0.5, 0);
          group.add(dome);
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), kit.glow(lamp.color, 3));
          b.position.set(x, h - 0.6, 0);
          group.add(b);
          add(x, h - 0.7, 0, lamp.power * 0.7);
        }
        break;
      }
      case "alarm": {
        const a = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.14, 12), kit.glow("#ff2a1a", 2));
        a.position.set(w / 2 - 0.3, h - 0.1, -d / 2 + 0.3);
        group.add(a);
        const sp = new THREE.SpotLight("#ff2a1a", lamp.power * 3, 10, 0.5, 0.5);
        sp.position.copy(a.position);
        group.add(sp, sp.target);
        tickers.push(() => sp.target.position.set(a.position.x + Math.cos(time * 2) * 3, 0, a.position.z + Math.sin(time * 2) * 3));
        break;
      }
      case "orbs":
        for (let i = 0; i < 3; i++) {
          const o = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), kit.glow(lamp.color, 2.5));
          group.add(o);
          const l = add(0, 2.6, 0, lamp.power * 0.5);
          tickers.push(() => {
            const a = time * 0.25 + (i * Math.PI * 2) / 3;
            o.position.set(Math.cos(a) * 1.6, 2.7 + Math.sin(time + i) * 0.15, Math.sin(a) * 1.4);
            l.position.copy(o.position);
          });
        }
        break;
      default:
        add(0, h - 0.4, 0, lamp.power);
    }
  }

  /* ---------- state sync ---------- */
  function sync(s) {
    gameState = s;
    if (!room) return;
    const test = (c) => testCond(room.L, s, c);
    for (const [id, v] of room.visuals) {
      const show = visible(room.L, s, v.def);
      v.group.visible = show;
      if (show) v.update(s.obj[id], s, test);
    }
  }

  function fx(list) {
    if (!room) return;
    for (const f of list) {
      if (f.type === "press") room.visuals.get(f.id)?.press?.(f.b);
    }
  }

  /* ---------- camera ---------- */
  function focusOn(id) {
    const v = room?.visuals.get(id);
    if (!v) return;
    const R = room.L.room;
    const g = v.group;
    const fy = v.focus?.y ?? v.size.h / 2;
    const normal = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
    const target = new THREE.Vector3(0, fy, Math.min(v.size.d, 0.6) * 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    let dir;
    if (!v.wall) {
      // floor objects: approach from the room centre side, a little from above
      dir = new THREE.Vector3(-g.position.x, 0, -g.position.z);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize();
      dir.y = v.focus?.top || v.focus?.flat ? 1.4 : v.def?.kind === "container" ? 0.9 : 0.55;
      dir.normalize();
    } else {
      dir = normal.clone();
      // containers are looked into from above so their contents are visible
      const into = v.def?.kind === "container" ? 0.75 : 0;
      dir.y = v.focus?.flat ? 1.6 : into || (target.y > 2.2 ? -0.35 : target.y < 0.7 ? 0.45 : 0.08);
      dir.normalize();
    }
    focus.id = id;
    focus.target.copy(target);
    focus.dir.copy(dir);
    focus.dist = v.focus?.dist ?? 1;
    focus.oyaw = 0;
    focus.opitch = 0;
    focus.zoom = 1;
  }
  function unfocus() {
    if (!focus.id) return;
    // keep looking in the same direction we were
    const d = wantLook.clone().sub(new THREE.Vector3(0, EYE, 0));
    view.tyaw = view.yaw = Math.atan2(d.x, d.z) + Math.PI;
    view.tyaw = view.yaw = Math.atan2(-d.x, -d.z);
    view.tpitch = Math.max(-0.9, Math.min(0.6, Math.atan2(d.y, Math.hypot(d.x, d.z))));
    focus.id = null;
  }
  function clampInRoom(p) {
    const R = room.L.room;
    p.x = Math.max(-R.w / 2 + 0.25, Math.min(R.w / 2 - 0.25, p.x));
    p.z = Math.max(-R.d / 2 + 0.25, Math.min(R.d / 2 - 0.25, p.z));
    p.y = Math.max(0.3, Math.min(R.h - 0.2, p.y));
    return p;
  }

  function updateCamera(dt) {
    if (mode === "menu") {
      const z = -((time * 0.6) % 6);
      camera.position.set(Math.sin(time * 0.3) * 0.15, 1.65 + Math.sin(time * 1.6) * 0.02, 2 + z);
      camera.lookAt(Math.sin(time * 0.2) * 0.4, 1.5, -20 + z);
      camera.fov = 62;
      camera.updateProjectionMatrix();
      return;
    }
    if (!room) return;
    if (exitT >= 0) {
      const door = room.visuals.get("door");
      const n = new THREE.Vector3(Math.sin(door.group.rotation.y), 0, Math.cos(door.group.rotation.y));
      const t = Math.min(1, exitT / 2.6);
      const k = t * t * (3 - 2 * t);
      wantLook.copy(door.group.position).add(new THREE.Vector3(0, 1.25, 0)).addScaledVector(n, -2);
      wantPos.copy(door.group.position).add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(n, 2.4 - k * 2.9);
    } else if (focus.id) {
      const d = focus.dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), focus.oyaw);
      const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
      d.applyAxisAngle(right, focus.opitch).normalize();
      wantPos.copy(focus.target).addScaledVector(d, focus.dist * focus.zoom);
      clampInRoom(wantPos);
      wantLook.copy(focus.target);
    } else {
      view.yaw += (view.tyaw - view.yaw) * Math.min(1, dt * 12);
      view.pitch += (view.tpitch - view.pitch) * Math.min(1, dt * 12);
      const dir = new THREE.Vector3(-Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), -Math.cos(view.yaw) * Math.cos(view.pitch));
      // stand slightly behind centre, opposite the view direction, so more of the room is visible
      wantPos.set(-dir.x * 0.9, EYE, -dir.z * 0.9);
      clampInRoom(wantPos);
      wantLook.copy(wantPos).addScaledVector(dir, 3);
    }
    const k = Math.min(1, dt * (exitT >= 0 ? 3 : focus.id ? 5 : 9));
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    const fovT = focus.id ? 50 : view.tfov;
    view.fov += (fovT - view.fov) * Math.min(1, dt * 8);
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
  }

  /* ---------- picking ---------- */
  function pickAt(x, y) {
    if (!room || mode !== "room") return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const targets = [];
    for (const v of room.visuals.values()) if (v.group.visible) targets.push(v.group);
    const hits = raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      let n = h.object;
      if (!n.visible) continue;
      let vis = true;
      for (let p = n; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) continue;
      const oid = n.userData.oid;
      if (!oid) continue;
      const v = room.visuals.get(oid);
      // something already slid aside is inert — let taps reach whatever it uncovered
      if (v.def.kind === "movable" && gameState?.obj[oid]?.moved) continue;
      const local = v.group.worldToLocal(h.point.clone());
      return { oid, part: n.userData.part ?? null, dir: local.y >= (v.focus?.y ?? 0) ? 1 : -1, point: h.point, distance: h.distance };
    }
    return null;
  }
  function setHover(oid) {
    if (hovered === oid || !room) return;
    const paint = (id, on) => {
      const v = room.visuals.get(id);
      if (!v) return;
      v.group.traverse((n) => {
        if (!n.isMesh || !n.material?.emissive || !n.userData.baseEmissive) return;
        if (on) {
          n.material.emissive.set("#ffb860");
          n.material.emissiveIntensity = 0.16;
        } else {
          n.material.emissive.copy(n.userData.baseEmissive);
          n.material.emissiveIntensity = n.userData.baseEI;
        }
      });
    };
    if (hovered) paint(hovered, false);
    hovered = oid;
    if (oid) paint(oid, true);
  }

  /* ---------- input ---------- */
  const pointers = new Map();
  let drag = null, pinch = null;
  const onDown = (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic / already-released pointer */
    }
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, t: performance.now() };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: view.tfov, zoom: focus.zoom };
      drag = null;
    }
  };
  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (p) (p.x = e.clientX), (p.y = e.clientY);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const k = pinch.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      if (focus.id) focus.zoom = Math.max(0.55, Math.min(1.8, pinch.zoom * k));
      else view.tfov = Math.max(30, Math.min(75, pinch.fov * k));
      return;
    }
    if (drag && pointers.size === 1) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (mode !== "room" || exitT >= 0) return;
      const sens = (opts.sensitivity?.() ?? 1) * 0.0042 * (view.fov / 62);
      if (focus.id) {
        focus.oyaw = Math.max(-0.75, Math.min(0.75, focus.oyaw - dx * sens * 1.2));
        focus.opitch = Math.max(-0.55, Math.min(0.5, focus.opitch - dy * sens * 1.2));
      } else {
        view.tyaw += dx * sens;
        view.tpitch = Math.max(-0.95, Math.min(0.7, view.tpitch + dy * sens));
      }
      return;
    }
    if (e.pointerType === "mouse" && mode === "room") {
      const hit = pickAt(e.clientX, e.clientY);
      setHover(hit?.oid ?? null);
      canvas.style.cursor = hit ? "pointer" : "grab";
      opts.onHover?.(hit ? hit.oid : null);
    }
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && pointers.size === 0) {
      if (drag.moved < 8 && mode === "room" && exitT < 0) {
        const hit = pickAt(e.clientX, e.clientY);
        if (hit) opts.onPick?.(hit);
        else opts.onPick?.(null);
      }
      drag = null;
    }
  };
  const onWheel = (e) => {
    if (mode !== "room") return;
    e.preventDefault();
    if (focus.id) focus.zoom = Math.max(0.55, Math.min(1.8, focus.zoom * (1 + Math.sign(e.deltaY) * 0.1)));
    else view.tfov = Math.max(30, Math.min(75, view.tfov + Math.sign(e.deltaY) * 4));
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  /* ---------- loop ---------- */
  let raf = 0, last = performance.now(), running = true, manual = false;
  function frame(dt) {
    time += dt;
    if (room && mode !== "menu") {
      for (const v of room.visuals.values()) v.tick(dt, time);
      for (const t of room.tickers) t(dt);
      for (const f of room.flickers) {
        const n = 0.82 + Math.sin(time * 13 + f.base) * 0.08 + Math.sin(time * 31 + f.base * 3) * 0.06 + (Math.random() < 0.01 ? -0.3 : 0);
        f.light.intensity = f.base * n;
        if (f.mesh) f.mesh.scale.y = 0.9 + n * 0.25;
      }
      if (exitT >= 0) {
        exitT += dt;
        if (exitT > 2.4 && !room.exitDone) {
          room.exitDone = true;
          opts.onExitDone?.();
        }
      }
    }
    if (mode === "menu") for (const d of menu.userData.doors) d.tick(dt, time);
    updateCamera(dt);
    renderer.render(mode === "menu" ? menuScene : scene, camera);
    mini.render(dt);
  }
  const menuScene = new THREE.Scene();
  menuScene.add(menu);
  menuScene.background = new THREE.Color("#07050a");
  menuScene.fog = new THREE.FogExp2("#07050a", 0.07);
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running && !manual) frame(dt);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  function resize() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(container);
  resize();

  return {
    canvas,
    renderer,
    get mode() {
      return mode;
    },
    get focusId() {
      return focus.id;
    },
    get roomId() {
      return room?.L.id ?? null;
    },
    loadLevel(L, s) {
      buildRoom(L);
      sync(s);
      for (let i = 0; i < 30; i++) for (const v of room.visuals.values()) v.tick(0.1, 0);
    },
    showMenu() {
      disposeRoom();
      mode = "menu";
      focus.id = null;
    },
    sync,
    fx,
    focusOn,
    unfocus,
    playExit() {
      focus.id = null;
      exitT = 0;
      mode = "room";
    },
    setPaused(p) {
      running = !p;
    },
    setManual(m) {
      manual = m;
    },
    advance(frames = 1, dt = 1 / 60) {
      for (let i = 0; i < frames; i++) frame(dt);
    },
    setQuality(qn) {
      if (!QUALITY[qn] || qn === quality) return;
      quality = qn;
      applyQuality();
      resize();
      if (room) {
        const L = room.L;
        buildRoom(L);
        if (gameState) sync(gameState);
      }
    },
    itemIcon: (id, def) => mini.icon(id, def),
    inspect: mini,
    resize,
    /** screen position of an object (for tests and tutorial pointers) */
    project(oid, part) {
      const v = room?.visuals.get(oid);
      if (!v) return null;
      let target = v.group;
      if (part) v.group.traverse((n) => n.userData.part === part && n.isMesh && (target = n));
      const b = new THREE.Box3().setFromObject(target);
      const c = b.getCenter(tmpV.clone());
      c.project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height, behind: c.z > 1 };
    },
    pickAt,
    /** every mesh under a screen point (debugging picking) */
    debugPick(x, y) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(room ? [room.group] : [], true).slice(0, 8).map((h) => ({ oid: h.object.userData.oid ?? null, part: h.object.userData.part ?? null, d: +h.distance.toFixed(2), type: h.object.type }));
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      disposeRoom();
      menu.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) for (const m of [].concat(o.material)) m.dispose();
      });
      shared.forEach((t) => t.dispose());
      mini.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
