/**
 * Island Conquest — the 3D archipelago (React Three Fiber).
 *
 * <Driver> is the ONLY place the engine is ticked (one useFrame). It drains
 * engine.events onto `bus` (sound, effects, HUD) and derives two per-frame
 * facts every other component reads: which player islands have hostile
 * fleets inbound (`ui.warn`) and whether the selected island is still ours.
 *
 * Every other component READS the authoritative state each frame and writes
 * pooled Three.js objects / DOM nodes directly. React never re-renders per
 * frame; geometry and materials are built once per level load (keyed by
 * `gen`) and disposed when the level changes.
 *
 * `world` is the engine itself, or (on the Islands screen) a one-island
 * showcase stub with the same shape.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { routePoint } from "../engine/engine.js";
import { FACTION_INFO, PLAYER, NEUTRAL, STEP, boatsFor, ISLAND_TYPES } from "../engine/constants.js";
import { buildIsland } from "./islandMesh.js";
import { createOceanMaterial, MAX_ISLANDS } from "./ocean.js";
import { boatGeometries, createWakeMaterial } from "./boat.js";
import { vcMat, getMat, T, paint, merge, sph, rng } from "./geo.js";

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const WHITE = new THREE.Color("#ffffff");
const OWNER_IDX = { player: 0, red: 1, purple: 2, neutral: 3 };
const ownerColor = (o) => FACTION_INFO[o]?.color || FACTION_INFO.neutral.color;

/** same swell as the ocean vertex shader, so boats ride the waves */
export function waveH(x, z, t, amp) {
  if (!amp) return 0;
  return amp * (0.05 * Math.sin((x * 0.8 + z * 0.6) * 0.9 + t * 1.1) + 0.035 * Math.sin((-x * 0.5 + z * 0.86) * 1.6 + t * 1.6) + 0.02 * Math.sin((x * 0.96 - z * 0.28) * 2.7 + t * 2.1));
}

/* ================================================================ driver */
export function Driver({ engine, bus, ui }) {
  useFrame((_, dt) => {
    engine.frame(dt);
    // derived per-frame facts
    ui.warn.clear();
    if (engine.mode === "play" && !engine.ended)
      for (const f of engine.fleets) {
      if (f.owner === PLAYER) continue;
      const t = engine.byId.get(f.to);
      if (t && t.owner === PLAYER) ui.warn.add(t.id);
    }
    if (ui.selected) {
      const s = engine.byId.get(ui.selected);
      if (!s || s.owner !== PLAYER || engine.mode !== "play" || engine.ended) {
        ui.selected = null;
        if (s && s.owner !== PLAYER && ui.onSelectionLost) ui.onSelectionLost();
      }
    }
    if (engine.events.length) {
      const ev = engine.events.splice(0, engine.events.length);
      for (const h of bus.handlers) h(ev);
    }
  }, -3);
  return null;
}

/* ================================================================ camera */
function fitMap(camera, aspect, islands, labelH) {
  const cam = camera.clone();
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  const pitch = aspect < 1.1 ? 1.12 : aspect < 1.45 ? 1.0 : 0.94; // radians above the horizon
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  const pts = [];
  let cx = 0;
  let cz = 0;
  for (const i of islands) {
    cx += i.x;
    cz += i.z;
    const r = i.r + 0.5;
    pts.push(new THREE.Vector3(i.x - r, 0, i.z), new THREE.Vector3(i.x + r, 0, i.z), new THREE.Vector3(i.x, 0, i.z - r), new THREE.Vector3(i.x, 0, i.z + r));
    pts.push(new THREE.Vector3(i.x, (labelH.get(i.id) || 1.5) + 0.5, i.z));
  }
  cx /= Math.max(1, islands.length);
  cz /= Math.max(1, islands.length);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  cx = (minX + maxX) / 2;
  const top = 0.72;
  const bottom = aspect < 1.1 ? -0.66 : -0.74;
  const side = aspect < 1.1 ? 0.96 : 0.93;
  let D = 30;
  let lz = cz;
  for (let iter = 0; iter < 4; iter++) {
    let lo = 5;
    let hi = 160;
    for (let k = 0; k < 30; k++) {
      D = (lo + hi) / 2;
      cam.position.set(cx, dir.y * D, lz + dir.z * D);
      cam.lookAt(cx, 0, lz);
      cam.updateMatrixWorld();
      let ok = true;
      for (const p of pts) {
        tmpV.copy(p).project(cam);
        if (tmpV.x < -side || tmpV.x > side || tmpV.y < bottom || tmpV.y > top || tmpV.z > 1) {
          ok = false;
          break;
        }
      }
      if (ok) hi = D;
      else lo = D;
    }
    D = hi;
    cam.position.set(cx, dir.y * D, lz + dir.z * D);
    cam.lookAt(cx, 0, lz);
    cam.updateMatrixWorld();
    let mn = Infinity;
    let mx = -Infinity;
    for (const p of pts) {
      tmpV.copy(p).project(cam);
      mn = Math.min(mn, tmpV.y);
      mx = Math.max(mx, tmpV.y);
    }
    const err = (mx - top + (mn - bottom)) / 2;
    lz -= err * D * Math.tan((camera.fov * Math.PI) / 360) * 1.1;
  }
  return { pos: new THREE.Vector3(cx, dir.y * D, lz + dir.z * D), look: new THREE.Vector3(cx, 0, lz) };
}

