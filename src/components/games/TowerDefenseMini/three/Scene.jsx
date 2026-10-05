/**
 * Tower Defense Mini — the 3D battlefield (React Three Fiber).
 *
 * <Driver> is the ONLY place the engine is ticked (one useFrame). It then
 * drains engine.events onto `bus`, which feeds effects, floating numbers and
 * (in the root component) sound. Every other component READS engine state
 * each frame and updates pooled Three.js objects directly — React never
 * re-renders per frame and nothing allocates geometry/materials per frame.
 *
 * `view` is a small mutable object shared with the DOM layer: hovered /
 * selected pad, range previews, the camera's project/toScreen helpers.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MAP } from "../data/levels.js";
import { TOWERS } from "../data/towers.js";
import { ENEMIES } from "../data/enemies.js";
import { distToPath } from "../engine/path.js";
import { buildPad, buildTower, buildEnemy, buildBase, buildGate, propParts, PROP_SIZE, PROP_TALL, flowerColors, FLASH_MAT, G, M } from "./models.js";
import { groundTexture, rippleTexture, lavaTexture, dotTexture, blobTexture, padMarkTexture, GROUND } from "./textures.js";

const tmpV = new THREE.Vector3();
const tmpObj = new THREE.Object3D();
const tmpCol = new THREE.Color();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const easeOutBack = (k) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};

/* ================================================================ driver */
export function Driver({ engine, bus }) {
  useFrame((_, dt) => {
    engine.frame(dt);
    if (engine.events.length) {
      const ev = engine.events.splice(0, engine.events.length);
      for (const h of bus.handlers) h(ev);
    }
  }, -2);
  return null;
}

/* ================================================================ camera */
export function levelBounds(level, paths) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const add = (x, z, r = 0) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minZ = Math.min(minZ, z - r);
    maxZ = Math.max(maxZ, z + r);
  };
  for (const p of paths)
    for (const [x, z] of p.dense) if (x >= MAP.minX - 1 && x <= MAP.maxX + 1 && z >= MAP.minZ - 1 && z <= MAP.maxZ + 1) add(Math.max(MAP.minX - 0.6, Math.min(MAP.maxX + 0.6, x)), Math.max(MAP.minZ - 0.6, Math.min(MAP.maxZ + 0.6, z)), 0.9);
  for (const [x, z] of level.spots) add(x, z, 1.0);
  const end = level.paths[0][level.paths[0].length - 1];
  add(end[0], end[1], 1.6);
  return { minX, maxX, minZ, maxZ };
}

export function CameraRig({ engine, view, mode, bounds, motion }) {
  const { camera, size } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const fit = useRef(null);

  // find the camera distance / aim that frames the whole battlefield
  useEffect(() => {
    if (!bounds) return;
    const aspect = size.width / Math.max(1, size.height);
    const portrait = aspect < 0.95;
    const yaw = portrait ? -Math.PI / 2 : 0;
    const pitch = portrait ? 0.98 : 0.86; // radians above the horizon
    const cx = (bounds.minX + bounds.maxX) / 2;
    let cz = (bounds.minZ + bounds.maxZ) / 2;
    const pts = [];
    for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) for (const y of [0, 1.6]) pts.push(new THREE.Vector3(x, y, z));
    const cam = camera.clone();
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    // HUD lives at the top, the wave button bottom-right: keep the field inside
    const top = portrait ? 0.74 : 0.8;
    const bottom = portrait ? -0.72 : -0.9;
    const side = 0.96;
    const place = (D, tz, tx) => {
      cam.position.set(tx + dir.x * D, dir.y * D, tz + dir.z * D);
      cam.lookAt(tx, 0, tz);
      cam.updateMatrixWorld();
    };
    let tx = cx;
    let D = 30;
    for (let iter = 0; iter < 4; iter++) {
      let lo = 4;
      let hi = 120;
      for (let i = 0; i < 30; i++) {
        D = (lo + hi) / 2;
        place(D, cz, tx);
        let okk = true;
        for (const p of pts) {
          tmpV.copy(p).project(cam);
          if (tmpV.x < -side || tmpV.x > side || tmpV.y < bottom || tmpV.y > top || tmpV.z > 1) {
            okk = false;
            break;
          }
        }
        if (okk) hi = D;
        else lo = D;
      }
      D = hi;
      place(D, cz, tx);
      // balance the margins (perspective makes the near edge bigger)
      let mnY = Infinity;
      let mxY = -Infinity;
      let mnX = Infinity;
      let mxX = -Infinity;
      for (const p of pts) {
        tmpV.copy(p).project(cam);
        mnY = Math.min(mnY, tmpV.y);
        mxY = Math.max(mxY, tmpV.y);
        mnX = Math.min(mnX, tmpV.x);
        mxX = Math.max(mxX, tmpV.x);
      }
      const errY = (mxY - top + (mnY - bottom)) / 2; // >0 → content sits high
      const errX = (mxX - side + (mnX + side)) / 2;
      const span = D * Math.tan((camera.fov * Math.PI) / 360);
      if (portrait) {
        tx += errY * span * 0.9;
        cz += errX * span * 0.9 * aspect;
      } else {
        cz -= errY * span * 0.9;
        tx += errX * span * 0.9 * aspect;
      }
    }
    fit.current = { pos: cam.position.clone(), look: new THREE.Vector3(tx, 0, cz), D };
  }, [bounds, size.width, size.height, camera]);

  useEffect(() => {
    view.project = (nx, ny) => {
      ray.setFromCamera({ x: nx, y: ny }, camera);
      const hit = ray.ray.intersectPlane(plane, tmpV);
      return hit ? [hit.x, hit.z] : null;
    };
    view.toScreen = (x, y, z) => {
      tmpV.set(x, y, z).project(camera);
      return [((tmpV.x + 1) / 2) * size.width, ((1 - tmpV.y) / 2) * size.height];
    };
    view.size = [size.width, size.height];
    return () => {
      view.project = null;
      view.toScreen = null;
    };
  }, [camera, ray, plane, view, size.width, size.height]);

  const cur = useRef({ pos: new THREE.Vector3(0, 30, 20), look: new THREE.Vector3(), mode: null, wantPos: new THREE.Vector3(), wantLook: new THREE.Vector3() });
  useFrame((st, dt) => {
    const c = cur.current;
    const t = st.clock.elapsedTime;
    const pos = c.wantPos;
    const look = c.wantLook;
    if (mode === "showcase") {
      look.set(SHOWCASE.x - 3.4, 1.25, 0);
      pos.set(SHOWCASE.x - 1.2 + Math.sin(t * 0.25) * 0.4, 3.6, 9.6);
    } else if (mode === "menu" && fit.current) {
      const f = fit.current;
      const a = 0.42 + (motion ? Math.sin(t * 0.07) * 0.12 : 0);
      look.set(f.look.x + 3.5, 0, f.look.z + 0.5);
      pos.set(look.x + Math.sin(a) * 15, 9.5, look.z + Math.cos(a) * 15);
    } else if (fit.current) {
      look.copy(fit.current.look);
      pos.copy(fit.current.pos);
      if (motion && !view.freeze) {
        pos.x += Math.sin(t * 0.21) * 0.12;
        pos.z += Math.cos(t * 0.17) * 0.1;
      }
    } else return;
    const snap = c.mode !== mode;
    c.mode = mode;
    const k = snap ? 1 : 1 - Math.exp(-dt * 3);
    c.pos.lerp(pos, k);
    c.look.lerp(look, k);
    camera.position.copy(c.pos);
    if (view.shake > 0 && motion) {
      const s = view.shake * 0.12;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      view.shake = Math.max(0, view.shake - dt * 2.5);
    } else view.shake = 0;
    camera.lookAt(c.look);
  });
  return null;
}

