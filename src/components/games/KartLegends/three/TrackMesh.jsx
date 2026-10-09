/**
 * Kart Legends — the drivable track: road (markings), curbs, off-road band,
 * barriers, shortcut lane, start/finish gantry with countdown lights, boost
 * pads, boost gems and corner arrow boards. Built once per track from the
 * engine's samples, so what you see is exactly what you drive on.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { roadTex, curbTex, groundTex, checkerTex, padTex, bannerTex, arrowTex } from "./textures.js";

/** A strip between two lateral offsets along a list of samples. */
function strip(samples, a, b, { lift = 0, vScale = 8, closed = true, uFlip = false } = {}) {
  const n = samples.length;
  const count = closed ? n + 1 : n;
  const pos = new Float32Array(count * 2 * 3);
  const uv = new Float32Array(count * 2 * 2);
  for (let k = 0; k < count; k++) {
    const p = samples[k % n];
    const s = closed && k === n ? samples[n - 1].s + Math.hypot(samples[0].x - samples[n - 1].x, samples[0].z - samples[n - 1].z) : p.s;
    const la = typeof a === "function" ? a(p) : a;
    const lb = typeof b === "function" ? b(p) : b;
    for (let j = 0; j < 2; j++) {
      const l = j ? lb : la;
      const o = (k * 2 + j) * 3;
      pos[o] = p.x + p.nx * l;
      pos[o + 1] = p.y + lift;
      pos[o + 2] = p.z + p.nz * l;
      uv[(k * 2 + j) * 2] = uFlip ? 1 - j : j;
      uv[(k * 2 + j) * 2 + 1] = s / vScale;
    }
  }
  const idx = [];
  for (let k = 0; k < count - 1; k++) {
    const a0 = k * 2;
    // winding: up-facing (a is left of b when la > lb)
    idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals face up
  const nrm = g.attributes.normal;
  let up = 0;
  for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
  if (up < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
    g.computeVertexNormals();
  }
  g.computeBoundingSphere();
  return g;
}

/** Vertical wall strip (sides of floating tracks, tunnel sides). */
function wallStrip(samples, lat, y0, y1, closed = true) {
  const n = samples.length;
  const count = closed ? n + 1 : n;
  const pos = new Float32Array(count * 2 * 3);
  for (let k = 0; k < count; k++) {
    const p = samples[k % n];
    const l = typeof lat === "function" ? lat(p) : lat;
    for (let j = 0; j < 2; j++) {
      const o = (k * 2 + j) * 3;
      pos[o] = p.x + p.nx * l;
      pos[o + 1] = p.y + (j ? y1 : y0);
      pos[o + 2] = p.z + p.nz * l;
    }
  }
  const idx = [];
  for (let k = 0; k < count - 1; k++) {
    const a0 = k * 2;
    idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function barrierPosts(T) {
  // posts every ~2 m along both barrier lines, skipping shortcut mouths
  const out = [];
  const SC = T.shortcut;
  const nearShort = (x, z) => {
    if (!SC) return false;
    for (let i = 0; i < SC.samples.length; i += 2) {
      const q = SC.samples[i];
      if ((q.x - x) ** 2 + (q.z - z) ** 2 < (SC.width + 2.2) ** 2) return true;
    }
    return false;
  };
  for (let i = 0; i < T.N; i += 2) {
    const p = T.samples[i];
    for (const sg of [-1, 1]) {
      const l = (p.w + T.margin + 0.35) * sg;
      const x = p.x + p.nx * l;
      const z = p.z + p.nz * l;
      if (nearShort(x, z)) continue;
      out.push({ x, z, y: p.y, h: Math.atan2(p.tx, p.tz), alt: (i / 2) % 2, s: p.s });
    }
  }
  if (SC) {
    for (let i = 3; i < SC.samples.length - 3; i += 2) {
      const p = SC.samples[i];
      for (const sg of [-1, 1]) {
        const l = (SC.width + 0.6 + 0.35) * sg;
        const x = p.x + p.nx * l;
        const z = p.z + p.nz * l;
        // inside the main band at the mouths: no wall
        let inMain = false;
        for (let j = 0; j < T.N; j += 3) {
          const q = T.samples[j];
          const d = Math.hypot(q.x - x, q.z - z);
          if (d < q.w + T.margin + 1.2) {
            inMain = true;
            break;
          }
        }
        if (!inMain) out.push({ x, z, y: p.y, h: Math.atan2(p.tx, p.tz), alt: (i / 2) % 2, s: -1 });
      }
    }
  }
  return out;
}

function Barriers({ T, world }) {
  const ref = useRef();
  const posts = useMemo(() => barrierPosts(T), [T]);
  const neon = world.theme === "neon" || world.theme === "sky";
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(0.5, neon ? 0.55 : 0.8, 2.15);
    g.translate(0, neon ? 0.55 : 0.4, 0);
    return g;
  }, [neon]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5, metalness: neon ? 0.3 : 0, emissive: neon ? "#ffffff" : "#000000", emissiveIntensity: neon ? 0.55 : 0 }), [neon]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    posts.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(0, p.h, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.set(world.barrier[p.alt]);
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [posts, world]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <instancedMesh ref={ref} args={[geo, mat, posts.length]} castShadow receiveShadow />;
}

function StartGantry({ T, race }) {
  const p = T.samples[0];
  const w = p.w + 1.6;
  const h = Math.atan2(p.tx, p.tz);
  const lights = useRef([]);
  const banner = bannerTex("KART LEGENDS", "#e8343a");
  const bm = useMemo(() => new THREE.MeshStandardMaterial({ map: banner, roughness: 0.6 }), [banner]);
  const ch = useMemo(() => new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), []);
  const lightMats = useMemo(() => [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: "#331010", emissive: "#ff2a2a", emissiveIntensity: 0, roughness: 0.3 })), []);
  useEffect(
    () => () => {
      bm.dispose();
      ch.dispose();
      lightMats.forEach((m) => m.dispose());
    },
    [bm, ch, lightMats],
  );
  useFrame(() => {
    if (!race) return;
    const cd = race.countdown;
    const go = race.state !== "COUNTDOWN";
    lightMats.forEach((m, i) => {
      if (go) {
        m.emissive.set("#2aff6a");
        m.emissiveIntensity = race.raceTime < 2.5 ? 3 : 0.4;
      } else {
        m.emissive.set("#ff2a2a");
        const lit = cd < 3.6 - (i + 1) * 0.75 + 0.6;
        m.emissiveIntensity = lit ? 3 : 0;
      }
    });
  });
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, h, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={ch} receiveShadow>
        <planeGeometry args={[p.w * 2, 1.6]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * w, 3.2, 0]} castShadow>
          <boxGeometry args={[0.6, 6.4, 0.6]} />
          <meshStandardMaterial color="#e9e9ef" metalness={0.4} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 6.3, 0]} material={bm} castShadow>
        <boxGeometry args={[w * 2 + 0.6, 1.3, 0.5]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[(i - 1.5) * 1.1, 5.2, -0.3]} material={lightMats[i]} ref={(o) => (lights.current[i] = o)}>
          <sphereGeometry args={[0.32, 14, 10]} />
        </mesh>
      ))}
    </group>
  );
}

