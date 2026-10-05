/**
 * Castle Rush — the 3D battlefield (React Three Fiber).
 *
 * <Driver> is the ONLY place the engine is ticked (one useFrame). It drains
 * engine.events onto `bus`, which feeds effects, floating numbers and (in the
 * root component) sound. Every other component READS engine state each frame
 * and updates pooled Three.js objects directly — React never re-renders per
 * frame, and nothing allocates geometry or materials per frame.
 *
 * `view` is a small mutable object shared with the DOM layer: the camera's
 * world→screen projection, stage size, camera shake impulse.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { UNITS } from "../data/units.js";
import { FIELD } from "../engine/constants.js";
import { buildSoldier, animateSoldier, resetRig, showcaseUnit } from "./soldier.js";
import { buildCastle, waveCloth, FRONT } from "./castle.js";
import { buildEnvironment } from "./environment.js";
import { Bits, Puffs, arrowGeometry } from "./effects.js";
import { paint, merge, T, cyl, vcMat } from "./geo.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, 1);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const SHOWCASE = { x: 0, z: 9.2 };
/** soldiers are drawn a bit larger than their lane body for readability */
const UNIT_VIS = 1.25;

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
/**
 * Fits the battlefield into the stage for the current aspect ratio: both
 * castle gates and the whole lane stay visible, clear of the top HUD and the
 * bottom unit bar. Other modes (menu, map, army) use framed shots.
 */
function fitBattle(camera, aspect) {
  const cam = camera.clone();
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  const pitch = aspect < 1.2 ? 0.46 : 0.36;
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  const pts = [];
  // gates + wall fronts must be on screen; the rest of each castle may crop
  const W = FIELD.wallX + 1.6;
  for (const x of [-W, W]) for (const z of [-2.6, 3.0]) pts.push(new THREE.Vector3(x, 0, z));
  for (const x of [-W, W]) pts.push(new THREE.Vector3(x, 4.2, 0));
  const top = 0.74;
  const bottom = aspect < 1.2 ? -0.5 : -0.56;
  const side = 0.985;
  let cy = 1.2;
  let cz = 0.2;
  let D = 40;
  for (let iter = 0; iter < 3; iter++) {
    let lo = 8;
    let hi = 200;
    for (let i = 0; i < 32; i++) {
      D = (lo + hi) / 2;
      cam.position.set(0, cy + dir.y * D, cz + dir.z * D);
      cam.lookAt(0, cy, cz);
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
    cam.position.set(0, cy + dir.y * D, cz + dir.z * D);
    cam.lookAt(0, cy, cz);
    cam.updateMatrixWorld();
    let mn = Infinity;
    let mx = -Infinity;
    for (const p of pts) {
      tmpV.copy(p).project(cam);
      mn = Math.min(mn, tmpV.y);
      mx = Math.max(mx, tmpV.y);
    }
    const err = (mx - top + (mn - bottom)) / 2;
    cy += err * D * Math.tan((camera.fov * Math.PI) / 360) * 0.9;
  }
  return { pos: new THREE.Vector3(0, cy + dir.y * D, cz + dir.z * D), look: new THREE.Vector3(0, cy, cz) };
}

export function CameraRig({ mode, view, motion, kingdomId }) {
  const { camera, size } = useThree();
  const cur = useRef({ pos: new THREE.Vector3(-14, 6, 22), look: new THREE.Vector3(4, 2, -2), init: false });
  const shot = useRef(null);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    let s;
    if (mode === "battle") s = fitBattle(camera, aspect);
    else if (mode === "army") {
      const narrow = aspect < 1.3;
      s = { pos: new THREE.Vector3(SHOWCASE.x, 2.05, SHOWCASE.z + (narrow ? 7 : 5.5)), look: new THREE.Vector3(SHOWCASE.x, 1.25, SHOWCASE.z) };
    } else if (mode === "map") s = { pos: new THREE.Vector3(2, 21, 33), look: new THREE.Vector3(0, 1, -6) };
    else s = { pos: new THREE.Vector3(-31, 6.5, 19), look: new THREE.Vector3(2, 2.6, -2.5) };
    shot.current = s;
    if (!cur.current.init) {
      cur.current.pos.copy(s.pos);
      cur.current.look.copy(s.look);
      cur.current.init = true;
    }
  }, [mode, size.width, size.height, camera, kingdomId]);

  useFrame((st, dt) => {
    const s = shot.current;
    if (!s) return;
    const c = cur.current;
    const k = 1 - Math.exp(-(mode === "battle" ? 4.5 : 2.4) * Math.min(dt, 0.1));
    c.pos.lerp(s.pos, k);
    c.look.lerp(s.look, k);
    camera.position.copy(c.pos);
    const t = st.clock.elapsedTime;
    if (motion && mode !== "battle" && mode !== "army") {
      camera.position.x += Math.sin(t * 0.11) * 1.6;
      camera.position.y += Math.sin(t * 0.17) * 0.35;
    }
    // impulse (castle destroyed) — small and brief
    if (view.shake > 0) {
      const a = view.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
      view.shake = Math.max(0, view.shake - dt * 1.6);
    }
    camera.lookAt(c.look);
    camera.updateMatrixWorld();
    view.size = [st.size.width, st.size.height];
    view.camera = camera;
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
export function Lights({ k, shadows, quality }) {
  const sun = useRef();
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.target.position.set(0, 0, -1);
    l.target.updateMatrixWorld();
    const c = l.shadow.camera;
    c.left = -27;
    c.right = 27;
    c.top = 16;
    c.bottom = -14;
    c.near = 1;
    c.far = 90;
    c.updateProjectionMatrix();
    l.shadow.bias = -0.0006;
    l.shadow.normalBias = 0.03;
  }, [shadows, quality]);
  const res = quality === "high" ? 2048 : 1024;
  return (
    <>
      <hemisphereLight args={[k.hemiSky, k.hemiGround, k.hemiI]} />
      <ambientLight intensity={0.18} />
      <directionalLight ref={sun} position={[-16, 30, 20]} intensity={k.sunI} color={k.sun} castShadow={shadows} shadow-mapSize-width={res} shadow-mapSize-height={res} />
    </>
  );
}