/* ================================================================ environment */
export function Lights({ world, shadows, quality, center }) {
  const light = useRef();
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target = target;
    target.position.set(center[0], 0, center[1]);
    l.position.set(center[0] - 9, 22, center[1] + 11);
    target.updateMatrixWorld();
    const cam = l.shadow.camera;
    cam.left = -21;
    cam.right = 21;
    cam.top = 15;
    cam.bottom = -15;
    cam.near = 1;
    cam.far = 70;
    cam.updateProjectionMatrix();
    l.shadow.mapSize.set(quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024);
    l.shadow.bias = -0.0006;
    l.shadow.normalBias = 0.03;
    if (l.shadow.map) {
      l.shadow.map.dispose();
      l.shadow.map = null;
    }
  }, [center, quality, target]);
  return (
    <>
      <hemisphereLight args={[world.hemi[0], world.hemi[1], world.hemiI]} />
      <directionalLight ref={light} color={world.sun} intensity={world.sunI} castShadow={shadows} />
      <primitive object={target} />
      <ambientLight intensity={0.18} />
    </>
  );
}

export function Ground({ level, world, paths, quality }) {
  const tex = useMemo(() => groundTexture(level, world, paths, quality), [level, world, paths, quality]);
  useEffect(() => () => tex.dispose(), [tex]);
  const outer = useMemo(() => M(world.grass[0], { flatShading: false, roughness: 1 }), [world]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(GROUND.minX + GROUND.maxX) / 2, 0, (GROUND.minZ + GROUND.maxZ) / 2]} receiveShadow>
        <planeGeometry args={[GROUND.maxX - GROUND.minX, GROUND.maxZ - GROUND.minZ]} />
        <meshStandardMaterial map={tex} roughness={1} metalness={0} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 0]} material={outer} receiveShadow>
        <planeGeometry args={[400, 400]} />
      </mesh>
    </group>
  );
}

export function Backdrop({ world, center }) {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const R = rng(world.id * 31);
    const add = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(center[0] + x, y, center[1] + z);
      m.scale.set(sx, sy, sz);
      m.rotation.y = ry;
      g.add(m);
    };
    const hill = G("hill", () => new THREE.IcosahedronGeometry(1, 1));
    const peak = G("peak", () => new THREE.ConeGeometry(1, 1, 7));
    const ring = [];
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * 0.95 + (i / 15) * Math.PI * 0.9 - Math.PI * 0.05;
      ring.push([Math.cos(a) * (32 + R() * 6), Math.sin(a) * (21 + R() * 5)]);
    }
    for (const [x, z] of ring) {
      if (world.id === 1) add(hill, M(R() > 0.5 ? "#5fae4a" : "#6dbb52"), x, -1, z, 6 + R() * 5, 3 + R() * 3, 5 + R() * 3, R() * 3);
      else if (world.id === 2) add(peak, M(R() > 0.5 ? "#c98a52" : "#d99c62"), x, 0, z, 4 + R() * 3, 3 + R() * 4, 4 + R() * 3, R() * 3);
      else if (world.id === 3) {
        const h = 6 + R() * 7;
        const s = 4 + R() * 3;
        add(peak, M("#8a9cb0"), x, h / 2 - 0.5, z, s, h, s, R() * 3);
        add(peak, M("#f4f8ff"), x, h - h * 0.17 - 0.5, z, s * 0.36, h * 0.34, s * 0.36, R() * 3);
      } else if (world.id === 4) add(hill, M(R() > 0.5 ? "#2f4429" : "#3a5233"), x, -1, z, 6 + R() * 5, 3 + R() * 3, 5 + R() * 3, R() * 3);
      else {
        const h = 5 + R() * 7;
        const s = 4 + R() * 3;
        add(peak, M("#2e2422"), x, h / 2 - 0.5, z, s, h, s, R() * 3);
        if (R() > 0.55) add(G("lavacap", () => new THREE.CylinderGeometry(1, 1, 0.2, 7)), M("#ff6a1f", { emissive: "#ff4a10", emissiveIntensity: 2 }), x, h - 0.6, z, s * 0.12, 1, s * 0.12);
      }
    }
    return g;
  }, [world, center]);
  return <primitive object={group} />;
}

export function Water({ level, world }) {
  const items = useMemo(() => {
    const kind = world.waterKind;
    const base =
      kind === "lava"
        ? new THREE.MeshStandardMaterial({ color: "#ff6a1f", emissive: "#ff5a10", emissiveIntensity: 1.3, emissiveMap: lavaTexture(), map: lavaTexture(), roughness: 0.9 })
        : kind === "ice"
        ? new THREE.MeshStandardMaterial({ color: world.water, roughness: 0.15, metalness: 0.1 })
        : new THREE.MeshStandardMaterial({ color: world.water, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.92 });
    const rip = kind === "lava" || kind === "ice" ? null : new THREE.MeshBasicMaterial({ map: rippleTexture().clone(), transparent: true, opacity: kind === "bog" ? 0.18 : 0.35, depthWrite: false });
    if (rip) {
      rip.map.wrapS = rip.map.wrapT = THREE.RepeatWrapping;
      rip.map.needsUpdate = true;
    }
    if (base.map) {
      base.map = base.map.clone();
      base.emissiveMap = base.map;
      base.map.wrapS = base.map.wrapT = THREE.RepeatWrapping;
      base.map.needsUpdate = true;
    }
    const geo = G("pond", () => new THREE.CircleGeometry(1, 40));
    const deep = M(world.waterDeep, { flatShading: false });
    return { base, rip, geo, deep };
  }, [world]);
  useEffect(
    () => () => {
      items.base.dispose();
      if (items.rip) items.rip.dispose();
    },
    [items]
  );
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (items.rip) items.rip.map.offset.set(t * 0.02, t * 0.035);
    if (items.base.map) items.base.map.offset.set(t * 0.012, t * 0.008);
  });
  return (
    <group>
      {level.water.map(([x, z, rx, rz], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={items.geo} material={items.deep} rotation-x={-Math.PI / 2} position-y={0.02} scale={[rx * 0.75, rz * 0.75, 1]} />
          <mesh geometry={items.geo} material={items.base} rotation-x={-Math.PI / 2} position-y={0.04} scale={[rx, rz, 1]} receiveShadow />
          {items.rip && <mesh geometry={items.geo} material={items.rip} rotation-x={-Math.PI / 2} position-y={0.05} scale={[rx, rz, 1]} />}
        </group>
      ))}
    </group>
  );
}