function Pads({ T }) {
  const t = useMemo(() => {
    const tx = padTex().clone();
    tx.needsUpdate = true;
    return tx;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: t, emissive: "#ffb21a", emissiveMap: t, emissiveIntensity: 1.6, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }), [t]);
  useEffect(
    () => () => {
      t.dispose();
      mat.dispose();
    },
    [t, mat],
  );
  useFrame((_, dt) => {
    t.offset.y -= dt * 1.8;
  });
  return (
    <group>
      {T.pads.map((p, i) => (
        <mesh key={i} position={[p.x, p.y + 0.035, p.z]} rotation={[-Math.PI / 2, 0, p.h + Math.PI]} material={mat}>
          <planeGeometry args={[p.hw * 2, p.len]} />
        </mesh>
      ))}
    </group>
  );
}

function Gems({ race }) {
  const refs = useRef([]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#7fe8ff", emissive: "#3cc8ff", emissiveIntensity: 1.4, roughness: 0.15, metalness: 0.2, transparent: true }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ clock }) => {
    if (!race) return;
    const t = clock.elapsedTime;
    race.pickups.forEach((pk, i) => {
      const m = refs.current[i];
      if (!m) return;
      m.visible = pk.cool <= 0;
      m.rotation.y = t * 2 + i;
      m.position.y = pk.y + Math.sin(t * 3 + i) * 0.15;
    });
  });
  if (!race) return null;
  return (
    <group>
      {race.pickups.map((pk, i) => (
        <mesh key={i} ref={(o) => (refs.current[i] = o)} position={[pk.x, pk.y, pk.z]} material={mat} castShadow>
          <octahedronGeometry args={[0.55, 0]} />
        </mesh>
      ))}
    </group>
  );
}