export function CameraRig({ mode, view, motion, world, gen, labelH }) {
  const { camera, size } = useThree();
  const cur = useRef({ pos: new THREE.Vector3(0, 30, 30), look: new THREE.Vector3(0, 0, 0), init: false });
  const shot = useRef(null);
  view.camera = camera;
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    let s;
    if (mode === "battle") s = fitMap(camera, aspect, world.islands, labelH.current);
    else if (mode === "islands") {
      const narrow = aspect < 1.2;
      s = { pos: new THREE.Vector3(narrow ? 0 : -2.2, 4.6, narrow ? 9.5 : 7.4), look: new THREE.Vector3(narrow ? 0 : -2.2, 0.35, narrow ? 1.2 : 0) };
    } else if (mode === "map") s = { pos: new THREE.Vector3(0, 34, 22), look: new THREE.Vector3(0, 0, 1) };
    else s = { pos: new THREE.Vector3(-4, 15, 25), look: new THREE.Vector3(1, 0, -1) };
    shot.current = s;
    if (!cur.current.init) {
      cur.current.pos.copy(s.pos);
      cur.current.look.copy(s.look);
      cur.current.init = true;
    }
  }, [mode, size.width, size.height, camera, world, gen, labelH]);

  useFrame((st, dt) => {
    const s = shot.current;
    if (!s) return;
    const c = cur.current;
    const k = 1 - Math.exp(-(mode === "battle" ? 5 : 2.2) * Math.min(dt, 0.1));
    c.pos.lerp(s.pos, k);
    c.look.lerp(s.look, k);
    camera.position.copy(c.pos);
    const t = st.clock.elapsedTime;
    if (motion) {
      if (mode === "menu" || mode === "map") {
        camera.position.x += Math.sin(t * 0.07) * 3.2;
        camera.position.z += Math.cos(t * 0.05) * 1.4;
      } else if (mode === "battle") {
        camera.position.x += Math.sin(t * 0.13) * 0.18;
        camera.position.y += Math.sin(t * 0.1) * 0.12;
      }
    }
    camera.lookAt(c.look);
    if (mode === "islands") {
      // turntable around the showcase island, framed left of the info panel
      const a = (motion ? t * 0.22 : 0) + 0.6;
      const narrow = size.width / Math.max(1, size.height) < 1.2;
      const R0 = narrow ? 9.5 : 7.6;
      camera.position.set(Math.sin(a) * R0, narrow ? 5.4 : 4.4, Math.cos(a) * R0);
      camera.lookAt(0, 0.55, 0);
      if (!narrow) camera.translateX(1.7);
      else camera.translateY(-0.9);
    }
    camera.updateMatrixWorld();
  }, -1);
  return null;
}