/** Scatter world props around (and a little inside) the field, clear of roads, pads, ponds and the base. */
function scatter(level, world, paths, quality) {
  const R = rng(level.id * 977 + 3);
  const density = quality === "low" ? 0.5 : quality === "high" ? 1.35 : 1;
  const end = level.paths[0][level.paths[0].length - 1];
  const gates = level.paths.map((w) => w[0]);
  const out = {};
  const placed = [];
  const blocked = (x, z, r, tall) => {
    for (const p of paths) {
      const d = distToPath(p, x, z);
      if (d < 1.15 + r) return true;
      if (tall && d < 2.6 + r) return true;
    }
    for (const [sx, sz] of level.spots) if (Math.hypot(x - sx, z - sz) < (tall ? 2.0 : 1.2) + r) return true;
    for (const [wx, wz, rx, rz] of level.water) if (((x - wx) / (rx + 0.4 + r)) ** 2 + ((z - wz) / (rz + 0.4 + r)) ** 2 < 1) return true;
    if (Math.hypot(x - end[0], z - end[1]) < 2.8 + r) return true;
    for (const [gx, gz] of gates) if (Math.hypot(x - Math.max(MAP.minX - 1, Math.min(MAP.maxX + 1, gx)), z - Math.max(MAP.minZ - 1, Math.min(MAP.maxZ + 1, gz))) < 2.4 + r) return true;
    for (const [px, pz, pr] of placed) if (Math.hypot(x - px, z - pz) < (pr + r) * 0.8) return true;
    return false;
  };
  const inField = (x, z) => x > MAP.minX && x < MAP.maxX && z > MAP.minZ && z < MAP.maxZ;
  for (const [kind, weight] of Object.entries(world.props)) {
    const tall = PROP_TALL.has(kind);
    const n = Math.round(weight * 3.2 * density * (kind === "flower" ? 1.6 : 1));
    const list = (out[kind] = []);
    const r = PROP_SIZE[kind] || 0.5;
    for (let tries = 0; list.length < n && tries < n * 30; tries++) {
      const x = GROUND.minX + 1 + R() * (GROUND.maxX - GROUND.minX - 2);
      const z = GROUND.minZ + 1 + R() * (GROUND.maxZ - GROUND.minZ - 2);
      const inside = inField(x, z);
      if (kind === "mesa" || kind === "wall") {
        if (inside || z > MAP.maxZ - 2) continue;
      } else if (tall && inside && (z > MAP.minZ + 4.5 || R() > 0.35)) continue; // keep tall props off the battlefield
      if (!tall && inside && kind !== "flower" && kind !== "glow" && kind !== "ember" && kind !== "reed" && R() > 0.55) continue;
      if (blocked(x, z, r, tall)) continue;
      const s = 0.75 + R() * 0.55;
      placed.push([x, z, r * s]);
      list.push({ x, z, s, ry: R() * Math.PI * 2, c: R() });
    }
  }
  if (world.id === 1) {
    // a little fenced field with hay, outside the battlefield
    const fx = R() > 0.5 ? -18.5 : 18.5;
    const fz = -11;
    if (!blocked(fx, fz, 2.5, false)) {
      const f = (out.fence = out.fence || []);
      for (let i = -1; i <= 1; i++) {
        f.push({ x: fx + i * 1.7, z: fz - 2.2, s: 1, ry: 0, c: 0 });
        f.push({ x: fx + i * 1.7, z: fz + 2.2, s: 1, ry: 0, c: 0 });
        f.push({ x: fx - 2.6, z: fz + i * 1.5, s: 1, ry: Math.PI / 2, c: 0 });
        f.push({ x: fx + 2.6, z: fz + i * 1.5, s: 1, ry: Math.PI / 2, c: 0 });
      }
      const h = (out.hay = out.hay || []);
      h.push({ x: fx - 0.7, z: fz, s: 1, ry: 0.3, c: 0 }, { x: fx + 0.8, z: fz + 0.6, s: 1, ry: 1.2, c: 0 }, { x: fx + 0.2, z: fz - 1, s: 0.9, ry: 2, c: 0 });
    }
  }
  // pebbles along the road edges
  const peb = (out.pebble = []);
  for (const p of paths) {
    for (let i = 0; i < p.n; i += Math.round(0.75 / 0.05)) {
      if (R() > 0.65) continue;
      const a = Math.max(0, i - 3);
      const b = Math.min(p.n, i + 3);
      let tx = p.xs[b] - p.xs[a];
      let tz = p.zs[b] - p.zs[a];
      const l = Math.hypot(tx, tz) || 1;
      const side = R() > 0.5 ? 1 : -1;
      const off = (0.85 + R() * 0.12) * side;
      const x = p.xs[i] - (tz / l) * off;
      const z = p.zs[i] + (tx / l) * off;
      let clash = false;
      for (const q of paths) if (q !== p && distToPath(q, x, z) < 0.8) clash = true;
      if (!clash) peb.push({ x, z, s: 0.22 + R() * 0.18, ry: R() * 6, c: R() });
    }
  }
  return out;
}

export function Props({ level, world, paths, quality }) {
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.userData.own = [];
    const data = scatter(level, world, paths, quality);
    for (const [kind, list] of Object.entries(data)) {
      if (!list.length) continue;
      const parts = kind === "pebble" ? [[G("pebble", () => new THREE.DodecahedronGeometry(0.5, 0)), world.rock]] : propParts(kind, world);
      for (const [geo, colorKey] of parts) {
        const multi = colorKey === "leaf" || colorKey === "flower" || colorKey === "glow" || colorKey === "glowcap" || colorKey === "ember";
        const glowing = colorKey === "glow" || colorKey === "glowcap" || colorKey === "ember";
        const mat = glowing
          ? new THREE.MeshBasicMaterial({ color: "#ffffff" }) // unlit: reads as glowing, tinted per instance
          : multi
            ? new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.85 })
            : M(colorKey);
        if (multi) g.userData.own.push(mat);
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        im.castShadow = kind !== "flower" && kind !== "pebble" && kind !== "glow" && kind !== "ember";
        im.receiveShadow = true;
        list.forEach((it, i) => {
          tmpObj.position.set(it.x, kind === "pebble" ? 0.02 : 0, it.z);
          tmpObj.rotation.set(0, it.ry, 0);
          if (kind === "pebble") tmpObj.scale.set(it.s, it.s * 0.5, it.s);
          else tmpObj.scale.setScalar(it.s);
          tmpObj.updateMatrix();
          im.setMatrixAt(i, tmpObj.matrix);
          if (multi) {
            let col;
            if (colorKey === "leaf") col = world.leaf[Math.floor(it.c * world.leaf.length)];
            else if (colorKey === "flower") col = flowerColors[Math.floor(it.c * flowerColors.length)];
            else if (colorKey === "glowcap") col = it.c > 0.5 ? "#c06aff" : "#ff6a8a";
            else if (colorKey === "ember") col = "#ff8a3a";
            else col = it.c > 0.5 ? "#7dffb0" : "#6fe0ff";
            im.setColorAt(i, tmpCol.set(col));
          }
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        g.add(im);
      }
    }
    return g;
  }, [level, world, paths, quality]);
  useEffect(
    () => () => {
      group.traverse((o) => o.isInstancedMesh && o.dispose());
      group.userData.own.forEach((m) => m.dispose());
    },
    [group]
  );
  return <primitive object={group} />;
}

