/**
 * Helix Drop — everything inside the game <Canvas>.
 *
 * <Driver> is the ONLY place the engine is ticked (one useFrame, priority -2),
 * so there is one render loop and one physics loop no matter how often React
 * re-renders or the stage resizes. Every other component reads state:
 *   Tower    — group.rotation.y = sim.rot (the collision rotation, verbatim);
 *              each layer group rotation.y = −layerOffset(L, sim.t)
 *   Ball     — y from the sim; spin/squash/trail/smash glow are cosmetic
 *   Effects  — pooled splash decals, particles and 3–8 debris chunks per smash
 *   Camera   — eases to engine.camY; never rotates with the tower
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PHYS, TAU } from "../engine/constants.js";
import { layerOffset } from "../engine/sim.js";
import { sectorGeometry, spikeGeometry, debrisGeometry } from "./geometry.js";
import { hazardTexture, crackTexture, grainTexture, columnTexture, ballTexture, radialTexture } from "./textures.js";
import Environment from "./Environment.jsx";

const BZ = PHYS.BALL_ORBIT; // ball world position: (0, y, BZ)

/* ================================================================ driver */

export function Driver({ engine }) {
  useFrame((_, dt) => engine.tick(dt), -2);
  return null;
}

/* ============================================================= materials */

function useWorldMaterials(world, quality) {
  return useMemo(() => {
    const hi = quality === "high";
    const grain = grainTexture();
    const mk = (color, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05, map: grain, ...extra });
    const d = world.danger;
    return {
      safe: [mk(world.safe[0]), mk(world.safe[1])],
      break: mk(world.brk, { map: crackTexture(world.brk), roughness: 0.3, transparent: true, opacity: 0.93 }),
      danger: new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: hazardTexture(d.body, d.stripe),
        roughness: 0.55,
        metalness: 0.25,
        emissive: new THREE.Color(d.glow),
        emissiveIntensity: 0.25,
      }),
      spikes: new THREE.MeshStandardMaterial({ color: "#d9dde6", roughness: 0.25, metalness: 0.85, emissive: new THREE.Color(d.glow), emissiveIntensity: 0.12 }),
      finish: new THREE.MeshStandardMaterial({ color: world.finish, roughness: 0.25, metalness: hi ? 0.55 : 0.35, emissive: new THREE.Color(world.finish), emissiveIntensity: 0.25 }),
      column: new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: columnTexture(world.column.color, world.column.accent),
        roughness: world.column.rough,
        metalness: world.column.metal,
      }),
    };
  }, [world, quality]);
}

/* ================================================================= tower */

function Layer({ L, mats, shadows, registry }) {
  const ref = useRef();
  useLayoutEffect(() => {
    registry.set(L, ref.current);
    return () => registry.delete(L);
  }, [L, registry]);
  const safeMat = mats.safe[L.idx % 2];
  return (
    <group ref={ref} position={[0, L.y, 0]}>
      {L.sectors.map((s, i) => {
        if (s.type === "gap") return null;
        const len = s.a1 - s.a0;
        const mat = L.finish ? mats.finish : s.type === "danger" ? mats.danger : s.type === "break" ? mats.break : safeMat;
        return (
          <group key={i} rotation-y={-s.a0}>
            <mesh geometry={sectorGeometry(len)} material={mat} castShadow={shadows} receiveShadow={shadows} />
            {s.type === "danger" && <mesh geometry={spikeGeometry(len)} material={mats.spikes} castShadow={false} />}
          </group>
        );
      })}
      {L.finish && <FinishDeco />}
    </group>
  );
}

