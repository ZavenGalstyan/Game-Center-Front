/**
 * Pirate Cove — things on the open sea: rocks and reefs, shipwrecks,
 * course markers (buoys / beacons / ghost lights), floating loot and gulls.
 * Marker and loot visuals read engine state each frame.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { M } from "./materials.js";
import { buildRockGeometry } from "./islandGeo.js";
import { waveHeight } from "../engine/waves.js";
import ShipModel from "./ShipModel.jsx";

export function SeaRocks({ rocks, biome = "tropic" }) {
  const color = biome === "cursed" || biome === "storm" ? "#5e5a55" : biome === "misty" ? "#6e706a" : "#8c867b";
  const geos = useMemo(() => rocks.filter((r) => r.h > -0.2).map((r, i) => ({ r, g: buildRockGeometry(r.r * 1.1, r.h, i * 3.7 + r.x * 0.01) })), [rocks]);
  return (
    <group>
      {geos.map(({ r, g }, i) => (
        <mesh key={i} geometry={g} position={[r.x, 0, r.z]} rotation={[0, i * 1.7, 0]} material={M.rock(color)} castShadow receiveShadow />
      ))}
    </group>
  );
}

export function Wrecks({ wrecks }) {
  return (
    <group>
      {wrecks.map((w, i) => (
        <group key={i} position={[w.x, -1.6 - (i % 2) * 0.6, w.z]} rotation={[0.12 * (i % 2 ? 1 : -1), w.heading, 0.55 * (i % 2 ? 1 : -1)]} scale={w.size / 18}>
          <ShipModel clsId={w.size > 20 ? "brig" : "sloop"} look={{ hullColor: "#3e2e24", accent: "#4a4038", sail: "#9e9684", tattered: true, flag: "bones", flagBg: "#222" }} preview={{ throttle: 0.15 }} castShadow={false} />
        </group>
      ))}
    </group>
  );
}

/** Course markers. style: buoy | beacon | ghost | wreck */
export function Markers({ game, style = "buoy" }) {
  const refs = useRef([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const st = game.currentStep();
    const next = st && st.k === "markers" ? st.ids.find((id) => !game.prog.sets.markers.has(id)) : null;
    game.markers.forEach((m, i) => {
      const g = refs.current[i];
      if (!g) return;
      const active = m.id === next;
      const inStep = st && st.k === "markers" && st.ids.includes(m.id);
      g.visible = !m.passed && (inStep || (!!next && game.adv.steps.some((s) => s.k === "markers" && s.ids.includes(m.id))));
      const y = waveHeight(m.x, m.z, game.time, game.waveAmp);
      g.position.set(m.x, style === "ghost" ? y + 3 + Math.sin(t * 1.4 + i) * 0.6 : y, m.z);
      g.rotation.z = Math.sin(t * 1.3 + i) * 0.08;
      const beam = g.children[g.children.length - 1];
      if (beam) {
        beam.visible = active;
        beam.material.opacity = 0.14 + Math.sin(t * 3) * 0.05;
      }
    });
  });
  const lightCol = style === "ghost" ? "#9fffd8" : style === "beacon" ? "#ffcf5a" : "#ffe08a";
  return (
    <group>
      {game.markers.map((m, i) => (
        <group key={m.id} ref={(el) => (refs.current[i] = el)}>
          {style === "ghost" ? (
            <>
              <mesh material={M.emissive("#9fffd8", 2.4)}>
                <sphereGeometry args={[0.9, 16, 12]} />
              </mesh>
              <mesh>
                <sphereGeometry args={[2.4, 16, 12]} />
                <meshBasicMaterial color="#7fffd0" transparent opacity={0.15} depthWrite={false} blending={THREE.AdditiveBlending} />
              </mesh>
            </>
          ) : (
            <>
              <mesh position={[0, 0.5, 0]} material={M.accent(style === "beacon" ? "#2a2a2a" : "#c23a2a")} castShadow>
                <cylinderGeometry args={[0.7, 1.1, 1.6, 12]} />
              </mesh>
              <mesh position={[0, 1.55, 0]} material={M.accent("#f2ede2")}>
                <cylinderGeometry args={[0.45, 0.7, 0.6, 12]} />
              </mesh>
              <mesh position={[0, 2.5, 0]} material={M.iron()}>
                <cylinderGeometry args={[0.06, 0.06, 1.6, 6]} />
              </mesh>
              <mesh position={[0, 3.4, 0]} material={M.emissive(lightCol, 2.4)}>
                <sphereGeometry args={[0.32, 10, 8]} />
              </mesh>
              <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[18, 20, 48]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.25} depthWrite={false} />
              </mesh>
            </>
          )}
          <mesh position={[0, 30, 0]}>
            <cylinderGeometry args={[1.2, 1.8, 60, 12, 1, true]} />
            <meshBasicMaterial color={lightCol} transparent opacity={0.15} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} fog={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FloatBody({ kind }) {
  switch (kind) {
    case "gold":
      return (
        <group>
          <mesh position={[0, 0.2, 0]} material={M.wood()} castShadow>
            <cylinderGeometry args={[0.55, 0.55, 1.1, 12]} />
          </mesh>
          <mesh position={[0, 0.78, 0]} material={M.gold()}>
            <sphereGeometry args={[0.48, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
      );
    case "repair":
      return (
        <group>
          <mesh position={[0, 0.25, 0]} material={M.wood()} castShadow>
            <boxGeometry args={[1.2, 0.9, 1.2]} />
          </mesh>
          <mesh position={[0, 0.25, 0.61]} material={M.emissive("#e85a4a", 1.2)}>
            <boxGeometry args={[0.6, 0.18, 0.02]} />
          </mesh>
          <mesh position={[0, 0.25, 0.61]} material={M.emissive("#e85a4a", 1.2)}>
            <boxGeometry args={[0.18, 0.6, 0.02]} />
          </mesh>
        </group>
      );
    case "map":
    case "fragment":
      return (
        <group rotation={[0, 0, 1.2]}>
          <mesh material={M.accent("#9fd8c8")} position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.8, 10]} />
          </mesh>
          <mesh material={M.wood()} position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 0.25, 8]} />
          </mesh>
          <mesh material={M.accent("#e8d6a8")} position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.6, 8]} />
          </mesh>
        </group>
      );
    default:
      return (
        <group>
          <mesh position={[0, 0.25, 0]} material={M.wood()} castShadow>
            <boxGeometry args={[1.3, 1, 1.3]} />
          </mesh>
          <mesh position={[0, 0.25, 0]} material={M.darkWood()}>
            <boxGeometry args={[1.34, 0.14, 1.34]} />
          </mesh>
        </group>
      );
  }
}