/* ================================================================ base + gate */
export function Base({ level, world, bus, view }) {
  const end = level.paths[0][level.paths[0].length - 1];
  const prev = level.paths[0][level.paths[0].length - 2];
  const yaw = Math.atan2(prev[0] - end[0], prev[1] - end[1]);
  const b = useMemo(() => buildBase(world), [world]);
  const hit = useRef(-10);
  useEffect(() => {
    const h = (ev) => {
      for (const e of ev) if (e.type === "leak") hit.current = performance.now() / 1000;
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    b.flags.forEach((f, i) => (f.rotation.y = Math.sin(t * 3 + i) * 0.35));
    const k = performance.now() / 1000 - hit.current;
    const s = k < 0.4 ? Math.sin(k * 40) * 0.05 * (1 - k / 0.4) : 0;
    b.group.position.x = s;
    b.group.scale.setScalar(1 + (k < 0.25 ? 0.04 * (1 - k / 0.25) : 0));
  });
  return (
    <group position={[end[0], 0, end[1]]} rotation-y={yaw}>
      <primitive object={b.group} />
    </group>
  );
}

export function Gates({ level, world }) {
  const gates = useMemo(
    () =>
      level.paths.map((w) => {
        const [x0, z0] = w[0];
        const [x1, z1] = w[1];
        const l = Math.hypot(x1 - x0, z1 - z0);
        // put the arch where the road crosses the field edge
        let t = 0;
        for (let k = 0; k <= 40; k++) {
          const x = x0 + ((x1 - x0) * k) / 40;
          const z = z0 + ((z1 - z0) * k) / 40;
          if (x >= MAP.minX - 0.4 && x <= MAP.maxX + 0.4 && z >= MAP.minZ - 0.4 && z <= MAP.maxZ + 0.4) {
            t = k / 40;
            break;
          }
        }
        const gx = x0 + (x1 - x0) * t - ((x1 - x0) / l) * 0.6;
        const gz = z0 + (z1 - z0) * t - ((z1 - z0) / l) * 0.6;
        const g = buildGate(world);
        g.group.position.set(gx, 0, gz);
        g.group.rotation.y = Math.atan2(x1 - x0, z1 - z0);
        return g;
      }),
    [level, world]
  );
  useFrame((_, dt) => {
    for (const g of gates) g.swirl.rotation.z -= dt * 1.6;
  });
  return (
    <group>
      {gates.map((g, i) => (
        <primitive key={i} object={g.group} />
      ))}
    </group>
  );
}

/* ================================================================ pads */
export function Pads({ engine, view, level }) {
  const pads = useMemo(
    () =>
      level.spots.map(([x, z]) => {
        const g = buildPad();
        g.position.set(x, 0, z);
        const mark = new THREE.Mesh(
          G("padmark", () => new THREE.PlaneGeometry(1.3, 1.3)),
          new THREE.MeshBasicMaterial({ map: padMarkTexture(), transparent: true, opacity: 0.35, depthWrite: false, color: "#ffffff" })
        );
        mark.rotation.x = -Math.PI / 2;
        mark.position.y = 0.23;
        g.add(mark);
        const glow = new THREE.Mesh(G("padglow", () => new THREE.RingGeometry(0.86, 1.02, 40)), new THREE.MeshBasicMaterial({ color: "#ffd34a", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.06;
        g.add(glow);
        return { g, mark, glow };
      }),
    [level]
  );
  useEffect(
    () => () =>
      pads.forEach((p) => {
        p.mark.material.dispose();
        p.glow.material.dispose();
      }),
    [pads]
  );
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    pads.forEach((p, i) => {
      const spot = engine.spots[i];
      const empty = !spot || !spot.tower;
      const hover = view.hoverSpot === i;
      const sel = view.selSpot === i;
      p.mark.visible = empty;
      p.mark.material.opacity = sel ? 0.95 : hover ? 0.85 : 0.28 + Math.sin(t * 2.2 + i) * 0.08;
      p.mark.material.color.set(sel || hover ? "#ffe17a" : "#ffffff");
      const s = hover || sel ? 1.06 + Math.sin(t * 6) * 0.02 : 1;
      p.mark.scale.setScalar(s);
      p.glow.material.opacity = sel ? 0.85 : hover ? 0.55 : 0;
    });
  });
  return (
    <group>
      {pads.map((p, i) => (
        <primitive key={i} object={p.g} />
      ))}
    </group>
  );
}

/* ================================================================ towers */
export function Towers({ engine, view }) {
  const root = useMemo(() => new THREE.Group(), []);
  const live = useMemo(() => new Map(), []);
  useEffect(() => () => live.clear(), [live]);
  useFrame((st) => {
    const now = engine.realT;
    const t = st.clock.elapsedTime;
    const seen = new Set();
    for (const tw of engine.towers) {
      seen.add(tw.id);
      let o = live.get(tw.id);
      if (!o || o.level !== tw.level) {
        if (o) root.remove(o.root);
        o = buildTower(tw.type, tw.level);
        o.level = tw.level;
        o.root.position.set(tw.x, 0, tw.z);
        root.add(o.root);
        live.set(tw.id, o);
      }
      const p = o.parts;
      // build / upgrade pop
      const since = Math.min(now - tw.builtAt, now - tw.upgradedAt);
      const k = Math.min(1, since / 0.5);
      const s = k < 1 ? Math.max(0.05, easeOutBack(k)) : 1;
      o.inner.scale.set(s, k < 1 ? s * (0.6 + 0.4 * k) + (1 - k) * 0.2 : 1, s);
      const sel = view.selTower === tw.id;
      o.inner.position.y = 0.2 + (sel ? 0.03 + Math.sin(t * 5) * 0.02 : 0);
      const fired = now - tw.firedAt;
      if (p.head) p.head.rotation.y = tw.aim;
      if (tw.type === "archer" && p.head) {
        p.head.position.z = fired < 0.15 ? -Math.sin((fired / 0.15) * Math.PI) * 0.06 : 0;
      }
      if (tw.type === "cannon" && p.barrels) {
        const r = fired < 0.35 ? Math.sin(Math.min(1, fired / 0.08) * Math.PI * 0.5) * (1 - fired / 0.35) * 0.22 : 0;
        for (const b of p.barrels) b.position.z = -r;
      }
      if (p.bob) p.bob.position.y = p.bobY + Math.sin(t * 2 + tw.id) * 0.06;
      if (p.core) {
        if (!p.core.userData.base) p.core.userData.base = p.core.scale.clone();
        p.core.rotation.y = t * 1.2;
        const pulse = fired < 0.25 ? 1 + (1 - fired / 0.25) * 0.3 : 1;
        p.core.scale.copy(p.core.userData.base).multiplyScalar(pulse);
      }
      if (p.rings) p.rings.forEach((r, i) => (r.rotation.z = t * (i ? -0.9 : 1.3)));
      if (p.orbit) {
        p.orbit.rotation.y = t * 1.6;
        const pulse = fired < 0.25 ? 1 + (1 - fired / 0.25) * 0.35 : 1;
        p.head.children[0].scale.setScalar(pulse);
      }
      if (p.flag) p.flag.rotation.y = Math.sin(t * 3.2 + tw.id) * 0.35;
    }
    for (const [id, o] of live)
      if (!seen.has(id)) {
        root.remove(o.root);
        live.delete(id);
      }
  });
  return <primitive object={root} />;
}

/* ================================================================ enemies */
const HB_GEO_BG = new THREE.PlaneGeometry(1, 1);
const HB_GEO_FILL = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
const HB_MAT_BG = new THREE.MeshBasicMaterial({ color: "#14181f", transparent: true, opacity: 0.75, depthTest: false, depthWrite: false });
const HB_MATS = ["#45d96a", "#ffd34a", "#ff5a4a", "#ff7a2a"].map((c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true }));

export function Enemies({ engine, world, view }) {
  const root = useMemo(() => new THREE.Group(), []);
  const bars = useMemo(() => new THREE.Group(), []);
  const live = useMemo(() => new Map(), []);
  const pool = useMemo(() => new Map(), []);
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }), []);
  useEffect(() => () => shadowMat.dispose(), [shadowMat]);
  const { camera } = useThree();
  const tint = world.boss.tint;

  const acquire = (type) => {
    const key = `${type}|${tint}`;
    const list = pool.get(key);
    let o = list && list.pop();
    if (!o) {
      o = buildEnemy(type, tint);
      o.key = key;
      const blob = new THREE.Mesh(G("blob", () => new THREE.PlaneGeometry(1, 1)), shadowMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.025;
      const r = type === "boss" || type === "warlord" ? 2.2 : type === "brute" ? 1.2 : type === "swarmer" ? 0.55 : 0.75;
      blob.scale.set(r, r, 1);
      o.root.add(blob);
      const hb = new THREE.Group();
      const w = o.boss ? 1.6 : type === "swarmer" ? 0.5 : 0.7;
      const h = o.boss ? 0.16 : 0.09;
      const bg = new THREE.Mesh(HB_GEO_BG, HB_MAT_BG);
      bg.scale.set(w + 0.06, h + 0.05, 1);
      bg.renderOrder = 10;
      const fill = new THREE.Mesh(HB_GEO_FILL, HB_MATS[0]);
      fill.position.x = -w / 2;
      fill.scale.set(w, h, 1);
      fill.renderOrder = 11;
      fill.position.z = 0.001;
      hb.add(bg, fill);
      o.hb = { g: hb, fill, w, h };
    }
    o.root.scale.setScalar(ENEMIES[type].scale || 1);
    root.add(o.root);
    bars.add(o.hb.g);
    return o;
  };
  const release = (o) => {
    root.remove(o.root);
    bars.remove(o.hb.g);
    if (!pool.has(o.key)) pool.set(o.key, []);
    pool.get(o.key).push(o);
  };

  useFrame(() => {
    const seen = new Set();
    const now = engine.time;
    for (const e of engine.enemies) {
      if (e.state === "gone") continue;
      seen.add(e.id);
      let o = live.get(e.id);
      if (!o) {
        o = acquire(e.type);
        live.set(e.id, o);
        o.group.rotation.set(0, 0, 0);
        o.group.position.set(0, 0, 0);
      }
      o.root.position.set(e.x, 0, e.z);
      o.root.rotation.y = e.heading;
      const walking = e.state === "walk";
      // walk cycle tied to distance travelled (slowed enemies step slower)
      const ph = e.dist * (e.type === "swarmer" ? 9 : e.boss ? 2.2 : e.type === "brute" ? 3.2 : e.type === "scout" ? 4.2 : 5.2);
      const amp = e.type === "brute" || e.boss ? 0.45 : 0.7;
      if (o.legs.length === 2 && !o.scuttle) {
        o.legs[0].rotation.x = Math.sin(ph) * amp;
        o.legs[1].rotation.x = -Math.sin(ph) * amp;
      } else if (o.scuttle) {
        o.legs[0].rotation.y = Math.sin(ph) * 0.5;
        o.legs[1].rotation.y = -Math.sin(ph) * 0.5;
      }
      o.body.position.y = Math.abs(Math.sin(ph)) * (o.boss ? 0.08 : 0.04);
      if (o.boss) o.body.rotation.z = Math.sin(ph) * 0.04;
      // spawn: grow out of the gate
      const age = now - e.bornAt;
      const grow = Math.min(1, 0.55 + age * 1.6);
      if (walking) {
        o.group.scale.setScalar((o.boss ? (e.type === "warlord" ? 1.15 : 1) : 1) * grow);
        o.group.rotation.x = 0;
        o.group.position.y = 0;
      } else {
        // defeated: topple backwards, sink and shrink
        const k = Math.min(1, e.t / 0.75);
        o.group.rotation.x = -k * (o.boss ? 0.6 : 1.35);
        o.group.position.y = -k * (o.boss ? 0.8 : 0.35);
        o.group.scale.setScalar((o.boss ? (e.type === "warlord" ? 1.15 : 1) : 1) * (1 - k * 0.55));
      }
      // hit flash
      const flash = walking && now - e.hitT < 0.07;
      o.flash.forEach((m, i) => (m.material = flash ? FLASH_MAT : o.mats[i]));
      o.iceShell.visible = walking && e.slow > 0;
      // health bar
      const show = walking && (e.boss || e.hp < e.maxHp || view.hoverEnemy === e.id);
      o.hb.g.visible = show;
      if (show) {
        const r = Math.max(0, Math.min(1, e.hp / e.maxHp));
        o.hb.g.position.set(e.x, (o.boss ? (e.type === "warlord" ? 3.75 : 3.3) : hbHeight(e.type)) * (e.def.scale || 1), e.z);
        o.hb.g.quaternion.copy(camera.quaternion);
        o.hb.fill.scale.x = Math.max(0.0001, o.hb.w * r);
        o.hb.fill.material = e.boss ? HB_MATS[3] : r > 0.55 ? HB_MATS[0] : r > 0.25 ? HB_MATS[1] : HB_MATS[2];
      }
    }
    for (const [id, o] of live)
      if (!seen.has(id)) {
        release(o);
        live.delete(id);
      }
  });
  return (
    <>
      <primitive object={root} />
      <primitive object={bars} />
    </>
  );
}
const HB_H = { raider: 1.3, scout: 1.28, brute: 1.75, armored: 1.62, swarmer: 0.62 };
const hbHeight = (t) => HB_H[t] || 1.3;