function CornerSigns({ T, world }) {
  const signs = useMemo(() => {
    const out = [];
    let last = -999;
    for (let i = 0; i < T.N; i += 2) {
      const p = T.samples[i];
      if (Math.abs(p.curv) < 1 / 26 || p.s - last < 45) continue;
      last = p.s;
      // board on the outside of the corner, a little before it
      const q = T.samples[(i - 14 + T.N) % T.N];
      const left = p.curv > 0;
      const l = (q.w + T.margin + 1.4) * (left ? -1 : 1);
      out.push({ x: q.x + q.nx * l, z: q.z + q.nz * l, y: q.y, h: Math.atan2(q.tx, q.tz) + Math.PI, left });
    }
    return out;
  }, [T]);
  const mats = useMemo(() => ({ l: new THREE.MeshStandardMaterial({ map: arrowTex(true), roughness: 0.6 }), r: new THREE.MeshStandardMaterial({ map: arrowTex(false), roughness: 0.6 }) }), []);
  useEffect(
    () => () => {
      mats.l.dispose();
      mats.r.dispose();
    },
    [mats],
  );
  void world;
  return (
    <group>
      {signs.map((s, i) => (
        <group key={i} position={[s.x, s.y, s.z]} rotation={[0, s.h, 0]}>
          {[-1.1, 1.1].map((x) => (
            <mesh key={x} position={[x, 0.7, 0.05]}>
              <boxGeometry args={[0.12, 1.4, 0.12]} />
              <meshStandardMaterial color="#cfd3da" metalness={0.5} roughness={0.4} />
            </mesh>
          ))}
          <mesh position={[0, 1.6, 0]} material={s.left ? mats.r : mats.l} castShadow>
            <boxGeometry args={[2.9, 1.05, 0.1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const SHORT_LOOK = {
  dirt: { color: "#8a6a45" },
  sand: { color: "#d9b06a" },
  wood: { color: "#8a6440" },
  ice: { color: "#bfe3f2" },
  neon: { color: "#2b2440" },
  stone: { color: "#8d8778" },
  tunnel: { color: "#6b6560" },
  snow: { color: "#e9f0f7" },
  glass: { color: "#9fd8ff" },
};

function Shortcut({ T, world }) {
  const SC = T.shortcut;
  const built = useMemo(() => {
    if (!SC) return null;
    const look = SHORT_LOOK[SC.kind] || SHORT_LOOK.dirt;
    const road = strip(SC.samples, SC.width + 0.6, -(SC.width + 0.6), { lift: 0.025, vScale: 3, closed: false });
    const mat = new THREE.MeshStandardMaterial({ map: groundTex(look.color, 31), roughness: SC.kind === "ice" || SC.kind === "glass" ? 0.15 : 0.9, emissive: SC.kind === "neon" ? "#ff3ca0" : "#000", emissiveIntensity: SC.kind === "neon" ? 0.15 : 0 });
    mat.map.repeat.set(1, 1);
    let roof = null;
    if (SC.kind === "tunnel" || SC.kind === "stone") {
      // an arch over the middle of the shortcut
      const inner = SC.samples.filter((q) => q.s > 10 && q.s < SC.length - 10);
      const g = new THREE.BufferGeometry();
      const ARC = 10;
      const pos = [];
      const idx = [];
      inner.forEach((p) => {
        for (let j = 0; j <= ARC; j++) {
          const th = (j / ARC) * Math.PI;
          const l = Math.cos(th) * (SC.width + 1.2);
          pos.push(p.x + p.nx * l, p.y + Math.sin(th) * 4.2, p.z + p.nz * l);
        }
      });
      for (let k = 0; k < inner.length - 1; k++)
        for (let j = 0; j < ARC; j++) {
          const a = k * (ARC + 1) + j;
          idx.push(a, a + ARC + 1, a + 1, a + 1, a + ARC + 1, a + ARC + 2);
        }
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      roof = g;
    }
    return { road, mat, roof, look };
  }, [SC]);
  useEffect(
    () => () => {
      if (!built) return;
      built.road.dispose();
      built.mat.dispose();
      built.roof?.dispose();
    },
    [built],
  );
  if (!built) return null;
  void world;
  return (
    <group>
      <mesh geometry={built.road} material={built.mat} receiveShadow />
      {built.roof && (
        <mesh geometry={built.roof} castShadow receiveShadow>
          <meshStandardMaterial color="#7a7068" roughness={0.9} side={THREE.DoubleSide} flatShading />
        </mesh>
      )}
    </group>
  );
}

export default function TrackMesh({ T, world, race }) {
  const built = useMemo(() => {
    const S = T.samples;
    const style = world.theme === "neon" ? "neon" : world.theme === "sky" ? "sky" : "day";
    const road = strip(S, (p) => p.w, (p) => -p.w, { lift: 0.02, vScale: 16 });
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex(style, world.road), roughness: world.theme === "neon" ? 0.32 : 0.82, metalness: world.theme === "neon" ? 0.35 : 0 });
    const curbL = strip(S, (p) => p.w + 0.9, (p) => p.w, { lift: 0.045, vScale: 2 });
    const curbR = strip(S, (p) => -p.w, (p) => -p.w - 0.9, { lift: 0.045, vScale: 2 });
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTex(world.curb[0], world.curb[1]), roughness: 0.6, emissive: world.theme === "neon" ? "#ffffff" : "#000", emissiveMap: world.theme === "neon" ? curbTex(world.curb[0], world.curb[1]) : null, emissiveIntensity: world.theme === "neon" ? 0.6 : 0 });
    const offL = strip(S, (p) => p.w + T.margin + 1.2, (p) => p.w + 0.9, { lift: 0.012, vScale: 6 });
    const offR = strip(S, (p) => -p.w - 0.9, (p) => -p.w - T.margin - 1.2, { lift: 0.012, vScale: 6 });
    const offMat = new THREE.MeshStandardMaterial({ map: groundTex(world.offroad, 13), roughness: 0.95 });
    let sides = null;
    if (world.theme === "sky") {
      sides = [wallStrip(S, (p) => p.w + T.margin + 1.2, -3.5, 0.01), wallStrip(S, (p) => -p.w - T.margin - 1.2, 0.01, -3.5)];
    }
    return { road, roadMat, curbL, curbR, curbMat, offL, offR, offMat, sides };
  }, [T, world]);
  useEffect(
    () => () => {
      for (const v of Object.values(built)) {
        if (Array.isArray(v)) v.forEach((g) => g.dispose());
        else v?.dispose?.();
      }
    },
    [built],
  );
  return (
    <group>
      <mesh geometry={built.road} material={built.roadMat} receiveShadow />
      <mesh geometry={built.curbL} material={built.curbMat} receiveShadow />
      <mesh geometry={built.curbR} material={built.curbMat} receiveShadow />
      <mesh geometry={built.offL} material={built.offMat} receiveShadow />
      <mesh geometry={built.offR} material={built.offMat} receiveShadow />
      {built.sides &&
        built.sides.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color="#5a4a8a" roughness={0.6} emissive="#ffb35a" emissiveIntensity={0.08} side={THREE.DoubleSide} />
          </mesh>
        ))}
      <Barriers T={T} world={world} />
      <StartGantry T={T} race={race} />
      <Pads T={T} />
      <Gems race={race} />
      <CornerSigns T={T} world={world} />
      <Shortcut T={T} world={world} />
    </group>
  );
}