function FinishDeco() {
  const ring = useRef();
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = clock.elapsedTime;
    ring.current.position.y = 0.9 + Math.sin(t * 2) * 0.08;
    ring.current.rotation.z = t * 0.6;
    ring.current.material.emissiveIntensity = 1.1 + Math.sin(t * 3) * 0.3;
  });
  return (
    <group>
      <mesh ref={ring} rotation-x={Math.PI / 2} position={[0, 0.9, 0]}>
        <torusGeometry args={[2.4, 0.06, 10, 72]} />
        <meshStandardMaterial color="#fff6c8" emissive="#ffd46b" emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <ringGeometry args={[1.25, 2.85, 72]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Tower({ engine, world, quality, shadows }) {
  const group = useRef();
  const column = useRef();
  const mats = useWorldMaterials(world, quality);
  const registry = useMemo(() => new Map(), []);
  const [layers, setLayers] = useState(() => engine.sim.layers.slice());
  const seen = useRef(-1);

  useFrame(() => {
    const sim = engine.sim;
    if (seen.current !== engine.layerVersion) {
      seen.current = engine.layerVersion;
      if (sim.layers.length !== layers.length || sim.layers[0] !== layers[0] || sim.layers[sim.layers.length - 1] !== layers[layers.length - 1]) setLayers(sim.layers.slice());
    }
    const g = group.current;
    if (!g) return;
    g.rotation.y = sim.rot; // THE rotation — collision uses the same number
    const camY = engine.camY;
    for (const [L, obj] of registry) {
      const near = L.y < camY + 9 && L.y > camY - 34;
      obj.visible = near && !L.destroyed;
      if (obj.visible && L.move) obj.rotation.y = -layerOffset(L, sim.t);
      else if (!L.move) obj.rotation.y = -L.off;
    }
    const top = layers.length ? layers[0].y + 3 : 3;
    const bottom = layers.length ? layers[layers.length - 1].y - 1 : -10;
    const c = column.current;
    if (c) {
      // endless: keep a column segment around the camera; levels: full height
      const y0 = Math.min(top, camY + 12);
      const y1 = Math.max(bottom, camY - 40);
      c.scale.y = Math.max(0.1, y0 - y1);
      c.position.y = (y0 + y1) / 2;
      mats.column.map.repeat.set(2, c.scale.y / 5.6);
      mats.column.map.offset.y = -y1 / 5.6;
    }
  });

  return (
    <group ref={group}>
      <mesh ref={column} material={mats.column} castShadow={shadows} receiveShadow={shadows}>
        <cylinderGeometry args={[PHYS.COLUMN_R, PHYS.COLUMN_R, 1, 40, 1]} />
      </mesh>
      {layers.map((L) => (
        <Layer key={L.id} L={L} mats={mats} shadows={shadows} registry={registry} />
      ))}
      <Effects engine={engine} world={world} registry={registry} />
    </group>
  );
}

/* ================================================================== ball */

export function Ball({ engine, skin, quality }) {
  const ref = useRef();
  const mat = useRef();
  const shadow = useRef();
  const halo = useRef();
  const light = useRef();
  const trail = useRef([]);
  const hist = useRef([]);
  const spin = useRef({ z: 0, x: 0, lastRot: 0 });
  const tex = useMemo(() => ballTexture(skin.base, skin.band, skin.dots), [skin]);
  const shadowTex = useMemo(() => radialTexture("shadow", "rgba(10,10,30,0.55)", "rgba(10,10,30,0)"), []);
  const haloTex = useMemo(() => radialTexture("halo", "rgba(255,200,90,0.9)", "rgba(255,120,40,0)"), []);
  const trailN = quality === "low" ? 4 : 7;

  useFrame((_, dt) => {
    const sim = engine.sim;
    const b = sim.ball;
    const m = ref.current;
    if (!m) return;
    const age = sim.t - b.landedAt;
    // squash on impact (cosmetic; the sim already bounced)
    let sy = 1;
    if (age >= 0 && age < 0.12) sy = 1 - 0.22 * Math.sin((age / 0.12) * Math.PI);
    else if (b.vy < -6) sy = 1 + Math.min(0.14, (-b.vy - 6) / 70);
    if (engine.settings.reducedMotion) sy = 1 + (sy - 1) * 0.4;
    const sx = 1 / Math.sqrt(sy);
    m.scale.set(sx, sy, sx);
    const lift = (1 - sy) * PHYS.BALL_R;
    m.position.set(0, b.y - lift, BZ);
    // rolling: the tower slides under the ball → the ball spins with it
    const dr = sim.rot - spin.current.lastRot;
    spin.current.lastRot = sim.rot;
    if (Math.abs(dr) < 1) spin.current.z += (dr * BZ) / PHYS.BALL_R;
    spin.current.x += dt * (b.vy < 0 ? 5 : 2);
    m.rotation.set(spin.current.x, 0, spin.current.z);
    // smash look: hot emissive + halo + light — never hides the ball
    const smash = b.smash && sim.status === "play";
    const heat = smash ? 1 : Math.max(0, Math.min(1, (b.streak - 1) / 2)) * 0.5;
    mat.current.emissive.setRGB(1, 0.42, 0.1);
    mat.current.emissiveIntensity = heat * (0.7 + 0.2 * Math.sin(engine.time * 20));
    if (halo.current) {
      halo.current.visible = smash;
      halo.current.position.set(0, b.y, BZ);
      const s = 1.9 + Math.sin(engine.time * 18) * 0.1;
      halo.current.scale.set(s, s, s);
    }
    if (light.current) {
      light.current.intensity = smash ? 6 : 0;
      light.current.position.set(0, b.y + 0.2, BZ + 0.4);
    }
    // dead: shrink/fade the ball a little so the fail reads
    if (sim.status === "dead") {
      const k = Math.max(0.55, 1 - (sim.t - sim.endAt) * 1.2);
      m.scale.multiplyScalar(k);
    }
    // trail at speed / during smash
    hist.current.unshift(b.y);
    if (hist.current.length > 24) hist.current.length = 24;
    const fast = b.vy < -9 || smash;
    trail.current.forEach((t, i) => {
      if (!t) return;
      const y = hist.current[(i + 1) * 2];
      t.visible = fast && y !== undefined && Math.abs(y - b.y) > 0.05;
      if (!t.visible) return;
      t.position.set(0, y, BZ);
      const k = 1 - (i + 1) / (trailN + 1);
      t.scale.setScalar(k * 0.9);
      t.material.opacity = k * (smash ? 0.55 : 0.28);
      t.material.color.set(smash ? "#ffae42" : skin.base);
    });
    // blob shadow on the surface below
    const sy0 = engine.shadowY();
    const sh = shadow.current;
    if (sh) {
      sh.visible = sy0 !== null && sim.status !== "finished";
      if (sh.visible) {
        const d = b.y - PHYS.BALL_R - sy0;
        const k = Math.max(0.25, 1 - d / 4);
        sh.position.set(0, sy0 + 0.012, BZ);
        sh.scale.setScalar(PHYS.BALL_R * 2.6 * (0.6 + 0.4 * k));
        sh.material.opacity = 0.75 * k;
      }
    }
  });

  return (
    <>
      <mesh ref={ref} castShadow>
        <sphereGeometry args={[PHYS.BALL_R, 48, 32]} />
        <meshPhysicalMaterial ref={mat} map={tex} roughness={0.22} metalness={0.05} clearcoat={1} clearcoatRoughness={0.12} />
      </mesh>
      {Array.from({ length: trailN }, (_, i) => (
        <mesh key={i} ref={(el) => (trail.current[i] = el)} visible={false}>
          <sphereGeometry args={[PHYS.BALL_R, 16, 12]} />
          <meshBasicMaterial transparent depthWrite={false} opacity={0.3} />
        </mesh>
      ))}
      <mesh ref={shadow} rotation-x={-Math.PI / 2} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <sprite ref={halo} visible={false}>
        <spriteMaterial map={haloTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.8} />
      </sprite>
      <pointLight ref={light} color="#ff9a40" distance={6} decay={2} intensity={0} />
    </>
  );
}

/* =============================================================== effects */

const MAX_P = 180;
const MAX_DEBRIS = 16;
const MAX_DECALS = 8;

function Effects({ engine, world, registry }) {
  const { scene } = useThree();
  const pts = useRef();
  const decals = useRef([]);
  const debris = useRef([]);
  const state = useMemo(
    () => ({
      p: Array.from({ length: MAX_P }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, max: 1 })),
      d: Array.from({ length: MAX_DEBRIS }, () => ({ life: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0 })),
      decal: 0,
      fxSeen: 0,
    }),
    []
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3));
    return g;
  }, []);
  const dotTex = useMemo(() => radialTexture("dot", "rgba(255,255,255,1)", "rgba(255,255,255,0)"), []);
  const decalTex = useMemo(() => radialTexture("decal", "rgba(255,255,255,0.9)", "rgba(255,255,255,0)"), []);
  const debGeo = useMemo(() => debrisGeometry(), []);
  const tmpC = useMemo(() => new THREE.Color(), []);
  void scene;

  const spawn = (n, at, o) => {
    if (!engine.settings.particles && !o.essential) return;
    const q = engine.settings.graphics === "low" ? 0.5 : engine.settings.graphics === "high" ? 1.3 : 1;
    const count = Math.round(n * q * (engine.settings.reducedMotion ? 0.5 : 1));
    tmpC.set(o.color);
    let made = 0;
    for (const p of state.p) {
      if (made >= count) break;
      if (p.life > 0) continue;
      const a = Math.random() * TAU;
      const sp = o.speed * (0.4 + Math.random() * 0.8);
      p.x = at[0];
      p.y = at[1];
      p.z = at[2];
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = o.up * (0.5 + Math.random());
      p.max = p.life = o.life * (0.7 + Math.random() * 0.5);
      p.r = tmpC.r;
      p.g = tmpC.g;
      p.b = tmpC.b;
      p.grav = o.grav ?? 9;
      made++;
    }
  };

  useFrame((_, dt) => {
    const sim = engine.sim;
    // consume new FX requests
    while (state.fxSeen < engine.fx.length) {
      const f = engine.fx[state.fxSeen++];
      const L = sim.layers.find((l) => l.idx === f.layer);
      const by = sim.ball.y - PHYS.BALL_R;
      if (f.kind === "splash") {
        spawn(9, [0, by + 0.05, BZ], { color: "#ffffff", speed: 1.6, up: 1.6, life: 0.45 });
        // impact mark that rotates with the tower
        const dcl = decals.current[state.decal++ % MAX_DECALS];
        const obj = L && registry.get(L);
        if (dcl && obj) {
          const phiLocal = (f.phi ?? sim.phi()) - layerOffset(L, sim.t);
          obj.add(dcl);
          dcl.position.set(BZ * Math.cos(phiLocal), 0.014, BZ * Math.sin(phiLocal));
          dcl.material.color.set(f.color).multiplyScalar(0.72);
          dcl.userData.born = engine.time;
          dcl.visible = true;
        }
      } else if (f.kind === "pass") {
        if (f.streak >= 2) spawn(4 + f.streak * 2, [0, by + 0.3, BZ], { color: f.streak >= 3 ? "#ffb347" : "#ffffff", speed: 2.2, up: 1.2, life: 0.4, grav: 2 });
      } else if (f.kind === "smash" && L) {
        spawn(26, [0, L.y + 0.1, BZ], { color: "#ffb347", speed: 4.5, up: 3.2, life: 0.7, essential: true });
        // 3–8 heavy chunks burst outward from the crashed ring
        const pieces = engine.settings.graphics === "low" ? 4 : engine.settings.graphics === "high" ? 8 : 6;
        const solid = L.sectors.filter((s) => s.type !== "gap");
        let made = 0;
        for (const dd of state.d) {
          if (made >= pieces) break;
          if (dd.life > 0) continue;
          const mesh = debris.current[state.d.indexOf(dd)];
          if (!mesh) continue;
          const s = solid[made % solid.length] || L.sectors[0];
          const local = s.a0 + (s.a1 - s.a0) * (0.5 + (Math.random() - 0.5) * 0.6) + layerOffset(L, sim.t);
          const wa = local; // debris lives in the WorldSpace group, which cancels the tower rotation below
          const r = 2.05;
          mesh.position.set(r * Math.cos(wa - sim.rot), L.y - 0.1, r * Math.sin(wa - sim.rot));
          mesh.rotation.set(0, -(wa - sim.rot), 0);
          const out = 2.5 + Math.random() * 2.5;
          dd.vx = Math.cos(wa - sim.rot) * out;
          dd.vz = Math.sin(wa - sim.rot) * out;
          dd.vy = 1.5 + Math.random() * 2.5;
          dd.sx = (Math.random() - 0.5) * 9;
          dd.sy = (Math.random() - 0.5) * 9;
          dd.life = 1.1;
          mesh.material.color.set(s.type === "danger" ? world.danger.body : s.type === "break" ? world.brk : world.safe[L.idx % 2]);
          mesh.material.opacity = 1;
          mesh.visible = true;
          made++;
        }
      } else if (f.kind === "death") {
        spawn(18, [0, by + 0.1, BZ], { color: world.danger.glow, speed: 3, up: 2.5, life: 0.6, essential: true });
      } else if (f.kind === "finish") {
        for (const c of ["#ffd46b", "#ff5d8f", "#4df0ff", "#7cf08a"]) spawn(14, [0, by + 0.4, BZ], { color: c, speed: 3.5, up: 6, life: 1.4, grav: 7, essential: true });
      }
    }
    if (engine.fx.length > 256) {
      engine.fx.splice(0, state.fxSeen);
      state.fxSeen = 0;
    }
    // particles
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    let alive = 0;
    for (let i = 0; i < MAX_P; i++) {
      const p = state.p[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const k = Math.max(0, p.life / p.max);
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r * k;
        col[i * 3 + 1] = p.g * k;
        col[i * 3 + 2] = p.b * k;
        alive++;
      } else {
        pos[i * 3 + 1] = -1e5;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    if (pts.current) pts.current.visible = alive > 0;
    // debris (world space: parent is the scene-level group below)
    state.d.forEach((dd, i) => {
      const m = debris.current[i];
      if (!m || dd.life <= 0) {
        if (m) m.visible = false;
        return;
      }
      dd.life -= dt;
      dd.vy -= 16 * dt;
      m.position.x += dd.vx * dt;
      m.position.y += dd.vy * dt;
      m.position.z += dd.vz * dt;
      m.rotation.x += dd.sx * dt;
      m.rotation.z += dd.sy * dt;
      m.material.opacity = Math.min(1, dd.life / 0.35);
      if (dd.life <= 0) m.visible = false;
    });
    // decals fade
    for (const d of decals.current) {
      if (!d || !d.visible) continue;
      const age = engine.time - d.userData.born;
      d.material.opacity = Math.max(0, 0.55 * (1 - age / 1.4));
      if (age > 1.4) {
        d.visible = false;
        d.parent?.remove(d);
      }
    }
  });

  // debris + particles live OUTSIDE the rotating tower (world space)
  return (
    <WorldSpace engine={engine}>
      <points ref={pts} geometry={geo} frustumCulled={false}>
        <pointsMaterial map={dotTex} size={0.16} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      {Array.from({ length: MAX_DEBRIS }, (_, i) => (
        <mesh key={i} ref={(el) => (debris.current[i] = el)} geometry={debGeo} visible={false} castShadow={false}>
          <meshStandardMaterial transparent roughness={0.5} />
        </mesh>
      ))}
      {Array.from({ length: MAX_DECALS }, (_, i) => (
        <mesh key={`d${i}`} ref={(el) => (decals.current[i] = el)} rotation-x={-Math.PI / 2} visible={false} scale={0.62}>
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial map={decalTex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-3} />
        </mesh>
      ))}
    </WorldSpace>
  );
}

/** Children of this group ignore the tower rotation (world-space FX). */
function WorldSpace({ engine, children }) {
  const ref = useRef();
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = -engine.sim.rot;
  });
  return <group ref={ref}>{children}</group>;
}