/* ================================================================ projectiles */
function buildProjectile(kind) {
  const g = new THREE.Group();
  if (kind === "arrow") {
    const shaft = new THREE.Mesh(G("arrow-shaft", () => new THREE.CylinderGeometry(0.018, 0.018, 0.55, 4).rotateX(Math.PI / 2)), M("#8a5a32"));
    const tip = new THREE.Mesh(G("arrow-tip", () => new THREE.ConeGeometry(0.045, 0.12, 4).rotateX(Math.PI / 2).translate(0, 0, 0.32)), M("#d8dde4", { metalness: 0.5 }));
    const fl = new THREE.Mesh(G("arrow-fl", () => new THREE.BoxGeometry(0.1, 0.01, 0.12).translate(0, 0, -0.24)), M("#f4f4f4"));
    const fl2 = fl.clone();
    fl2.rotation.z = Math.PI / 2;
    g.add(shaft, tip, fl, fl2);
  } else if (kind === "cannonball") {
    g.add(new THREE.Mesh(G("ball", () => new THREE.SphereGeometry(0.15, 10, 8)), M("#2a2e35", { metalness: 0.4, roughness: 0.4 })));
  } else if (kind === "frost") {
    const c = new THREE.Mesh(G("frost-bolt", () => new THREE.OctahedronGeometry(0.13, 0)), M("#c9f4ff", { emissive: "#5fd6ff", emissiveIntensity: 1.5 }));
    c.scale.set(1, 1, 1.8);
    g.add(c);
    g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: "#7fe6ff", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));
    g.children[1].scale.setScalar(0.65);
  } else {
    g.add(new THREE.Mesh(G("magic-bolt", () => new THREE.SphereGeometry(0.13, 10, 8)), M("#f0e0ff", { emissive: "#a060ff", emissiveIntensity: 2 })));
    g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: "#b47cff", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));
    g.children[1].scale.setScalar(0.8);
  }
  g.traverse((o) => (o.castShadow = kind === "cannonball"));
  return g;
}

