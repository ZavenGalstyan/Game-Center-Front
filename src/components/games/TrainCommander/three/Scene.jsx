/**
 * Train Commander — the 3D world (React Three Fiber).
 *
 * <Driver> is the ONLY place the engine is ticked (one useFrame, priority
 * −2). It drains engine.events onto `bus`, which feeds effects, floating
 * numbers and (in the root component) sound. Every other component READS
 * engine state each frame and updates pooled Three.js objects directly —
 * React never re-renders per frame, nothing allocates geometry per frame.
 *
 * `view` is a small mutable object shared with the DOM layer: world→screen
 * projection, stage size, camera shake impulse, warnings for edge arrows,
 * the selected car's screen anchor.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Environment, RAIL_Y } from "./environment.js";
import { atmosphere } from "./atmosphere.js";
import { blobTexture } from "./textures.js";

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

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

/** train extent in the train frame (for camera + tunnels) */
export function trainExtent(engine) {
  const cars = engine.cars;
  if (!cars.length) return [-12, 12];
  const f = cars[0].x + cars[0].len / 2;
  const l = cars[cars.length - 1];
  return [l.x - l.len / 2, f];
}

/* ================================================================ camera */
/**
 * Battle shot: an elevated three-quarter view from the right-rear of the
 * train. Distance is solved so the whole train plus both attack bands fit
 * between the top HUD and the bottom interaction strip for the current
 * aspect ratio (desktop 16:9 → phones in portrait get a higher, closer shot).
 */
function fitPlay(camera, aspect, ext) {
  const cam = camera.clone();
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  const narrow = aspect < 1.2;
  const pitch = narrow ? 0.8 : 0.58;
  const yaw = narrow ? 0.12 : 0.42;
  const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const [rear, front] = ext;
  const mid = (rear + front) / 2;
  const pts = [];
  for (const x of [rear - 1.5, front + 2]) for (const z of [-3, 3]) pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 3.6, z));
  const farZ = narrow ? -12 : -19;
  const nearZ = narrow ? 7 : 6;
  for (const x of [rear + 3, mid, front - 3]) pts.push(new THREE.Vector3(x, 0, farZ), new THREE.Vector3(x, 0, nearZ));
  const top = 0.74;
  const bottom = narrow ? -0.56 : -0.8;
  const side = narrow ? 1.0 : 0.97;
  const look = new THREE.Vector3(mid + (narrow ? 0 : 1.5), 0.8, -2.5);
  let D = 40;
  for (let iter = 0; iter < 3; iter++) {
    let lo = 6;
    let hi = 260;
    for (let i = 0; i < 34; i++) {
      D = (lo + hi) / 2;
      cam.position.copy(look).addScaledVector(dir, D);
      cam.lookAt(look);
      cam.updateMatrixWorld();
      let ok = true;
      for (const p of pts) {
        tmpV.copy(p).project(cam);
        if (tmpV.x < -side || tmpV.x > side || tmpV.y < bottom || tmpV.y > top) {
          ok = false;
          break;
        }
      }
      if (ok) hi = D;
      else lo = D;
    }
    D = hi;
    // re-centre vertically between the HUD bands
    cam.position.copy(look).addScaledVector(dir, D);
    cam.lookAt(look);
    cam.updateMatrixWorld();
    let mn = Infinity;
    let mx = -Infinity;
    for (const p of pts) {
      tmpV.copy(p).project(cam);
      mn = Math.min(mn, tmpV.y);
      mx = Math.max(mx, tmpV.y);
    }
    const err = (mx - top + (mn - bottom)) / 2;
    look.addScaledVector(new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch)).normalize(), err * D * Math.tan((camera.fov * Math.PI) / 360) * 0.8);
  }
  return { pos: look.clone().addScaledVector(dir, D), look };
}