/* ================================================================ world */
export function World({ k, quality, engine, bus, fx, view, settings }) {
  const env = useMemo(() => buildEnvironment(k, quality), [k, quality]);
  const castles = useMemo(() => ({ player: buildCastle("player", k), enemy: buildCastle("enemy", k) }), [k]);
  const st = useRef({ loadId: -1, destroyT: { player: -1, enemy: -1 }, smokeT: 0 });

  useEffect(
    () => () => {
      env.group.traverse((o) => {
        if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
      });
    },
    [env]
  );

  // destruction sequence trigger
  useEffect(() => {
    const h = (ev) => {
      for (const e of ev) {
        if (e.type === "castleDestroyed") {
          st.current.destroyT[e.side] = 0;
          if (settings.cameraMotion && !settings.reducedMotion) view.shake = 0.55;
        }
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, view, settings.cameraMotion, settings.reducedMotion]);

  useFrame((s, rdt) => {
    const dt = Math.min(rdt, 0.1);
    const t = s.clock.elapsedTime;
    const S = st.current;
    if (S.loadId !== engine.loadId) {
      // new battle → rebuild-free reset of the castle pose
      S.loadId = engine.loadId;
      S.destroyT.player = S.destroyT.enemy = -1;
      for (const side of ["player", "enemy"]) {
        const c = castles[side];
        for (const g of Object.values(c.parts)) {
          if (!g.isObject3D) continue;
          g.position.set(0, 0, 0);
          g.rotation.set(0, 0, 0);
        }
        for (const b of c.banners) b.rotation.x = 0;
        c.dmg1.visible = c.dmg2.visible = false;
      }
    }
    env.update(t, dt);
    const running = !engine.paused;
    for (const side of ["player", "enemy"]) {
      const c = castles[side];
      const ec = engine.castles[side];
      waveCloth(c.banners, t, 0.8);
      waveCloth(c.flags, t);
      for (let i = 0; i < c.torches.length; i++) c.torches[i].scale.set(1, 1 + Math.sin(t * 14 + i * 3) * 0.18, 1);
      const frac = ec.maxHp > 0 ? ec.hp / ec.maxHp : 1;
      const live = engine.mode === "play";
      c.dmg1.visible = live && frac < 0.66;
      c.dmg2.visible = live && frac < 0.33;
      // hit shake (tiny)
      const base = side === "player" ? -FIELD.castleX : FIELD.castleX;
      const shake = ec.hitT > 0 && !settings.reducedMotion ? ec.hitT * 0.18 : 0;
      c.group.position.x = base + (shake ? (Math.random() - 0.5) * shake : 0);
      // smoke from a badly damaged castle
      if (live && frac < 0.4 && running && settings.particles) {
        S.smokeT += dt;
        if (S.smokeT > 0.45) {
          S.smokeT = 0;
          const sx = side === "player" ? -FIELD.castleX + 1.5 : FIELD.castleX - 1.5;
          fx.current?.puffs.spawn(sx + (Math.random() - 0.5) * 2, 4 + Math.random() * 2, (Math.random() - 0.5) * 6, { color: "#5a5652", size: 0.9, grow: 3, rise: 1.2, life: 2.2, alpha: 0.45, speed: 0.2, vx: 0.3 });
        }
      }
      // destruction: parts topple and sink over ~1.6 s, banners fall
      const d = S.destroyT[side];
      if (d >= 0) {
        S.destroyT[side] = d + dt;
        const p = c.parts;
        const fall = (g, delay, dir, depth) => {
          const k = clamp01((d - delay) / 1.1);
          const e = k * k;
          g.position.y = -e * depth;
          g.rotation.z = e * 0.22 * dir;
          g.rotation.x = e * 0.1 * dir;
        };
        fall(p.towerL, 0.0, 1, 3.2);
        fall(p.towerR, 0.2, -1, 3.0);
        fall(p.gate, 0.35, 1, 2.2);
        fall(p.keep, 0.5, -1, 4.5);
        fall(p.front, 0.55, 1, 1.4);
        for (const b of c.banners) b.rotation.x = Math.min(1.4, d * 1.6);
        if (fx.current && d < 1.7 && Math.floor(d * 10) !== Math.floor((d - dt) * 10)) {
          const cx = side === "player" ? -FIELD.castleX : FIELD.castleX;
          const q = settings.particles ? 1 : 0.4;
          fx.current.puffs.burst(Math.round(4 * q), cx + (Math.random() - 0.5) * 6, 0.5 + Math.random() * 3, (Math.random() - 0.5) * 8, { color: "#cbbfae", size: 1.6, grow: 2.6, rise: 1.4, life: 1.8, alpha: 0.7, speed: 1.4, spread: 2 });
          fx.current.bits.burst(Math.round(6 * q), cx + (Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 7, { color: k.stone, size: 0.22, speed: 3.5, up: 0.4, life: 1.6, gravity: 12, bounce: true });
        }
      }
    }
  });

  return (
    <>
      <primitive object={env.group} />
      <primitive object={castles.player.group} />
      <primitive object={castles.enemy.group} />
    </>
  );
}

/* ================================================================ units */
export function Units({ engine, quality, view }) {
  const group = useRef();
  const state = useRef({ rigs: new Map(), pools: new Map(), frame: 0 });
  const { camera } = useThree();
  const unitShadows = quality === "high";

  useEffect(() => {
    const S = state.current;
    return () => {
      for (const rig of S.rigs.values()) rig.mat.dispose();
      for (const list of S.pools.values()) for (const rig of list) rig.mat.dispose();
      S.rigs.clear();
      S.pools.clear();
    };
  }, []);

  useFrame((s, rdt) => {
    const dt = Math.min(rdt, 0.1);
    const S = state.current;
    const g = group.current;
    if (!g) return;
    S.frame++;
    const ended = engine.phase === "ending" || engine.phase === "won" || engine.phase === "lost";
    const animDt = engine.paused ? 0 : dt * engine.speed;
    for (const u of engine.units) {
      let rig = S.rigs.get(u.id);
      if (!rig) {
        const key = `${u.type}|${u.side}`;
        const pool = S.pools.get(key);
        rig = pool && pool.length ? pool.pop() : buildSoldier(u.type, u.side);
        resetRig(rig);
        rig.root.traverse((o) => {
          if (o.isMesh && o !== rig.blob && o.parent !== rig.bar) o.castShadow = unitShadows;
        });
        rig.root.visible = true;
        if (!rig.root.parent) g.add(rig.root);
        S.rigs.set(u.id, rig);
        rig.unitId = u.id;
        rig.yaw = 0;
      }
      rig.seen = S.frame;
      rig.root.position.set(u.x, 0, u.z);
      rig.root.scale.setScalar(UNITS[u.type].visualScale * UNIT_VIS);
      // face along the lane; turn a little toward an off-lane target
      let yaw = 0;
      if (u.target && u.target.kind === "unit" && (u.state === "ATTACKING" || u.state === "RECOVERING")) {
        const o = engine.unitById.get(u.target.id);
        if (o) yaw = Math.max(-0.6, Math.min(0.6, Math.atan2(o.z - u.z, Math.abs(o.x - u.x) + 0.01))) * -u.dir;
      }
      rig.yaw += (yaw - rig.yaw) * (1 - Math.exp(-10 * dt));
      rig.root.rotation.y = (u.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + rig.yaw * u.dir;
      animateSoldier(rig, u, engine.time, animDt || 1e-4, ended, engine.winner);
      // health bar: only once damaged, hidden when defeated
      const frac = u.hp / u.maxHp;
      const showBar = frac < 0.999 && u.state !== "DEFEATED";
      rig.bar.visible = showBar;
      if (showBar) {
        rig.hpShown += (frac - rig.hpShown) * (1 - Math.exp(-14 * dt));
        const w = rig.barW * rig.hpShown;
        rig.barFill.scale.x = Math.max(0.001, w);
        rig.barFill.position.x = -(rig.barW - w) / 2;
        rig.root.getWorldQuaternion(tmpQ).invert();
        rig.bar.quaternion.copy(tmpQ.multiply(camera.quaternion));
      }
    }
    for (const [id, rig] of S.rigs) {
      if (rig.seen === S.frame) continue;
      S.rigs.delete(id);
      rig.root.visible = false;
      const key = `${rig.type}|${rig.side}`;
      if (!S.pools.has(key)) S.pools.set(key, []);
      S.pools.get(key).push(rig);
    }
  });
  return <group ref={group} />;
}

/* ================================================================ arrows */
let arrowGeo = null;
export function Projectiles({ engine }) {
  const group = useRef();
  const pool = useRef({ meshes: [], used: 0 });
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e8d4a2", roughness: 0.6, flatShading: true }), []);
  const trailMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.3, depthWrite: false }), []);
  useEffect(() => () => (mat.dispose(), trailMat.dispose()), [mat, trailMat]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (!arrowGeo) arrowGeo = mergeGeometries(arrowGeometry().map((x) => (x.index ? x.toNonIndexed() : x)), false);
    const P = pool.current;
    let n = 0;
    for (const p of engine.projectiles) {
      let m = P.meshes[n];
      if (!m) {
        m = new THREE.Group();
        const a = new THREE.Mesh(arrowGeo, mat);
        a.castShadow = true;
        a.scale.setScalar(1.45);
        const tr = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 1), trailMat);
        tr.position.z = -1.1;
        m.add(a, tr);
        g.add(m);
        P.meshes.push(m);
      }
      m.visible = true;
      m.position.set(p.x, p.y, p.z);
      tmpV.set(p.x - p.px, p.y - p.py, p.z - p.pz);
      if (tmpV.lengthSq() > 1e-8) {
        tmpV.normalize();
        m.quaternion.setFromUnitVectors(FWD, tmpV);
      }
      n++;
    }
    for (let i = n; i < P.meshes.length; i++) P.meshes[i].visible = false;
  });
  return <group ref={group} />;
}