export function Projectiles({ engine, fx, settings }) {
  const root = useMemo(() => new THREE.Group(), []);
  const pools = useMemo(() => ({ arrow: [], cannonball: [], frost: [], magic: [] }), []);
  const used = useMemo(() => ({ arrow: 0, cannonball: 0, frost: 0, magic: 0 }), []);
  const last = useMemo(() => new Map(), []);
  const ticker = useRef(0);
  useFrame(() => {
    for (const k in used) used[k] = 0;
    ticker.current++;
    const trails = settings.particles && !settings.reducedMotion;
    const seen = new Set();
    for (const p of engine.projectiles) {
      const pool = pools[p.kind];
      let o = pool[used[p.kind]];
      if (!o) {
        o = buildProjectile(p.kind);
        pool.push(o);
        root.add(o);
      }
      used[p.kind]++;
      o.visible = true;
      const y = p.y + (p.lift || 0);
      const prev = last.get(p.id);
      o.position.set(p.x, y, p.z);
      if (prev && (p.kind === "arrow" || p.kind === "frost")) {
        tmpV.set(p.x + (p.x - prev[0]) * 3, y + (y - prev[1]) * 3, p.z + (p.z - prev[2]) * 3);
        if (Math.abs(p.x - prev[0]) + Math.abs(p.z - prev[2]) + Math.abs(y - prev[1]) > 1e-5) o.lookAt(tmpV);
      } else if (!prev && (p.kind === "arrow" || p.kind === "frost")) o.lookAt(p.tx, p.ty, p.tz);
      if (p.kind === "cannonball") o.rotation.x += 0.2;
      last.set(p.id, [p.x, y, p.z]);
      seen.add(p.id);
      if (trails && fx.current) {
        if (p.kind === "magic") fx.current.spark(p.x, y, p.z, "#c79bff", 0.22, 0.35);
        else if (p.kind === "frost" && ticker.current % 2 === 0) fx.current.spark(p.x, y, p.z, "#9fe8ff", 0.18, 0.3);
        else if (p.kind === "cannonball" && ticker.current % 2 === 0) fx.current.smoke(p.x, y, p.z, 0.22, 0.45);
      }
    }
    for (const k in pools) for (let i = used[k]; i < pools[k].length; i++) pools[k][i].visible = false;
    for (const id of last.keys()) if (!seen.has(id)) last.delete(id);
  });
  return <primitive object={root} />;
}