/* ================================================================ sky + light */
export function SkyDome({ th }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() } },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uBot; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(uBot, uTop, h), 1.0);
        #include <colorspace_fragment>
        }`,
      }),
    []
  );
  useEffect(() => {
    mat.uniforms.uTop.value.set(th.skyTop);
    mat.uniforms.uBot.value.set(th.fog);
  }, [mat, th]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[300, 24, 12]} />
    </mesh>
  );
}

export const SUN_DIR = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();

export function Lights({ th, shadows, quality }) {
  const ref = useRef();
  useEffect(() => {
    const l = ref.current;
    if (!l) return;
    l.target.position.set(0, 0, 0);
    l.target.updateMatrixWorld();
  }, []);
  const map = quality === "high" ? 2048 : 1024;
  return (
    <>
      <hemisphereLight args={[th.hemiSky, th.hemiGround, th.hemiI]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        ref={ref}
        position={[SUN_DIR.x * 40, SUN_DIR.y * 40, SUN_DIR.z * 40]}
        color={th.sun}
        intensity={th.sunI}
        castShadow={shadows}
        shadow-mapSize-width={map}
        shadow-mapSize-height={map}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={10}
        shadow-camera-far={80}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
    </>
  );
}

/* ================================================================ ocean */
export function Ocean({ world, th, quality, ui, gen }) {
  const mat = useMemo(() => createOceanMaterial(), []);
  const segs = quality === "low" ? 1 : quality === "high" ? 220 : 140;
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(220, 160, segs, Math.max(1, Math.round(segs * 0.72)));
    g.rotateX(-Math.PI / 2);
    return g;
  }, [segs]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    const u = mat.uniforms;
    u.uDeep.value.set(th.deep);
    u.uMid.value.set(th.mid);
    u.uShallow.value.set(th.shallow);
    u.uFoam.value.set(th.foam);
    u.uSky.value.set(th.sky);
    u.uSunCol.value.set(th.sun);
    u.uSunDir.value.copy(SUN_DIR);
    u.uOwn.value[0].set(FACTION_INFO.player.color);
    u.uOwn.value[1].set("#ff3d2e");
    u.uOwn.value[2].set("#a65cff");
    u.uOwn.value[3].set(FACTION_INFO.neutral.color);
    u.uAmp.value = quality === "low" ? 0 : 1;
    u.uDetail.value = quality === "low" ? 0.4 : quality === "high" ? 1 : 0.8;
  }, [mat, th, quality]);
  useFrame((st) => {
    const u = mat.uniforms;
    u.uTime.value = st.clock.elapsedTime;
    const isl = world.islands;
    const n = Math.min(isl.length, MAX_ISLANDS);
    u.uCount.value = n;
    const sel = ui.selected;
    const hov = ui.target;
    const now = world.run ? world.run.time : 0;
    for (let k = 0; k < n; k++) {
      const i = isl[k];
      const sp = ui.shore?.get(i.id);
      u.uIsl.value[k].set(i.x, i.z, i.r, OWNER_IDX[i.owner] ?? 3);
      if (sp) u.uShape.value[k].set(sp.p1, sp.p2, sp.p3, 0);
      const st4 = u.uState.value[k];
      const isSel = sel === i.id ? 1 : 0;
      const isTgt = sel && sel !== i.id ? (hov === i.id ? 1 : 0.0) : 0;
      st4.set(isSel, isTgt, ui.warn.has(i.id) ? 1 : 0, i.capturedAt != null && now - i.capturedAt < 1.2 ? now - i.capturedAt : -1);
    }
  });
  return <mesh geometry={geo} material={mat} position={[0, 0, 0]} receiveShadow={false} frustumCulled={false} renderOrder={-1} />;
}

/* ================================================================ islands */
const flagTime = { value: 0 };
function flagMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8, flatShading: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = flagTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uT;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfloat fk = clamp(position.x / 0.42, 0.0, 1.0);\ntransformed.z += sin(position.x * 13.0 - uT * 7.0) * 0.05 * fk;\ntransformed.y += sin(position.x * 9.0 - uT * 5.0) * 0.012 * fk;"
      );
  };
  m.customProgramCacheKey = () => "ic-flag";
  return m;
}

const tentGeo = (() => {
  let g = null;
  return () => {
    if (!g) {
      // white vertex colour so the faction material shows through
      g = paint(T(new THREE.ConeGeometry(0.16, 0.22, 4), 0, 0.11, 0), "#ffffff");
      g.computeVertexNormals();
    }
    return g;
  };
})();

const flagGeo = (() => {
  const cache = new Map();
  return (s) => {
    let g = cache.get(s);
    if (!g) {
      g = new THREE.PlaneGeometry(0.42 * s, 0.26 * s, 10, 3);
      g.translate(0.21 * s, -0.13 * s, 0);
      cache.set(s, g);
    }
    return g;
  };
})();

const TENT_AT = [8, 18, 30, 46];

export function Islands({ world, th, quality, gen, shadows, labelH, ui }) {
  const built = useMemo(() => {
    const list = world.islands.map((i) => {
      const b = buildIsland(i, th, quality);
      const col = new THREE.Color(ownerColor(i.owner));
      const cloth = new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 0.7, vertexColors: true });
      const flag = flagMaterial(col.clone());
      return { i, b, cloth, flag, owner: i.owner, anim: 2, from: col.clone(), pop: 0 };
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, th, quality]);
  useEffect(() => {
    const m = new Map();
    const shore = new Map();
    for (const x of built) {
      m.set(x.i.id, x.b.labelY);
      shore.set(x.i.id, x.b.shore);
    }
    labelH.current = m;
    ui.shore = shore;
    return () => {
      for (const x of built) {
        x.b.body.dispose();
        if (x.b.cloth) x.b.cloth.dispose();
        if (x.b.glow) x.b.glow.dispose();
        x.cloth.dispose();
        x.flag.dispose();
      }
    };
  }, [built, labelH, ui]);
  const groups = useRef([]);
  const flags = useRef([]);
  const tents = useRef([]);
  useFrame((st, dt) => {
    flagTime.value = st.clock.elapsedTime;
    const d = Math.min(dt, 0.1);
    built.forEach((x, k) => {
      const live = world.byId ? world.byId.get(x.i.id) : x.i;
      if (!live) return;
      if (live.owner !== x.owner) {
        // ownership changed: lower the old flag, raise the new one
        x.from.copy(x.cloth.color);
        x.owner = live.owner;
        x.anim = 0;
      }
      if (x.anim < 1.2) {
        x.anim += d;
        const a = x.anim;
        const target = tmpC.set(ownerColor(x.owner));
        const f = flags.current[k];
        if (a < 0.45) {
          if (f) f.position.y = x.b.flag[1] - (a / 0.45) * 0.3;
        } else {
          x.cloth.color.copy(target);
          x.flag.color.copy(target);
          if (f) f.position.y = x.b.flag[1] - 0.3 + Math.min(1, (a - 0.45) / 0.55) * 0.3;
        }
        const g = groups.current[k];
        if (g) {
          const p = a < 1 ? Math.sin((a / 1) * Math.PI) * 0.045 : 0;
          g.scale.setScalar(1 + p);
        }
      }
      const ts = tents.current[k];
      if (ts) for (let j = 0; j < ts.length; j++) if (ts[j]) ts[j].visible = live.owner !== NEUTRAL && live.troops >= TENT_AT[j];
    });
  });
  const glowMat = useMemo(() => (th.glow ? new THREE.MeshStandardMaterial({ color: th.glow, emissive: th.glow, emissiveIntensity: 1.6, flatShading: true }) : null), [th]);
  useEffect(() => () => glowMat && glowMat.dispose(), [glowMat]);
  const body = vcMat("island");
  return (
    <group>
      {built.map((x, k) => (
        <group key={`${gen}-${x.i.id}`} position={[x.i.x, 0, x.i.z]} ref={(el) => (groups.current[k] = el)}>
          <mesh geometry={x.b.body} material={body} castShadow={shadows} receiveShadow={shadows} />
          {x.b.cloth && <mesh geometry={x.b.cloth} material={x.cloth} castShadow={false} />}
          {x.b.glow && glowMat && <mesh geometry={x.b.glow} material={glowMat} />}
          <mesh ref={(el) => (flags.current[k] = el)} geometry={flagGeo(x.i.type === "capital" ? 2.2 : 1.6)} material={x.flag} position={x.b.flag} castShadow={false} />
          {x.b.tents.map(([tx, ty, tz, ry], j) => (
            <mesh
              key={j}
              geometry={tentGeo()}
              material={x.cloth}
              position={[tx, ty, tz]}
              rotation={[0, ry, 0]}
              visible={false}
              castShadow={false}
              ref={(el) => {
                if (!tents.current[k]) tents.current[k] = [];
                tents.current[k][j] = el;
              }}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

/* ================================================================ fleets */
const MAX_BOATS = 192;
const FORMATION = [
  [[0, 0]],
  [
    [-0.24, 0.05],
    [0.24, -0.05],
  ],
  [
    [0, 0.12],
    [-0.36, -0.24],
    [0.36, -0.24],
  ],
];
const pose = { x: 0, z: 0, hx: 0, hz: 1 };
/** boats are drawn larger than life so a fleet reads at strategy zoom */
const BOAT_SCALE = 1.8;

export function Fleets({ world, quality, bus, settings }) {
  const geos = useMemo(() => boatGeometries(), []);
  const meshes = useMemo(() => {
    const body = new THREE.InstancedMesh(geos.body, vcMat("boat", { flatShading: true, roughness: 0.8 }), MAX_BOATS);
    const sail = new THREE.InstancedMesh(geos.sail, getMat("sail", () => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 })), MAX_BOATS);
    const trim = new THREE.InstancedMesh(geos.trim, getMat("trim", () => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, flatShading: true })), MAX_BOATS);
    const wakeGeo = new THREE.PlaneGeometry(0.9, 1.9, 1, 1);
    wakeGeo.rotateX(Math.PI / 2);
    wakeGeo.translate(0, 0, -0.6);
    const str = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOATS), 1);
    wakeGeo.setAttribute("aStr", str);
    const wake = new THREE.InstancedMesh(wakeGeo, createWakeMaterial(), MAX_BOATS);
    for (const m of [body, sail, trim, wake]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    sail.setColorAt(0, WHITE);
    trim.setColorAt(0, WHITE);
    body.castShadow = true;
    sail.castShadow = true;
    wake.renderOrder = 2;
    return { body, sail, trim, wake, str };
  }, [geos]);
  useEffect(
    () => () => {
      meshes.wake.geometry.dispose();
      meshes.wake.material.dispose();
      for (const m of [meshes.body, meshes.sail, meshes.trim, meshes.wake]) m.dispose();
    },
    [meshes]
  );
  useEffect(() => {
    meshes.body.castShadow = settings.shadows && quality !== "low";
    meshes.sail.castShadow = settings.shadows && quality !== "low";
  }, [meshes, settings.shadows, quality]);

  // last pose of every fleet (for the landing animation after it resolves)
  const last = useRef(new Map());
  const ghosts = useRef([]);
  useEffect(() => {
    const h = (ev) => {
      for (const e of ev) {
        if (e.type !== "arrive") continue;
        const p = last.current.get(e.fleet);
        if (p) ghosts.current.push({ ...p, t: 0 });
        last.current.delete(e.fleet);
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus]);

  const amp = quality === "low" ? 0 : 1;
  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    const { body, sail, trim, wake, str } = meshes;
    let n = 0;
    const put = (x, z, hx, hz, s, owner, k, id, strength, sink) => {
      if (n >= MAX_BOATS) return;
      const y = waveH(x, z, t, amp) + 0.0 - sink;
      const yaw = Math.atan2(hx, hz);
      tmpE.set(Math.sin(t * 2.3 + id * 1.7 + k) * 0.05, yaw, Math.sin(t * 2.1 + id + k * 2) * 0.07);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(s, s, s));
      body.setMatrixAt(n, tmpM);
      sail.setMatrixAt(n, tmpM);
      trim.setMatrixAt(n, tmpM);
      tmpE.set(0, yaw, 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(x, waveH(x, z, t, amp) + 0.035, z), tmpQ, tmpS.set(s, 1, s));
      wake.setMatrixAt(n, tmpM);
      str.array[n] = strength;
      const fc = ownerColor(owner);
      tmpC.set(fc);
      trim.setColorAt(n, tmpC);
      tmpC.lerp(WHITE, 0.22);
      sail.setColorAt(n, tmpC);
      n++;
    };
    const fleets = world.fleets || [];
    const lead = world.alpha && world.active && !world.paused ? world.alpha * STEP : 0;
    for (const f of fleets) {
      const d = f.d + f.speed * lead;
      routePoint(f.route, d, pose);
      const boats = boatsFor(f.troops);
      const s = BOAT_SCALE * (0.85 + Math.min(1, f.troops / 60) * 0.35);
      const grow = Math.min(1, d / 0.5);
      const rx = pose.hz;
      const rz = -pose.hx;
      const form = FORMATION[boats - 1];
      for (let k = 0; k < boats; k++) {
        const [lat, fwd] = form[k];
        const x = pose.x + rx * lat * s + pose.hx * fwd * s;
        const z = pose.z + rz * lat * s + pose.hz * fwd * s;
        put(x, z, pose.hx, pose.hz, s * (0.4 + 0.6 * grow), f.owner, k, f.id, grow, 0);
      }
      last.current.set(f.id, { x: pose.x, z: pose.z, hx: pose.hx, hz: pose.hz, boats, s, owner: f.owner, id: f.id });
    }
    // landing: boats glide in and settle onto the beach for a moment
    const gs = ghosts.current;
    for (let g = gs.length - 1; g >= 0; g--) {
      const o = gs[g];
      o.t += Math.min(dt, 0.1);
      if (o.t > 0.5) {
        gs.splice(g, 1);
        continue;
      }
      const k01 = o.t / 0.5;
      const form = FORMATION[o.boats - 1];
      const rx = o.hz;
      const rz = -o.hx;
      for (let k = 0; k < o.boats; k++) {
        const [lat, fwd] = form[k];
        const x = o.x + rx * lat * o.s + o.hx * (fwd * o.s + k01 * 0.25);
        const z = o.z + rz * lat * o.s + o.hz * (fwd * o.s + k01 * 0.25);
        put(x, z, o.hx, o.hz, o.s * (1 - k01 * 0.6), o.owner, k, o.id, 1 - k01, k01 * 0.12);
      }
    }
    if (last.current.size > 200) last.current.clear();
    for (const m of [body, sail, trim, wake]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    if (sail.instanceColor) sail.instanceColor.needsUpdate = true;
    if (trim.instanceColor) trim.instanceColor.needsUpdate = true;
    str.needsUpdate = true;
    wake.material.uniforms.uTime.value = t;
  });
  return (
    <>
      <primitive object={meshes.wake} />
      <primitive object={meshes.body} />
      <primitive object={meshes.sail} />
      <primitive object={meshes.trim} />
    </>
  );
}

/* ================================================================ route dots */
const MAX_DOTS = 700;
export function RouteDots({ world, ui, quality }) {
  const mesh = useMemo(() => {
    const g = new THREE.CircleGeometry(0.075, 10);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    const im = new THREE.InstancedMesh(g, m, MAX_DOTS);
    im.count = 0;
    im.frustumCulled = false;
    im.renderOrder = 3;
    im.setColorAt(0, WHITE);
    return im;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    },
    [mesh]
  );
  const colors = useMemo(
    () => ({
      player: new THREE.Color(FACTION_INFO.player.light),
      red: new THREE.Color(FACTION_INFO.red.color),
      redDim: new THREE.Color(FACTION_INFO.red.color).lerp(new THREE.Color("#3a5a78"), 0.55),
      purple: new THREE.Color(FACTION_INFO.purple.color),
      purpleDim: new THREE.Color(FACTION_INFO.purple.color).lerp(new THREE.Color("#3a5a78"), 0.55),
      aim: new THREE.Color("#ffffff"),
      bad: new THREE.Color("#9fb0bf"),
    }),
    []
  );
  const amp = quality === "low" ? 0 : 1;
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    let n = 0;
    const dot = (x, z, s, c) => {
      if (n >= MAX_DOTS) return;
      tmpM.compose(tmpV.set(x, waveH(x, z, t, amp) + 0.06, z), tmpQ.identity(), tmpS.set(s, 1, s));
      mesh.setMatrixAt(n, tmpM);
      mesh.setColorAt(n, c);
      n++;
    };
    const SP = 0.55;
    if (world.fleets && world.mode === "play") {
      for (const f of world.fleets) {
        const tgt = world.byId.get(f.to);
        let c;
        let s = 0.85;
        if (f.owner === PLAYER) c = colors.player;
        else if (tgt && tgt.owner === PLAYER) {
          c = f.owner === "purple" ? colors.purple : colors.red;
          s = 1.05;
        } else c = f.owner === "purple" ? colors.purpleDim : colors.redDim;
        const off = (t * 0.9) % SP;
        for (let d = f.d + 0.6 + off; d < f.len - 0.1; d += SP) {
          routePoint(f.route, d, pose);
          dot(pose.x, pose.z, s, c);
        }
      }
    }
    // aim preview from the selected island
    const src = ui.selected ? world.byId?.get(ui.selected) : null;
    if (src && world.mode === "play") {
      const tgt = ui.target ? world.byId.get(ui.target) : null;
      if (tgt && tgt !== src) {
        const r = world.route(src, tgt);
        const off = (t * 1.6) % 0.42;
        for (let d = off; d < r.len; d += 0.42) {
          routePoint(r, d, pose);
          dot(pose.x, pose.z, 1.25, colors.aim);
        }
      } else if (ui.drag && ui.drag.active && ui.drag.wx != null) {
        const dx = ui.drag.wx - src.x;
        const dz = ui.drag.wz - src.z;
        const L = Math.hypot(dx, dz);
        if (L > src.r + 0.4) {
          const off = (t * 1.6) % 0.42;
          for (let d = src.r + 0.35 + off; d < L; d += 0.42) dot(src.x + (dx / L) * d, src.z + (dz / L) * d, 1.0, colors.bad);
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

/* ================================================================ bursts */
const MAX_P = 260;
export function Bursts({ world, bus, settings, labelH }) {
  const pts = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_P * 3);
    const col = new Float32Array(MAX_P * 3);
    const life = new Float32Array(MAX_P);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aLife", new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 300 } },
      vertexShader: `attribute float aLife; attribute vec3 color; varying vec3 vC; varying float vL; uniform float uScale;
        void main(){ vC = color; vL = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = uScale * (0.05 + 0.07 * aLife) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vL; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5 || vL <= 0.0) discard; gl_FragColor = vec4(vC, smoothstep(0.5, 0.1, d) * min(1.0, vL * 1.6));
        #include <colorspace_fragment>
        }`,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.renderOrder = 4;
    return { p, pos, col, life, vel: new Float32Array(MAX_P * 3), next: 0 };
  }, []);
  useEffect(
    () => () => {
      pts.p.geometry.dispose();
      pts.p.material.dispose();
    },
    [pts]
  );
  const rand = useMemo(() => rng(42), []);
  useEffect(() => {
    const spawn = (x, y, z, n, color, speed, up) => {
      tmpC.set(color);
      for (let k = 0; k < n; k++) {
        const i = pts.next++ % MAX_P;
        pts.pos[i * 3] = x;
        pts.pos[i * 3 + 1] = y;
        pts.pos[i * 3 + 2] = z;
        const a = rand() * Math.PI * 2;
        const v = speed * (0.4 + rand() * 0.8);
        pts.vel[i * 3] = Math.cos(a) * v;
        pts.vel[i * 3 + 1] = up * (0.6 + rand() * 0.8);
        pts.vel[i * 3 + 2] = Math.sin(a) * v;
        const k2 = 0.8 + rand() * 0.4;
        pts.col[i * 3] = tmpC.r * k2;
        pts.col[i * 3 + 1] = tmpC.g * k2;
        pts.col[i * 3 + 2] = tmpC.b * k2;
        pts.life[i] = 1;
      }
    };
    const h = (ev) => {
      if (!settings.particles || world.mode !== "play") return;
      const many = settings.reducedMotion ? 0.4 : 1;
      for (const e of ev) {
        const i = world.byId.get(e.island ?? e.from);
        if (!i) continue;
        if (e.type === "capture") {
          const y = (labelH.current.get(i.id) || 1.2) - 0.4;
          spawn(i.x, y, i.z, Math.round(34 * many), ownerColor(e.to), 2.2, 2.6);
          spawn(i.x, y, i.z, Math.round(10 * many), "#fff6d8", 1.4, 3.4);
        } else if (e.type === "arrive" && e.kind === "repelled") {
          spawn(i.x, 0.4, i.z, Math.round(14 * many), "#ffe2b0", 1.6, 1.8);
        } else if (e.type === "launch") {
          spawn(i.x, 0.15, i.z, Math.round(6 * many), "#ffffff", 0.9, 0.9);
        }
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, pts, world, settings.particles, settings.reducedMotion, rand, labelH]);
  useFrame((st, dt) => {
    const d = Math.min(dt, 0.05);
    let alive = false;
    for (let i = 0; i < MAX_P; i++) {
      if (pts.life[i] <= 0) continue;
      alive = true;
      pts.life[i] -= d * 1.2;
      pts.vel[i * 3 + 1] -= 6 * d;
      pts.pos[i * 3] += pts.vel[i * 3] * d;
      pts.pos[i * 3 + 1] = Math.max(0.05, pts.pos[i * 3 + 1] + pts.vel[i * 3 + 1] * d);
      pts.pos[i * 3 + 2] += pts.vel[i * 3 + 2] * d;
    }
    const g = pts.p.geometry;
    g.attributes.position.needsUpdate = alive;
    g.attributes.color.needsUpdate = alive;
    g.attributes.aLife.needsUpdate = true;
    pts.p.material.uniforms.uScale.value = st.size.height * 0.9;
  });
  return <primitive object={pts.p} />;
}

/* ================================================================ clouds + birds */
export function Clouds({ th, quality, mode }) {
  const list = useMemo(() => {
    const rand = rng(7);
    const n = quality === "low" ? 4 : quality === "high" ? 9 : 6;
    const out = [];
    for (let i = 0; i < n; i++) {
      const parts = [];
      const k = 3 + Math.floor(rand() * 3);
      for (let j = 0; j < k; j++) parts.push(paint(T(sph(0.9 + rand() * 0.9, 8, 6), j * 1.1 - k * 0.5, rand() * 0.4, (rand() - 0.5) * 0.9, 0, 0, 0, 1, 0.62, 1), "#ffffff", 0.06, j));
      // clouds drift around the rim of the map (never over the battlefield)
      const side = i % 2 ? 1 : -1;
      // far horizon (behind the map) or out past the left/right edges — never
      // between the camera (which sits on the +z side) and the islands
      const back = i % 2 === 0;
      out.push({ geo: merge(parts), x: back ? -40 + rand() * 80 : side * (27 + rand() * 8), y: 9 + rand() * 3, z: back ? -24 - rand() * 10 : -14 + rand() * 12, speed: back ? 0.25 + rand() * 0.3 : 0, s: 1.0 + rand() * 0.7 });
    }
    return out;
  }, [quality]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.45, transparent: true, opacity: 0.9, flatShading: true, depthWrite: false, fog: true }), []);
  useEffect(() => {
    mat.color.set(th.clouds);
    mat.emissive.set(th.clouds);
    mat.opacity = th.cloudA * (mode === "battle" ? 0.75 : 1);
  }, [mat, th, mode]);
  useEffect(
    () => () => {
      list.forEach((c) => c.geo.dispose());
    },
    [list]
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const refs = useRef([]);
  useFrame((st, dt) => {
    const d = Math.min(dt, 0.1);
    list.forEach((c, i) => {
      c.x += c.speed * d;
      if (c.x > 45) c.x = -45;
      const m = refs.current[i];
      if (m) m.position.set(c.x, c.y, c.z);
    });
  });
  return list.map((c, i) => <mesh key={i} ref={(el) => (refs.current[i] = el)} geometry={c.geo} material={mat} scale={c.s} position={[c.x, c.y, c.z]} renderOrder={5} />);
}

export function Birds({ quality, reduced }) {
  const n = quality === "low" || reduced ? 0 : quality === "high" ? 7 : 4;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.08, -0.32, 0.06, -0.06, 0, 0, -0.04, 0, 0, 0.08, 0, 0, -0.04, 0.32, 0.06, -0.06], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#2b3440", side: THREE.DoubleSide }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat]
  );
  const refs = useRef([]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const R = 9 + (i % 3) * 3;
      const a = t * (0.16 + i * 0.015) + i * 1.9;
      m.position.set(Math.cos(a) * R + (i % 2 ? 4 : -3), 4.6 + Math.sin(t * 0.7 + i) * 0.4, Math.sin(a) * R * 0.6 - 2);
      m.rotation.y = -a;
      m.scale.set(1, 1 + Math.sin(t * 9 + i * 2) * 0.9, 1);
    }
  });
  return Array.from({ length: n }, (_, i) => <mesh key={i} ref={(el) => (refs.current[i] = el)} geometry={geo} material={mat} />);
}

/* ================================================================ labels + picking */
/**
 * DOM troop badges over every island and every fleet, positioned each frame
 * from the camera projection (no React renders). The same pass records each
 * island's on-screen centre and pick radius in `view.picks`, which the root
 * component uses for click/tap/drag hit-testing.
 */
const SPECIAL_ICON = {
  farm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9M12 9c0-3 2-5 5-5 0 3-2 5-5 5zM12 13c0-3-2-5-5-5 0 3 2 5 5 5zM12 17c0-2.5 2-4.5 4.5-4.5 0 2.5-2 4.5-4.5 4.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  fort: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="currentColor"/></svg>',
  port: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a2 2 0 1 0 0-.01M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  capital: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" fill="currentColor"/></svg>',
};

export function Labels({ world, layer, ui, view, gen, labelH, visible }) {
  // Badges are (re)built lazily from the frame loop whenever the island list
  // being drawn changes (new level, demo restart, Islands-screen showcase), so
  // they can never get out of step with the world they label.
  const els = useRef({ list: null, islands: [], fleets: [] });
  const build = () => {
    const root = layer.current;
    const old = els.current;
    old.islands.forEach((x) => x.el.remove());
    old.fleets.forEach((x) => x.el.remove());
    els.current = { list: world.islands, islands: [], fleets: [] };
    if (!root) return;
    const islands = world.islands.map((i) => {
      const el = document.createElement("div");
      el.className = "ic-lbl";
      el.style.display = "none";
      const T0 = ISLAND_TYPES[i.type];
      const sp = T0.special && SPECIAL_ICON[i.type] ? `<span class="ic-lbl__ico ic-lbl__ico--${i.type}">${SPECIAL_ICON[i.type]}</span>` : "";
      const def = T0.defense > 1 ? `<span class="ic-lbl__def">×${T0.defense}</span>` : "";
      el.innerHTML = `<span class="ic-lbl__warn" aria-hidden="true">!</span>${sp}<span class="ic-lbl__n"></span>${def}`;
      root.appendChild(el);
      return { el, n: el.querySelector(".ic-lbl__n"), last: -1, cls: "" };
    });
    const fleets = [];
    for (let k = 0; k < 48; k++) {
      const el = document.createElement("span");
      el.className = "ic-flbl";
      el.style.display = "none";
      root.appendChild(el);
      fleets.push({ el, last: -1, cls: "" });
    }
    els.current = { list: world.islands, islands, fleets };
  };
  useEffect(
    () => () => {
      els.current.islands.forEach((x) => x.el.remove());
      els.current.fleets.forEach((x) => x.el.remove());
      els.current = { list: null, islands: [], fleets: [] };
    },
    []
  );

  useFrame((st) => {
    const cam = st.camera;
    const W = st.size.width;
    const H = st.size.height;
    view.size = { w: W, h: H };
    if (els.current.list !== world.islands) build();
    const { islands, fleets } = els.current;
    const picks = [];
    const showN = visible;
    world.islands.forEach((i, k) => {
      const L = islands[k];
      if (!L) return;
      const ly = labelH.current.get(i.id) || 1.4;
      tmpV.set(i.x, ly, i.z).project(cam);
      const sx = (tmpV.x * 0.5 + 0.5) * W;
      const sy = (-tmpV.y * 0.5 + 0.5) * H;
      // pick radius: projected island radius (centre at ~ground level)
      tmpV2.set(i.x, 0.35, i.z).project(cam);
      const cx = (tmpV2.x * 0.5 + 0.5) * W;
      const cy = (-tmpV2.y * 0.5 + 0.5) * H;
      tmpV.set(i.x + i.r, 0.35, i.z).project(cam);
      const rad = Math.abs((tmpV.x * 0.5 + 0.5) * W - cx);
      picks.push({ id: i.id, x: cx, y: cy, rad: Math.max(26, rad * 1.08), lx: sx, ly: sy });
      if (!showN) {
        if (L.el.style.display !== "none") L.el.style.display = "none";
        return;
      }
      if (L.el.style.display === "none") L.el.style.display = "";
      L.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      if (L.last !== i.troops) {
        L.n.textContent = String(i.troops);
        L.last = i.troops;
      }
      const atCap = i.owner !== NEUTRAL && i.troops >= i.cap;
      const cls = `ic-lbl is-${i.owner}${ui.selected === i.id ? " is-sel" : ""}${ui.warn.has(i.id) ? " is-warn" : ""}${ui.selected && ui.selected !== i.id && ui.target === i.id ? " is-tgt" : ""}${atCap ? " is-cap" : ""}${i.capturedAt != null && world.run && world.run.time - i.capturedAt < 0.8 ? " is-pop" : ""}`;
      if (cls !== L.cls) {
        L.el.className = cls;
        L.cls = cls;
      }
    });
    view.picks = picks;
    // fleet strength labels
    let n = 0;
    if (showN && world.fleets) {
      const lead = world.alpha && world.active && !world.paused ? world.alpha * STEP : 0;
      for (const f of world.fleets) {
        if (n >= fleets.length) break;
        routePoint(f.route, f.d + f.speed * lead, pose);
        tmpV.set(pose.x, 0.95, pose.z).project(cam);
        const F = fleets[n++];
        if (F.el.style.display === "none") F.el.style.display = "";
        F.el.style.transform = `translate3d(${((tmpV.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-tmpV.y * 0.5 + 0.5) * H).toFixed(1)}px, 0) translate(-50%, -100%)`;
        if (F.last !== f.troops) {
          F.el.textContent = String(f.troops);
          F.last = f.troops;
        }
        const tgt = world.byId.get(f.to);
        const cls = `ic-flbl is-${f.owner}${f.owner !== PLAYER && tgt && tgt.owner === PLAYER ? " is-threat" : ""}`;
        if (cls !== F.cls) {
          F.el.className = cls;
          F.cls = cls;
        }
      }
    }
    for (let k = n; k < fleets.length; k++) if (fleets[k].el.style.display !== "none") fleets[k].el.style.display = "none";
  });
  return null;
}