/* ================================================================ effects */
export function Effects({ engine, bus, fx, settings, k }) {
  const { camera } = useThree();
  const sys = useMemo(() => ({ bits: new Bits(360), puffs: new Puffs(140) }), []);
  useEffect(() => {
    fx.current = sys;
    return () => {
      fx.current = null;
      sys.bits.geo.dispose();
      sys.bits.mat.dispose();
      sys.puffs.geo.dispose();
      sys.puffs.mat.dispose();
    };
  }, [fx, sys]);
  const loadRef = useRef(-1);
  useEffect(() => {
    const h = (ev) => {
      const q = settings.particles ? 1 : 0.35;
      const n = (x) => Math.max(1, Math.round(x * q));
      for (const e of ev) {
        if (e.type === "hit") {
          const def = UNITS[e.unit];
          const y = 0.95 * def.visualScale;
          const fromX = e.side === "player" ? 0.32 : -0.32; // toward the attacker
          if (e.kind === "melee") {
            const heavy = e.by === "knight";
            const metal = e.unit === "shield" || e.unit === "knight";
            sys.bits.burst(n(heavy ? 9 : 6), e.x + fromX, y, e.z, { color: metal ? "#fff1b8" : "#ffe9a8", size: 0.05, speed: heavy ? 4.2 : 3.2, up: 0.5, life: 0.28, gravity: 6 });
            if (heavy) sys.puffs.burst(n(2), e.x, 0.25, e.z, { color: "#d8c9b0", size: 0.55, grow: 2, rise: 0.4, life: 0.6, alpha: 0.55 });
          } else {
            if (e.blocked) sys.bits.burst(n(5), e.x + fromX * 1.4, y, e.z, { color: "#fff4c8", size: 0.045, speed: 2.6, up: 0.55, life: 0.25, gravity: 6 });
            else sys.bits.burst(n(3), e.x + fromX, y, e.z, { color: "#b58b52", size: 0.04, speed: 1.8, up: 0.5, life: 0.3, gravity: 9 });
          }
        } else if (e.type === "kill") {
          sys.puffs.burst(n(4), e.x, 0.25, e.z, { color: "#dccfb8", size: 0.7, grow: 2.2, rise: 0.45, life: 1.0, alpha: 0.6, spread: 0.5 });
          if (e.bounty > 0 && e.side === "enemy") sys.bits.burst(n(6), e.x, 1.0, e.z, { color: "#ffd24a", size: 0.09, speed: 2.4, up: 0.85, life: 0.75, gravity: 9, bounce: true });
        } else if (e.type === "castleHit") {
          const wx = e.side === "player" ? -FIELD.wallX : FIELD.wallX;
          sys.bits.burst(n(e.kind === "arrow" ? 2 : 4), wx, Math.max(0.4, e.y), e.z, { color: k.stone, size: 0.08, speed: 2.2, up: 0.5, life: 0.55, gravity: 10, vx: e.side === "player" ? 1.2 : -1.2 });
          if (e.kind !== "arrow") sys.puffs.burst(n(1), wx, Math.max(0.5, e.y), e.z, { color: "#cfc4b2", size: 0.6, grow: 2.2, rise: 0.4, life: 0.7, alpha: 0.5 });
        } else if (e.type === "deploy") {
          const gx = e.side === "player" ? -FIELD.wallX + 0.3 : FIELD.wallX - 0.3;
          sys.puffs.burst(n(3), gx, 0.2, 0, { color: "#d9cbb4", size: 0.5, grow: 2, rise: 0.3, life: 0.7, alpha: 0.45, spread: 1.2 });
        } else if (e.type === "fizzle") {
          sys.bits.burst(n(2), e.x, Math.max(0.1, e.y), e.z, { color: "#b58b52", size: 0.035, speed: 1.2, up: 0.5, life: 0.3 });
        }
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, sys, settings.particles, k]);
  useFrame((_, rdt) => {
    if (loadRef.current !== engine.loadId) {
      loadRef.current = engine.loadId;
      sys.bits.hideAll();
      sys.puffs.hideAll();
    }
    const dt = engine.paused ? 0 : Math.min(rdt, 0.1) * (engine.mode === "play" ? engine.speed : 1);
    sys.bits.update(dt);
    sys.puffs.update(dt, camera);
  });
  return (
    <>
      <primitive object={sys.bits.mesh} />
      <primitive object={sys.puffs.mesh} />
    </>
  );
}

/* ================================================================ floaters */
/**
 * Damage numbers and gold pop-ups in a DOM layer over the canvas: a fixed
 * pool of spans re-used round-robin, positioned from world coordinates.
 */
export function Floaters({ bus, layer, view, settings, engine }) {
  const pool = useRef([]);
  const live = useRef([]);
  const idx = useRef(0);
  useEffect(() => {
    const el = layer.current;
    if (!el) return undefined;
    const spans = [];
    for (let i = 0; i < 36; i++) {
      const s = document.createElement("span");
      s.className = "cr-float";
      s.style.display = "none";
      el.appendChild(s);
      spans.push(s);
    }
    pool.current = spans;
    return () => {
      spans.forEach((s) => s.remove());
      pool.current = [];
      live.current = [];
    };
  }, [layer]);
  useEffect(() => {
    const h = (ev) => {
      if (engine.mode !== "play") return;
      for (const e of ev) {
        let text = null;
        let cls = "";
        let x = 0;
        let y = 0;
        let z = 0;
        if (e.type === "hit" && settings.damageNumbers) {
          text = String(Math.max(1, Math.round(e.dmg)));
          cls = e.side === "player" ? "is-hurt" : "is-dmg";
          x = e.x;
          y = 1.75 * UNITS[e.unit].visualScale;
          z = e.z;
        } else if (e.type === "kill" && e.bounty > 0 && e.side === "enemy") {
          text = `+${e.bounty}`;
          cls = "is-gold";
          x = e.x;
          y = 2.1;
          z = e.z;
        } else if (e.type === "castleHit" && settings.damageNumbers && e.dmg > 0) {
          text = String(Math.max(1, Math.round(e.dmg)));
          cls = e.side === "player" ? "is-hurt" : "is-castle";
          x = e.side === "player" ? -FIELD.wallX : FIELD.wallX;
          y = Math.max(1.8, e.y + 1);
          z = e.z;
        }
        if (!text) continue;
        const spans = pool.current;
        if (!spans.length) return;
        const s = spans[idx.current % spans.length];
        idx.current++;
        s.textContent = text;
        s.className = `cr-float ${cls}`;
        s.style.display = "block";
        live.current = live.current.filter((f) => f.s !== s);
        live.current.push({ s, x, y, z, t: 0, jx: (Math.random() - 0.5) * 14 });
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, settings.damageNumbers, engine]);
  useFrame((_, rdt) => {
    if (!view.toScreen || !live.current.length) return;
    const dt = engine.paused ? 0 : Math.min(rdt, 0.1);
    const keep = [];
    for (const f of live.current) {
      f.t += dt;
      const life = f.s.classList.contains("is-gold") ? 1.1 : 0.8;
      if (f.t >= life) {
        f.s.style.display = "none";
        continue;
      }
      const [sx, sy] = view.toScreen(f.x, f.y, f.z);
      const k = f.t / life;
      f.s.style.transform = `translate(${Math.round(sx + f.jx)}px, ${Math.round(sy - k * 34)}px) translate(-50%, -50%) scale(${k < 0.15 ? 0.7 + k * 2 : 1})`;
      f.s.style.opacity = String(k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
      keep.push(f);
    }
    live.current = keep;
  });
  return null;
}

/* ================================================================ showcase */
/** Army screen: the selected soldier on a small stone dais, looping idle → attack. */
export function Showcase({ type, side = "player" }) {
  const group = useRef();
  const rigs = useRef(new Map());
  const dais = useMemo(() => {
    const m = new THREE.Mesh(
      merge([paint(T(cyl(1.25, 1.4, 0.32, 18), 0, 0.16, 0), "#9c968a", 0.1, 3), paint(T(cyl(1.05, 1.15, 0.12, 18), 0, 0.38, 0), "#b9b2a4", 0.1, 4), paint(T(cyl(1.42, 1.42, 0.05, 18), 0, 0.02, 0), "#6e6a62")]),
      vcMat("dais")
    );
    m.receiveShadow = true;
    m.castShadow = true;
    return m;
  }, []);
  const t0 = useRef(0);
  useEffect(() => {
    t0.current = 0;
  }, [type]);
  useEffect(
    () => () => {
      for (const r of rigs.current.values()) r.mat.dispose();
    },
    []
  );
  useFrame((st, rdt) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(rdt, 0.1);
    t0.current += dt;
    const key = `${type}|${side}`;
    let rig = rigs.current.get(key);
    if (!rig) {
      rig = buildSoldier(type, side);
      rig.root.position.y = 0.44;
      rigs.current.set(key, rig);
      g.add(rig.root);
    }
    for (const [kk, r] of rigs.current) r.root.visible = kk === key;
    const u = showcaseUnit(type, t0.current);
    rig.root.rotation.y = 0.75 + Math.sin(st.clock.elapsedTime * 0.4) * 0.15;
    rig.root.scale.setScalar(UNITS[type].visualScale * 1.08);
    animateSoldier(rig, u, st.clock.elapsedTime, dt, false, null);
    rig.blob.visible = false;
    rig.bar.visible = false;
  });
  return (
    <group ref={group} position={[SHOWCASE.x, 0, SHOWCASE.z]}>
      <primitive object={dais} />
    </group>
  );
}

export { FRONT };