/* ================================================================ camera */

export function CameraRig({ engine, menu }) {
  const { camera, size } = useThree();
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const aspect = size.width / Math.max(1, size.height);
    // keep the full ring width in view on narrow (portrait) screens
    const dist = Math.max(menu ? 11.5 : 10.4, 3.9 / (Math.tan(((camera.fov / 2) * Math.PI) / 180) * aspect));
    const y = engine.camY;
    const sh = engine.shake * engine.shake * 0.18;
    const jx = sh ? (Math.random() - 0.5) * sh : 0;
    const jy = sh ? (Math.random() - 0.5) * sh : 0;
    const side = menu && aspect > 1.2 ? -3.4 : 0;
    // pulled back on narrow screens → scale height/look offsets too, so the
    // downward viewing angle (and the read of the rings) never flattens
    const k = dist / (menu ? 11.5 : 10.4);
    camera.position.set(side + jx, y + 4.3 * k + jy, dist);
    look.set(side * 0.55, y - 2.3 * k, 0);
    camera.lookAt(look);
  });
  return null;
}

/* ================================================================ lights */

export function Lights({ engine, world, shadows, quality }) {
  const sun = useRef();
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const y = engine.camY;
    if (sun.current) {
      sun.current.position.set(world.sun.pos[0], y + world.sun.pos[1], world.sun.pos[2]);
      target.position.set(0, y - 3, 0);
      target.updateMatrixWorld();
    }
  });
  const res = quality === "high" ? 2048 : 1024;
  return (
    <>
      <hemisphereLight args={[world.hemi[0], world.hemi[1], world.hemi[2]]} />
      <ambientLight intensity={0.18} />
      <primitive object={target} />
      <directionalLight
        ref={sun}
        color={world.sun.color}
        intensity={world.sun.intensity}
        target={target}
        castShadow={shadows}
        shadow-mapSize={[res, res]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={9}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
    </>
  );
}

export { Environment };
