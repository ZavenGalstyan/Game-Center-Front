/**
 * Kart Legends — one set piece per track (named by the track's `landmark`):
 *
 *   lighthouse · hut · volcano (lava + smoke) · oasis       tropical / desert
 *   pyramid · arch                                         desert
 *   cabin · icecastle                                      snow
 *   tower · ferris (turning wheel)                         neon
 *   ring · rainbow · crown                                 sky
 *
 * Placement is size-aware (landmarkSpot): the clear spot nearest the infield
 * centre that keeps the whole footprint off the road, the run-off and the
 * shortcut — big pieces like the volcano end up outside the loop.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mulberry32 } from "../engine/rng.js";
import { softDot } from "./textures.js";

export const LANDMARK_R = { lighthouse: 4, arch: 12, cabin: 9, tower: 7, ring: 16, hut: 8, volcano: 42, pyramid: 30, oasis: 20, icecastle: 18, ferris: 16, rainbow: 26, crown: 14 };

export function landmarkSpot(T, R) {
  let cx = 0;
  let cz = 0;
  let a = Infinity;
  let b = -Infinity;
  let c = Infinity;
  let d = -Infinity;
  for (const p of T.samples) {
    cx += p.x;
    cz += p.z;
    a = Math.min(a, p.x);
    b = Math.max(b, p.x);
    c = Math.min(c, p.z);
    d = Math.max(d, p.z);
  }
  cx /= T.N;
  cz /= T.N;
  const pts = [];
  for (let i = 0; i < T.N; i += 3) pts.push([T.samples[i].x, T.samples[i].z, T.samples[i].w + T.margin + 1.5]);
  if (T.shortcut) for (let i = 0; i < T.shortcut.samples.length; i += 3) pts.push([T.shortcut.samples[i].x, T.shortcut.samples[i].z, T.shortcut.width + 2.5]);
  const clearance = (x, z) => {
    let m = Infinity;
    for (const [px, pz, band] of pts) m = Math.min(m, Math.hypot(px - x, pz - z) - band);
    return m;
  };
  let best = null;
  const pad = R + 30;
  for (let x = a - pad; x <= b + pad; x += 6) {
    for (let z = c - pad; z <= d + pad; z += 6) {
      const cl = clearance(x, z);
      if (cl < R) continue;
      const score = Math.hypot(x - cx, z - cz);
      if (!best || score < best.score) best = { x, z, score, clearance: cl };
    }
  }
  return best || { x: cx, z: d + R + 20, score: 0, clearance: R };
}

function Volcano() {
  const smoke = useRef();
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(9, 40, 34, 24, 6, true);
    const p = g.attributes.position;
    const R = mulberry32(5);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = 1 + (R() - 0.5) * 0.18 * (1 - (y + 17) / 34);
      p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
    }
    g.translate(0, 17, 0);
    g.computeVertexNormals();
    return g;
  }, []);
  const smokeMat = useMemo(() => Array.from({ length: 5 }, () => new THREE.SpriteMaterial({ map: softDot(), color: "#8a8480", transparent: true, opacity: 0.4, depthWrite: false })), []);
  useEffect(
    () => () => {
      geo.dispose();
      smokeMat.forEach((m) => m.dispose());
    },
    [geo, smokeMat],
  );
  useFrame(({ clock }) => {
    if (!smoke.current) return;
    smoke.current.children.forEach((m, i) => {
      const t = (clock.elapsedTime * 0.12 + i / 5) % 1;
      m.position.set(Math.sin(i * 2.1) * 3 * t, 36 + t * 30, Math.cos(i * 1.7) * 3 * t);
      m.scale.setScalar(6 + t * 14);
      m.material.opacity = 0.5 * (1 - t);
    });
  });
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color="#5a4a44" roughness={0.95} flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 33.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[8.8, 20]} />
        <meshStandardMaterial color="#ff5a1a" emissive="#ff3a00" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.cos(i * 2.1) * 14, 20, Math.sin(i * 2.1) * 14]} rotation={[0, -i * 2.1, 0.45]}>
          <boxGeometry args={[1.6, 22, 0.8]} />
          <meshStandardMaterial color="#ff6a1a" emissive="#ff4a00" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
      ))}
      <group ref={smoke}>
        {smokeMat.map((m, i) => (
          <sprite key={i} material={m} />
        ))}
      </group>
    </group>
  );
}

function Ferris() {
  const wheel = useRef();
  useFrame((_, dt) => {
    if (wheel.current) wheel.current.rotation.z += dt * 0.15;
  });
  const cabins = 12;
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 9, s * 2.2]}>
          <cylinderGeometry args={[0.35, 0.5, 18, 6]} />
          <meshStandardMaterial color="#2a2448" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <group ref={wheel} position={[0, 18, 0]}>
        <mesh>
          <torusGeometry args={[13, 0.35, 8, 64]} />
          <meshStandardMaterial color="#ff3ca0" emissive="#ff3ca0" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        <mesh>
          <torusGeometry args={[9, 0.2, 8, 48]} />
          <meshStandardMaterial color="#3de0ff" emissive="#3de0ff" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        {Array.from({ length: cabins }, (_, i) => {
          const a = (i / cabins) * Math.PI * 2;
          return (
            <group key={i}>
              <mesh position={[Math.cos(a) * 6.5, Math.sin(a) * 6.5, 0]} rotation={[0, 0, a]}>
                <boxGeometry args={[13, 0.15, 0.15]} />
                <meshStandardMaterial color="#9a8cff" emissive="#9a8cff" emissiveIntensity={0.8} />
              </mesh>
              <mesh position={[Math.cos(a) * 13, Math.sin(a) * 13 - 1.2, 0]}>
                <boxGeometry args={[1.8, 1.6, 1.6]} />
                <meshStandardMaterial color={i % 2 ? "#ffd21f" : "#3de0ff"} emissive={i % 2 ? "#ffb21a" : "#3de0ff"} emissiveIntensity={1.2} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

function SimplePalm({ x, z, s = 1, r = 0 }) {
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]} scale={s}>
      <mesh position={[0.3, 3.2, 0]} rotation={[0, 0, -0.12]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 6.4, 7]} />
        <meshStandardMaterial color="#8a6a42" roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <mesh key={k} position={[0.7 + Math.cos(k) * 1.2, 6.2, Math.sin(k) * 1.2]} rotation={[Math.sin(k) * 0.9, -k, Math.cos(k) * 0.9]} castShadow>
          <coneGeometry args={[0.45, 3, 4]} />
          <meshStandardMaterial color={k % 2 ? "#3f9a3a" : "#55b444"} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

const RAINBOW = ["#ff4a5a", "#ff9a3a", "#ffe14a", "#5ae06a", "#3ab4ff", "#9a6aff"];

export default function Landmark({ T, world }) {
  const kind = T.def.landmark || { tropical: "lighthouse", desert: "arch", snow: "cabin", neon: "tower", sky: "ring" }[world.theme];
  const spot = useMemo(() => landmarkSpot(T, LANDMARK_R[kind] || 10), [T, kind]);
  const spin = useRef();
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.2;
  });
  const y = world.theme === "sky" ? -2 : 0;
  return (
    <group position={[spot.x, y, spot.z]}>
      {kind === "lighthouse" && (
        <group>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, 1.6 + i * 3.2, 0]} castShadow>
              <cylinderGeometry args={[1.9 - i * 0.18, 2.05 - i * 0.18, 3.2, 18]} />
              <meshStandardMaterial color={i % 2 ? "#e8343a" : "#ffffff"} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 17.4, 0]}>
            <cylinderGeometry args={[1.3, 1.3, 1.6, 12]} />
            <meshStandardMaterial color="#fff6c0" emissive="#ffe27a" emissiveIntensity={1.5} />
          </mesh>
          <mesh position={[0, 18.8, 0]} castShadow>
            <coneGeometry args={[1.6, 1.6, 12]} />
            <meshStandardMaterial color="#e8343a" />
          </mesh>
        </group>
      )}
      {kind === "hut" && (
        <group>
          <mesh position={[0, 2, 0]} castShadow>
            <cylinderGeometry args={[5, 5, 4, 10]} />
            <meshStandardMaterial color="#c9a46a" roughness={0.9} />
          </mesh>
          <mesh position={[0, 5.6, 0]} castShadow>
            <coneGeometry args={[7.5, 4, 10]} />
            <meshStandardMaterial color="#d8b45a" roughness={1} flatShading />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[Math.cos(i) * 6.5, 0.6, Math.sin(i) * 6.5]}>
              <cylinderGeometry args={[0.5, 0.5, 1.2, 8]} />
              <meshStandardMaterial color="#8a5a34" />
            </mesh>
          ))}
          <SimplePalm x={-7} z={4} s={1.3} />
          <SimplePalm x={6} z={-6} s={1.1} r={2} />
        </group>
      )}
      {kind === "volcano" && <Volcano />}
      {kind === "pyramid" && (
        <group>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <mesh key={i} position={[0, 2 + i * 4, 0]} castShadow receiveShadow>
              <boxGeometry args={[52 - i * 7.4, 4, 52 - i * 7.4]} />
              <meshStandardMaterial color={i % 2 ? "#e2c48a" : "#d6b47a"} roughness={0.95} />
            </mesh>
          ))}
          <mesh position={[0, 29.5, 0]}>
            <boxGeometry args={[2.4, 3, 2.4]} />
            <meshStandardMaterial color="#ffd21f" metalness={0.8} roughness={0.25} emissive="#ffb21a" emissiveIntensity={0.4} />
          </mesh>
        </group>
      )}
      {kind === "oasis" && (
        <group>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[13, 32]} />
            <meshStandardMaterial color="#2ac4c9" roughness={0.1} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[12.5, 18, 32]} />
            <meshStandardMaterial color="#7cc56a" roughness={1} />
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <SimplePalm key={i} x={Math.cos(i * 0.8) * 15.5} z={Math.sin(i * 0.8) * 15.5} s={1.1 + (i % 3) * 0.2} r={i * 1.3} />
          ))}
        </group>
      )}
      {kind === "arch" && (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 7, 7, 0]} castShadow>
              <boxGeometry args={[4, 14, 4]} />
              <meshStandardMaterial color="#c9773f" roughness={0.9} flatShading />
            </mesh>
          ))}
          <mesh position={[0, 15, 0]} castShadow>
            <boxGeometry args={[19, 4, 4.4]} />
            <meshStandardMaterial color="#b8673a" roughness={0.9} flatShading />
          </mesh>
        </group>
      )}
      {kind === "cabin" && (
        <group scale={2.2}>
          <mesh position={[0, 1.3, 0]} castShadow>
            <boxGeometry args={[4, 2.6, 3.2]} />
            <meshStandardMaterial color="#7a4a2c" />
          </mesh>
          <mesh position={[0, 3.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[3.2, 1.8, 4]} />
            <meshStandardMaterial color="#f4f8fc" />
          </mesh>
          <mesh position={[0, 1.4, 1.62]}>
            <boxGeometry args={[1, 0.9, 0.05]} />
            <meshStandardMaterial color="#ffd27a" emissive="#ffb24a" emissiveIntensity={1.2} />
          </mesh>
        </group>
      )}
      {kind === "icecastle" && (
        <group>
          <mesh position={[0, 5, 0]} castShadow>
            <boxGeometry args={[20, 10, 14]} />
            <meshStandardMaterial color="#cfe9f7" roughness={0.25} metalness={0.1} />
          </mesh>
          {[
            [-10, -7],
            [10, -7],
            [-10, 7],
            [10, 7],
          ].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, 8, 0]} castShadow>
                <cylinderGeometry args={[2.6, 2.8, 16, 12]} />
                <meshStandardMaterial color="#e2f4ff" roughness={0.2} />
              </mesh>
              <mesh position={[0, 18.5, 0]} castShadow>
                <coneGeometry args={[3.2, 5, 12]} />
                <meshStandardMaterial color="#7fc4ef" roughness={0.2} emissive="#5ab4ff" emissiveIntensity={0.25} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 15, 0]} castShadow>
            <coneGeometry args={[4.5, 9, 12]} />
            <meshStandardMaterial color="#7fc4ef" roughness={0.2} emissive="#5ab4ff" emissiveIntensity={0.3} />
          </mesh>
        </group>
      )}
      {kind === "tower" && (
        <group>
          <mesh position={[0, 30, 0]}>
            <cylinderGeometry args={[3, 5, 60, 8]} />
            <meshStandardMaterial color="#1d1a33" emissive="#3de0ff" emissiveIntensity={0.15} metalness={0.6} roughness={0.3} />
          </mesh>
          {[12, 26, 40, 54].map((yy, i) => (
            <mesh key={yy} position={[0, yy, 0]}>
              <torusGeometry args={[5 - i * 0.4, 0.25, 8, 32]} />
              <meshStandardMaterial color="#ff3ca0" emissive="#ff3ca0" emissiveIntensity={2} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
      {kind === "ferris" && <Ferris />}
      {kind === "ring" && (
        <group ref={spin} position={[0, 18, 0]}>
          <mesh>
            <torusGeometry args={[14, 1.2, 12, 48]} />
            <meshStandardMaterial color="#ffcf5a" metalness={0.8} roughness={0.25} emissive="#ffb21a" emissiveIntensity={0.3} />
          </mesh>
        </group>
      )}
      {kind === "rainbow" && (
        <group rotation={[0, 0.4, 0]}>
          {RAINBOW.map((col, i) => (
            <mesh key={col} position={[0, -2, 0]}>
              <torusGeometry args={[24 - i * 1.3, 0.6, 8, 48, Math.PI]} />
              <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.7} />
            </mesh>
          ))}
        </group>
      )}
      {kind === "crown" && (
        <group>
          <mesh position={[0, -4, 0]} rotation={[Math.PI, 0, 0]} castShadow>
            <coneGeometry args={[11, 14, 8]} />
            <meshStandardMaterial color="#7a6a9a" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0, 3.2, 0]}>
            <cylinderGeometry args={[11, 11, 0.8, 8]} />
            <meshStandardMaterial color="#9be38a" roughness={0.9} />
          </mesh>
          <group ref={spin} position={[0, 7, 0]}>
            <mesh>
              <cylinderGeometry args={[6, 5.2, 4, 24, 1, true]} />
              <meshStandardMaterial color="#ffcf3a" metalness={0.85} roughness={0.2} emissive="#ffb21a" emissiveIntensity={0.35} side={THREE.DoubleSide} />
            </mesh>
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <group key={i} position={[Math.cos(a) * 5.8, 3.4, Math.sin(a) * 5.8]}>
                  <mesh>
                    <coneGeometry args={[1, 3, 4]} />
                    <meshStandardMaterial color="#ffcf3a" metalness={0.85} roughness={0.2} />
                  </mesh>
                  <mesh position={[0, 1.9, 0]}>
                    <octahedronGeometry args={[0.7]} />
                    <meshStandardMaterial color={i % 2 ? "#ff3c5a" : "#3de0ff"} emissive={i % 2 ? "#ff3c5a" : "#3de0ff"} emissiveIntensity={1.4} />
                  </mesh>
                </group>
              );
            })}
          </group>
        </group>
      )}
    </group>
  );
}