export function CameraRig({ mode, view, engine, settings, garage }) {
  const { camera, size } = useThree();
  const cur = useRef({ pos: new THREE.Vector3(30, 6, 22), look: new THREE.Vector3(0, 1.5, 0), init: false });
  const shot = useRef(null);
  const extKey = engine.cars.length;
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const ext = trainExtent(engine);
    const narrow = aspect < 1.2;
    let s;
    if (mode === "play") s = fitPlay(camera, aspect, ext);
    else if (mode === "map") s = { pos: new THREE.Vector3(ext[1] + 30, 46, 70), look: new THREE.Vector3(ext[1] - 10, 0, -20) };
    else if (mode === "garage") s = { pos: new THREE.Vector3(0, 7, 22), look: new THREE.Vector3(0, 1.6, 0), orbit: true };
    else {
      // menu: low, cinematic, looking back along the train past the locomotive
      const lx = ext[1];
      s = narrow ? { pos: new THREE.Vector3(lx + 9, 5.5, 16), look: new THREE.Vector3(lx - 9, 1.2, -1) } : { pos: new THREE.Vector3(lx + 2.5, 4.0, 19.5), look: new THREE.Vector3(lx - 10.5, 2.4, -1.0) };
    }
    shot.current = s;
    if (!cur.current.init) {
      cur.current.pos.copy(s.pos);
      cur.current.look.copy(s.look);
      cur.current.init = true;
    }
  }, [mode, size.width, size.height, camera, engine, extKey]);

  useFrame((st, rdt) => {
    const s = shot.current;
    if (!s) return;
    const dt = Math.min(rdt, 0.1);
    const c = cur.current;
    const motion = settings.cameraMotion && !settings.reducedMotion;
    const t = st.clock.elapsedTime;
    let pos = s.pos;
    let look = s.look;
    if (s.orbit) {
      // Train screen: drag to orbit; slow auto-turn when idle
      const ext = trainExtent(engine);
      const len = ext[1] - ext[0];
      const mid = (ext[0] + ext[1]) / 2;
      if (!garage.drag) garage.yaw += dt * 0.12;
      const R = Math.max(16, len * 1.25);
      tmpV2.set(mid + Math.sin(garage.yaw) * R, 3 + R * 0.22 + garage.pitch * 8, Math.cos(garage.yaw) * R);
      look = tmpV.set(mid, 1.5, 0);
      // frame the train in the free area left of the side panel
      const aspect = st.size.width / Math.max(1, st.size.height);
      if (aspect > 1.2) {
        const rx = Math.cos(garage.yaw);
        const rz = -Math.sin(garage.yaw);
        const off = R * 0.17;
        tmpV2.x += rx * off;
        tmpV2.z += rz * off;
        look.x += rx * off;
        look.z += rz * off;
      }
      pos = tmpV2;
    }
    const k = 1 - Math.exp(-(mode === "play" ? 4 : 1.8) * dt);
    c.pos.lerp(pos, k);
    c.look.lerp(look, k);
    camera.position.copy(c.pos);
    if (motion) {
      const amp = mode === "play" ? 0.18 : 0.9;
      camera.position.x += Math.sin(t * 0.13) * amp;
      camera.position.y += Math.sin(t * 0.21) * amp * 0.35;
    }
    if (view.shake > 0) {
      if (settings.cameraShake && !settings.reducedMotion) {
        const a = view.shake * 0.4;
        camera.position.x += (Math.random() - 0.5) * a;
        camera.position.y += (Math.random() - 0.5) * a;
      }
      view.shake = Math.max(0, view.shake - dt * 2.2);
    }
    camera.lookAt(c.look);
    camera.updateMatrixWorld();
    view.size = [st.size.width, st.size.height];
    view.camera = camera;
    view.scene = st.scene;
  });

  useEffect(() => {
    view.toScreen = (x, y, z) => {
      tmpV2.set(x, y, z).project(camera);
      const [W, H] = view.size || [1, 1];
      return [(tmpV2.x * 0.5 + 0.5) * W, (-tmpV2.y * 0.5 + 0.5) * H, tmpV2.z];
    };
  }, [camera, view]);
  return null;
}

/* ================================================================ lights */
export function Lights({ A, shadows, quality, envRef, view }) {
  const sun = useRef();
  const hemi = useRef();
  const amb = useRef();
  const flash = useRef({ t: 0, next: 6 });
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.target.position.set(0, 0, -2);
    l.target.updateMatrixWorld();
    const c = l.shadow.camera;
    c.left = -42;
    c.right = 42;
    c.top = 26;
    c.bottom = -26;
    c.near = 1;
    c.far = 160;
    c.updateProjectionMatrix();
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.04;
  }, [shadows, quality]);
  useFrame((st, rdt) => {
    const dt = Math.min(rdt, 0.1);
    const tf = envRef.current ? envRef.current.tunnelFactor : 0;
    // lightning for storms (visual only)
    let bolt = 0;
    if (A.weather === "storm") {
      const f = flash.current;
      f.next -= dt;
      if (f.next <= 0) {
        f.t = 0.35;
        f.next = 5 + Math.random() * 8;
        view.thunder = (view.thunder || 0) + 1;
      }
      if (f.t > 0) {
        f.t -= dt;
        bolt = f.t > 0.25 || (f.t > 0.08 && f.t < 0.15) ? 1 : 0;
      }
    }
    if (sun.current) sun.current.intensity = A.sunI * (1 - tf * 0.85) + bolt * 2.5;
    if (hemi.current) hemi.current.intensity = A.hemiI * (1 - tf * 0.55) + bolt * 1.4;
    if (amb.current) amb.current.intensity = A.ambient + tf * 0.12;
    view.lampBoost = Math.min(2.2, A.lamps + tf * 1.6);
  });
  const res = quality === "high" ? 2048 : 1024;
  return (
    <>
      <hemisphereLight ref={hemi} args={[A.hemiSky, A.hemiGround, A.hemiI]} />
      <ambientLight ref={amb} intensity={A.ambient} />
      <directionalLight ref={sun} position={A.sunPos} intensity={A.sunI} color={A.sun} castShadow={shadows} shadow-mapSize-width={res} shadow-mapSize-height={res} />
    </>
  );
}