/* ================================================================ particles */
const PVERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vC;
varying float vA;
uniform float uScale;
void main() {
  vC = aColor;
  vA = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PFRAG = `
uniform sampler2D uMap;
varying vec3 vC;
varying float vA;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vC, vA * t.a);
  if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(n, additive) {
    this.n = n;
    this.i = 0;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dotTexture() }, uScale: { value: 400 } },
      vertexShader: PVERT,
      fragmentShader: PFRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geo = g;
    this.live = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, color, a0, grav = 0, drag = 0) {
    const i = this.i;
    this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    tmpCol.set(color);
    this.col[i * 3] = tmpCol.r;
    this.col[i * 3 + 1] = tmpCol.g;
    this.col[i * 3 + 2] = tmpCol.b;
    this.life[i] = life;
    this.max[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.a0[i] = a0;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.live = Math.min(this.n, this.live + 1);
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = 1 - Math.max(0, this.life[i]) / this.max[i];
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.03, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = this.a0[i] * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    }
    for (const a of ["position", "aColor", "aSize", "aAlpha"]) this.geo.attributes[a].needsUpdate = true;
  }
  clear() {
    this.life.fill(0);
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export function Effects({ engine, bus, settings, fx, view }) {
  const { size, camera, gl } = useThree();
  const quality = settings.graphics;
  const sys = useMemo(() => {
    const cap = quality === "low" ? 220 : quality === "high" ? 1400 : 800;
    return { add: new Particles(cap, true), norm: new Particles(Math.round(cap * 0.7), false) };
  }, [quality]);
  const rings = useMemo(() => {
    const list = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(G("shock", () => new THREE.RingGeometry(0.8, 1, 40)), new THREE.MeshBasicMaterial({ color: "#fff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData = { t: 1, dur: 0.4, r: 1 };
      list.push(m);
    }
    return list;
  }, []);
  const group = useMemo(() => {
    const g = new THREE.Group();
    g.add(sys.add.points, sys.norm.points);
    rings.forEach((r) => g.add(r));
    return g;
  }, [sys, rings]);
  useEffect(
    () => () => {
      sys.add.dispose();
      sys.norm.dispose();
    },
    [sys]
  );
  useEffect(() => () => rings.forEach((r) => r.material.dispose()), [rings]);
  const ringI = useRef(0);

  const on = settings.particles && !settings.reducedMotion;
  const mul = quality === "low" ? 0.4 : quality === "high" ? 1.3 : 1;
  const api = useMemo(() => {
    const R = Math.random;
    const burst = (s, n, x, y, z, color, speed, life, s0, s1, a0, grav, drag, up = 0.5) => {
      const k = Math.max(1, Math.round(n * mul));
      for (let i = 0; i < k; i++) {
        const a = R() * Math.PI * 2;
        const v = speed * (0.4 + R() * 0.6);
        s.spawn(x, y, z, Math.cos(a) * v, (R() * 0.8 + up) * speed, Math.sin(a) * v, life * (0.7 + R() * 0.6), s0, s1, color, a0, grav, drag);
      }
    };
    const ring = (x, z, r, color, dur = 0.4, y = 0.08) => {
      const m = rings[ringI.current++ % rings.length];
      m.position.set(x, y, z);
      m.material.color.set(color);
      m.userData = { t: 0, dur, r };
      m.visible = true;
    };
    return {
      ring,
      spark: (x, y, z, color, s, life) => on && sys.add.spawn(x, y, z, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3, life, s, s * 0.2, color, 0.9),
      smoke: (x, y, z, s, life) => on && sys.norm.spawn(x, y, z, 0, 0.2, 0, life, s, s * 2, "#d8d4cc", 0.45),
      event(e) {
        switch (e.type) {
          case "shot":
            if (!on) break;
            if (e.kind === "cannon") {
              burst(sys.norm, 8, e.x, e.y, e.z, "#e8e4dc", 1.2, 0.7, 0.35, 0.9, 0.55, -0.4, 2);
              burst(sys.add, 6, e.x, e.y, e.z, "#ffb04a", 2, 0.18, 0.4, 0.1, 1, 0, 3);
            } else if (e.kind === "frost") burst(sys.add, 6, e.x, e.y, e.z, "#9fe8ff", 1.2, 0.35, 0.25, 0.05, 0.9, 0, 3);
            else if (e.kind === "mage") burst(sys.add, 8, e.x, e.y, e.z, "#c79bff", 1.4, 0.4, 0.3, 0.05, 1, 0, 3);
            break;
          case "hit":
            if (e.kind === "arrow") {
              if (on) burst(sys.add, 4, e.x, e.y, e.z, "#fff2b0", 1.6, 0.2, 0.18, 0.04, 0.9, 4, 2);
            } else if (e.kind === "frost") {
              if (on) burst(sys.add, 12, e.x, e.y, e.z, "#bff0ff", 2, 0.45, 0.28, 0.05, 1, 3, 2);
              ring(e.x, e.z, 0.7 + e.level * 0.15, "#9fe8ff", 0.35);
            } else if (e.kind === "magic") {
              if (on) burst(sys.add, 14, e.x, e.y, e.z, "#c79bff", 2.2, 0.45, 0.32, 0.05, 1, 0, 3);
              ring(e.x, e.z, 0.6, "#b47cff", 0.3);
            }
            break;
          case "boom":
            if (on) {
              burst(sys.norm, 16, e.x, 0.3, e.z, "#c9b08a", 2.2, 0.9, 0.5, 1.3, 0.7, 1.5, 2.5, 0.3);
              burst(sys.add, 12, e.x, 0.4, e.z, "#ffb04a", 3.2, 0.3, 0.5, 0.1, 1, 4, 2);
            }
            ring(e.x, e.z, e.r, "#ffd08a", 0.38);
            view.shake = Math.max(view.shake || 0, 0.25);
            break;
          case "fizzle":
            if (on) burst(sys.norm, 3, e.x, 0.15, e.z, "#b8a080", 0.6, 0.4, 0.2, 0.4, 0.5, 1, 2);
            break;
          case "kill":
            if (on) {
              burst(sys.norm, e.boss ? 40 : 10, e.x, 0.4, e.z, "#d6c8b0", e.boss ? 3 : 1.4, 0.8, e.boss ? 0.9 : 0.4, e.boss ? 1.8 : 0.9, 0.7, 0.5, 2, 0.4);
              burst(sys.add, e.boss ? 30 : 6, e.x, 0.6, e.z, "#ffe9a0", e.boss ? 4 : 1.8, 0.45, 0.3, 0.05, 1, 2, 2);
            }
            if (e.boss) {
              ring(e.x, e.z, 3.2, "#ffd34a", 0.7);
              view.shake = 1;
            }
            break;
          case "build":
            if (on) burst(sys.norm, 14, e.x, 0.25, e.z, "#c9b08a", 1.6, 0.7, 0.35, 0.8, 0.65, 1, 2.5, 0.2);
            ring(e.x, e.z, 1.2, "#ffffff", 0.4);
            break;
          case "upgrade":
            if (on) for (let i = 0; i < Math.round(22 * mul); i++) sys.add.spawn(e.x + (R() - 0.5) * 1.2, 0.3 + R() * 0.5, e.z + (R() - 0.5) * 1.2, 0, 1.4 + R() * 1.6, 0, 0.9 + R() * 0.4, 0.3, 0.05, "#ffd34a", 1, 0, 0.5);
            ring(e.x, e.z, 1.3, "#ffd34a", 0.5);
            break;
          case "sell":
            if (on) burst(sys.norm, 16, e.x, 0.6, e.z, "#c9b08a", 1.8, 0.8, 0.4, 1, 0.7, 1, 2, 0.3);
            break;
          case "leak":
            ring(e.x, e.z, 1.6, "#ff4a3a", 0.45);
            view.shake = Math.max(view.shake || 0, 0.45);
            break;
          case "summon":
            if (on) burst(sys.add, 18, e.x, 0.3, e.z, "#ff7a2a", 2.4, 0.6, 0.4, 0.05, 1, 2, 2);
            ring(e.x, e.z, 1.8, "#ff7a2a", 0.5);
            break;
          case "bossEnter":
            view.shake = Math.max(view.shake || 0, 0.6);
            break;
          default:
        }
      },
    };
  }, [sys, rings, on, mul, view]);
  useEffect(() => {
    fx.current = api;
    const h = (ev) => {
      for (const e of ev) api.event(e);
    };
    bus.handlers.add(h);
    return () => {
      bus.handlers.delete(h);
      if (fx.current === api) fx.current = null;
    };
  }, [api, bus, fx]);
  useEffect(() => {
    // restart / level change → no stale particles
    sys.add.clear();
    sys.norm.clear();
    rings.forEach((r) => (r.visible = false));
  }, [engine.version, sys, rings]);
  useFrame((_, dt) => {
    const scale = (size.height * gl.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    sys.add.mat.uniforms.uScale.value = scale;
    sys.norm.mat.uniforms.uScale.value = scale;
    const d = engine.paused ? 0 : Math.min(dt, 0.1) * (engine.speed || 1);
    sys.add.update(d);
    sys.norm.update(d);
    for (const r of rings) {
      if (!r.visible) continue;
      const u = r.userData;
      u.t += d;
      const k = u.t / u.dur;
      if (k >= 1) {
        r.visible = false;
        continue;
      }
      r.scale.setScalar(u.r * (0.35 + 0.65 * Math.sqrt(k)));
      r.material.opacity = 0.75 * (1 - k);
    }
  });
  return <primitive object={group} />;
}

/* ================================================================ range rings */
export function RangeRings({ view }) {
  const make = (color, op) => {
    const g = new THREE.Group();
    const fill = new THREE.Mesh(G("range-fill", () => new THREE.CircleGeometry(1, 72)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
    const edge = new THREE.Mesh(G("range-edge", () => new THREE.RingGeometry(0.975, 1, 96)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    fill.rotation.x = edge.rotation.x = -Math.PI / 2;
    g.add(fill, edge);
    g.position.y = 0.07;
    g.visible = false;
    g.renderOrder = 2;
    return g;
  };
  const a = useMemo(() => make("#ffffff", 0.13), []);
  const b = useMemo(() => make("#ffd34a", 0.0), []);
  useEffect(
    () => () =>
      [a, b].forEach((g) =>
        g.children.forEach((c) => c.material.dispose())
      ),
    [a, b]
  );
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    for (const [g, r] of [[a, view.range], [b, view.range2]]) {
      g.visible = !!r;
      if (!r) continue;
      g.position.x = r.x;
      g.position.z = r.z;
      g.scale.set(r.r, 1, r.r);
      g.scale.y = 1;
      g.children[0].scale.set(1, 1, 1);
      g.children[1].material.color.set(r.color || "#ffffff");
      g.children[0].material.color.set(r.color || "#ffffff");
      g.children[1].material.opacity = 0.75 + Math.sin(t * 4) * 0.15;
    }
  });
  return (
    <>
      <primitive object={a} />
      <primitive object={b} />
    </>
  );
}

/* ================================================================ floating numbers (DOM) */
export function Floaters({ bus, layer, settings, engine }) {
  const { camera, size } = useThree();
  const pool = useRef(null);
  useEffect(() => {
    const el = layer.current;
    if (!el) return undefined;
    const list = [];
    for (let i = 0; i < 48; i++) {
      const d = document.createElement("div");
      d.className = "tdm-float";
      d.style.display = "none";
      el.appendChild(d);
      list.push({ d, t: 1, life: 1, x: 0, y: 0, z: 0, on: false });
    }
    pool.current = { list, i: 0 };
    return () => {
      list.forEach((f) => f.d.remove());
      pool.current = null;
    };
  }, [layer]);
  useEffect(() => {
    const add = (text, cls, x, y, z, life = 1) => {
      const P = pool.current;
      if (!P) return;
      const f = P.list[P.i];
      P.i = (P.i + 1) % P.list.length;
      f.d.textContent = text;
      f.d.className = `tdm-float ${cls}`;
      f.x = x + (Math.random() - 0.5) * 0.25;
      f.y = y;
      f.z = z;
      f.t = 0;
      f.life = life;
      f.on = true;
      f.d.style.display = "block";
    };
    const h = (ev) => {
      for (const e of ev) {
        if (e.type === "kill" && engine.mode === "play") add(`+${e.reward}`, e.boss ? "is-coin is-big" : "is-coin", e.x, e.boss ? 3 : 1.4, e.z, 1.1);
        else if (e.type === "dmg" && settings.damageNumbers && e.amount >= 1 && engine.mode === "play") add(String(Math.round(e.amount)), e.armored ? "is-dmg is-resist" : "is-dmg", e.x, 1.1, e.z, 0.6);
        else if (e.type === "leak" && engine.mode === "play") add(`-${e.lives}`, "is-life", e.x, 1.6, e.z, 1.2);
        else if (e.type === "sell") add(`+${e.refund}`, "is-coin", e.x, 1.6, e.z, 1.1);
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, settings.damageNumbers, engine]);
  useEffect(() => {
    const P = pool.current;
    if (P)
      P.list.forEach((f) => {
        f.on = false;
        f.d.style.display = "none";
      });
  }, [engine.version]);
  useFrame((_, dt) => {
    const P = pool.current;
    if (!P) return;
    const d = engine.paused ? 0 : Math.min(dt, 0.1);
    for (const f of P.list) {
      if (!f.on) continue;
      f.t += d;
      const k = f.t / f.life;
      if (k >= 1) {
        f.on = false;
        f.d.style.display = "none";
        continue;
      }
      tmpV.set(f.x, f.y + k * 0.9, f.z).project(camera);
      const sx = ((tmpV.x + 1) / 2) * size.width;
      const sy = ((1 - tmpV.y) / 2) * size.height;
      f.d.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${k < 0.15 ? 0.6 + k * 2.7 : 1})`;
      f.d.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
    }
  });
  return null;
}