export function Floats({ game, version }) {
  const refs = useRef(new Map());
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const f of game.floats) {
      const g = refs.current.get(f.id);
      if (!g) continue;
      g.visible = f.active;
      if (!f.active) continue;
      const pop = f.pop > 0 ? f.pop : 0;
      g.position.set(f.x, (f.y || 0) - 0.15 + pop * 1.5, f.z);
      g.rotation.set(Math.sin(t * 1.3 + f.phase) * 0.18, t * 0.4 + f.phase, Math.cos(t * 1.1 + f.phase) * 0.18);
      const ring = g.children[1];
      if (ring) ring.scale.setScalar(1 + Math.sin(t * 3 + f.phase) * 0.12);
    }
  });
  void version;
  return (
    <group>
      {game.floats.map((f) => (
        <group key={f.id} ref={(el) => (el ? refs.current.set(f.id, el) : refs.current.delete(f.id))}>
          <FloatBody kind={f.kind} />
          <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.6, 2.1, 32]} />
            <meshBasicMaterial color={f.kind === "map" || f.kind === "fragment" ? "#9fffd8" : "#ffe08a"} transparent opacity={0.45} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A few gulls circling over the area around the focus point. */
export function Gulls({ focus, count = 8, dark = false }) {
  const mesh = useRef();
  const birds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        r: 30 + (i % 4) * 14,
        h: 18 + (i % 3) * 7,
        sp: 0.12 + (i % 5) * 0.03,
        ph: i * 1.9,
        dir: i % 2 ? 1 : -1,
        cx: ((i * 37) % 60) - 30,
        cz: ((i * 53) % 60) - 30,
      })),
    [count],
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const v = [0, 0, 0.3, -1.1, 0.25, -0.1, 0, 0, -0.35, 0, 0, 0.3, 0, 0, -0.35, 1.1, 0.25, -0.1, 0, 0, 0.3, 0, 0.05, -0.6, 0, 0, -0.35];
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: dark ? "#2a2a30" : "#f4f4f0", side: THREE.DoubleSide }), [dark]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime;
    const f = focus?.current || { x: 0, z: 0 };
    birds.forEach((b, i) => {
      const a = t * b.sp * b.dir + b.ph;
      p.set(f.x + b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + b.ph) * 2, f.z + b.cz + Math.sin(a) * b.r);
      e.set(0, -a * b.dir + (b.dir > 0 ? Math.PI : 0), Math.sin(t * 9 + b.ph) * 0.1);
      q.setFromEuler(e);
      const flap = 0.55 + Math.abs(Math.sin(t * 7 + b.ph)) * 0.55;
      s.set(1.3, flap * 1.3, 1.3);
      m.compose(p, q, s);
      mesh.current.setMatrixAt(i, m);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo, mat, count]} frustumCulled={false} />;
}