/* ================================================================ world */
export function World({ R, A, quality, engine, envRef, seed, twin }) {
  const env = useMemo(() => new Environment(R, quality, seed, { atmo: A, twinTrack: twin }), [R, A, quality, seed, twin]);
  useEffect(() => {
    envRef.current = env;
    return () => {
      if (envRef.current === env) envRef.current = null;
      env.dispose();
    };
  }, [env, envRef]);
  useFrame((st, rdt) => {
    const dt = engine.paused ? 0 : Math.min(rdt, 0.1);
    env.update(engine, dt, st.clock.elapsedTime, trainExtent(engine));
  });
  return <primitive object={env.group} />;
}

/* ================================================================ weather */
/**
 * Rain streaks / snowflakes / blowing dust inside a box around the train.
 * Particles live in the AIR, so in the train frame they drift back at
 * −trainSpeed (plus wind) — rain visibly slants as the train speeds up.
 */
export function Weather({ A, engine, quality, particles }) {
  const kind = A.weather === "storm" ? "rain" : A.weather;
  const active = kind === "rain" || kind === "snow" || kind === "dust";
  const n = !active ? 0 : Math.round((kind === "dust" ? 90 : 520) * (quality === "low" ? 0.4 : quality === "high" ? 1.3 : 1) * (particles ? 1 : 0.35));
  const sys = useMemo(() => {
    if (!n) return null;
    let geo;
    let mat;
    if (kind === "rain") {
      geo = new THREE.BoxGeometry(0.03, 0.9, 0.03);
      mat = new THREE.MeshBasicMaterial({ color: "#c9d6e6", transparent: true, opacity: 0.45, depthWrite: false });
    } else if (kind === "snow") {
      geo = new THREE.IcosahedronGeometry(0.07, 0);
      mat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false });
    } else {
      geo = new THREE.PlaneGeometry(3, 3);
      mat = new THREE.MeshBasicMaterial({ map: blobTexture(), color: "#d8b07a", transparent: true, opacity: 0.18, depthWrite: false });
    }
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const p = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      p[i * 4] = (Math.random() - 0.5) * 90;
      p[i * 4 + 1] = Math.random() * 26;
      p[i * 4 + 2] = -34 + Math.random() * 52;
      p[i * 4 + 3] = Math.random() * 6.28;
    }
    return { mesh, p, geo, mat };
  }, [n, kind]);
  useEffect(() => () => sys && (sys.geo.dispose(), sys.mat.dispose()), [sys]);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((st, rdt) => {
    if (!sys) return;
    const dt = engine.paused ? 0 : Math.min(rdt, 0.1);
    const v = engine.v;
    const { p, mesh } = sys;
    const t = st.clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      let x = p[i * 4];
      let y = p[i * 4 + 1];
      let z = p[i * 4 + 2];
      if (kind === "rain") {
        y -= 22 * dt;
        x -= (v + 3) * dt;
      } else if (kind === "snow") {
        y -= 2.2 * dt;
        x -= (v * 0.9 + 1) * dt + Math.sin(t + p[i * 4 + 3]) * 0.6 * dt;
        z += Math.cos(t * 0.7 + p[i * 4 + 3]) * 0.4 * dt;
      } else {
        x -= (v + 9) * dt;
        y += Math.sin(t * 0.5 + p[i * 4 + 3]) * 0.3 * dt;
      }
      if (y < 0) y += 26;
      if (x < -45) x += 90;
      if (x > 45) x -= 90;
      p[i * 4] = x;
      p[i * 4 + 1] = y;
      p[i * 4 + 2] = z;
      o.position.set(x, kind === "dust" ? 1 + (y % 6) : y, z);
      if (kind === "rain") {
        o.rotation.set(0, 0, Math.atan2(v + 3, 22));
        o.scale.set(1, 1, 1);
      } else if (kind === "dust") {
        o.rotation.set(-Math.PI / 2, 0, p[i * 4 + 3]);
        o.scale.setScalar(1 + (i % 5) * 0.4);
      } else o.rotation.set(0, 0, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (!sys) return null;
  return <primitive object={sys.mesh} />;
}

export { atmosphere, RAIL_Y };