/* ================================================================ towers showcase */
export const SHOWCASE = { x: 120 };
export function Showcase({ type, level, world }) {
  const obj = useMemo(() => {
    const g = new THREE.Group();
    g.position.set(SHOWCASE.x, 0, 0);
    const island = new THREE.Mesh(G("show-island", () => new THREE.CylinderGeometry(2.6, 2.2, 0.5, 18)), M(world.grass[1]));
    island.position.y = -0.25;
    island.receiveShadow = true;
    g.add(island);
    const dirt = new THREE.Mesh(G("show-dirt", () => new THREE.CylinderGeometry(2.2, 2.6, 0.9, 18)), M(world.roadEdge));
    dirt.position.y = -0.95;
    g.add(dirt);
    const pad = buildPad();
    g.add(pad);
    const t = buildTower(type, level);
    g.add(t.root);
    g.userData.t = t;
    return g;
  }, [type, level, world]);
  useFrame((st) => {
    const tt = st.clock.elapsedTime;
    obj.rotation.y = tt * 0.35;
    const p = obj.userData.t.parts;
    if (p.bob) p.bob.position.y = p.bobY + Math.sin(tt * 2) * 0.06;
    if (p.orbit) p.orbit.rotation.y = tt * 1.6;
    if (p.rings) p.rings.forEach((r, i) => (r.rotation.z = tt * (i ? -0.9 : 1.3)));
    if (p.core) p.core.rotation.y = tt * 1.2;
    if (p.flag) p.flag.rotation.y = Math.sin(tt * 3.2) * 0.35;
  });
  return <primitive object={obj} />;
}

export const TOWER_COLORS = Object.fromEntries(Object.entries(TOWERS).map(([k, v]) => [k, v.color]));
